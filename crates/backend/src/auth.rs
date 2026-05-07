use crate::AppState;
use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    routing::post,
    Json, Router,
};
use dashmap::DashMap;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;
use webauthn_rs::prelude::*;

// ── Rate Limiter ────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_REQUESTS: usize = 5;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;

/// In-memory key-based rate limiter using DashMap for lock-free concurrent access.
#[derive(Clone)]
pub struct RateLimiter {
    attempts: Arc<DashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self { attempts: Arc::new(DashMap::new()) }
    }

    /// Returns true if the request is allowed, false if rate-limited.
    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let cutoff = now - std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);

        let mut entry = self.attempts.entry(key.to_string()).or_default();
        // Prune old entries
        entry.retain(|t| *t > cutoff);

        if entry.len() >= RATE_LIMIT_MAX_REQUESTS {
            return false;
        }
        entry.push(now);
        true
    }
}

pub fn build_access_code(user_id: Uuid) -> String {
    let compact = user_id.simple().to_string().to_uppercase();
    format!("{}-{}", &compact[0..4], &compact[4..8])
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub org_id: Uuid,
    pub role: String,
    pub jti: Uuid,
    pub exp: usize,
}

#[derive(Clone)]
pub struct AuthContext {
    pub claims: Claims,
}

impl FromRequestParts<AppState> for AuthContext {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers.get("Authorization").and_then(|h| h.to_str().ok());
        if let Some(auth_header) = auth_header {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                let validation = Validation::default();
                let token_data = decode::<Claims>(
                    token,
                    &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
                    &validation,
                );
                if let Ok(data) = token_data {
                    // Session Revocation Check: Ensure JTI exists in database
                    let session_exists = sqlx::query("SELECT 1 FROM sessions WHERE jti = $1")
                        .bind(data.claims.jti)
                        .fetch_optional(&state.db)
                        .await;

                    if let Ok(Some(_)) = session_exists {
                        return Ok(AuthContext { claims: data.claims });
                    }
                }
            }
        }
        Err((StatusCode::UNAUTHORIZED, Json(json!({"error": "Unauthorized"}))))
    }
}

pub async fn logout(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let res = sqlx::query("DELETE FROM sessions WHERE jti = $1")
        .bind(auth.claims.jti)
        .execute(&state.db)
        .await;

    match res {
        Ok(_) => Ok(Json(json!({ "status": "success" }))),
        Err(e) => {
            tracing::error!("Failed to logout session: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/request-access", post(request_access))
        .route("/register-passkey/begin", post(register_passkey_begin))
        .route("/register-passkey/complete", post(register_passkey_complete))
        .route("/login/begin", post(login_begin))
        .route("/login/complete", post(login_complete))
        .route("/admin-bootstrap", post(admin_bootstrap))
        .route("/logout", post(logout))
}

/// One-time admin bootstrap endpoint.
/// Issues a JWT directly for the admin email configured via ADMIN_EMAIL env var.
/// This bypasses WebAuthn for initial admin setup on platforms where WebAuthn
/// is not available (e.g., Linux Tauri desktop).
async fn admin_bootstrap(
    State(state): State<AppState>,
    Json(payload): Json<AdminBootstrapPayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();
    let provided_setup_token = payload.setup_token.unwrap_or_default();

    if !state.admin_bootstrap_enabled {
        return Err(AppError::Forbidden("Admin bootstrap is disabled".into()));
    }

    let expected_setup_token = match state.admin_bootstrap_setup_token.as_ref() {
        Some(token) => token,
        None => {
            tracing::error!("ADMIN_BOOTSTRAP_ENABLED=true but setup token is not configured");
            return Err(AppError::Internal("Admin bootstrap is not configured".into()));
        }
    };

    if provided_setup_token.trim().is_empty() || provided_setup_token.trim() != expected_setup_token
    {
        tracing::warn!("⚠️ Admin bootstrap rejected due to invalid setup token");
        return Err(AppError::Unauthorized("Admin bootstrap credentials invalid or unavailable".into()));
    }

    // Rate limit: 5 attempts per minute per email
    if !state.rate_limiter.check(&format!("admin-bootstrap:{}", email)) {
        tracing::warn!("⚠️ Rate limit exceeded for admin-bootstrap: {}", email);
        return Err(AppError::Forbidden("Too many attempts. Please try again in a minute.".into()));
    }

    // Only allow the configured admin email
    let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_default().trim().to_lowercase();

    if admin_email.is_empty() || email != admin_email {
        return Err(AppError::Forbidden("Admin bootstrap is not available for this email".into()));
    }

    // Look up the admin user
    let row =
        sqlx::query("SELECT u.id, u.org_id, u.role, u.status, u.username, u.department FROM users u WHERE u.email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound("Admin user not found. Restart the backend to seed.".into()))
        }
    };

    let user_id: Uuid = row.get("id");
    let org_id: Uuid = row.get("org_id");
    let role: String = row.get("role");
    let status: String = row.get("status");
    let username: Option<String> = row.get("username");
    let department: Option<String> = row.get("department");

    if status != "active" || role != "ADMIN" {
        return Err(AppError::Forbidden("User is not an active admin".into()));
    }

    // Invalidate any previous bootstrap sessions for this admin to enforce single active session.
    let _ = sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp");
    let expiration = expiration_dt.timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        org_id,
        role: role.clone(),
        jti,
        exp: expiration,
    };

    // Store session in DB
    let session_store = sqlx::query("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(jti)
        .bind(user_id)
        .bind(expiration_dt)
        .execute(&state.db)
        .await;

    if let Err(e) = session_store {
        return Err(e.into());
    }

    let token = match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ) {
        Ok(t) => t,
        Err(e) => {
            return Err(AppError::Internal(format!("Failed to create token: {}", e)));
        }
    };

    tracing::info!("✅ Admin bootstrap: issued JWT for {}", email);
    Ok(Json(json!({
        "status": "success",
        "token": token,
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
        "username": username,
        "department": department
    })))
}

#[derive(Deserialize)]
pub struct RequestAccessPayload {
    pub email: String,
    pub metadata: Option<Value>,
}

#[derive(Deserialize)]
pub struct AdminBootstrapPayload {
    pub email: String,
    pub setup_token: Option<String>,
}

use crate::error::AppError;

pub async fn request_access(
    State(state): State<AppState>,
    Json(payload): Json<RequestAccessPayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();
    let (_, domain_part) = match email.split_once('@') {
        Some(parts) => parts,
        None => return Err(AppError::BadRequest("Invalid email address".into())),
    };
    if domain_part.is_empty() {
        return Err(AppError::BadRequest("Invalid email address".into()));
    }
    let domain = domain_part.to_string();
    let email_for_insert = email.clone();
    let metadata = payload.metadata.unwrap_or(json!({}));

    // RLS: org_id scoped
    let (user_id, status, access_code) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| Box::pin(async move {
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
            "INSERT INTO users (org_id, email, status, request_metadata) 
             VALUES ($1, $2, 'pending_approval', $3) 
             ON CONFLICT (org_id, email) DO UPDATE SET request_metadata = EXCLUDED.request_metadata
             RETURNING id, status"
        )
        .bind(org_id)
        .bind(&email_for_insert)
        .bind(metadata)
        .fetch_one(&mut *tx)
        .await?;

        let status: String = user_record.get("status");
        let user_id: Uuid = user_record.get("id");
        let access_code = build_access_code(user_id);

        Ok((user_id, status, access_code))
    })).await?;

    if status == "active" {
        Ok(Json(
            json!({"status": "active", "message": "User is already active.", "user_id": user_id, "access_code": access_code}),
        ))
    } else {
        Ok(Json(
            json!({"status": "pending", "message": "Access requested. Waiting for admin approval.", "user_id": user_id, "access_code": access_code}),
        ))
    }
}

#[derive(Deserialize)]
pub struct RegisterBeginPayload {
    pub user_id: Uuid,
}

pub async fn register_passkey_begin(
    State(state): State<AppState>,
    Json(payload): Json<RegisterBeginPayload>,
) -> Result<Json<Value>, AppError> {
    let (email, org_id, exclude_credentials) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| {
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
    .await?;

    let webauthn_res = state.webauthn.start_passkey_registration(
        payload.user_id,
        &email,
        &email,
        Some(exclude_credentials),
    ).map_err(|e| AppError::Internal(format!("WebAuthn error: {:?}", e)))?;

    let (ccr, reg_state) = webauthn_res;
    let reg_state_json = serde_json::to_value(&reg_state).unwrap();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    crate::db::with_rls_context(&state.db, org_id, |tx| Box::pin(async move {
        let _ = sqlx::query("DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'registration'")
            .bind(payload.user_id)
            .execute(&mut *tx)
            .await;

        sqlx::query(
            "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'registration', $4)"
        )
        .bind(payload.user_id)
        .bind(org_id)
        .bind(reg_state_json)
        .bind(expires_at)
        .execute(&mut *tx)
        .await
    })).await?;

    Ok(Json(json!({ "challenge": ccr })))
}

#[derive(Deserialize)]
pub struct RegisterCompletePayload {
    pub user_id: Uuid,
    pub credential: RegisterPublicKeyCredential,
}

pub async fn register_passkey_complete(
    State(state): State<AppState>,
    Json(payload): Json<RegisterCompletePayload>,
) -> Result<Json<Value>, AppError> {
    let (challenge_val, org_id) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| Box::pin(async move {
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
    })).await?;

    let reg_state: PasskeyRegistration = serde_json::from_value(challenge_val)
        .map_err(|_| AppError::BadRequest("Invalid session state".into()))?;

    let passkey = state.webauthn.finish_passkey_registration(&payload.credential, &reg_state)
        .map_err(|e| AppError::BadRequest(format!("Registration failed: {:?}", e)))?;

    let passkey_json = serde_json::to_value(&passkey).unwrap();
    let cred_id = passkey.cred_id().clone();

    crate::db::with_rls_context(&state.db, org_id, |tx| Box::pin(async move {
        sqlx::query(
            "INSERT INTO passkeys (user_id, org_id, passkey_id, passkey_data) VALUES ($1, $2, $3, $4)"
        )
        .bind(payload.user_id)
        .bind(org_id)
        .bind(cred_id.as_slice())
        .bind(passkey_json)
        .execute(&mut *tx)
        .await
    })).await?;

    Ok(Json(json!({"status": "success", "message": "Passkey registered successfully"})))
}

#[derive(Deserialize)]
pub struct LoginBeginPayload {
    pub email: String,
}

pub async fn login_begin(
    State(state): State<AppState>,
    Json(payload): Json<LoginBeginPayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();

    let (user_id, org_id, passkeys) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| {
        Box::pin(async move {
            let user_row =
                sqlx::query("SELECT id, org_id, role FROM users WHERE email = $1 AND status = 'active'")
                    .bind(&email)
                    .fetch_optional(&mut *tx)
                    .await?;

            let row = match user_row {
                Some(r) => r,
                None => return Err(sqlx::Error::Decode("User not found".into())),
            };

            let user_id: Uuid = row.get("id");
            let org_id: Uuid = row.get("org_id");
            let role: String = row.get("role");

            // Check maintenance mode
            let org_row = sqlx::query("SELECT is_maintenance_mode FROM organizations WHERE id = $1")
                .bind(org_id)
                .fetch_one(&mut *tx)
                .await?;
            let is_maintenance: bool = org_row.get::<Option<bool>, _>("is_maintenance_mode").unwrap_or(false);

            if is_maintenance && role != "ADMIN" {
                return Err(sqlx::Error::Decode("MAINTENANCE_MODE".into()));
            }

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
    .await.map_err(|e| {
        let err_str = e.to_string();
        if err_str.contains("MAINTENANCE_MODE") {
            // Re-wrap specialized error string if needed, or handle in AppError
            return AppError::Forbidden("MAINTENANCE_MODE".into());
        }
        AppError::from(e)
    })?;

    if passkeys.is_empty() {
        return Err(AppError::NotFound("No passkeys found for this user".into()));
    }

    let (rcr, auth_state) = state.webauthn.start_passkey_authentication(&passkeys)
        .map_err(|e| AppError::Internal(format!("WebAuthn error: {:?}", e)))?;

    let auth_state_json = serde_json::to_value(&auth_state).unwrap();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    crate::db::with_rls_context(&state.db, org_id, |tx| Box::pin(async move {
        let _ = sqlx::query("DELETE FROM webauthn_sessions WHERE user_id = $1 AND session_type = 'authentication'")
            .bind(user_id)
            .execute(&mut *tx)
            .await;

        sqlx::query(
            "INSERT INTO webauthn_sessions (user_id, org_id, challenge, session_type, expires_at) VALUES ($1, $2, $3, 'authentication', $4)"
        )
        .bind(user_id)
        .bind(org_id)
        .bind(auth_state_json)
        .bind(expires_at)
        .execute(&mut *tx)
        .await
    })).await?;

    Ok(Json(json!({ "challenge": rcr, "user_id": user_id })))
}

#[derive(Deserialize)]
pub struct LoginCompletePayload {
    pub user_id: Uuid,
    pub credential: PublicKeyCredential,
}

pub async fn login_complete(
    State(state): State<AppState>,
    Json(payload): Json<LoginCompletePayload>,
) -> Result<Json<Value>, AppError> {
    let (challenge_val, org_id) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| Box::pin(async move {
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
    })).await?;

    let auth_state: PasskeyAuthentication = serde_json::from_value(challenge_val)
        .map_err(|_| AppError::BadRequest("Invalid session state".into()))?;

    let auth_verify = state.webauthn.finish_passkey_authentication(&payload.credential, &auth_state)
        .map_err(|e| AppError::BadRequest(format!("Authentication failed: {:?}", e)))?;

    let cred_id = auth_verify.cred_id().clone();
    let passkey_json = serde_json::to_value(&auth_verify).unwrap();

    let user_record = crate::db::with_rls_context(&state.db, org_id, |tx| {
        Box::pin(async move {
            let _ = sqlx::query(
                "UPDATE passkeys SET passkey_data = $1 WHERE passkey_id = $2 AND user_id = $3",
            )
            .bind(passkey_json)
            .bind(cred_id.as_slice())
            .bind(payload.user_id)
            .execute(&mut *tx)
            .await?;

            let user_record = sqlx::query("SELECT role, username, department FROM users WHERE id = $1")
                .bind(payload.user_id)
                .fetch_optional(&mut *tx)
                .await?;

            Ok(user_record)
        })
    })
    .await?;

    let user_record = match user_record {
        Some(r) => r,
        _ => return Err(AppError::NotFound("User not found".into())),
    };

    let role: String = user_record.get("role");
    let username: Option<String> = user_record.get("username");
    let department: Option<String> = user_record.get("department");

    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp");
    let expiration = expiration_dt.timestamp() as usize;

    let claims = Claims {
        sub: payload.user_id,
        org_id,
        role: role.clone(),
        jti,
        exp: expiration,
    };

    // Store session in DB
    sqlx::query("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(jti)
        .bind(payload.user_id)
        .bind(expiration_dt)
        .execute(&state.db)
        .await?;

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ).map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

    Ok(Json(json!({"status": "success", "token": token, "user_id": payload.user_id, "org_id": org_id, "role": role, "username": username, "department": department})))
}
