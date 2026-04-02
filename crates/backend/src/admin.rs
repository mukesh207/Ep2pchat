use crate::auth::build_access_code;
use crate::auth::AuthContext;
use crate::AppState;
use axum::extract::ws::CloseFrame;
use axum::{
    extract::ws::Message as WsMessage,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        // Legacy paths
        .route("/pending-users", get(get_pending_users))
        .route("/approve-user", post(approve_user))
        .route("/users", get(get_all_users))
        .route("/revoke-device", post(revoke_device))
        .route("/audit-logs", get(get_audit_logs))
        // Phase-3 paths
        .route("/pending", get(get_pending_users))
        .route("/approve/{id}", post(approve_user_path))
        .route("/deny/{id}", post(deny_user))
        .route("/devices/{user_id}", get(get_user_devices))
        .route("/revoke/{device_id}", post(revoke_device_path))
        .route("/audit", get(get_audit_logs))
}

pub async fn get_pending_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT id, org_id, email, username, status, created_at
                 FROM users
                 WHERE status = 'pending_approval' AND org_id = $1
                 ORDER BY created_at ASC",
            )
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await;

    match records {
        Ok(rows) => {
            let users: Vec<Value> = rows
                .iter()
                .map(|row| {
                    let status: Option<String> = row.get("status");
                    json!({
                        "id": row.get::<Uuid, _>("id"),
                        "org_id": row.get::<Uuid, _>("org_id"),
                        "email": row.get::<String, _>("email"),
                        "username": row.get::<Option<String>, _>("username"),
                        "status": status.unwrap_or_default(),
                        "requested_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                        "access_code": build_access_code(row.get::<Uuid, _>("id")),
                    })
                })
                .collect();
            Ok(Json(json!({ "users": users })))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

#[derive(Deserialize)]
pub struct ApproveUserPayload {
    pub user_id: Uuid,
}

pub async fn approve_user(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<ApproveUserPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    approve_user_internal(state, auth, payload.user_id).await
}

pub async fn approve_user_path(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    approve_user_internal(state, auth, user_id).await
}

async fn approve_user_internal(
    state: AppState,
    auth: AuthContext,
    user_id: Uuid,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            let res = sqlx::query(
                "UPDATE users SET status = 'active'
                 WHERE id = $1 AND org_id = $2
                 RETURNING org_id, email",
            )
            .bind(user_id)
            .bind(auth.claims.org_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(ref row) = res {
                let org_id: Uuid = row.get("org_id");
                let email: String = row.get("email");
                let _ = sqlx::query(
                    "INSERT INTO audit_logs (org_id, actor_id, action, details)
                     VALUES ($1, $2, $3, $4)",
                )
                .bind(org_id)
                .bind(auth.claims.sub)
                .bind("USER_APPROVED")
                .bind(json!({"target_user_id": user_id, "target_email": email}))
                .execute(&mut *tx)
                .await?;
            }
            Ok(res)
        })
    })
    .await;

    match result {
        Ok(Some(_)) => Ok(Json(json!({"status": "success"}))),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

pub async fn deny_user(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            let res = sqlx::query(
                "UPDATE users
                 SET status = 'denied'
                 WHERE id = $1 AND org_id = $2 AND status = 'pending_approval'
                 RETURNING org_id, email",
            )
            .bind(user_id)
            .bind(auth.claims.org_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(ref row) = res {
                let org_id: Uuid = row.get("org_id");
                let email: String = row.get("email");
                let _ = sqlx::query(
                    "INSERT INTO audit_logs (org_id, actor_id, action, details)
                     VALUES ($1, $2, $3, $4)",
                )
                .bind(org_id)
                .bind(auth.claims.sub)
                .bind("USER_DENIED")
                .bind(json!({"target_user_id": user_id, "target_email": email}))
                .execute(&mut *tx)
                .await?;
            }

            Ok(res)
        })
    })
    .await;

    match result {
        Ok(Some(_)) => Ok(Json(json!({"status": "success"}))),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found or not pending"})),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

pub async fn get_all_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT u.id, u.email, u.username, u.status, u.org_id, COUNT(d.id) as device_count
                 FROM users u LEFT JOIN devices d ON u.id = d.user_id
                 WHERE u.org_id = $1
                 GROUP BY u.id",
            )
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await;

    match records {
        Ok(rows) => {
            let users: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.get::<Uuid, _>("id"),
                        "email": r.get::<String, _>("email"),
                        "username": r.get::<Option<String>, _>("username"),
                        "status": r.get::<String, _>("status"),
                        "org_id": r.get::<Uuid, _>("org_id"),
                        "device_count": r.get::<i64, _>("device_count")
                    })
                })
                .collect();
            Ok(Json(json!({"users": users})))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

pub async fn get_user_devices(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT d.id, d.device_name, d.last_seen, d.is_active
                 FROM devices d
                 JOIN users u ON u.id = d.user_id
                 WHERE d.user_id = $1 AND u.org_id = $2
                 ORDER BY d.last_seen DESC",
            )
            .bind(user_id)
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await;

    match records {
        Ok(rows) => {
            let devices: Vec<Value> = rows
                .iter()
                .map(|r| {
                    let last_seen = r.get::<chrono::DateTime<chrono::Utc>, _>("last_seen");
                    json!({
                        "id": r.get::<Uuid, _>("id"),
                        "device_name": r.get::<String, _>("device_name"),
                        "registered_at": last_seen,
                        "last_seen": last_seen,
                        "is_active": r.get::<bool, _>("is_active"),
                    })
                })
                .collect();
            Ok(Json(json!({"devices": devices})))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

#[derive(Deserialize)]
pub struct RevokeDevicePayload {
    pub device_id: Uuid,
}

pub async fn revoke_device(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<RevokeDevicePayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    revoke_device_internal(state, auth, payload.device_id).await
}

pub async fn revoke_device_path(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    revoke_device_internal(state, auth, device_id).await
}

async fn revoke_device_internal(
    state: AppState,
    auth: AuthContext,
    device_id: Uuid,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            let res = sqlx::query(
                "UPDATE devices SET is_active = FALSE
                 WHERE id = $1 AND org_id = $2
                 RETURNING org_id, user_id",
            )
            .bind(device_id)
            .bind(auth.claims.org_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(ref row) = res {
                let org_id: Uuid = row.get("org_id");
                let user_id: Uuid = row.get("user_id");

                let _ = sqlx::query("DELETE FROM one_time_pre_keys WHERE device_id = $1")
                    .bind(device_id)
                    .execute(&mut *tx)
                    .await?;

                let _ = sqlx::query(
                    "INSERT INTO audit_logs (org_id, actor_id, action, details)
                     VALUES ($1, $2, $3, $4)",
                )
                .bind(org_id)
                .bind(auth.claims.sub)
                .bind("DEVICE_REVOKED")
                .bind(json!({"device_id": device_id, "target_user_id": user_id}))
                .execute(&mut *tx)
                .await?;
            }
            Ok(res)
        })
    })
    .await;

    match result {
        Ok(Some(_)) => {
            if let Some((_, conn)) = state.ws.connections.remove(&device_id) {
                let event = json!({ "type": "DEVICE_REVOKED", "payload": { "device_id": device_id } });
                let _ = conn.tx.send(WsMessage::Text(event.to_string().into()));
                let _ = conn.tx.send(WsMessage::Close(Some(CloseFrame {
                    code: axum::extract::ws::close_code::POLICY,
                    reason: "device revoked".into(),
                })));
            }
            Ok(Json(json!({"status": "success"})))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Device not found"})),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

#[derive(Deserialize, Default)]
pub struct AuditQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

pub async fn get_audit_logs(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !auth.claims.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * page_size;

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |mut tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT a.id, a.action, a.details, a.created_at, u.email as actor_email
                 FROM audit_logs a LEFT JOIN users u ON a.actor_id = u.id
                 WHERE a.org_id = $1
                 ORDER BY a.created_at DESC
                 LIMIT $2 OFFSET $3",
            )
            .bind(auth.claims.org_id)
            .bind(page_size)
            .bind(offset)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await;

    match records {
        Ok(rows) => {
            let logs: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.get::<Uuid, _>("id"),
                        "action": r.get::<String, _>("action"),
                        "details": r.get::<Value, _>("details"),
                        "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                        "actor_email": r.get::<Option<String>, _>("actor_email")
                    })
                })
                .collect();
            Ok(Json(json!({
                "logs": logs,
                "page": page,
                "page_size": page_size,
            })))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}
