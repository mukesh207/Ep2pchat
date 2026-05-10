use crypto_core::{
    decrypt_message, decrypt_symmetric, ed25519_pk_to_curve25519, ed25519_sk_to_curve25519,
    encrypt_message, encrypt_symmetric, generate_identity_keypair, generate_one_time_pre_keys,
    generate_otpk_batch, generate_signed_pre_key, init, sign_detached, x3dh_receiver, x3dh_sender,
    MessageHeader, RatchetSession,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sodiumoxide::crypto::box_::curve25519xsalsa20poly1305::{
    PublicKey as BoxPublicKey, SecretKey as BoxSecretKey,
};
use sodiumoxide::crypto::sign::ed25519::{
    PublicKey as SignPublicKey, SecretKey as SignSecretKey,
};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::Manager;
use zeroize::Zeroize;

mod vault_key;
use vault_key::{get_or_create_vault_key, verify_vault_key_accessible};

#[derive(Default)]
struct SessionState {
    jwt: Arc<RwLock<Option<String>>>,
}

#[tauri::command]
fn clear_vault_session(session: tauri::State<'_, SessionState>) -> Result<(), String> {
    let mut guard = session
        .jwt
        .write()
        .map_err(|_| "session state lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn set_session_jwt(session: tauri::State<'_, SessionState>, jwt: String) -> Result<(), String> {
    let mut guard = session
        .jwt
        .write()
        .map_err(|_| "session state lock poisoned".to_string())?;
    *guard = Some(jwt);
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_or_create_vault_secret(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    let secret_path: PathBuf = app_data_dir.join("vault-secret.bin");
    if secret_path.exists() {
        let existing =
            fs::read(&secret_path).map_err(|e| format!("Failed to read vault secret: {}", e))?;
        if existing.len() == 32 {
            return Ok(STANDARD.encode(existing));
        }
    }

    let mut secret = [0u8; 32];
    rand::rng().fill_bytes(&mut secret);
    fs::write(&secret_path, secret)
        .map_err(|e| format!("Failed to persist vault secret: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&secret_path, fs::Permissions::from_mode(0o600));
    }

    Ok(STANDARD.encode(secret))
}

#[derive(Serialize, Deserialize)]
pub struct KeyBundleResponse {
    pub identity_public: String,
    pub identity_secret: String,
    pub signed_pre_key_public: String,
    pub signed_pre_key_secret: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: Vec<OneTimeKeyResponse>,
}

#[derive(Serialize, Deserialize)]
pub struct OneTimeKeyResponse {
    pub key_id: u32,
    pub public_key: String,
    pub secret_key: String,
}

#[tauri::command]
fn generate_keys() -> Result<KeyBundleResponse, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let (ik_pk, ik_sk) = generate_identity_keypair();
    let (spk_pk, spk_sk, spk_sig) = generate_signed_pre_key(&ik_sk);
    let opks = generate_one_time_pre_keys(50);

    let mut opk_responses = Vec::new();
    for (id, pk, sk) in opks {
        opk_responses.push(OneTimeKeyResponse {
            key_id: id,
            public_key: STANDARD.encode(pk.as_ref()),
            secret_key: STANDARD.encode(sk.as_ref()),
        });
    }

    Ok(KeyBundleResponse {
        identity_public: STANDARD.encode(ik_pk.as_ref()),
        identity_secret: STANDARD.encode(ik_sk.as_ref()),
        signed_pre_key_public: STANDARD.encode(spk_pk.as_ref()),
        signed_pre_key_secret: STANDARD.encode(spk_sk.as_ref()),
        signed_pre_key_signature: STANDARD.encode(spk_sig),
        one_time_pre_keys: opk_responses,
    })
}

#[tauri::command]
fn sign_login_challenge(mut identity_secret_b64: String, challenge_b64: String) -> Result<String, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded_sk = STANDARD.decode(&identity_secret_b64).map_err(|e| e.to_string())?;
    let sk = SignSecretKey::from_slice(&decoded_sk).ok_or("invalid identity_secret length")?;
    identity_secret_b64.zeroize();
    decoded_sk.zeroize();

    let challenge = STANDARD.decode(&challenge_b64).map_err(|e| e.to_string())?;
    let signature = sign_detached(&challenge, &sk);

    Ok(STANDARD.encode(signature))
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
}

#[tauri::command]
fn story_encrypt(plaintext: String, key_b64: String) -> Result<(String, String), String> {
    let key = STANDARD.decode(key_b64).map_err(|e| e.to_string())?;
    let (ciphertext, nonce) = encrypt_symmetric(plaintext.as_bytes(), &key).map_err(|e| e.to_string())?;
    Ok((STANDARD.encode(ciphertext), STANDARD.encode(nonce)))
}

#[tauri::command]
fn story_decrypt(ciphertext_b64: String, key_b64: String, nonce_b64: String) -> Result<String, String> {
    let ciphertext = STANDARD.decode(ciphertext_b64).map_err(|e| e.to_string())?;
    let key = STANDARD.decode(key_b64).map_err(|e| e.to_string())?;
    let nonce = STANDARD.decode(nonce_b64).map_err(|e| e.to_string())?;
    let plaintext = decrypt_symmetric(&ciphertext, &key, &nonce).map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

#[tauri::command]
async fn alice_handshake_and_encrypt(
    mut alice_ik_sk_b64: String,
    bob_ik_pk_b64: String,
    bob_spk_pk_b64: String,
    bob_opk_pk_b64: Option<String>,
    message: String,
) -> Result<(String, EncryptedPayload), String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded_aik_sk = STANDARD.decode(&alice_ik_sk_b64).map_err(|e| e.to_string())?;
    let aik_sk_sign = SignSecretKey::from_slice(&decoded_aik_sk).ok_or("invalid input: alice_ik_sk length")?;
    let aik_sk = ed25519_sk_to_curve25519(&aik_sk_sign).map_err(|e| e.to_string())?;
    alice_ik_sk_b64.zeroize();
    decoded_aik_sk.zeroize();

    let bik_pk_sign = SignPublicKey::from_slice(&STANDARD.decode(bob_ik_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid input: bob_ik_pk length")?;
    let bik_pk = ed25519_pk_to_curve25519(&bik_pk_sign).map_err(|e| e.to_string())?;

    let bspk_pk = BoxPublicKey::from_slice(&STANDARD.decode(bob_spk_pk_b64).map_err(|e| e.to_string())?)
            .ok_or("invalid input: bob_spk_pk length")?;

    let bopk_pk = if let Some(pk) = bob_opk_pk_b64 {
        Some(BoxPublicKey::from_slice(&STANDARD.decode(pk).map_err(|e| e.to_string())?)
                .ok_or("invalid input: bob_opk_pk length")?)
    } else {
        None
    };

    let (_aek_pk_sign, aek_sk_sign) = generate_identity_keypair();
    let aek_pk = BoxPublicKey::from_slice(_aek_pk_sign.as_ref()).ok_or("conversion failed")?;
    let aek_sk = ed25519_sk_to_curve25519(&aek_sk_sign).map_err(|e| e.to_string())?;

    let shared_secret = x3dh_sender(&aik_sk, &aek_sk, &bik_pk, &bspk_pk, bopk_pk.as_ref())
        .map_err(|e| e.to_string())?;

    let (ciphertext, nonce) = encrypt_message(message.as_bytes(), &shared_secret)
        .map_err(|e| e.to_string())?;

    Ok((
        STANDARD.encode(aek_pk.as_ref()),
        EncryptedPayload {
            ciphertext: STANDARD.encode(ciphertext),
            nonce: STANDARD.encode(nonce),
        },
    ))
}

#[tauri::command]
fn alice_x3dh(
    mut alice_ik_sk_b64: String,
    bob_ik_pk_b64: String,
    bob_spk_pk_b64: String,
    bob_opk_pk_b64: Option<String>,
) -> Result<serde_json::Value, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded = STANDARD.decode(&alice_ik_sk_b64).map_err(|e| e.to_string())?;
    let aik_sk_sign = SignSecretKey::from_slice(&decoded).ok_or("invalid alice IK length")?;
    let aik_sk = ed25519_sk_to_curve25519(&aik_sk_sign).map_err(|e| e.to_string())?;
    alice_ik_sk_b64.zeroize();
    decoded.zeroize();

    let bik_pk_sign = SignPublicKey::from_slice(&STANDARD.decode(&bob_ik_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid bob IK")?;
    let bik_pk = ed25519_pk_to_curve25519(&bik_pk_sign).map_err(|e| e.to_string())?;

    let bspk_pk = BoxPublicKey::from_slice(&STANDARD.decode(&bob_spk_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid bob SPK")?;

    let bopk_pk = bob_opk_pk_b64
        .map(|pk| {
            STANDARD
                .decode(&pk)
                .map_err(|e| e.to_string())
                .and_then(|b| BoxPublicKey::from_slice(&b).ok_or_else(|| "invalid OPK".to_string()))
        })
        .transpose()?;

    let (aek_pk_sign, aek_sk_sign) = generate_identity_keypair();
    let aek_pk = BoxPublicKey::from_slice(aek_pk_sign.as_ref()).unwrap();
    let aek_sk = ed25519_sk_to_curve25519(&aek_sk_sign).map_err(|e| e.to_string())?;

    let mut secret = x3dh_sender(&aik_sk, &aek_sk, &bik_pk, &bspk_pk, bopk_pk.as_ref())
        .map_err(|e| e.to_string())?;

    let out = serde_json::json!({
        "shared_secret_b64": STANDARD.encode(&secret),
        "ephemeral_pk_b64":  STANDARD.encode(aek_pk.as_ref()),
    });
    secret.zeroize();
    Ok(out)
}

#[tauri::command]
fn bob_x3dh(
    mut bob_ik_sk_b64: String,
    mut bob_spk_sk_b64: String,
    bob_opk_sk_b64: Option<String>,
    alice_ik_pk_b64: String,
    alice_ek_pk_b64: String,
) -> Result<String, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut dbik = STANDARD.decode(&bob_ik_sk_b64).map_err(|e| e.to_string())?;
    let bik_sk_sign = SignSecretKey::from_slice(&dbik).ok_or("invalid bob IK")?;
    let bik_sk = ed25519_sk_to_curve25519(&bik_sk_sign).map_err(|e| e.to_string())?;
    bob_ik_sk_b64.zeroize();
    dbik.zeroize();

    let mut dbspk = STANDARD.decode(&bob_spk_sk_b64).map_err(|e| e.to_string())?;
    let bspk_sk = BoxSecretKey::from_slice(&dbspk).ok_or("invalid bob SPK")?;
    bob_spk_sk_b64.zeroize();
    dbspk.zeroize();

    let bopk_sk = bob_opk_sk_b64
        .map(|sk| {
            STANDARD
                .decode(&sk)
                .map_err(|e| e.to_string())
                .and_then(|b| BoxSecretKey::from_slice(&b).ok_or_else(|| "invalid OPK SK".to_string()))
        })
        .transpose()?;

    let aik_pk_sign = SignPublicKey::from_slice(&STANDARD.decode(&alice_ik_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid alice IK")?;
    let aik_pk = ed25519_pk_to_curve25519(&aik_pk_sign).map_err(|e| e.to_string())?;

    let aek_pk = BoxPublicKey::from_slice(&STANDARD.decode(&alice_ek_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid alice EK")?;

    let mut secret = x3dh_receiver(&bik_sk, &bspk_sk, bopk_sk.as_ref(), &aik_pk, &aek_pk)
        .map_err(|e| e.to_string())?;
    let out = STANDARD.encode(&secret);
    secret.zeroize();
    Ok(out)
}

#[tauri::command]
fn bob_handshake_and_decrypt(
    mut bob_ik_sk_b64: String,
    mut bob_spk_sk_b64: String,
    mut bob_opk_sk_b64: Option<String>,
    alice_ik_pk_b64: String,
    alice_ek_pk_b64: String,
    ciphertext: String,
    nonce: String,
) -> Result<String, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded_bik_sk = STANDARD.decode(&bob_ik_sk_b64).map_err(|e| e.to_string())?;
    let bik_sk_sign = SignSecretKey::from_slice(&decoded_bik_sk).ok_or("invalid input: bob_ik_sk length")?;
    let bik_sk = ed25519_sk_to_curve25519(&bik_sk_sign).map_err(|e| e.to_string())?;
    bob_ik_sk_b64.zeroize();
    decoded_bik_sk.zeroize();

    let mut decoded_bspk_sk = STANDARD.decode(&bob_spk_sk_b64).map_err(|e| e.to_string())?;
    let bspk_sk = BoxSecretKey::from_slice(&decoded_bspk_sk).ok_or("invalid input: bob_spk_sk length")?;
    bob_spk_sk_b64.zeroize();
    decoded_bspk_sk.zeroize();

    let bopk_sk = if let Some(ref mut sk_str) = bob_opk_sk_b64 {
        let mut decoded_bopk_sk = STANDARD.decode(&sk_str).map_err(|e| e.to_string())?;
        let sk = BoxSecretKey::from_slice(&decoded_bopk_sk).ok_or("invalid input: bob_opk_sk length")?;
        sk_str.zeroize();
        decoded_bopk_sk.zeroize();
        Some(sk)
    } else {
        None
    };

    let aik_pk_sign = SignPublicKey::from_slice(&STANDARD.decode(alice_ik_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid input: alice_ik_pk length")?;
    let aik_pk = ed25519_pk_to_curve25519(&aik_pk_sign).map_err(|e| e.to_string())?;

    let aek_pk = BoxPublicKey::from_slice(&STANDARD.decode(alice_ek_pk_b64).map_err(|e| e.to_string())?)
        .ok_or("invalid input: alice_ek_pk length")?;

    let shared_secret = x3dh_receiver(&bik_sk, &bspk_sk, bopk_sk.as_ref(), &aik_pk, &aek_pk)
        .map_err(|e| e.to_string())?;

    let ciphertext_bytes = STANDARD.decode(ciphertext).map_err(|e| e.to_string())?;
    let nonce_bytes = STANDARD.decode(nonce).map_err(|e| e.to_string())?;

    let decrypted = decrypt_message(&ciphertext_bytes, &shared_secret, &nonce_bytes)
        .map_err(|e| e.to_string())?;

    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

#[tauri::command]
fn ratchet_init_sender(
    shared_secret_b64: String,
    bob_spk_public_b64: String,
) -> Result<String, String> {
    init().map_err(|_| "crypto init failed".to_string())?;

    let secret_bytes = STANDARD.decode(&shared_secret_b64).map_err(|e| e.to_string())?;
    let spk_bytes = STANDARD.decode(&bob_spk_public_b64).map_err(|e| e.to_string())?;

    let mut secret = [0u8; 32];
    let mut spk = [0u8; 32];
    if secret_bytes.len() != 32 || spk_bytes.len() != 32 {
        return Err("shared_secret and spk_public must each be 32 bytes".to_string());
    }
    secret.copy_from_slice(&secret_bytes);
    spk.copy_from_slice(&spk_bytes);

    let session = RatchetSession::init_as_sender(&secret, &spk);
    session.to_json().map_err(|e| e.to_string())
}

#[tauri::command]
fn ratchet_init_receiver(
    shared_secret_b64: String,
    bob_spk_public_b64: String,
    bob_spk_private_b64: String,
) -> Result<String, String> {
    init().map_err(|_| "crypto init failed".to_string())?;

    let secret_bytes = STANDARD.decode(&shared_secret_b64).map_err(|e| e.to_string())?;
    let spk_pub_bytes = STANDARD.decode(&bob_spk_public_b64).map_err(|e| e.to_string())?;
    let spk_prv_bytes = STANDARD.decode(&bob_spk_private_b64).map_err(|e| e.to_string())?;

    let mut secret = [0u8; 32];
    let mut spk_pub = [0u8; 32];
    let mut spk_prv = [0u8; 32];
    if secret_bytes.len() != 32 || spk_pub_bytes.len() != 32 || spk_prv_bytes.len() != 32 {
        return Err("invalid key length".to_string());
    }
    secret.copy_from_slice(&secret_bytes);
    spk_pub.copy_from_slice(&spk_pub_bytes);
    spk_prv.copy_from_slice(&spk_prv_bytes);

    let session = RatchetSession::init_as_receiver(&secret, spk_pub, spk_prv).map_err(|e| e.to_string())?;
    session.to_json().map_err(|e| e.to_string())
}

#[tauri::command]
fn ratchet_encrypt(
    session_json: String,
    plaintext: String,
    conv_id: String,
) -> Result<serde_json::Value, String> {
    let mut session = RatchetSession::from_json(&session_json).map_err(|e| e.to_string())?;
    let (header, ciphertext) = session.encrypt(plaintext.as_bytes(), conv_id.as_bytes()).map_err(|e| e.to_string())?;
    let new_session_json = session.to_json().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "new_session_json": new_session_json,
        "header": header,
        "ciphertext": STANDARD.encode(&ciphertext),
    }))
}

#[tauri::command]
fn ratchet_decrypt(
    session_json: String,
    header: MessageHeader,
    ciphertext_b64: String,
    conv_id: String,
) -> Result<serde_json::Value, String> {
    let mut session = RatchetSession::from_json(&session_json).map_err(|e| e.to_string())?;
    let ciphertext = STANDARD.decode(&ciphertext_b64).map_err(|e| e.to_string())?;
    let plaintext_bytes = session.decrypt(&header, &ciphertext, conv_id.as_bytes()).map_err(|e| e.to_string())?;
    let plaintext = String::from_utf8(plaintext_bytes).map_err(|e| e.to_string())?;
    let new_session_json = session.to_json().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "new_session_json": new_session_json,
        "plaintext": plaintext,
    }))
}

#[tauri::command]
async fn check_and_replenish_otpks(
    session: tauri::State<'_, SessionState>,
) -> Result<ReplenishResult, String> {
    let base_url = std::env::var("VITE_API_BASE_URL")
        .unwrap_or_else(|_| "https://api.encryptedchat.in/api/v1".to_string());

    let token = {
        let guard = session.jwt.read().map_err(|_| "session state lock poisoned".to_string())?;
        guard.clone().unwrap_or_default()
    };
    if token.is_empty() { return Err("No auth token".to_string()); }

    let client = reqwest::Client::new();
    let count_resp = client.get(format!("{}/keys/otpk/count", base_url)).bearer_auth(&token).send().await
        .map_err(|e| e.to_string())?.json::<OtpkCountResponse>().await.map_err(|e| e.to_string())?;

    if count_resp.count >= 10 {
        return Ok(ReplenishResult { needed: false, uploaded: 0, server_count_before: count_resp.count, private_pairs: Vec::new() });
    }

    let pairs = generate_otpk_batch(20);
    let private_pairs = pairs.iter().map(|p| OtpkPrivatePair { key_id: p.key_id.clone(), private_key: p.private_key.to_vec() }).collect();
    let upload_payload: Vec<serde_json::Value> = pairs.iter().map(|p| serde_json::json!({ "key_id": p.key_id, "public_key": STANDARD.encode(p.public_key) })).collect();

    let upload_resp = client.post(format!("{}/keys/otpk/upload", base_url)).bearer_auth(&token).json(&serde_json::json!({ "keys": upload_payload })).send().await
        .map_err(|e| e.to_string())?;

    if !upload_resp.status().is_success() { return Err(format!("OTPK upload failed: {}", upload_resp.status())); }
    let uploaded = upload_resp.json::<UploadOtpksResponse>().await.map_err(|e| e.to_string())?.uploaded;

    Ok(ReplenishResult { needed: true, uploaded, server_count_before: count_resp.count, private_pairs })
}

#[derive(serde::Deserialize)] struct OtpkCountResponse { count: i64 }
#[derive(serde::Deserialize)] struct UploadOtpksResponse { uploaded: usize }
#[derive(serde::Serialize)] pub struct ReplenishResult { pub needed: bool, pub uploaded: usize, pub server_count_before: i64, pub private_pairs: Vec<OtpkPrivatePair> }
#[derive(serde::Serialize)] pub struct OtpkPrivatePair { pub key_id: String, pub private_key: Vec<u8> }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(SessionState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_or_create_vault_secret,
            get_or_create_vault_key,
            verify_vault_key_accessible,
            clear_vault_session,
            set_session_jwt,
            generate_keys,
            sign_login_challenge,
            alice_x3dh,
            bob_x3dh,
            alice_handshake_and_encrypt,
            bob_handshake_and_decrypt,
            ratchet_init_sender,
            ratchet_init_receiver,
            ratchet_encrypt,
            ratchet_decrypt,
            check_and_replenish_otpks,
            story_encrypt,
            story_decrypt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

