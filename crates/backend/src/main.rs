mod admin;
mod auth;
mod db;
pub mod error;
mod keys;
mod nats;
mod test_api;
#[cfg(test)]
mod tests;
mod users;
mod ws;

use crate::nats::NatsService;
use crate::ws::WsState;
use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    response::Json,
    routing::get,
    Router,
};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;
use webauthn_rs::prelude::*;

/// Shared application state passed to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub webauthn: Arc<Webauthn>,
    pub ws: WsState,
    pub nats: NatsService,
    pub jwt_secret: Arc<String>,
    pub rate_limiter: crate::auth::RateLimiter,
    pub admin_bootstrap_enabled: bool,
    pub admin_bootstrap_setup_token: Arc<Option<String>>,
    pub admin_bootstrap_consumed: Arc<AtomicBool>,
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
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
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
    let database_url = required_env("DATABASE_URL");

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
    sqlx::migrate!("../../migrations").run(&pool).await.expect("Failed to run database migrations");

    tracing::info!("✅ Database migrations applied");

    // ── Admin Organization Setup ────────────────────────────────────────
    if let Ok(admin_email) = std::env::var("ADMIN_EMAIL") {
        let admin_email = admin_email.trim().to_lowercase();
        if let Some((_, domain_part)) = admin_email.split_once('@') {
            if !domain_part.is_empty() {
                tracing::info!("⚙️ Seeding admin user from ADMIN_EMAIL: {}", admin_email);
                let seed_res = sqlx::query(
                    r#"WITH new_org AS (
                        INSERT INTO organizations (domain, name) VALUES ($1, $1)
                        ON CONFLICT (domain) DO UPDATE SET domain=EXCLUDED.domain RETURNING id
                    )
                    INSERT INTO users (org_id, email, status, is_admin)
                    SELECT id, $2, 'active', true FROM new_org
                    ON CONFLICT (org_id, email) DO UPDATE SET status='active', is_admin=true;"#,
                )
                .bind(domain_part)
                .bind(&admin_email)
                .execute(&pool)
                .await;

                match seed_res {
                    Ok(_) => tracing::info!("✅ Admin user successfully bootstrapped via config"),
                    Err(e) => tracing::error!("❌ Failed to bootstrap admin user: {}", e),
                }
            }
        }
    }

    // ── NATS JetStream ──────────────────────────────────────────────────
    let nats_url = env_or_local_default("NATS_URL", "nats://localhost:4222");

    let nats_client = async_nats::connect(&nats_url).await.expect("Failed to connect to NATS");

    tracing::info!("✅ Connected to NATS at {}", nats_url);

    // ── WebAuthn ────────────────────────────────────────────────────────
    let frontend_url = env_or_local_default("FRONTEND_URL", "http://localhost:1420");
    let rp_origin = url::Url::parse(&frontend_url).expect("Invalid FRONTEND_URL");
    let rp_id = rp_origin.host_str().unwrap_or("localhost");
    let jwt_secret = Arc::new(required_env("JWT_SECRET"));

    let builder = WebauthnBuilder::new(rp_id, &rp_origin).expect("Invalid configuration");
    let webauthn = Arc::new(builder.build().expect("Invalid configuration"));

    let state = AppState {
        db: pool,
        webauthn,
        ws: WsState::new(),
        nats: NatsService::new(nats_client),
        jwt_secret,
        rate_limiter: crate::auth::RateLimiter::new(),
        admin_bootstrap_enabled: resolve_admin_bootstrap_enabled(),
        admin_bootstrap_setup_token: Arc::new(resolve_admin_bootstrap_setup_token()),
        admin_bootstrap_consumed: Arc::new(AtomicBool::new(false)),
    };
    let test_mode = env_flag("TEST_MODE");

    // ── CORS ────────────────────────────────────────────────────────────
    let allowed_origins = build_allowed_origins(&frontend_url);

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // ── Router ──────────────────────────────────────────────────────────
    let mut app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/v1/health", get(health))
        .route("/api/v1/health/db", get(health_db))
        .route("/api/v1/health/nats", get(health_nats))
        .route("/ws", get(ws::ws_handler))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1/admin", admin::router())
        .nest("/api/v1/keys", keys::router())
        .nest("/api/v1/users", users::router());

    if test_mode {
        tracing::warn!("⚠ TEST_MODE enabled: exposing /api/v1/test helpers");
        app = app.nest("/api/v1/test", test_api::router());
    }

    let app = app
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        // Prevent slow-loris: hard timeout of 30s per request
        .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_secs(30)))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{port}");
    tracing::info!("✅ WebAuthn RP origin configured as {}", frontend_url);
    tracing::info!("✅ CORS origins configured");
    tracing::info!("✅ Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn required_env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} must be set in the environment"))
}

fn env_or_local_default(name: &str, default: &str) -> String {
    match std::env::var(name) {
        Ok(value) => value,
        Err(_) if cfg!(debug_assertions) => default.to_string(),
        Err(_) => panic!("{name} must be set in the environment"),
    }
}

fn env_flag(name: &str) -> bool {
    match std::env::var(name) {
        Ok(value) => {
            matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => false,
    }
}

fn resolve_admin_bootstrap_enabled() -> bool {
    let enabled = env_flag("ADMIN_BOOTSTRAP_ENABLED");
    if enabled {
        tracing::warn!("⚠️ ADMIN_BOOTSTRAP_ENABLED=true: passkey bypass route is active");
    } else {
        tracing::info!("✅ Admin bootstrap route disabled by default");
    }
    enabled
}

fn resolve_admin_bootstrap_setup_token() -> Option<String> {
    let setup_token = std::env::var("ADMIN_BOOTSTRAP_SETUP_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if env_flag("ADMIN_BOOTSTRAP_ENABLED") && setup_token.is_none() {
        panic!("ADMIN_BOOTSTRAP_SETUP_TOKEN must be set when ADMIN_BOOTSTRAP_ENABLED=true");
    }

    if !env_flag("ADMIN_BOOTSTRAP_ENABLED") && setup_token.is_some() {
        tracing::warn!("ADMIN_BOOTSTRAP_SETUP_TOKEN is set, but admin bootstrap route is disabled");
    }

    setup_token
}

fn build_allowed_origins(frontend_url: &str) -> Vec<HeaderValue> {
    let mut origins = vec![
        "http://localhost:1420".parse::<HeaderValue>().unwrap(),
        "tauri://localhost".parse::<HeaderValue>().unwrap(),
        "http://localhost:5173".parse::<HeaderValue>().unwrap(),
    ];

    if let Ok(value) = frontend_url.parse::<HeaderValue>() {
        origins.push(value);
    }

    if let Ok(configured) = std::env::var("CORS_ALLOWED_ORIGINS") {
        for origin in configured.split(',').map(str::trim).filter(|value| !value.is_empty()) {
            if let Ok(value) = origin.parse::<HeaderValue>() {
                origins.push(value);
            }
        }
    }

    origins
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

async fn health_db(State(state): State<AppState>) -> (axum::http::StatusCode, Json<Value>) {
    match sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db).await {
        Ok(_) => (
            axum::http::StatusCode::OK,
            Json(json!({
                "status": "connected",
                "database": "postgresql"
            })),
        ),
        Err(e) => {
            tracing::error!("DB health check failed: {}", e);
            (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "error"
                })),
            )
        }
    }
}

/// NATS health check — verifies the connection is still alive.
async fn health_nats(State(state): State<AppState>) -> (axum::http::StatusCode, Json<Value>) {
    let conn_state = state.nats.connection_state();
    match conn_state {
        Some(async_nats::connection::State::Connected) => (
            axum::http::StatusCode::OK,
            Json(json!({
                "status": "connected",
                "service": "nats-jetstream"
            })),
        ),
        Some(async_nats::connection::State::Disconnected) => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "disconnected",
                "service": "nats-jetstream"
            })),
        ),
        None => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "disabled",
                "service": "nats-jetstream"
            })),
        ),
        _ => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "unknown",
                "service": "nats-jetstream"
            })),
        ),
    }
}
