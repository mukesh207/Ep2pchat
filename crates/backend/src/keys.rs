use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, PgPool};
use uuid::Uuid;
use base64::Engine;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/upload", post(upload_keys))
        .route("/:user_id", get(get_user_keys_handler))
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
    pub identity_key: String, // base64
    pub signed_pre_key: String, // base64
    pub signed_pre_key_sig: String, // base64
    pub one_time_pre_keys: Vec<OneTimeKeyPayload>,
}

pub async fn upload_keys(
    State(state): State<AppState>,
    Json(payload): Json<UploadKeysPayload>,
) -> Json<Value> {
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return Json(json!({"error": format!("DB Error: {}", e)})),
    };

    let ik = match base64::engine::general_purpose::STANDARD.decode(&payload.identity_key) {
        Ok(k) => k,
        Err(_) => return Json(json!({"error": "Invalid base64 for identity_key"})),
    };
    let spk = match base64::engine::general_purpose::STANDARD.decode(&payload.signed_pre_key) {
        Ok(k) => k,
        Err(_) => return Json(json!({"error": "Invalid base64 for signed_pre_key"})),
    };
    let spk_sig = match base64::engine::general_purpose::STANDARD.decode(&payload.signed_pre_key_sig) {
        Ok(k) => k,
        Err(_) => return Json(json!({"error": "Invalid base64 for signed_pre_key_sig"})),
    };

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
    .await;

    let device_id: Uuid = match device_row {
        Ok(row) => row.get("id"),
        Err(e) => return Json(json!({"error": format!("Failed to insert device: {}", e)})),
    };

    for opk in payload.one_time_pre_keys {
        let opk_bytes = match base64::engine::general_purpose::STANDARD.decode(&opk.public_key) {
            Ok(k) => k,
            Err(_) => return Json(json!({"error": format!("Invalid base64 for OPK {}", opk.key_id)})),
        };

        if let Err(e) = sqlx::query(
            "INSERT INTO one_time_pre_keys (device_id, org_id, key_id, public_key) VALUES ($1, $2, $3, $4)"
        )
        .bind(device_id)
        .bind(payload.org_id)
        .bind(opk.key_id)
        .bind(opk_bytes)
        .execute(&mut *tx)
        .await {
            return Json(json!({"error": format!("Failed to insert OPK {}: {}", opk.key_id, e)}));
        }
    }

    if let Err(e) = tx.commit().await {
        return Json(json!({"error": format!("Failed to commit tx: {}", e)}));
    }

    Json(json!({"status": "success", "device_id": device_id}))
}

#[derive(Serialize, Clone)]
pub struct DeviceBundle {
    pub device_id: Uuid,
    pub device_name: String,
    pub identity_key: String, // base64
    pub signed_pre_key: String, // base64
    pub signed_pre_key_sig: String, // base64
    pub one_time_pre_key: Option<OneTimeKeyPayload>,
}

pub async fn get_user_keys_handler(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Json<Value> {
    match get_user_keys_internal(&state.db, user_id).await {
        Ok(bundles) => Json(json!({ "user_id": user_id, "devices": bundles })),
        Err(e) => Json(json!({"error": e})),
    }
}

pub async fn get_user_keys_internal(db: &PgPool, user_id: Uuid) -> Result<Vec<DeviceBundle>, String> {
    let devices = sqlx::query(
        "SELECT id, device_name, identity_key_public, signed_pre_key_public, signed_pre_key_signature 
         FROM devices WHERE user_id = $1 AND is_active = TRUE"
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let mut bundles = Vec::new();
    for device_row in devices {
        let device_id: Uuid = device_row.get("id");

        let opk_row = sqlx::query(
            "DELETE FROM one_time_pre_keys 
             WHERE id = (SELECT id FROM one_time_pre_keys WHERE device_id = $1 LIMIT 1) 
             RETURNING key_id, public_key"
        )
        .bind(device_id)
        .fetch_optional(db)
        .await
        .map_err(|e| e.to_string())?;

        let opk = match opk_row {
            Some(row) => Some(OneTimeKeyPayload {
                key_id: row.get::<i32, _>("key_id"),
                public_key: base64::engine::general_purpose::STANDARD.encode(row.get::<Vec<u8>, _>("public_key")),
            }),
            None => None,
        };

        bundles.push(DeviceBundle {
            device_id,
            device_name: device_row.get("device_name"),
            identity_key: base64::engine::general_purpose::STANDARD.encode(device_row.get::<Vec<u8>, _>("identity_key_public")),
            signed_pre_key: base64::engine::general_purpose::STANDARD.encode(device_row.get::<Vec<u8>, _>("signed_pre_key_public")),
            signed_pre_key_sig: base64::engine::general_purpose::STANDARD.encode(device_row.get::<Vec<u8>, _>("signed_pre_key_signature")),
            one_time_pre_key: opk,
        });
    }
    Ok(bundles)
}
