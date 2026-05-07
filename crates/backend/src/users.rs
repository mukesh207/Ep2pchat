use crate::auth::AuthContext;
use crate::AppState;
use axum::extract::ws::Message as WsMessage;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post, patch},
    Json, Router,
};
use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
// RLS wrappers already available in `crate::db`

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(get_users))
        .route("/devices", get(get_my_devices))
        .route("/revoke-device", post(revoke_own_device))
        .route("/audit/log-event", post(log_security_event))
        .route("/profile", patch(update_profile))
}

#[derive(Deserialize)]
pub struct UpdateProfilePayload {
    pub username: Option<String>,
    pub department: Option<String>,
    pub presence_status: Option<String>,
}

use crate::error::AppError;

pub async fn update_profile(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<Value>, AppError> {
    let presence_status = payload.presence_status.clone();

    crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "UPDATE users 
                 SET username = COALESCE($1, username),
                     department = COALESCE($2, department),
                     presence_status = COALESCE($3, presence_status)
                 WHERE id = $4 AND org_id = $5"
            )
            .bind(payload.username)
            .bind(payload.department)
            .bind(payload.presence_status)
            .bind(auth.claims.sub)
            .bind(auth.claims.org_id)
            .execute(&mut *tx)
            .await
        })
    })
    .await?;

    // Broadcast presence update if changed
    if let Some(status) = presence_status {
        let subject = format!("presence.org.{}", auth.claims.org_id);
        let presence_msg = json!({
            "type": "PRESENCE_UPDATE",
            "payload": {
                "user_id": auth.claims.sub,
                "status": status
            }
        });
        state.nats.publish(subject, presence_msg.to_string().into()).await;
    }

    Ok(Json(json!({ "status": "success" })))
}

#[derive(Deserialize)]
pub struct LogEventPayload {
    pub action: String,
    pub details: Value,
}

pub async fn log_security_event(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<LogEventPayload>,
) -> Result<Json<Value>, AppError> {
    // Only allow specific white-listed actions to be logged via this endpoint
    let allowed_actions = ["DATA_EXPORT", "VAULT_BACKUP", "AUDIT_LOG_EXPORT"];
    if !allowed_actions.contains(&payload.action.as_str()) {
        return Err(AppError::BadRequest("Invalid action".into()));
    }

    crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)",
            )
            .bind(auth.claims.org_id)
            .bind(auth.claims.sub)
            .bind(&payload.action)
            .bind(&payload.details)
            .execute(&mut *tx)
            .await
        })
    })
    .await?;

    Ok(Json(json!({ "status": "success" })))
}

#[derive(Serialize)]
struct UserInfo {
    id: Uuid,
    email: String,
    username: Option<String>,
    device_count: i64,
    presence_status: Option<String>,
    department: Option<String>,
}

pub async fn get_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, AppError> {
    // RLS: org_id scoped
    let rows = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT u.id, u.email, u.username, u.presence_status, u.department, COUNT(d.id) AS device_count
             FROM users u
             LEFT JOIN devices d ON u.id = d.user_id AND d.is_active = TRUE
             WHERE u.status = 'active' AND u.org_id = $1
             GROUP BY u.id",
            )
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await?;

    let mut users = Vec::new();
    for row in rows {
        users.push(UserInfo {
            id: row.get("id"),
            email: row.get("email"),
            username: row.get("username"),
            device_count: row.get("device_count"),
            presence_status: row.get("presence_status"),
            department: row.get("department"),
        });
    }
    Ok(Json(json!({"users": users})))
}

#[derive(Serialize)]
pub struct MyDeviceInfo {
    pub id: Uuid,
    pub device_name: String,
    pub is_active: bool,
    pub last_seen: chrono::DateTime<chrono::Utc>,
}

pub async fn get_my_devices(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, AppError> {
    // RLS: org_id scoped
    let rows = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT id, device_name, is_active, last_seen
             FROM devices
             WHERE user_id = $1 AND org_id = $2
             ORDER BY last_seen DESC",
            )
            .bind(auth.claims.sub)
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await?;

    let devices: Vec<MyDeviceInfo> = rows
        .into_iter()
        .map(|row| MyDeviceInfo {
            id: row.get("id"),
            device_name: row.get("device_name"),
            is_active: row.get("is_active"),
            last_seen: row.get("last_seen"),
        })
        .collect();
    Ok(Json(json!({ "devices": devices })))
}

#[derive(Deserialize)]
pub struct RevokeOwnDevicePayload {
    pub device_id: Uuid,
}

pub async fn revoke_own_device(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<RevokeOwnDevicePayload>,
) -> Result<Json<Value>, AppError> {
    // RLS: org_id scoped
    let row = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            let row = sqlx::query(
                "UPDATE devices
             SET is_active = FALSE
             WHERE id = $1 AND user_id = $2 AND org_id = $3
             RETURNING id",
            )
            .bind(payload.device_id)
            .bind(auth.claims.sub)
            .bind(auth.claims.org_id)
            .fetch_optional(&mut *tx)
            .await?;

            if row.is_some() {
                let _ = sqlx::query("DELETE FROM one_time_pre_keys WHERE device_id = $1")
                    .bind(payload.device_id)
                    .execute(&mut *tx)
                    .await?;

                let _ = sqlx::query("DELETE FROM sessions WHERE device_id = $1")
                    .bind(payload.device_id)
                    .execute(&mut *tx)
                    .await?;

                let _ = sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)"
            )
            .bind(auth.claims.org_id)
            .bind(auth.claims.sub)
            .bind("DEVICE_SELF_REVOKED")
            .bind(json!({ "device_id": payload.device_id }))
            .execute(&mut *tx)
            .await?;
            }

            Ok(row)
        })
    })
    .await?;

    if let Some(_) = row {
        // Purge pending messages from NATS JetStream
        let routing_subject = format!("routing.{}", payload.device_id);
        state.nats.purge_subject(routing_subject).await;

        if let Some((_, conn)) = state.ws.connections.remove(&payload.device_id) {
            let event = json!({ "type": "DEVICE_REVOKED", "payload": { "device_id": payload.device_id } });
            let _ = conn.tx.send(WsMessage::Text(event.to_string().into()));
            let _ = conn.tx.send(WsMessage::Close(None));
        }
        Ok(Json(json!({ "status": "success" })))
    } else {
        Err(AppError::NotFound("Device not found".into()))
    }
}
