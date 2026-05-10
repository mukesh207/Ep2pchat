use crate::auth::AuthContext;
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

const OTPK_ABSOLUTE_MAX: i64 = 200;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/upload", post(upload_keys))
        .route("/{user_id}", get(get_user_keys_handler))
        .route("/otpk/count", get(get_otpk_count))
        .route("/otpk/upload", post(upload_otpks))
}

#[derive(Deserialize, Serialize, Clone)]
pub struct OneTimeKeyPayload {
    pub key_id: i32,
    pub public_key: String, // base64
}

#[derive(Deserialize)]
pub struct UploadKeysPayload {
    pub user_id: Uuid,
    pub org_id: Uuid,
    pub device_name: String,
    pub identity_key: String,       // base64
    pub signed_pre_key: String,     // base64
    pub signed_pre_key_sig: String, // base64
    pub one_time_pre_keys: Vec<OneTimeKeyPayload>,
}

use crate::error::AppError;

pub async fn upload_keys(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(payload): Json<UploadKeysPayload>,
) -> Result<Json<Value>, AppError> {
    if auth.claims.sub != payload.user_id || auth.claims.org_id != payload.org_id {
        return Err(AppError::Forbidden("Cannot upload keys for another user".into()));
    }

    let ik = base64::engine::general_purpose::STANDARD.decode(&payload.identity_key)
        .map_err(|_| AppError::BadRequest("Invalid base64 for identity_key".into()))?;
        
    let spk = base64::engine::general_purpose::STANDARD.decode(&payload.signed_pre_key)
        .map_err(|_| AppError::BadRequest("Invalid base64 for signed_pre_key".into()))?;
        
    let spk_sig = base64::engine::general_purpose::STANDARD.decode(&payload.signed_pre_key_sig)
        .map_err(|_| AppError::BadRequest("Invalid base64 for signed_pre_key_sig".into()))?;

    // RLS: org_id scoped
    let device_id = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| Box::pin(async move {
        let device_row = sqlx::query(
            "INSERT INTO devices (user_id, org_id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
        )
        .bind(payload.user_id)
        .bind(payload.org_id)
        .bind(&payload.device_name)
        .bind(ik)
        .bind(spk)
        .bind(spk_sig)
        .fetch_one(&mut *tx)
        .await?;

        let device_id: Uuid = device_row.get("id");

        // Link current session to this device
        sqlx::query("UPDATE sessions SET device_id = $1 WHERE jti = $2")
            .bind(device_id)
            .bind(auth.claims.jti)
            .execute(&mut *tx)
            .await?;

        for opk in payload.one_time_pre_keys {
            let opk_bytes = base64::engine::general_purpose::STANDARD.decode(&opk.public_key)
                .map_err(|_| sqlx::Error::Decode("Invalid base64 in OTPK".into()))?;

            sqlx::query(
                "INSERT INTO one_time_pre_keys (device_id, org_id, key_id, public_key) VALUES ($1, $2, $3, $4)"
            )
            .bind(device_id)
            .bind(payload.org_id)
            .bind(opk.key_id)
            .bind(opk_bytes)
            .execute(&mut *tx)
            .await?;
        }

        Ok(device_id)
    })).await?;

    Ok(Json(json!({"status": "success", "device_id": device_id})))
}

#[derive(Serialize, Clone)]
pub struct DeviceBundle {
    pub device_id: Uuid,
    pub device_name: String,
    pub identity_key: String,       // base64
    pub signed_pre_key: String,     // base64
    pub signed_pre_key_sig: String, // base64
    pub one_time_pre_key: Option<OneTimeKeyPayload>,
}

pub async fn get_user_keys_handler(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    // RLS: org_id scoped
    let allowed = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| {
        Box::pin(async move {
            let row = sqlx::query("SELECT org_id FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_optional(&mut *tx)
                .await?;
            if let Some(r) = row {
                let target_org_id: Uuid = r.get("org_id");
                Ok(target_org_id == auth.claims.org_id)
            } else {
                Ok(false)
            }
        })
    })
    .await?;

    if !allowed {
        return Err(AppError::Forbidden("Cross-tenant key request denied / User not found".into()));
    }

    let bundles = get_user_keys_internal(&state.db, user_id, auth.claims.org_id)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(json!({ "user_id": user_id, "devices": bundles })))
}

pub async fn get_user_keys_internal(
    db: &PgPool,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<Vec<DeviceBundle>, String> {
    let devices = crate::db::with_rls_context(db, org_id, |tx| Box::pin(async move {
        sqlx::query(
            "SELECT id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature
             FROM devices
             WHERE user_id = $1 AND org_id = $2 AND is_active = TRUE"
        )
        .bind(user_id)
        .bind(org_id)
        .fetch_all(&mut *tx)
        .await
    }))
    .await
    .map_err(|e| e.to_string())?;

    if devices.is_empty() {
        return Ok(Vec::new());
    }

    let device_ids: Vec<Uuid> = devices.iter().map(|d| d.get("id")).collect();

    // Consume one OTPK per device in a single query
    let opks = crate::db::with_rls_context(db, org_id, |tx| Box::pin(async move {
        sqlx::query(
            "DELETE FROM one_time_pre_keys
             WHERE id IN (
                SELECT id FROM (
                    SELECT id, row_number() OVER (PARTITION BY device_id ORDER BY created_at) as rn
                    FROM one_time_pre_keys
                    WHERE device_id = ANY($1)
                ) sub
                WHERE rn = 1
             )
             RETURNING device_id, key_id, public_key"
        )
        .bind(&device_ids)
        .fetch_all(&mut *tx)
        .await
    }))
    .await
    .map_err(|e| e.to_string())?;

    let mut bundles = Vec::new();
    for device_row in devices {
        let device_id: Uuid = device_row.get("id");
        
        let opk = opks.iter().find(|o| o.get::<Uuid, _>("device_id") == device_id).map(|row| OneTimeKeyPayload {
            key_id: row.get::<i32, _>("key_id"),
            public_key: base64::engine::general_purpose::STANDARD
                .encode(row.get::<Vec<u8>, _>("public_key")),
        });

        bundles.push(DeviceBundle {
            device_id,
            device_name: device_row.get("device_name"),
            identity_key: base64::engine::general_purpose::STANDARD
                .encode(device_row.get::<Vec<u8>, _>("identity_key_public")),
            signed_pre_key: base64::engine::general_purpose::STANDARD
                .encode(device_row.get::<Vec<u8>, _>("signed_pre_key_public")),
            signed_pre_key_sig: base64::engine::general_purpose::STANDARD
                .encode(device_row.get::<Vec<u8>, _>("signed_pre_key_signature")),
            one_time_pre_key: opk,
        });
    }
    Ok(bundles)
}

#[derive(Serialize)]
pub struct OtpkCountResponse {
    pub count: i64,
    pub threshold: i64,
}

pub async fn get_otpk_count(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<Json<OtpkCountResponse>, (StatusCode, Json<serde_json::Value>)> {
    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| Box::pin(async move {
        let device_id: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM devices WHERE user_id = $1 AND is_active = TRUE ORDER BY last_seen DESC LIMIT 1"
        )
        .bind(auth.claims.sub)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(did) = device_id {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM one_time_pre_keys WHERE device_id = $1 AND used = FALSE"
            )
            .bind(did)
            .fetch_one(&mut *tx)
            .await?;
            Ok(Some((did, count)))
        } else {
            Ok(None)
        }
    })).await;

    match result {
        Ok(Some((_, count))) => Ok(Json(OtpkCountResponse {
            count,
            threshold: 10,
        })),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "No active device found"})),
        )),
        Err(e) => {
            tracing::error!("OTPK count query failed: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "An internal error occurred"})),
            ))
        }
    }
}

#[derive(Deserialize)]
pub struct UploadOtpksRequest {
    pub keys: Vec<OtpkUploadEntry>,
}

#[derive(Deserialize)]
pub struct OtpkUploadEntry {
    pub key_id: String,
    pub public_key: String,
}

#[derive(Serialize)]
pub struct UploadOtpksResponse {
    pub uploaded: usize,
}

pub async fn upload_otpks(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(body): Json<UploadOtpksRequest>,
) -> Result<Json<UploadOtpksResponse>, (StatusCode, Json<serde_json::Value>)> {
    if body.keys.is_empty() || body.keys.len() > 50 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Batch must be 1–50 keys"})),
        ));
    }
    let upload_count = body.keys.len();

    let result = crate::db::with_rls_context(&state.db, auth.claims.org_id, |tx| Box::pin(async move {
        let device_id: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM devices WHERE user_id = $1 AND is_active = TRUE ORDER BY last_seen DESC LIMIT 1"
        )
        .bind(auth.claims.sub)
        .fetch_optional(&mut *tx)
        .await?;

        let did = match device_id {
            Some(d) => d,
            None => return Ok(None),
        };

        let existing: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM one_time_pre_keys WHERE device_id = $1 AND used = FALSE"
        )
        .bind(did)
        .fetch_one(&mut *tx)
        .await?;

        let existing_count = existing;

        if existing_count + upload_count as i64 > OTPK_ABSOLUTE_MAX {
            return Err(sqlx::Error::Decode("Cap reached".into()));
        }

        for entry in &body.keys {
            let pubkey_bytes = base64::engine::general_purpose::STANDARD.decode(&entry.public_key)
                .map_err(|_| sqlx::Error::Decode("Invalid bounds".into()))?;

            if pubkey_bytes.len() != 32 {
                return Err(sqlx::Error::Decode("Length mismatch".into()));
            }

            let numeric_key_id = {
                // Use SHA-256 for deterministic, collision-resistant UUID → i32 mapping.
                use sha2::{Sha256, Digest};
                let mut hasher = Sha256::new();
                hasher.update(entry.key_id.as_bytes());
                let hash = hasher.finalize();
                // Take first 4 bytes as big-endian i32, masked to positive range.
                let bytes: [u8; 4] = hash[..4].try_into().unwrap();
                i32::from_be_bytes(bytes) & 0x7FFF_FFFF
            };

            sqlx::query(
                "INSERT INTO one_time_pre_keys (device_id, org_id, key_id, public_key, used)
                 VALUES ($1, $2, $3, $4, FALSE)
                 ON CONFLICT DO NOTHING"
            )
            .bind(did)
            .bind(auth.claims.org_id)
            .bind(numeric_key_id)
            .bind(pubkey_bytes)
            .execute(&mut *tx)
            .await?;
        }

        Ok(Some(()))
    })).await;

    match result {
        Ok(Some(_)) => {
            // Audit: OTPK upload
            let _ = sqlx::query(
                "INSERT INTO audit_logs (org_id, actor_id, action, details) VALUES ($1, $2, $3, $4)"
            )
            .bind(auth.claims.org_id)
            .bind(auth.claims.sub)
            .bind("OTPK_UPLOAD")
            .bind(json!({"count": upload_count}))
            .execute(&state.db)
            .await;

            Ok(Json(UploadOtpksResponse {
                uploaded: upload_count,
            }))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "No active device found"})),
        )),
        Err(_) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed or cap reached"})),
        )),
    }
}
