#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    
    #[tokio::test]
    async fn test_full_auth_flow() {
        let (ik_pk, ik_sk) = crypto_core::generate_identity_keypair();
        
        let ik_pk_b64 = STANDARD.encode(ik_pk.as_ref());
        let ik_sk_b64 = STANDARD.encode(ik_sk.as_ref());
        
        let payload_ik = STANDARD.decode(&ik_pk_b64).unwrap();
        
        // Let's emulate register
        let db_ik_pub = payload_ik.clone();
        
        // Emulate challenge
        let challenge = crypto_core::random_bytes(32);
        let challenge_b64 = STANDARD.encode(&challenge);
        
        // Emulate Tauri
        let tauri_sk = STANDARD.decode(&ik_sk_b64).unwrap();
        let tauri_sk_obj = crypto_core::SignSecretKey::from_slice(&tauri_sk).unwrap();
        let tauri_challenge = STANDARD.decode(&challenge_b64).unwrap();
        let sig = crypto_core::sign_detached(&tauri_challenge, &tauri_sk_obj);
        let sig_b64 = STANDARD.encode(&sig);
        
        // Emulate backend verify
        let backend_sig = STANDARD.decode(&sig_b64).unwrap();
        let backend_challenge = STANDARD.decode(&challenge_b64).unwrap();
        let backend_pubkey = crypto_core::SignPublicKey::from_slice(&db_ik_pub).unwrap();
        
        assert!(crypto_core::verify_detached(&backend_sig, &backend_challenge, &backend_pubkey));
    }
}
