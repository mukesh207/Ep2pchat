#![cfg(test)]

use crate::auth::Claims;
use crate::nats::NatsService;
use crate::ws::{handle_envelope, ActiveConnection, WsEnvelope, WsState};
use crate::{admin, keys, AppState};
use axum::{
    body::Body,
    extract::ws::Message as WsMessage,
    http::{Request, StatusCode},
    Router,
};
use base64::Engine;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

async fn create_test_token(user_id: Uuid, org_id: Uuid, is_admin: bool, pool: &sqlx::PgPool) -> String {
    let jwt_secret = "super_secret_fallback_key_for_dev";
    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(1))
        .expect("valid timestamp");
    let expiration = expiration_dt.timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        org_id,
        role: if is_admin { "ADMIN".to_string() } else { "USER".to_string() },
        jti,
        exp: expiration,
    };

    // Insert session into real DB
    let res = sqlx::query("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(jti)
        .bind(user_id)
        .bind(expiration_dt)
        .execute(pool)
        .await;

    if let Err(e) = res {
        eprintln!("Failed to insert session in create_test_token: {}", e);
    }

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .unwrap()
}
async fn mock_app_state() -> AppState {
    AppState {
        db: PgPoolOptions::new()
            .connect_lazy("postgres://localhost/mock")
            .unwrap(),
        ws: WsState::new(),
        nats: NatsService::disabled(),
        jwt_secret: Arc::new("super_secret_fallback_key_for_dev".to_string()),
        rate_limiter: crate::auth::RateLimiter::new(),
        admin_bootstrap_enabled: false,
        admin_bootstrap_setup_token: Arc::new(None),
        admin_bootstrap_consumed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    }
}

async fn integration_app_state() -> Option<AppState> {
    let database_url = std::env::var("DATABASE_URL").ok()?;

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .ok()?;

    if sqlx::migrate!("../../migrations").run(&pool).await.is_err() {
        return None;
    }

    Some(AppState {
        db: pool,
        ws: WsState::new(),
        nats: NatsService::disabled(),
        jwt_secret: Arc::new("super_secret_fallback_key_for_dev".to_string()),
        rate_limiter: crate::auth::RateLimiter::new(),
        admin_bootstrap_enabled: false,
        admin_bootstrap_setup_token: Arc::new(None),
        admin_bootstrap_consumed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    })
}

async fn reset_db(state: &AppState) {
    let _ = sqlx::query("DELETE FROM encrypted_messages")
        .execute(&state.db)
        .await;
    let _ = sqlx::query("DELETE FROM one_time_pre_keys")
        .execute(&state.db)
        .await;
    let _ = sqlx::query("DELETE FROM devices").execute(&state.db).await;
    let _ = sqlx::query("DELETE FROM users").execute(&state.db).await;
    let _ = sqlx::query("DELETE FROM organizations")
        .execute(&state.db)
        .await;
}

async fn seed_org_user_device(
    state: &AppState,
    org_id: Uuid,
    user_id: Uuid,
    email: &str,
    device_id: Uuid,
) {
    sqlx::query("INSERT INTO organizations (id, domain, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING")
        .bind(org_id)
        .bind(format!("{}.test", org_id))
        .bind("Org")
        .execute(&state.db)
        .await
        .unwrap();

    sqlx::query(
        "INSERT INTO users (id, org_id, email, username, status, role)
         VALUES ($1, $2, $3, $4, 'active', 'USER')",
    )
    .bind(user_id)
    .bind(org_id)
    .bind(email)
    .bind(email.split('@').next().unwrap_or("user"))
    .execute(&state.db)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO devices
         (id, user_id, org_id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)",
    )
    .bind(device_id)
    .bind(user_id)
    .bind(org_id)
    .bind("Test Device")
    .bind(vec![1u8; 32])
    .bind(vec![2u8; 32])
    .bind(vec![3u8; 64])
    .execute(&state.db)
    .await
    .unwrap();
}

#[tokio::test]
async fn test_admin_route_unauthorized() {
    let state = mock_app_state().await;
    let app = Router::new()
        .nest("/api/v1/admin", admin::router())
        .with_state(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/pending-users")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_admin_route_forbidden_for_non_admin() {
    let Some(state) = integration_app_state().await else {
        eprintln!("skipping test_admin_route_forbidden_for_non_admin: DATABASE_URL not available");
        return;
    };
    reset_db(&state).await;

    let user_id = Uuid::new_v4();
    let org_id = Uuid::new_v4();
    seed_org_user_device(&state, org_id, user_id, "nonadmin@test.com", Uuid::new_v4()).await;
    let token = create_test_token(user_id, org_id, false, &state.db).await;

    let app = Router::new()
        .nest("/api/v1/admin", admin::router())
        .with_state(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/pending-users")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    reset_db(&state).await;
}

#[tokio::test]
async fn test_cross_tenant_key_request_denied() {
    let Some(state) = integration_app_state().await else {
        eprintln!("skipping test_cross_tenant_key_request_denied: DATABASE_URL not available");
        return;
    };

    reset_db(&state).await;

    let org_a = Uuid::new_v4();
    let org_b = Uuid::new_v4();
    let user_a = Uuid::new_v4();
    let user_b = Uuid::new_v4();

    seed_org_user_device(&state, org_a, user_a, "alice@orga.test", Uuid::new_v4()).await;
    seed_org_user_device(&state, org_b, user_b, "bob@orgb.test", Uuid::new_v4()).await;

    let token = create_test_token(user_a, org_a, false, &state.db).await;
    let app = Router::new()
        .nest("/api/v1/keys", keys::router())
        .with_state(state.clone());
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/keys/{}", user_b))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    reset_db(&state).await;
}

#[tokio::test]
async fn test_cross_tenant_message_send_denied() {
    let Some(state) = integration_app_state().await else {
        eprintln!("skipping test_cross_tenant_message_send_denied: DATABASE_URL not available");
        return;
    };

    reset_db(&state).await;

    let org_a = Uuid::new_v4();
    let org_b = Uuid::new_v4();
    let sender_user = Uuid::new_v4();
    let recipient_user = Uuid::new_v4();
    let sender_device = Uuid::new_v4();
    let recipient_device = Uuid::new_v4();

    seed_org_user_device(
        &state,
        org_a,
        sender_user,
        "sender@orga.test",
        sender_device,
    )
    .await;
    seed_org_user_device(
        &state,
        org_b,
        recipient_user,
        "recipient@orgb.test",
        recipient_device,
    )
    .await;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    state.ws.connections.insert(
        sender_device,
        ActiveConnection {
            tx,
            user_id: sender_user,
            org_id: org_a,
        },
    );

    handle_envelope(
        WsEnvelope::MessageSend {
            temp_id: None,
            recipient_device_id: recipient_device,
            ciphertext: base64::engine::general_purpose::STANDARD.encode("secret"),
            ephemeral_public_key: None,
            header: json!({"dh_public":"x","prev_counter":0,"msg_counter":0}),
        },
        sender_device,
        &state,
    )
    .await;

    match rx.try_recv() {
        Ok(WsMessage::Text(text)) => {
            assert!(text.contains("Cross-tenant access denied"));
        }
        other => panic!("expected ERROR ws message, got {other:?}"),
    }

    let created: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM encrypted_messages WHERE sender_device_id = $1 AND recipient_device_id = $2",
    )
    .bind(sender_device)
    .bind(recipient_device)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(created, 0);

    state.ws.connections.remove(&sender_device);
    reset_db(&state).await;
}

#[tokio::test]
async fn test_receipt_spoofing_denied() {
    let Some(state) = integration_app_state().await else {
        eprintln!("skipping test_receipt_spoofing_denied: DATABASE_URL not available");
        return;
    };

    reset_db(&state).await;

    let org_id = Uuid::new_v4();
    let sender_user = Uuid::new_v4();
    let recipient_user = Uuid::new_v4();
    let sender_device = Uuid::new_v4();
    let recipient_device = Uuid::new_v4();

    seed_org_user_device(
        &state,
        org_id,
        sender_user,
        "sender@org.test",
        sender_device,
    )
    .await;
    seed_org_user_device(
        &state,
        org_id,
        recipient_user,
        "recipient@org.test",
        recipient_device,
    )
    .await;

    let message_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO encrypted_messages
         (id, sender_device_id, recipient_device_id, ciphertext, sender_identity_key, ephemeral_public_key, ratchet_header, org_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(message_id)
    .bind(sender_device)
    .bind(recipient_device)
    .bind(vec![9u8; 8])
    .bind("sender-ik")
    .bind(Option::<String>::None)
    .bind(json!({"dh_public":"x","prev_counter":0,"msg_counter":0}))
    .bind(org_id)
    .execute(&state.db)
    .await
    .unwrap();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    state.ws.connections.insert(
        sender_device,
        ActiveConnection {
            tx,
            user_id: sender_user,
            org_id,
        },
    );

    handle_envelope(
        WsEnvelope::MessageRead { message_id },
        sender_device,
        &state,
    )
    .await;

    match rx.try_recv() {
        Ok(WsMessage::Text(text)) => {
            assert!(text.contains("Receipt spoofing denied"));
        }
        other => panic!("expected ERROR ws message, got {other:?}"),
    }

    let read_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT read_at FROM encrypted_messages WHERE id = $1")
            .bind(message_id)
            .fetch_one(&state.db)
            .await
            .unwrap();
    assert!(read_at.is_none());

    state.ws.connections.remove(&sender_device);
    reset_db(&state).await;
}
