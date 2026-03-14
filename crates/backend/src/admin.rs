use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, PgPool};
use uuid::Uuid;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pending-users", get(get_pending_users))
        .route("/approve-user", post(approve_user))
        .route("/users", get(get_all_users))
        .route("/revoke-device", post(revoke_device))
        .route("/audit-logs", get(get_audit_logs))
}

#[derive(Serialize)]
pub struct AdminUser {
    pub id: Uuid,
    pub email: String,
    pub status: String,
    pub org_id: Uuid,
    pub device_count: i64,
}

pub async fn get_pending_users(
    State(state): State<AppState>,
) -> Json<Value> {
    let records = sqlx::query(
        "SELECT id, org_id, email, status FROM users WHERE status = 'pending_approval'"
    )
    .fetch_all(&state.db)
    .await;

    match records {
        Ok(rows) => {
            let mut users = Vec::new();
            for row in rows {
                let status: Option<String> = row.get("status");
                users.push(json!({
                    "id": row.get::<Uuid, _>("id"),
                    "org_id": row.get::<Uuid, _>("org_id"),
                    "email": row.get::<String, _>("email"),
                    "status": status.unwrap_or_default(),
                }));
            }
            Json(json!({"users": users}))
        }
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

#[derive(Deserialize)]
pub struct ApproveUserPayload {
    pub user_id: Uuid,
    pub admin_id: Option<Uuid>, // In real app, from auth context
}

pub async fn approve_user(
    State(state): State<AppState>,
    Json(payload): Json<ApproveUserPayload>,
) -> Json<Value> {
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return Json(json!({"error": e.to_string()})),
    };

    let result = sqlx::query(
        "UPDATE users SET status = 'active' WHERE id = $1 RETURNING org_id, email"
    )
    .bind(payload.user_id)
    .fetch_optional(&mut *tx)
    .await;

    match result {
        Ok(Some(row)) => {
            let org_id: Uuid = row.get("org_id");
            let email: String = row.get("email");

            // Log action
            let _ = sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)"
            )
            .bind(org_id)
            .bind(payload.admin_id)
            .bind("USER_APPROVED")
            .bind(json!({"target_user_id": payload.user_id, "target_email": email}))
            .execute(&mut *tx)
            .await;

            if let Err(e) = tx.commit().await {
                return Json(json!({"error": e.to_string()}));
            }
            Json(json!({"status": "success"}))
        }
        Ok(None) => Json(json!({"error": "User not found"})),
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

pub async fn get_all_users(
    State(state): State<AppState>,
) -> Json<Value> {
    let records = sqlx::query(
        "SELECT u.id, u.email, u.status, u.org_id, COUNT(d.id) as device_count 
         FROM users u LEFT JOIN devices d ON u.id = d.user_id 
         GROUP BY u.id"
    )
    .fetch_all(&state.db)
    .await;

    match records {
        Ok(rows) => {
            let users: Vec<Value> = rows.iter().map(|r| {
                json!({
                    "id": r.get::<Uuid, _>("id"),
                    "email": r.get::<String, _>("email"),
                    "status": r.get::<String, _>("status"),
                    "org_id": r.get::<Uuid, _>("org_id"),
                    "device_count": r.get::<i64, _>("device_count")
                })
            }).collect();
            Json(json!({"users": users}))
        }
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

#[derive(Deserialize)]
pub struct RevokeDevicePayload {
    pub device_id: Uuid,
    pub admin_id: Option<Uuid>,
}

pub async fn revoke_device(
    State(state): State<AppState>,
    Json(payload): Json<RevokeDevicePayload>,
) -> Json<Value> {
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return Json(json!({"error": e.to_string()})),
    };

    let result = sqlx::query(
        "UPDATE devices SET is_active = FALSE WHERE id = $1 RETURNING org_id, user_id"
    )
    .bind(payload.device_id)
    .fetch_optional(&mut *tx)
    .await;

    match result {
        Ok(Some(row)) => {
            let org_id: Uuid = row.get("org_id");
            let user_id: Uuid = row.get("user_id");

            // Remove OPKs for this device
            let _ = sqlx::query("DELETE FROM one_time_pre_keys WHERE device_id = $1")
                .bind(payload.device_id)
                .execute(&mut *tx)
                .await;

            // Log action
            let _ = sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)"
            )
            .bind(org_id)
            .bind(payload.admin_id)
            .bind("DEVICE_REVOKED")
            .bind(json!({"device_id": payload.device_id, "target_user_id": user_id}))
            .execute(&mut *tx)
            .await;

            // Close active WebSocket if any
            {
                let mut conns = state.ws.connections.write().unwrap();
                conns.remove(&payload.device_id);
            }

            if let Err(e) = tx.commit().await {
                return Json(json!({"error": e.to_string()}));
            }
            Json(json!({"status": "success"}))
        }
        Ok(None) => Json(json!({"error": "Device not found"})),
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}

pub async fn get_audit_logs(
    State(state): State<AppState>,
) -> Json<Value> {
    let records = sqlx::query(
        "SELECT a.id, a.action, a.details, a.created_at, u.email as actor_email 
         FROM audit_logs a LEFT JOIN users u ON a.actor_id = u.id 
         ORDER BY a.created_at DESC LIMIT 100"
    )
    .fetch_all(&state.db)
    .await;

    match records {
        Ok(rows) => {
            let logs: Vec<Value> = rows.iter().map(|r| {
                json!({
                    "id": r.get::<Uuid, _>("id"),
                    "action": r.get::<String, _>("action"),
                    "details": r.get::<Value, _>("details"),
                    "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                    "actor_email": r.get::<Option<String>, _>("actor_email")
                })
            }).collect();
            Json(json!({"logs": logs}))
        }
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}
