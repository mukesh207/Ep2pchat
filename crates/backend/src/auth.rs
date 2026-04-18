use crate::AppState;
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

pub fn build_access_code(user_id: Uuid) -> String {
    let compact = user_id.simple().to_string().to_uppercase();
    format!("{}-{}", &compact[0..4], &compact[4..8])
}

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

impl FromRequestParts<AppState> for AuthContext {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok());
        if let Some(auth_header) = auth_header {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                let validation = Validation::default();
                let token_data = decode::<Claims>(
                    token,
                    &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
                    &validation,
                );
                if let Ok(data) = token_data {
                    return Ok(AuthContext {
                        claims: data.claims,
                    });
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
        .route(
            "/register-passkey/complete",
            post(register_passkey_complete),
        )
        .route("/login/begin", post(login_begin))
        .route("/login/complete", post(login_complete))
        .route("/admin-bootstrap", post(admin_bootstrap))
}

/// One-time admin bootstrap endpoint.
/// Issues a JWT directly for the admin email configured via ADMIN_EMAIL env var.
/// This bypasses WebAuthn for initial admin setup on platforms where WebAuthn
/// is not available (e.g., Linux Tauri desktop).
async fn admin_bootstrap(
    State(state): State<AppState>,
    Json(payload): Json<RequestAccessPayload>,
) -> Json<Value> {
    let email = payload.email.trim().to_lowercase();

    // Only allow the configured admin email
    let admin_email = std::env::var("ADMIN_EMAIL")
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    if admin_email.is_empty() || email != admin_email {
        return Json(json!({"error": "Admin bootstrap is not available for this email"}));
    }

    // Look up the admin user
    let row = sqlx::query(
        "SELECT u.id, u.org_id, u.is_admin, u.status FROM users u WHERE u.email = $1"
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({"error": "Admin user not found. Restart the backend to seed."})),
        Err(e) => return Json(json!({"error": format!("Database error: {}", e)})),
    };

    let user_id: Uuid = row.get("id");
    let org_id: Uuid = row.get("org_id");
    let is_admin: bool = row.get("is_admin");
    let status: String = row.get("status");

    if status != "active" || !is_admin {
        return Json(json!({"error": "User is not an active admin"}));
    }

    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        org_id,
        is_admin: true,
        exp: expiration,
    };

    let token = match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ) {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("Failed to create token: {}", e)})),
    };

    tracing::info!("✅ Admin bootstrap: issued JWT for {}", email);
    Json(json!({
        "status": "success",
        "token": token,
        "user_id": user_id,
        "org_id": org_id,
        "is_admin": true
    }))
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
    let (_, domain_part) = match email.split_once('@') {
        Some(parts) => parts,
        None => return Json(json!({"error": "Invalid email address"})),
    };
    if domain_part.is_empty() {
        return Json(json!({"error": "Invalid email address"}));
    }
    let domain = domain_part.to_string();
    let email_for_insert = email.clone();

    // RLS: org_id scoped
    let res = crate::db::with_rls_context(&state.db, Uuid::nil(), |mut tx| Box::pin(async move {
        let org_record = sqlx::query(
            "INSERT INTO organizations (domain, name) VALUES ($1, $2) ON CONFLICT (domain) DO UPDATE SET domain=EXCLUDED.domain RETURNING id"
        )
        .bind(&domain)
        .bind(&domain)
        .fetch_one(&mut *tx)
        .await?;

        let org_id: Uuid = org_record.get("id");

        sqlx::query("SELECT set_config('app.current_org_id', $1, true)")
            .bind(org_id.to_string())
            .execute(&mut *tx)
            .await?;

        let user_record = sqlx::query(
            "INSERT INTO users (org_id, email, status) VALUES ($1, $2, 'pending_approval') ON CONFLICT (org_id, email) DO UPDATE SET status=users.status RETURNING id, status"
        )
        .bind(org_id)
        .bind(&email_for_insert)
        .fetch_one(&mut *tx)
        .await?;

        let status: String = user_record.get("status");
        let user_id: Uuid = user_record.get("id");
        let access_code = build_access_code(user_id);

        Ok((user_id, status, access_code))
    })).await;

    match res {
        Ok((user_id, status, access_code)) => {
            if status == "active" {
                Json(
                    json!({"status": "active", "message": "User is already active.", "user_id": user_id, "access_code": access_code}),
                )
            } else {
                Json(
                    json!({"status": "pending", "message": "Access requested. Waiting for admin approval.", "user_id": user_id, "access_code": access_code}),
                )
            }
        }
        Err(e) => Json(json!({"error": format!("Failed to request access: {}", e)})),
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
    let res = crate::db::with_rls_context(&state.db, Uuid::nil(), |mut tx| {
        Box::pin(async move {
            let user_row = sqlx::query("SELECT org_id, email, status FROM users WHERE id = $1")
                .bind(payload.user_id)
                .fetch_optional(&mut *tx)
                .await?;

            let row = match user_row {
                Some(r) => r,
                None => return Err(sqlx::Error::Decode("User not found".into())),
            };

            let status: Option<String> = row.get("status");
            if status.as_deref() != Some("active") {
                return Err(sqlx::Error::Decode("User is not active".into()));
            }

            let email: String = row.get("email");
            let org_id: Uuid = row.get("org_id");

            sqlx::query("SELECT set_config('app.current_org_id', $1, true)")
                .bind(org_id.to_string())
                .execute(&mut *tx)
                .await?;

            let passkeys_records =
                sqlx::query("SELECT passkey_data FROM passkeys WHERE user_id = $1")
                    .bind(payload.user_id)
                    .fetch_all(&mut *tx)
                    .await
                    .unwrap_or_default();

            let mut exclude_credentials = Vec::new();
            for record in passkeys_records {
                if let Ok(data) = serde_json::from_value::<Passkey>(record.get("passkey_data")) {
                    exclude_credentials.push(data.cred_id().clone());
                }
            }

            Ok((email, org_id, exclude_credentials))
        })
    })
    .await;

    let (email, org_id, exclude_credentials) = match res {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("DB error: {}", e)})),
    };

    let webauthn_res = match state.webauthn.start_passkey_registration(
        payload.user_id,
        &email,
        &email,
        Some(exclude_credentials),
    ) {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("WebAuthn error: {:?}", e)})),
    };

    let (ccr, reg_state) = webauthn_res;
    let reg_state_json = serde_json::to_value(&reg_state).unwrap();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    let store_res = crate::db::with_rls_context(&state.db, org_id, |mut tx| Box::pin(async move {
        sqlx::query(
            "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'registration', $4)"
        )
        .bind(payload.user_id)
        .bind(org_id)
        .bind(reg_state_json)
        .bind(expires_at)
        .execute(&mut *tx)
        .await
    })).await;

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
    let session_res = crate::db::with_rls_context(&state.db, Uuid::nil(), |mut tx| Box::pin(async move {
        let session_row = sqlx::query(
            "DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'registration' AND expires_at > NOW() RETURNING challenge, org_id"
        )
        .bind(payload.user_id)
        .fetch_optional(&mut *tx)
        .await?;

        let row = match session_row {
            Some(r) => r,
            None => return Err(sqlx::Error::Decode("No session found".into())),
        };

        let challenge_val: Value = row.get("challenge");
        let org_id: Uuid = row.get("org_id");
        Ok((challenge_val, org_id))
    })).await;

    let (challenge_val, org_id) = match session_res {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    let reg_state: PasskeyRegistration = match serde_json::from_value(challenge_val) {
        Ok(s) => s,
        Err(_) => return Json(json!({"error": "Invalid session state"})),
    };

    let passkey = match state
        .webauthn
        .finish_passkey_registration(&payload.credential, &reg_state)
    {
        Ok(p) => p,
        Err(e) => return Json(json!({"error": format!("Registration failed: {:?}", e)})),
    };

    let passkey_json = serde_json::to_value(&passkey).unwrap();
    let cred_id = passkey.cred_id().clone();

    let insert_res = crate::db::with_rls_context(&state.db, org_id, |mut tx| Box::pin(async move {
        sqlx::query(
            "INSERT INTO passkeys (user_id, org_id, passkey_id, passkey_data) VALUES ($1, $2, $3, $4)"
        )
        .bind(payload.user_id)
        .bind(org_id)
        .bind(cred_id.as_slice())
        .bind(passkey_json)
        .execute(&mut *tx)
        .await
    })).await;

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

    let start_res = crate::db::with_rls_context(&state.db, Uuid::nil(), |mut tx| {
        Box::pin(async move {
            let user_row =
                sqlx::query("SELECT id, org_id FROM users WHERE email = $1 AND status = 'active'")
                    .bind(&email)
                    .fetch_optional(&mut *tx)
                    .await?;

            let row = match user_row {
                Some(r) => r,
                None => return Err(sqlx::Error::Decode("User not found".into())),
            };

            let user_id: Uuid = row.get("id");
            let org_id: Uuid = row.get("org_id");

            sqlx::query("SELECT set_config('app.current_org_id', $1, true)")
                .bind(org_id.to_string())
                .execute(&mut *tx)
                .await?;

            let passkeys_records =
                sqlx::query("SELECT passkey_data FROM passkeys WHERE user_id = $1")
                    .bind(user_id)
                    .fetch_all(&mut *tx)
                    .await
                    .unwrap_or_default();

            let mut passkeys = Vec::new();
            for record in passkeys_records {
                if let Ok(data) = serde_json::from_value::<Passkey>(record.get("passkey_data")) {
                    passkeys.push(data);
                }
            }

            Ok((user_id, org_id, passkeys))
        })
    })
    .await;

    let (user_id, org_id, passkeys) = match start_res {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("DB error: {}", e)})),
    };

    if passkeys.is_empty() {
        return Json(json!({"error": "No passkeys found for this user"}));
    }

    let auth_res = match state.webauthn.start_passkey_authentication(&passkeys) {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("WebAuthn error: {:?}", e)})),
    };
    let (rcr, auth_state) = auth_res;

    let auth_state_json = serde_json::to_value(&auth_state).unwrap();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    let store_res = crate::db::with_rls_context(&state.db, org_id, |mut tx| Box::pin(async move {
        sqlx::query(
            "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'authentication', $4)"
        )
        .bind(user_id)
        .bind(org_id)
        .bind(auth_state_json)
        .bind(expires_at)
        .execute(&mut *tx)
        .await
    })).await;

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
    let session_res = crate::db::with_rls_context(&state.db, Uuid::nil(), |mut tx| Box::pin(async move {
        let session_row = sqlx::query(
            "DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'authentication' AND expires_at > NOW() RETURNING challenge, org_id"
        )
        .bind(payload.user_id)
        .fetch_optional(&mut *tx)
        .await?;

        let row = match session_row {
            Some(r) => r,
            None => return Err(sqlx::Error::Decode("No active session".into())),
        };

        let challenge_val: Value = row.get("challenge");
        let org_id: Uuid = row.get("org_id");
        Ok((challenge_val, org_id))
    })).await;

    let (challenge_val, org_id) = match session_res {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    let auth_state: PasskeyAuthentication = match serde_json::from_value(challenge_val) {
        Ok(s) => s,
        Err(_) => return Json(json!({"error": "Invalid session state"})),
    };

    let auth_verify = match state
        .webauthn
        .finish_passkey_authentication(&payload.credential, &auth_state)
    {
        Ok(r) => r,
        Err(e) => return Json(json!({"error": format!("Authentication failed: {:?}", e)})),
    };

    let cred_id = auth_verify.cred_id().clone();
    let passkey_json = serde_json::to_value(&auth_verify).unwrap();

    let final_res = crate::db::with_rls_context(&state.db, org_id, |mut tx| {
        Box::pin(async move {
            let _ = sqlx::query(
                "UPDATE passkeys SET passkey_data = $1 WHERE passkey_id = $2 AND user_id = $3",
            )
            .bind(passkey_json)
            .bind(cred_id.as_slice())
            .bind(payload.user_id)
            .execute(&mut *tx)
            .await?;

            let user_record = sqlx::query("SELECT is_admin FROM users WHERE id = $1")
                .bind(payload.user_id)
                .fetch_optional(&mut *tx)
                .await?;

            Ok(user_record)
        })
    })
    .await;

    let user_record = match final_res {
        Ok(Some(r)) => r,
        _ => return Json(json!({"error": "User not found or DB err"})),
    };

    let is_admin: bool = user_record
        .get::<Option<bool>, _>("is_admin")
        .unwrap_or(false);

    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: payload.user_id,
        org_id,
        is_admin,
        exp: expiration,
    };

    let token = match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ) {
        Ok(t) => t,
        Err(e) => return Json(json!({"error": format!("Failed to create token: {}", e)})),
    };

    Json(json!({"status": "success", "token": token, "user_id": payload.user_id, "org_id": org_id}))
}
