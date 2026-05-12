use crate::auth::AuthContext;
use crate::AppState;
use axum::{
    extract::{State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
use base64::Engine;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(post_story))
        .route("/", get(get_stories))
}

#[derive(Deserialize)]
pub struct PostStoryPayload {
    pub ciphertext_b64: String,
    pub nonce_b64: String,
}

#[derive(Serialize)]
pub struct StoryResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub ciphertext_b64: String,
    pub nonce_b64: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

use crate::error::AppError;

pub async fn post_story(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<PostStoryPayload>,
) -> Result<Json<Value>, AppError> {
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&payload.ciphertext_b64)
        .map_err(|_| AppError::BadRequest("Invalid ciphertext base64".into()))?;
    
    let nonce = base64::engine::general_purpose::STANDARD
        .decode(&payload.nonce_b64)
        .map_err(|_| AppError::BadRequest("Invalid nonce base64".into()))?;

    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

    crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO stories (org_id, user_id, ciphertext, nonce, expires_at)
                 VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(auth.claims.org_id)
            .bind(auth.claims.sub)
            .bind(ciphertext)
            .bind(nonce)
            .bind(expires_at)
            .execute(&mut *tx)
            .await
        })
    })
    .await?;

    Ok(Json(json!({"status": "success"})))
}

pub async fn get_stories(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, AppError> {
    let rows = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                "SELECT id, user_id, ciphertext, nonce, created_at
                 FROM stories
                 WHERE org_id = $1 AND expires_at > NOW()
                 ORDER BY created_at DESC"
            )
            .bind(auth.claims.org_id)
            .fetch_all(&mut *tx)
            .await
        })
    })
    .await?;

    let stories: Vec<StoryResponse> = rows.iter().map(|r| {
        StoryResponse {
            id: r.get("id"),
            user_id: r.get("user_id"),
            ciphertext_b64: base64::engine::general_purpose::STANDARD.encode(r.get::<Vec<u8>, _>("ciphertext")),
            nonce_b64: base64::engine::general_purpose::STANDARD.encode(r.get::<Vec<u8>, _>("nonce")),
            created_at: r.get("created_at"),
        }
    }).collect();

    Ok(Json(json!({"stories": stories})))
}
