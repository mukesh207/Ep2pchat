use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
use crate::AppState;

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
) -> Json<Value> {
    // In a real app, we'd filter by org_id from the user's token
    let records = sqlx::query(
        "SELECT id, email FROM users WHERE status = 'active'"
    )
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
            Json(json!({"users": users}))
        }
        Err(e) => Json(json!({"error": e.to_string()})),
    }
}
