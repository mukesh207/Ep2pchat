#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    
    #[test]
    fn test_login_verify_logic() {
        // Just testing the crypto logic directly as it happens in login_verify
        let (ik_pk, ik_sk) = crypto_core::generate_identity_keypair();
        
        let challenge = crypto_core::random_bytes(32);
        let challenge_b64 = STANDARD.encode(&challenge);
        
        // Frontend signs
        let sig = crypto_core::sign_detached(&challenge, &ik_sk);
        let sig_b64 = STANDARD.encode(&sig);
        
        // Backend verifies
        let sig_bytes = STANDARD.decode(&sig_b64).unwrap();
        let challenge_bytes = STANDARD.decode(&challenge_b64).unwrap();
        let pubkey_bytes = ik_pk.as_ref().to_vec();
        
        let pubkey = crypto_core::SignPublicKey::from_slice(&pubkey_bytes).unwrap();
        let is_valid = crypto_core::verify_detached(&sig_bytes, &challenge_bytes, &pubkey);
        
        assert!(is_valid);
    }
}
