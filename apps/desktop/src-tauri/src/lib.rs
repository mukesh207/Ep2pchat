use crypto_core::{init, generate_identity_keypair, generate_signed_pre_key, generate_one_time_pre_keys, x3dh_sender, x3dh_receiver, encrypt_message, decrypt_message};
use sodiumoxide::crypto::sign::ed25519::gen_keypair as gen_sign_keypair;
use sodiumoxide::crypto::box_::curve25519xsalsa20poly1305::{PublicKey, SecretKey};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
    let (_sign_pk, sign_sk) = gen_sign_keypair(); 
    let (spk_pk, spk_sk, spk_sig) = generate_signed_pre_key(&sign_sk);
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

#[derive(Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
}

#[tauri::command]
fn alice_handshake_and_encrypt(
    mut alice_ik_sk: String,
    bob_ik_pk: String,
    bob_spk_pk: String,
    bob_opk_pk: Option<String>,
    message: String,
) -> Result<(String, EncryptedPayload), String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded_aik_sk = STANDARD.decode(&alice_ik_sk).map_err(|e| e.to_string())?;
    let aik_sk = SecretKey::from_slice(&decoded_aik_sk).unwrap();
    
    // Explicitly zeroize private key material from memory
    alice_ik_sk.zeroize();
    decoded_aik_sk.zeroize();

    let bik_pk = PublicKey::from_slice(&STANDARD.decode(bob_ik_pk).map_err(|e| e.to_string())?).unwrap();
    let bspk_pk = PublicKey::from_slice(&STANDARD.decode(bob_spk_pk).map_err(|e| e.to_string())?).unwrap();
    let bopk_pk = if let Some(pk) = bob_opk_pk {
        Some(PublicKey::from_slice(&STANDARD.decode(pk).map_err(|e| e.to_string())?).unwrap())
    } else {
        None
    };

    let (aek_pk, aek_sk) = generate_identity_keypair();

    let shared_secret = x3dh_sender(
        &aik_sk,
        &aek_sk,
        &bik_pk,
        &bspk_pk,
        bopk_pk.as_ref(),
    );

    let (ciphertext, nonce) = encrypt_message(message.as_bytes(), &shared_secret);

    Ok((
        STANDARD.encode(aek_pk.as_ref()),
        EncryptedPayload {
            ciphertext: STANDARD.encode(ciphertext),
            nonce: STANDARD.encode(nonce),
        }
    ))
}

#[tauri::command]
fn bob_handshake_and_decrypt(
    mut bob_ik_sk: String,
    mut bob_spk_sk: String,
    mut bob_opk_sk: Option<String>,
    alice_ik_pk: String,
    alice_ek_pk: String,
    ciphertext: String,
    nonce: String,
) -> Result<String, String> {
    init().map_err(|_| "Failed to initialize crypto".to_string())?;

    let mut decoded_bik_sk = STANDARD.decode(&bob_ik_sk).map_err(|e| e.to_string())?;
    let bik_sk = SecretKey::from_slice(&decoded_bik_sk).unwrap();
    bob_ik_sk.zeroize();
    decoded_bik_sk.zeroize();

    let mut decoded_bspk_sk = STANDARD.decode(&bob_spk_sk).map_err(|e| e.to_string())?;
    let bspk_sk = SecretKey::from_slice(&decoded_bspk_sk).unwrap();
    bob_spk_sk.zeroize();
    decoded_bspk_sk.zeroize();

    let bopk_sk = if let Some(ref mut sk_str) = bob_opk_sk {
        let mut decoded_bopk_sk = STANDARD.decode(&sk_str).map_err(|e| e.to_string())?;
        let sk = SecretKey::from_slice(&decoded_bopk_sk).unwrap();
        sk_str.zeroize();
        decoded_bopk_sk.zeroize();
        Some(sk)
    } else {
        None
    };

    let aik_pk = PublicKey::from_slice(&STANDARD.decode(alice_ik_pk).map_err(|e| e.to_string())?).unwrap();
    let aek_pk = PublicKey::from_slice(&STANDARD.decode(alice_ek_pk).map_err(|e| e.to_string())?).unwrap();

    let shared_secret = x3dh_receiver(
        &bik_sk,
        &bspk_sk,
        bopk_sk.as_ref(),
        &aik_pk,
        &aek_pk,
    );

    let ciphertext_bytes = STANDARD.decode(ciphertext).map_err(|e| e.to_string())?;
    let nonce_bytes = STANDARD.decode(nonce).map_err(|e| e.to_string())?;

    let decrypted = decrypt_message(&ciphertext_bytes, &shared_secret, &nonce_bytes).map_err(|_| "Decryption failed".to_string())?;

    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet, 
            generate_keys, 
            alice_handshake_and_encrypt, 
            bob_handshake_and_decrypt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
