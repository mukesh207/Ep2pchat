use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
use crate::AppState;
use crate::auth::AuthContext;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(get_users))
}

#[derive(Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
}

pub async fn get_users(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let records = sqlx::query(
        "SELECT id, email FROM users WHERE status = 'active' AND org_id = $1"
    )
    .bind(auth.claims.org_id)
    .fetch_all(&state.db)
    .await;

    match records {
        Ok(rows) => {
            let mut users = Vec::new();
            for row in rows {
                users.push(UserInfo {
                    id: row.get("id"),
                    email: row.get("email"),
                });
            }
            Ok(Json(json!({"users": users})))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()})))),
    }
}
