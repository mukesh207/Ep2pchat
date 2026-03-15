mod auth;
mod admin;
mod keys;
mod ws;
mod users;
#[cfg(test)]
mod tests;

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
use std::time::Duration;
use tower_http::timeout::TimeoutLayer;
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
    pub nats: async_nats::Client,
}

/// Constrain Tokio to 4 worker threads in dev to reduce CPU stress.
/// In release/production, the runtime will use all available cores.
fn main() {
    let worker_threads = if cfg!(debug_assertions) { 4 } else { num_cpus() };

    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(worker_threads)
        .enable_all()
        .build()
        .expect("Failed to build Tokio runtime")
        .block_on(async_main());
}

/// Returns the number of available CPU cores for production builds.
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

async fn async_main() {
    // Load .env file from project root
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let worker_count = if cfg!(debug_assertions) { 4 } else { num_cpus() };
    tracing::info!("🚀 Trustline Backend starting ({} worker threads)...", worker_count);

    // ── PostgreSQL ──────────────────────────────────────────────────────
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in .env or environment");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
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

    // ── NATS JetStream ──────────────────────────────────────────────────
    let nats_url = std::env::var("NATS_URL")
        .unwrap_or_else(|_| "nats://localhost:4222".to_string());

    let nats_client = async_nats::connect(&nats_url)
        .await
        .expect("Failed to connect to NATS");

    tracing::info!("✅ Connected to NATS at {}", nats_url);

    // ── WebAuthn ────────────────────────────────────────────────────────
    let rp_id = "localhost";
    let rp_origin = Url::parse("http://localhost:1420").expect("Invalid URL");
    let builder = WebauthnBuilder::new(rp_id, &rp_origin).expect("Invalid configuration");
    let webauthn = Arc::new(builder.build().expect("Invalid configuration"));

    let state = AppState {
        db: pool,
        webauthn,
        ws: WsState::new(),
        nats: nats_client,
    };

    // ── CORS ────────────────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:1420".parse::<axum::http::HeaderValue>().unwrap(),
            "tauri://localhost".parse::<axum::http::HeaderValue>().unwrap(),
        ])
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // ── Router ──────────────────────────────────────────────────────────
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/v1/health/db", get(health_db))
        .route("/api/v1/health/nats", get(health_nats))
        .route("/ws", get(ws::ws_handler))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1/admin", admin::router())
        .nest("/api/v1/keys", keys::router())
        .nest("/api/v1/users", users::router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        // Prevent slow-loris: hard timeout of 30s per request
        .layer(TimeoutLayer::new(Duration::from_secs(30)))
        .with_state(state);

    let addr = "0.0.0.0:3000";
    tracing::info!("✅ Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ── Health & Root Handlers ──────────────────────────────────────────────────

async fn root() -> Json<Value> {
    Json(json!({
        "name": "Trustline API",
        "version": "0.2.0",
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

/// NATS health check — verifies the connection is still alive.
async fn health_nats(State(state): State<AppState>) -> Json<Value> {
    let conn_state = state.nats.connection_state();
    let status = match conn_state {
        async_nats::connection::State::Connected => "connected",
        async_nats::connection::State::Disconnected => "disconnected",
        _ => "unknown",
    };
    Json(json!({
        "status": status,
        "service": "nats-jetstream"
    }))
}
