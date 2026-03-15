use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    routing::post,
    Json, Router,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;
use webauthn_rs::prelude::*;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub org_id: Uuid,
    pub is_admin: bool,
    pub exp: usize,
}

pub struct AuthContext {
    pub claims: Claims,
}

impl<S> FromRequestParts<S> for AuthContext
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers.get("Authorization").and_then(|h| h.to_str().ok());
        if let Some(auth_header) = auth_header {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "super_secret_fallback_key_for_dev".to_string());
                let validation = Validation::default();
                // Depending on jsonwebtoken version, we might not need to mutate validation here.
                let token_data = decode::<Claims>(
                    token,
                    &DecodingKey::from_secret(jwt_secret.as_bytes()),
                    &validation,
                );
                if let Ok(data) = token_data {
                    return Ok(AuthContext { claims: data.claims });
                }
            }
        }
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Unauthorized"})),
        ))
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/request-access", post(request_access))
        .route("/register-passkey/begin", post(register_passkey_begin))
        .route("/register-passkey/complete", post(register_passkey_complete))
        .route("/login/begin", post(login_begin))
        .route("/login/complete", post(login_complete))
}

#[derive(Deserialize)]
pub struct RequestAccessPayload {
    pub email: String,
}

pub async fn request_access(
    State(state): State<AppState>,
    Json(payload): Json<RequestAccessPayload>,
) -> Json<Value> {
    let email = payload.email.trim().to_lowercase();
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Json(json!({"error": "Invalid email address"}));
    }
    let domain = parts[1];

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    // Find or create organization
    let org_record = sqlx::query(
        "INSERT INTO organizations (domain, name) VALUES ($1, $2) ON CONFLICT (domain) DO UPDATE SET domain=EXCLUDED.domain RETURNING id"
    )
    .bind(domain)
    .bind(domain)
    .fetch_one(&mut *tx)
    .await;

    let org_id: Uuid = match org_record {
        Ok(row) => row.get("id"),
        Err(e) => return Json(json!({"error": format!("Failed to find or create organization: {}", e)})),
    };

    // Insert user as pending_approval
    let user_record = sqlx::query(
        "INSERT INTO users (org_id, email, status) VALUES ($1, $2, 'pending_approval') ON CONFLICT (org_id, email) DO UPDATE SET status=users.status RETURNING id, status"
    )
    .bind(org_id)
    .bind(&email)
    .fetch_one(&mut *tx)
    .await;

    match user_record {
        Ok(row) => {
            let status: String = row.get("status");
            let user_id: Uuid = row.get("id");
            if let Err(e) = tx.commit().await {
                return Json(json!({"error": format!("Failed to commit tx: {}", e)}));
            }
            if status == "active" {
                Json(json!({"status": "active", "message": "User is already active.", "user_id": user_id}))
            } else {
                Json(json!({"status": "pending", "message": "Access requested. Waiting for admin approval.", "user_id": user_id}))
            }
        }
        Err(e) => {
            Json(json!({"error": format!("Failed to request access: {}", e)}))
        }
    }
}

#[derive(Deserialize)]
pub struct RegisterBeginPayload {
    pub user_id: Uuid,
}

pub async fn register_passkey_begin(
    State(state): State<AppState>,
    Json(payload): Json<RegisterBeginPayload>,
) -> Json<Value> {
    let user_record = sqlx::query("SELECT org_id, email, status FROM users WHERE id = $1")
        .bind(payload.user_id)
        .fetch_optional(&state.db)
        .await;

    let user_row = match user_record {
        Ok(Some(row)) => row,
        Ok(None) => return Json(json!({"error": "User not found"})),
        Err(e) => return Json(json!({"error": format!("DB error: {}", e)})),
    };

    let status: Option<String> = user_row.get("status");
    if status.as_deref() != Some("active") {
        return Json(json!({"error": "User is not active. Admin approval required."}));
    }

    let email: String = user_row.get("email");
    let org_id: Uuid = user_row.get("org_id");

    // Fetch existing passkeys to prevent re-registration of the same device
    let existing_passkeys_records = sqlx::query("SELECT passkey_data FROM passkeys WHERE user_id = $1")
        .bind(payload.user_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let mut exclude_credentials = Vec::new();
    for record in existing_passkeys_records {
        if let Ok(data) = serde_json::from_value::<Passkey>(record.get("passkey_data")) {
            exclude_credentials.push(data.cred_id().clone());
        }
    }

    let res = match state.webauthn.start_passkey_registration(
        payload.user_id,
        &email,
        &email,
        Some(exclude_credentials),
    ) {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("WebAuthn error: {:?}", e)})),
    };

    let (ccr, reg_state) = res;
    let reg_state_json = serde_json::to_value(&reg_state).unwrap();

    // Store in DB
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);
    let store_res = sqlx::query(
        "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'registration', $4)"
    )
    .bind(payload.user_id)
    .bind(org_id)
    .bind(reg_state_json)
    .bind(expires_at)
    .execute(&state.db)
    .await;

    if let Err(e) = store_res {
        return Json(json!({"error": format!("Failed to store session: {}", e)}));
    }

    Json(json!({ "challenge": ccr }))
}

#[derive(Deserialize)]
pub struct RegisterCompletePayload {
    pub user_id: Uuid,
    pub credential: RegisterPublicKeyCredential,
}

pub async fn register_passkey_complete(
    State(state): State<AppState>,
    Json(payload): Json<RegisterCompletePayload>,
) -> Json<Value> {
    // 1. Get session state
    let session_row = match sqlx::query(
        "DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'registration' AND expires_at > NOW() RETURNING challenge, org_id"
    )
    .bind(payload.user_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({"error": "No active registration session found or it expired"})),
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    let challenge_val: Value = session_row.get("challenge");
    let org_id: Uuid = session_row.get("org_id");
    let reg_state: PasskeyRegistration = match serde_json::from_value(challenge_val) {
        Ok(s) => s,
        Err(_) => return Json(json!({"error": "Invalid session state"})),
    };

    // 2. Verify challenge
    let passkey = match state.webauthn.finish_passkey_registration(&payload.credential, &reg_state) {
        Ok(p) => p,
        Err(e) => return Json(json!({"error": format!("Registration failed: {:?}", e)})),
    };

    // 3. Store passkey
    let passkey_json = serde_json::to_value(&passkey).unwrap();
    let cred_id = passkey.cred_id().clone();

    let insert_res = sqlx::query(
        "INSERT INTO passkeys (user_id, org_id, passkey_id, passkey_data) VALUES ($1, $2, $3, $4)"
    )
    .bind(payload.user_id)
    .bind(org_id)
    .bind(cred_id.as_slice())
    .bind(passkey_json)
    .execute(&state.db)
    .await;

    if let Err(e) = insert_res {
        return Json(json!({"error": format!("Failed to store passkey: {}", e)}));
    }

    Json(json!({"status": "success", "message": "Passkey registered successfully"}))
}

#[derive(Deserialize)]
pub struct LoginBeginPayload {
    pub email: String,
}

pub async fn login_begin(
    State(state): State<AppState>,
    Json(payload): Json<LoginBeginPayload>,
) -> Json<Value> {
    let email = payload.email.trim().to_lowercase();
    let user_record = sqlx::query("SELECT id, org_id FROM users WHERE email = $1 AND status = 'active'")
        .bind(&email)
        .fetch_optional(&state.db)
        .await;

    let user_row = match user_record {
        Ok(Some(row)) => row,
        Ok(None) => return Json(json!({"error": "User not found or inactive"})),
        Err(e) => return Json(json!({"error": format!("DB error: {}", e)})),
    };

    let user_id: Uuid = user_row.get("id");
    let org_id: Uuid = user_row.get("org_id");

    let existing_passkeys_records = sqlx::query("SELECT passkey_data FROM passkeys WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    if existing_passkeys_records.is_empty() {
        return Json(json!({"error": "No passkeys found for this user"}));
    }

    let mut passkeys = Vec::new();
    for record in existing_passkeys_records {
        if let Ok(data) = serde_json::from_value::<Passkey>(record.get("passkey_data")) {
            passkeys.push(data);
        }
    }

    let res = match state.webauthn.start_passkey_authentication(&passkeys) {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("WebAuthn error: {:?}", e)})),
    };

    let (rcr, auth_state) = res;
    let auth_state_json = serde_json::to_value(&auth_state).unwrap();

    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);
    let store_res = sqlx::query(
        "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'authentication', $4)"
    )
    .bind(user_id)
    .bind(org_id)
    .bind(auth_state_json)
    .bind(expires_at)
    .execute(&state.db)
    .await;

    if let Err(e) = store_res {
        return Json(json!({"error": format!("Failed to store session: {}", e)}));
    }

    Json(json!({ "challenge": rcr, "user_id": user_id }))
}

#[derive(Deserialize)]
pub struct LoginCompletePayload {
    pub user_id: Uuid,
    pub credential: PublicKeyCredential,
}

pub async fn login_complete(
    State(state): State<AppState>,
    Json(payload): Json<LoginCompletePayload>,
) -> Json<Value> {
    let session_row = match sqlx::query(
        "DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'authentication' AND expires_at > NOW() RETURNING challenge, org_id"
    )
    .bind(payload.user_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({"error": "No active authentication session found or it expired"})),
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    let challenge_val: Value = session_row.get("challenge");
    let org_id: Uuid = session_row.get("org_id");
    let auth_state: PasskeyAuthentication = match serde_json::from_value(challenge_val) {
        Ok(s) => s,
        Err(_) => return Json(json!({"error": "Invalid session state"})),
    };

    let res = match state.webauthn.finish_passkey_authentication(&payload.credential, &auth_state) {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("Authentication failed: {:?}", e)})),
    };

    // Update the credential counter/status in DB if needed (not strictly necessary for basic usage, but good practice)
    let cred_id = res.cred_id().clone();
    let passkey_json = serde_json::to_value(&res).unwrap();
    let _ = sqlx::query("UPDATE passkeys SET passkey_data = $1 WHERE passkey_id = $2 AND user_id = $3")
        .bind(passkey_json)
        .bind(cred_id.as_slice())
        .bind(payload.user_id)
        .execute(&state.db)
        .await;

    // Issue a short-lived JWT token
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "super_secret_fallback_key_for_dev".to_string());
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let user_record = match sqlx::query("SELECT is_admin FROM users WHERE id = $1")
        .bind(payload.user_id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({"error": "User not found"})),
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };
    let is_admin: bool = user_record.get::<Option<bool>, _>("is_admin").unwrap_or(false);

    let claims = Claims {
        sub: payload.user_id,
        org_id,
        is_admin,
        exp: expiration,
    };

    let token = match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    ) {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("Failed to create token: {}", e)})),
    };

    Json(json!({"status": "success", "token": token, "user_id": payload.user_id, "org_id": org_id}))
}
