use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use thiserror::Error;

/// Unified error type for all Trustline backend operations.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Crypto error: {0}")]
    Crypto(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Rate limit exceeded")]
    RateLimit,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            AppError::RateLimit => (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded".to_string()),
            AppError::Internal(msg) => {
                tracing::error!("Internal Server Error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "An internal error occurred".into())
            }
            AppError::Database(err) => {
                tracing::error!("Database Error: {}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "An internal error occurred".into())
            }
            AppError::Network(msg) => {
                tracing::error!("Network Error: {}", msg);
                (StatusCode::SERVICE_UNAVAILABLE, "Service momentarily unavailable".into())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "An unexpected error occurred".into()),
        };

        let body = axum::Json(json!({ 
            "error": message,
            "status": status.as_u16()
        }));
        
        (status, body).into_response()
    }
}
