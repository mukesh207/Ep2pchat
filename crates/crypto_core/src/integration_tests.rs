#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    
    #[test]
    fn test_signature_roundtrip() {
        crate::init().unwrap();
        
        let (ik_pk, ik_sk) = crate::generate_identity_keypair();
        let challenge = crate::random_bytes(32);
        
        // Simulating backend sending to frontend
        let challenge_b64 = STANDARD.encode(&challenge);
        let identity_secret_b64 = STANDARD.encode(ik_sk.as_ref());
        let identity_public_b64 = STANDARD.encode(ik_pk.as_ref());
        
        // Simulating frontend receiving and signing (Tauri command)
        let decoded_sk = STANDARD.decode(&identity_secret_b64).unwrap();
        let sk = crate::SignSecretKey::from_slice(&decoded_sk).unwrap();
        
        let decoded_challenge = STANDARD.decode(&challenge_b64).unwrap();
        let sig = crate::sign_detached(&decoded_challenge, &sk);
        let sig_b64 = STANDARD.encode(&sig);
        
        // Simulating backend verifying
        let sig_bytes = STANDARD.decode(&sig_b64).unwrap();
        let challenge_bytes = STANDARD.decode(&challenge_b64).unwrap();
        let pk_bytes = STANDARD.decode(&identity_public_b64).unwrap();
        let pk = crate::SignPublicKey::from_slice(&pk_bytes).unwrap();
        
        let is_valid = crate::verify_detached(&sig_bytes, &challenge_bytes, &pk);
        assert!(is_valid, "Signature verification failed!");
    }
}
