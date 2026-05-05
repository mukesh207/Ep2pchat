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
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, QueryBuilder};
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
        .route("/settings", get(get_settings))
        .route("/settings", post(update_settings))
        // Phase-4 Bulk & Device management
        .route("/bulk-approve", post(approve_bulk))
        .route("/bulk-deny", post(deny_bulk))
        .route("/devices/{device_id}/alias", post(update_device_alias))
        .route("/devices/{device_id}/nuke", post(nuke_device))
        .route("/users/{user_id}/department", post(update_user_department))
}

#[derive(Deserialize)]
pub struct UpdateDepartmentPayload {
    pub department: String,
}

pub async fn update_user_department(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<UpdateDepartmentPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let result = sqlx::query(
        "UPDATE users SET department = $1 WHERE id = $2 AND org_id = $3",
    )
    .bind(payload.department)
    .bind(user_id)
    .bind(auth.claims.org_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Ok(Json(json!({"status": "success"}))),
        Err(_) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update department"})))),
    }
}

#[derive(Deserialize, Serialize)]
pub struct UpdateSettingsPayload {
    pub audit_retention_days: Option<i32>,
    pub force_rls: Option<bool>,
    pub branding: Option<Value>,
    pub is_maintenance_mode: Option<bool>,
}

pub async fn get_settings(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let record = sqlx::query(
        "SELECT audit_retention_days, force_rls, branding, is_maintenance_mode FROM organizations WHERE id = $1",
    )
    .bind(auth.claims.org_id)
    .fetch_optional(&state.db)
    .await;

    match record {
        Ok(Some(row)) => Ok(Json(json!({
            "audit_retention_days": row.get::<Option<i32>, _>("audit_retention_days").unwrap_or(365),
            "force_rls": row.get::<Option<bool>, _>("force_rls").unwrap_or(true),
            "branding": row.get::<Option<Value>, _>("branding").unwrap_or(json!({"primary_color": "#6e56cf", "workspace_name": ""})),
            "is_maintenance_mode": row.get::<Option<bool>, _>("is_maintenance_mode").unwrap_or(false),
        }))),
        _ => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Organization not found"})),
        )),
    }
}

pub async fn update_settings(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<UpdateSettingsPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let result = sqlx::query(
        "UPDATE organizations SET 
            audit_retention_days = COALESCE($1, audit_retention_days),
            force_rls = COALESCE($2, force_rls),
            branding = COALESCE($3, branding),
            is_maintenance_mode = COALESCE($4, is_maintenance_mode)
         WHERE id = $5",
    )
    .bind(payload.audit_retention_days)
    .bind(payload.force_rls)
    .bind(&payload.branding)
    .bind(payload.is_maintenance_mode)
    .bind(auth.claims.org_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Audit: settings updated
            let _ = sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)",
            )
            .bind(auth.claims.org_id)
            .bind(auth.claims.sub)
            .bind("SETTINGS_UPDATED")
            .bind(json!(&payload))
            .execute(&state.db)
            .await;

            Ok(Json(json!({ "status": "success" })))
        }
        Err(e) => {
            tracing::error!("Failed to update settings: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

#[derive(Deserialize)]
pub struct BulkActionPayload {
    pub user_ids: Vec<Uuid>,
}

pub async fn approve_bulk(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<BulkActionPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    for user_id in payload.user_ids {
        let _ = approve_user_internal(state.clone(), auth.clone(), user_id).await;
    }

    Ok(Json(json!({"status": "success"})))
}

pub async fn deny_bulk(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<BulkActionPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    for user_id in payload.user_ids {
        let _ = deny_user_internal(state.clone(), auth.clone(), user_id).await;
    }

    Ok(Json(json!({"status": "success"})))
}

#[derive(Deserialize)]
pub struct UpdateAliasPayload {
    pub alias: String,
}

pub async fn update_device_alias(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(device_id): Path<Uuid>,
    Json(payload): Json<UpdateAliasPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let result = sqlx::query(
        "UPDATE devices SET alias = $1 WHERE id = $2 AND org_id = $3",
    )
    .bind(payload.alias)
    .bind(device_id)
    .bind(auth.claims.org_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Ok(Json(json!({"status": "success"}))),
        Err(_) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update alias"})))),
    }
}

pub async fn nuke_device(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // Set is_nuked flag
    let _ = sqlx::query(
        "UPDATE devices SET is_nuked = TRUE WHERE id = $1 AND org_id = $2",
    )
    .bind(device_id)
    .bind(auth.claims.org_id)
    .execute(&state.db)
    .await;

    // Send NUKE_VAULT command via WS if connected
    if let Some(conn) = state.ws.connections.get(&device_id) {
        let nuke_msg = json!({ "type": "NUKE_VAULT", "payload": {} });
        let _ = conn.tx.send(WsMessage::Text(nuke_msg.to_string().into()));
    }

    // Then revoke normally
    revoke_device_internal(state, auth, device_id).await
}

async fn deny_user_internal(
    state: AppState,
    auth: AuthContext,
    user_id: Uuid,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            let res = sqlx::query(
                "UPDATE users SET status = 'revoked'
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
        _ => Err((StatusCode::NOT_FOUND, Json(json!({"error": "User not found"})))),
    }
}

pub async fn get_pending_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
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
        Err(e) => {
            tracing::error!("Failed to fetch pending users: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
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
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
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
        Err(e) => {
            tracing::error!("Failed to approve user: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

pub async fn deny_user(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
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
        Err(e) => {
            tracing::error!("Failed to deny user: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

pub async fn get_all_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT u.id, u.email, u.username, u.status, u.org_id, u.department, COUNT(d.id) as device_count
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
                        "department": r.get::<Option<String>, _>("department"),
                        "device_count": r.get::<i64, _>("device_count")
                    })
                })
                .collect();
            Ok(Json(json!({"users": users})))
        }
        Err(e) => {
            tracing::error!("Failed to list users: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

pub async fn get_user_devices(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let records = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
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
        Err(e) => {
            tracing::error!("Failed to list devices for user: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
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
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
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

                let _ = sqlx::query("DELETE FROM sessions WHERE device_id = $1")
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
            // Purge pending messages from NATS JetStream
            let routing_subject = format!("routing.{}", device_id);
            state.nats.purge_subject(routing_subject).await;

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
        Err(e) => {
            tracing::error!("Failed to revoke device: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

#[derive(Deserialize, Default)]
pub struct AuditQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub action: Option<String>,
    pub email: Option<String>,
    pub start_date: Option<chrono::DateTime<chrono::Utc>>,
    pub end_date: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn get_audit_logs(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if auth.claims.role != "ADMIN" {
        return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * page_size;

    // RLS: org_id scoped
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            // 1. Build the filtered query
            let mut builder: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
                "SELECT a.id, a.action, a.details, a.created_at, u.email as actor_email "
            );
            builder.push("FROM audit_logs a LEFT JOIN users u ON a.actor_id = u.id ");
            builder.push("WHERE a.org_id = ");
            builder.push_bind(auth.claims.org_id);

            if let Some(action) = &query.action {
                if !action.is_empty() {
                    builder.push(" AND a.action = ");
                    builder.push_bind(action);
                }
            }

            if let Some(email) = &query.email {
                if !email.is_empty() {
                    builder.push(" AND u.email ILIKE ");
                    builder.push_bind(format!("%{}%", email));
                }
            }

            if let Some(start) = query.start_date {
                builder.push(" AND a.created_at >= ");
                builder.push_bind(start);
            }

            if let Some(end) = query.end_date {
                builder.push(" AND a.created_at <= ");
                builder.push_bind(end);
            }

            builder.push(" ORDER BY a.created_at DESC ");
            builder.push(" LIMIT ");
            builder.push_bind(page_size);
            builder.push(" OFFSET ");
            builder.push_bind(offset);

            let rows = builder.build().fetch_all(&mut *tx).await?;

            // 2. Build the count query with same filters
            let mut count_builder: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
                "SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON a.actor_id = u.id "
            );
            count_builder.push("WHERE a.org_id = ");
            count_builder.push_bind(auth.claims.org_id);

            if let Some(action) = &query.action {
                if !action.is_empty() {
                    count_builder.push(" AND a.action = ");
                    count_builder.push_bind(action);
                }
            }

            if let Some(email) = &query.email {
                if !email.is_empty() {
                    count_builder.push(" AND u.email ILIKE ");
                    count_builder.push_bind(format!("%{}%", email));
                }
            }

            if let Some(start) = query.start_date {
                count_builder.push(" AND a.created_at >= ");
                count_builder.push_bind(start);
            }

            if let Some(end) = query.end_date {
                count_builder.push(" AND a.created_at <= ");
                count_builder.push_bind(end);
            }

            let count_row = count_builder.build().fetch_one(&mut *tx).await?;
            let total: i64 = count_row.get(0);

            Ok((rows, total))
        })
    })
    .await;

    match result {
        Ok((rows, total)) => {
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
                "total": total,
                "page": page,
                "page_size": page_size,
            })))
        }
        Err(e) => {
            tracing::error!("Failed to fetch audit logs: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}
