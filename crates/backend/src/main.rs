mod auth;
mod admin;
mod keys;
mod ws;
mod users;

use axum::{
    Router,
    extract::State,
    routing::get,
    response::Json,
};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;
use webauthn_rs::prelude::*;
use crate::ws::WsState;

/// Shared application state passed to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub webauthn: Arc<Webauthn>,
    pub ws: WsState,
}

#[tokio::main]
async fn main() {
    // Load .env file from project root
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    tracing::info!("🚀 Trustline Backend starting...");

    // Connect to PostgreSQL
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in .env or environment");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    tracing::info!("✅ Connected to PostgreSQL");

    // Initialize crypto core (libsodium)
    crypto_core::init().expect("Failed to initialize crypto core");

    // Run migrations automatically on startup
    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("Failed to run database migrations");

    tracing::info!("✅ Database migrations applied");

    // Initialize Webauthn
    let rp_id = "localhost";
    let rp_origin = Url::parse("http://localhost:1420").expect("Invalid URL");
    let builder = WebauthnBuilder::new(rp_id, &rp_origin).expect("Invalid configuration");
    let webauthn = Arc::new(builder.build().expect("Invalid configuration"));

    let state = AppState { 
        db: pool, 
        webauthn,
        ws: WsState::new(),
    };

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/v1/health/db", get(health_db))
        .route("/ws", get(ws::ws_handler))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1/admin", admin::router())
        .nest("/api/v1/keys", keys::router())
        .nest("/api/v1/users", users::router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = "0.0.0.0:3000";
    tracing::info!("✅ Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> Json<Value> {
    Json(json!({
        "name": "Trustline API",
        "version": "0.1.0",
        "status": "running"
    }))
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "healthy"
    }))
}

async fn health_db(State(state): State<AppState>) -> Json<Value> {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => Json(json!({
            "status": "connected",
            "database": "postgresql"
        })),
        Err(e) => Json(json!({
            "status": "error",
            "message": e.to_string()
        })),
    }
}
