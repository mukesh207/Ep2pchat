use crate::AppState;
use crate::error::AppError;
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
use base64::{Engine as _, engine::general_purpose::STANDARD};

// ── Rate Limiter ────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_REQUESTS: usize = 5;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;

#[derive(Clone)]
pub struct RateLimiter {
    attempts: Arc<DashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self { attempts: Arc::new(DashMap::new()) }
    }

    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let cutoff = now - std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);

        let mut entry = self.attempts.entry(key.to_string()).or_default();
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
        .route("/register-device", post(register_device))
        .route("/login/challenge", post(login_challenge))
        .route("/login/verify", post(login_verify))
        .route("/admin-bootstrap", post(admin_bootstrap))
        .route("/logout", post(logout))
}

#[derive(Deserialize)]
pub struct RegisterDevicePayload {
    pub email: String,
    pub access_code: String,
    pub device_name: String,
    pub identity_key: String,       // base64
    pub signed_pre_key: String,     // base64
    pub signed_pre_key_sig: String, // base64
}

pub async fn register_device(
    State(state): State<AppState>,
    Json(payload): Json<RegisterDevicePayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();
    
    // 1. Verify user exists and is active
    let user_row = sqlx::query("SELECT id, org_id, status FROM users WHERE email = $1")
        .bind(&email).fetch_optional(&state.db).await?;
    let user = user_row.ok_or(AppError::NotFound("User not found".into()))?;
    
    if user.get::<String, _>("status") != "active" {
        return Err(AppError::Forbidden("User not approved yet".into()));
    }

    let user_id: Uuid = user.get("id");
    let org_id: Uuid = user.get("org_id");

    // 2. Verify access code
    if build_access_code(user_id) != payload.access_code.trim().to_uppercase() {
        return Err(AppError::Unauthorized("Invalid access code".into()));
    }

    // 3. Create device
    let ik = STANDARD.decode(&payload.identity_key).map_err(|_| AppError::BadRequest("Invalid IK".into()))?;
    let spk = STANDARD.decode(&payload.signed_pre_key).map_err(|_| AppError::BadRequest("Invalid SPK".into()))?;
    let spk_sig = STANDARD.decode(&payload.signed_pre_key_sig).map_err(|_| AppError::BadRequest("Invalid SPK Sig".into()))?;

    let device_id = crate::db::with_rls_context(&state.db, org_id, |tx| Box::pin(async move {
        let device_row = sqlx::query(
            "INSERT INTO devices (user_id, org_id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
        )
        .bind(user_id)
        .bind(org_id)
        .bind(&payload.device_name)
        .bind(ik)
        .bind(spk)
        .bind(spk_sig)
        .fetch_one(&mut *tx)
        .await?;
        
        Ok(device_row.get::<Uuid, _>("id"))
    })).await?;

    // 4. Issue initial JWT
    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now() + chrono::Duration::hours(24);
    let claims = Claims {
        sub: user_id, org_id, role: "USER".to_string(), jti, exp: expiration_dt.timestamp() as usize,
    };

    sqlx::query("INSERT INTO sessions (jti, user_id, device_id, expires_at) VALUES ($1, $2, $3, $4)")
        .bind(jti).bind(user_id).bind(device_id).bind(expiration_dt).execute(&state.db).await?;

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(state.jwt_secret.as_bytes()))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(json!({"status": "success", "token": token, "user_id": user_id, "org_id": org_id, "device_id": device_id})))
}

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
        None => return Err(AppError::Internal("Admin bootstrap is not configured".into())),
    };

    if provided_setup_token.trim().is_empty() || provided_setup_token.trim() != expected_setup_token
    {
        return Err(AppError::Unauthorized("Invalid setup token".into()));
    }

    if state.admin_bootstrap_consumed.load(std::sync::atomic::Ordering::SeqCst) {
        return Err(AppError::Forbidden("Admin bootstrap token has already been consumed".into()));
    }

    if !state.rate_limiter.check(&format!("admin-bootstrap:{}", email)) {
        return Err(AppError::Forbidden("Too many attempts".into()));
    }

    let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_default().trim().to_lowercase();
    if admin_email.is_empty() || email != admin_email {
        return Err(AppError::Forbidden("Email not authorized for admin bootstrap".into()));
    }

    let row = sqlx::query("SELECT id, org_id, role, status, username, department FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;

    let row = row.ok_or(AppError::NotFound("Admin user not found".into()))?;
    let status: String = row.get("status");
    let role: String = row.get("role");

    if status != "active" || role != "ADMIN" {
        return Err(AppError::Forbidden("User is not an active admin".into()));
    }

    let user_id: Uuid = row.get("id");
    let org_id: Uuid = row.get("org_id");

    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now() + chrono::Duration::hours(24);
    let claims = Claims {
        sub: user_id,
        org_id,
        role: role.clone(),
        jti,
        exp: expiration_dt.timestamp() as usize,
    };

    sqlx::query("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)")
        .bind(jti).bind(user_id).bind(expiration_dt).execute(&state.db).await?;

    state.admin_bootstrap_consumed.store(true, std::sync::atomic::Ordering::SeqCst);

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(state.jwt_secret.as_bytes()))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(json!({
        "status": "success", "token": token, "user_id": user_id, "org_id": org_id, "role": role,
        "username": row.get::<Option<String>, _>("username"),
        "department": row.get::<Option<String>, _>("department")
    })))
}

#[derive(Deserialize)]
pub struct AdminBootstrapPayload {
    pub email: String,
    pub setup_token: Option<String>,
}

#[derive(Deserialize)]
pub struct RequestAccessPayload {
    pub email: String,
    pub metadata: Option<Value>,
}

pub async fn request_access(
    State(state): State<AppState>,
    Json(payload): Json<RequestAccessPayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();
    let domain = email.split('@').last().ok_or(AppError::BadRequest("Invalid email".into()))?.to_string();
    let metadata = payload.metadata.unwrap_or(json!({}));

    let email_for_closure = email.clone();
    let (user_id, org_id, status, access_code) = crate::db::with_rls_context(&state.db, Uuid::nil(), |tx| Box::pin(async move {
        let org_id: Uuid = sqlx::query(
            "INSERT INTO organizations (domain, name) VALUES ($1, $1) ON CONFLICT (domain) DO UPDATE SET domain=EXCLUDED.domain RETURNING id"
        ).bind(&domain).fetch_one(&mut *tx).await?.get("id");

        sqlx::query("SELECT set_config('app.current_org_id', $1, true)").bind(org_id.to_string()).execute(&mut *tx).await?;

        let user_record = sqlx::query(
            "INSERT INTO users (org_id, email, status, request_metadata) 
             VALUES ($1, $2, 'pending_approval', $3) 
             ON CONFLICT (org_id, email) DO UPDATE SET 
                request_metadata = EXCLUDED.request_metadata,
                status = CASE 
                    WHEN users.status = 'active' THEN 'active' 
                    ELSE 'pending_approval' 
                END
             RETURNING id, status"
        ).bind(org_id).bind(&email_for_closure).bind(&metadata).fetch_one(&mut *tx).await?;

        let user_id: Uuid = user_record.get("id");
        let status: String = user_record.get("status");
        
        tracing::info!("Assigned org_id: {} to user: {} (email: {})", org_id, user_id, email_for_closure);

        // Audit: New admission request
        let _ = sqlx::query(
            "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)",
        )
        .bind(org_id)
        .bind(user_id)
        .bind("ADMISSION_REQUEST")
        .bind(json!({ "email": email_for_closure, "status": status, "metadata": metadata }))
        .execute(&mut *tx)
        .await?;
        
        Ok((user_id, org_id, status, build_access_code(user_id)))
    })).await?;

    tracing::info!(
        email = %email,
        org_id = %org_id,
        user_id = %user_id,
        status = %status,
        "Access request processed"
    );

    // Broadcast to admins in the same organization for real-time UI updates
    let admin_subject = format!("admin.org.{}", org_id);
    let event = json!({
        "type": "ADMISSION_REQUEST",
        "payload": {
            "id": user_id,
            "org_id": org_id,
            "email": email,
            "status": status,
            "requested_at": chrono::Utc::now(),
            "access_code": access_code
        }
    });

    if let Ok(payload_bytes) = serde_json::to_vec(&event) {
        state.nats.publish(admin_subject, payload_bytes).await;
    }

    Ok(Json(json!({"status": if status == "active" { "active" } else { "pending" }, "user_id": user_id, "access_code": access_code})))
}

#[derive(Deserialize)]
pub struct LoginChallengePayload {
    pub email: String,
}

pub async fn login_challenge(
    State(state): State<AppState>,
    Json(payload): Json<LoginChallengePayload>,
) -> Result<Json<Value>, AppError> {
    let email = payload.email.trim().to_lowercase();

    let user_row = sqlx::query("SELECT id, org_id, status FROM users WHERE email = $1")
        .bind(&email).fetch_optional(&state.db).await?;
    let user = user_row.ok_or(AppError::NotFound("User not found".into()))?;
    
    if user.get::<String, _>("status") != "active" {
        return Err(AppError::Forbidden("User not active".into()));
    }

    let user_id: Uuid = user.get("id");
    let org_id: Uuid = user.get("org_id");

    let devices = sqlx::query("SELECT id, device_name FROM devices WHERE user_id = $1 AND is_active = TRUE")
        .bind(user_id).fetch_all(&state.db).await?;

    let challenge = crypto_core::random_bytes(32);
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

    sqlx::query("INSERT INTO auth_challenges (user_id, challenge, expires_at) VALUES ($1, $2, $3)")
        .bind(user_id).bind(&challenge).bind(expires_at).execute(&state.db).await?;

    Ok(Json(json!({
        "user_id": user_id,
        "challenge": STANDARD.encode(challenge),
        "devices": devices.into_iter().map(|d| json!({"id": d.get::<Uuid, _>("id"), "name": d.get::<String, _>("device_name")})).collect::<Vec<_>>()
    })))
}

#[derive(Deserialize)]
pub struct LoginVerifyPayload {
    pub user_id: Uuid,
    pub device_id: Uuid,
    pub signature: String, // base64
    pub challenge: String, // base64
}

pub async fn login_verify(
    State(state): State<AppState>,
    Json(payload): Json<LoginVerifyPayload>,
) -> Result<Json<Value>, AppError> {
    let challenge_bytes = STANDARD.decode(&payload.challenge).map_err(|_| AppError::BadRequest("Invalid challenge".into()))?;
    
    // 1. Verify challenge exists and is not expired
    let challenge_row = sqlx::query("DELETE FROM auth_challenges WHERE user_id = $1 AND challenge = $2 AND expires_at > NOW() RETURNING id")
        .bind(payload.user_id).bind(&challenge_bytes).fetch_optional(&state.db).await?;
    
    if challenge_row.is_none() {
        return Err(AppError::Unauthorized("Invalid or expired challenge".into()));
    }

    // 2. Get device public key
    let device_row = sqlx::query("SELECT identity_key_public FROM devices WHERE id = $1 AND user_id = $2 AND is_active = TRUE")
        .bind(payload.device_id).bind(payload.user_id).fetch_optional(&state.db).await?;
    
    let device = device_row.ok_or(AppError::Unauthorized("Device not found or inactive".into()))?;
    let pubkey_bytes: Vec<u8> = device.get("identity_key_public");
    let pubkey = crypto_core::SignPublicKey::from_slice(&pubkey_bytes).ok_or(AppError::Internal("Stored public key is invalid".into()))?;

    // 3. Verify signature
    let sig_bytes = STANDARD.decode(&payload.signature).map_err(|_| AppError::BadRequest("Invalid signature format".into()))?;
    if !crypto_core::verify_detached(&sig_bytes, &challenge_bytes, &pubkey) {
        tracing::error!("Signature verification failed! sig len: {}, challenge len: {}, pubkey: {:?}", sig_bytes.len(), challenge_bytes.len(), pubkey.as_ref());
        return Err(AppError::Unauthorized("Signature verification failed".into()));
    }

    // 4. Issue JWT
    let user_row = sqlx::query("SELECT org_id, role, username, department FROM users WHERE id = $1")
        .bind(payload.user_id).fetch_one(&state.db).await?;
    
    let org_id: Uuid = user_row.get("org_id");
    let role: String = user_row.get("role");
    let jti = Uuid::new_v4();
    let expiration_dt = chrono::Utc::now() + chrono::Duration::hours(24);
    let claims = Claims {
        sub: payload.user_id, org_id, role: role.clone(), jti, exp: expiration_dt.timestamp() as usize,
    };

    sqlx::query("INSERT INTO sessions (jti, user_id, device_id, expires_at) VALUES ($1, $2, $3, $4)")
        .bind(jti).bind(payload.user_id).bind(payload.device_id).bind(expiration_dt).execute(&state.db).await?;

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(state.jwt_secret.as_bytes()))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(json!({
        "status": "success", "token": token, "user_id": payload.user_id, "org_id": org_id, "role": role,
        "username": user_row.get::<Option<String>, _>("username"),
        "department": user_row.get::<Option<String>, _>("department")
    })))
}
