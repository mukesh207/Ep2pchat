use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::auth::{build_access_code, Claims};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reset", post(reset))
        .route("/bootstrap", post(bootstrap))
}

#[derive(Serialize)]
struct AccountFixture {
    user_id: Uuid,
    org_id: Uuid,
    device_id: Uuid,
    email: String,
    token: String,
}

#[derive(Deserialize)]
pub struct BootstrapPayload {
    pub scenario: Option<String>,
}

pub async fn reset(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut tx = state.db.begin().await.map_err(internal_error)?;

    sqlx::query("DELETE FROM encrypted_messages")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM one_time_pre_keys")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM devices")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM passkeys")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM webauthn_sessions")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM audit_logs")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM users")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM organizations")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;

    tx.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "status": "ok" })))
}

pub async fn bootstrap(
    State(state): State<AppState>,
    Json(payload): Json<BootstrapPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _ = payload.scenario.as_deref().unwrap_or("default");
    let _ = reset(State(state.clone())).await?;

    let org_id = Uuid::new_v4();
    let other_org_id = Uuid::new_v4();

    let mut tx = state.db.begin().await.map_err(internal_error)?;

    sqlx::query("INSERT INTO organizations (id, domain, name) VALUES ($1, $2, $3)")
        .bind(org_id)
        .bind("trustline.test")
        .bind("Trustline Corp")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;

    sqlx::query("INSERT INTO organizations (id, domain, name) VALUES ($1, $2, $3)")
        .bind(other_org_id)
        .bind("other.test")
        .bind("Other Tenant")
        .execute(&mut *tx)
        .await
        .map_err(internal_error)?;

    let admin_user_id = Uuid::new_v4();
    let alice_user_id = Uuid::new_v4();
    let bob_user_id = Uuid::new_v4();
    let pending_user_id = Uuid::new_v4();
    let outsider_user_id = Uuid::new_v4();

    insert_user(
        &mut tx,
        admin_user_id,
        org_id,
        "admin@trustline.test",
        "admin",
        "active",
        true,
    )
    .await?;
    insert_user(
        &mut tx,
        alice_user_id,
        org_id,
        "alice@trustline.test",
        "alice",
        "active",
        false,
    )
    .await?;
    insert_user(
        &mut tx,
        bob_user_id,
        org_id,
        "bob@trustline.test",
        "bob",
        "active",
        false,
    )
    .await?;
    insert_user(
        &mut tx,
        pending_user_id,
        org_id,
        "newhire@trustline.test",
        "newhire",
        "pending_approval",
        false,
    )
    .await?;
    insert_user(
        &mut tx,
        outsider_user_id,
        other_org_id,
        "outsider@other.test",
        "outsider",
        "active",
        false,
    )
    .await?;

    let admin_device_id = insert_device(&mut tx, admin_user_id, org_id, "Admin Device", 10).await?;
    let alice_device_id =
        insert_device(&mut tx, alice_user_id, org_id, "Alice Desktop", 20).await?;
    let bob_device_id = insert_device(&mut tx, bob_user_id, org_id, "Bob Desktop", 30).await?;
    let outsider_device_id = insert_device(
        &mut tx,
        outsider_user_id,
        other_org_id,
        "Outsider Device",
        40,
    )
    .await?;

    insert_opk(&mut tx, admin_device_id, org_id, 1, 50).await?;
    insert_opk(&mut tx, alice_device_id, org_id, 1, 60).await?;
    insert_opk(&mut tx, bob_device_id, org_id, 1, 70).await?;
    insert_opk(&mut tx, outsider_device_id, other_org_id, 1, 80).await?;

    tx.commit().await.map_err(internal_error)?;

    let admin = AccountFixture {
        user_id: admin_user_id,
        org_id,
        device_id: admin_device_id,
        email: "admin@trustline.test".to_string(),
        token: issue_token(admin_user_id, org_id, "ADMIN".to_string(), &state).await?,
    };
    let alice = AccountFixture {
        user_id: alice_user_id,
        org_id,
        device_id: alice_device_id,
        email: "alice@trustline.test".to_string(),
        token: issue_token(alice_user_id, org_id, "USER".to_string(), &state).await?,
    };
    let bob = AccountFixture {
        user_id: bob_user_id,
        org_id,
        device_id: bob_device_id,
        email: "bob@trustline.test".to_string(),
        token: issue_token(bob_user_id, org_id, "USER".to_string(), &state).await?,
    };
    let outsider = AccountFixture {
        user_id: outsider_user_id,
        org_id: other_org_id,
        device_id: outsider_device_id,
        email: "outsider@other.test".to_string(),
        token: issue_token(outsider_user_id, other_org_id, "USER".to_string(), &state).await?,
    };

    Ok(Json(json!({
        "org_id": org_id,
        "other_org_id": other_org_id,
        "admin": admin,
        "alice": alice,
        "bob": bob,
        "outsider": outsider,
        "pending_user": {
            "user_id": pending_user_id,
            "email": "newhire@trustline.test",
            "access_code": build_access_code(pending_user_id),
        }
    })))
}

async fn insert_user(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    org_id: Uuid,
    email: &str,
    username: &str,
    status: &str,
    is_admin: bool,
) -> Result<(), (StatusCode, Json<Value>)> {
    sqlx::query(
        "INSERT INTO users (id, org_id, email, username, status, is_admin) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(user_id)
    .bind(org_id)
    .bind(email)
    .bind(username)
    .bind(status)
    .bind(is_admin)
    .execute(&mut **tx)
    .await
    .map_err(internal_error)?;
    Ok(())
}

async fn insert_device(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    org_id: Uuid,
    device_name: &str,
    seed: u8,
) -> Result<Uuid, (StatusCode, Json<Value>)> {
    let row = sqlx::query(
        "INSERT INTO devices
         (user_id, org_id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id",
    )
    .bind(user_id)
    .bind(org_id)
    .bind(device_name)
    .bind(vec![seed; 32])
    .bind(vec![seed + 1; 32])
    .bind(vec![seed + 2; 64])
    .fetch_one(&mut **tx)
    .await
    .map_err(internal_error)?;
    Ok(row.get("id"))
}

async fn insert_opk(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    device_id: Uuid,
    org_id: Uuid,
    key_id: i32,
    seed: u8,
) -> Result<(), (StatusCode, Json<Value>)> {
    sqlx::query("INSERT INTO one_time_pre_keys (device_id, org_id, key_id, public_key) VALUES ($1, $2, $3, $4)")
        .bind(device_id)
        .bind(org_id)
        .bind(key_id)
        .bind(vec![seed; 32])
        .execute(&mut **tx)
        .await
        .map_err(internal_error)?;
    Ok(())
}

async fn issue_token(
    user_id: Uuid,
    org_id: Uuid,
    role: String,
    state: &AppState,
) -> Result<String, (StatusCode, Json<Value>)> {
    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp");
    let expiration = expiration_dt.timestamp() as usize;
    
    let claims = Claims {
        sub: user_id,
        org_id,
        role,
        jti,
        exp: expiration,
    };

    // Store session in DB to pass middleware check
    let _ = sqlx::query("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(jti)
        .bind(user_id)
        .bind(expiration_dt)
        .execute(&state.db)
        .await;

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(internal_error)
}

fn internal_error<E: std::fmt::Display>(err: E) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": err.to_string() })),
    )
}
