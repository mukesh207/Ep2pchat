pub mod ratchet;
pub use ratchet::{DhRatchetKeyPair, MessageHeader, RatchetError, RatchetSession};

use sodiumoxide::crypto::aead::chacha20poly1305_ietf as aead;
use sodiumoxide::crypto::box_::curve25519xsalsa20poly1305::{gen_keypair, PublicKey, SecretKey};

use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sodiumoxide::crypto::scalarmult::curve25519::{scalarmult, GroupElement, Scalar};
use sodiumoxide::crypto::sign::ed25519::SecretKey as SignSecretKey;

#[derive(Serialize, Deserialize, Clone)]
pub struct IdentityKeyPair {
    pub public: String, // base64
    pub secret: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SignedPreKey {
    pub public: String,    // base64
    pub secret: String,    // base64
    pub signature: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OneTimePreKey {
    pub key_id: u32,
    pub public_key: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PublicBundle {
    pub identity_key: String,       // base64
    pub signed_pre_key: String,     // base64
    pub signed_pre_key_sig: String, // base64
    pub one_time_pre_key: Option<OneTimePreKey>,
}

/// Initialize libsodium. Must be called before any crypto operations.
pub fn init() -> Result<(), ()> {
    sodiumoxide::init()
}

pub fn generate_identity_keypair() -> (PublicKey, SecretKey) {
    gen_keypair()
}

pub fn generate_signed_pre_key(identity_secret: &SignSecretKey) -> (PublicKey, SecretKey, Vec<u8>) {
    let (pk, sk) = gen_keypair();
    // Signature of the public key using the identity signing key
    let sig = sodiumoxide::crypto::sign::ed25519::sign_detached(pk.as_ref(), identity_secret);
    (pk, sk, sig.as_ref().to_vec())
}

pub fn generate_one_time_pre_keys(count: usize) -> Vec<(u32, PublicKey, SecretKey)> {
    let mut keys = Vec::with_capacity(count);
    for i in 0..count {
        let (pk, sk) = gen_keypair();
        keys.push((i as u32, pk, sk));
    }
    keys
}

/// A single generated OTPK — public key goes to the server via the upload
/// endpoint, private key goes into the local vault. Never serialized to JS.
#[derive(Serialize, Deserialize)]
pub struct OtpkPair {
    pub key_id: String, // UUID v4, client-assigned
    pub public_key: [u8; 32],
    pub private_key: [u8; 32], // NEVER sent to the server
}

/// Generate `count` fresh OTPK keypairs using libsodium's X25519 primitives.
/// Call exclusively from a Tauri command — runs in Rust, private keys never
/// touch the JS heap.
pub fn generate_otpk_batch(count: usize) -> Vec<OtpkPair> {
    sodiumoxide::init().ok();

    (0..count)
        .map(|_| {
            let (pk, sk) = gen_keypair();
            let mut public_key = [0u8; 32];
            let mut private_key = [0u8; 32];
            public_key.copy_from_slice(pk.as_ref());
            private_key.copy_from_slice(&sk.as_ref()[..32]);
            OtpkPair {
                key_id: uuid::Uuid::new_v4().to_string(),
                public_key,
                private_key,
            }
        })
        .collect()
}

fn do_dh(sk: &SecretKey, pk: &PublicKey) -> Vec<u8> {
    let scalar = Scalar::from_slice(sk.as_ref()).unwrap();
    let group_element = GroupElement::from_slice(pk.as_ref()).unwrap();
    scalarmult(&scalar, &group_element)
        .unwrap()
        .as_ref()
        .to_vec()
}

pub fn x3dh_sender(
    alice_ik_sk: &SecretKey,
    alice_ek_sk: &SecretKey,
    bob_ik_pk: &PublicKey,
    bob_spk_pk: &PublicKey,
    bob_opk_pk: Option<&PublicKey>,
) -> Vec<u8> {
    let dh1 = do_dh(alice_ik_sk, bob_spk_pk);
    let dh2 = do_dh(alice_ek_sk, bob_ik_pk);
    let dh3 = do_dh(alice_ek_sk, bob_spk_pk);

    let mut combined = Vec::new();
    combined.extend_from_slice(&dh1);
    combined.extend_from_slice(&dh2);
    combined.extend_from_slice(&dh3);

    if let Some(opk) = bob_opk_pk {
        let dh4 = do_dh(alice_ek_sk, opk);
        combined.extend_from_slice(&dh4);
    }

    // HKDF-SHA256 per Signal X3DH spec (salt = 32 zero bytes)
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), &combined);
    let mut okm = [0u8; 32];
    hk.expand(b"TrustlineX3DH_v1", &mut okm)
        .expect("32 bytes is always valid for HKDF-SHA256");
    okm.to_vec()
}

pub fn x3dh_receiver(
    bob_ik_sk: &SecretKey,
    bob_spk_sk: &SecretKey,
    bob_opk_sk: Option<&SecretKey>,
    alice_ik_pk: &PublicKey,
    alice_ek_pk: &PublicKey,
) -> Vec<u8> {
    let dh1 = do_dh(bob_spk_sk, alice_ik_pk);
    let dh2 = do_dh(bob_ik_sk, alice_ek_pk);
    let dh3 = do_dh(bob_spk_sk, alice_ek_pk);

    let mut combined = Vec::new();
    combined.extend_from_slice(&dh1);
    combined.extend_from_slice(&dh2);
    combined.extend_from_slice(&dh3);

    if let Some(opk_sk) = bob_opk_sk {
        let dh4 = do_dh(opk_sk, alice_ek_pk);
        combined.extend_from_slice(&dh4);
    }

    // HKDF-SHA256 per Signal X3DH spec (salt = 32 zero bytes)
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), &combined);
    let mut okm = [0u8; 32];
    hk.expand(b"TrustlineX3DH_v1", &mut okm)
        .expect("32 bytes is always valid for HKDF-SHA256");
    okm.to_vec()
}

pub fn encrypt_message(plaintext: &[u8], key: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let nonce_bytes = sodiumoxide::randombytes::randombytes(aead::NONCEBYTES);
    let nonce = aead::Nonce::from_slice(&nonce_bytes).unwrap();
    let key = aead::Key::from_slice(key).unwrap();
    let ciphertext = aead::seal(plaintext, None, &nonce, &key);
    (ciphertext, nonce.as_ref().to_vec())
}

pub fn decrypt_message(ciphertext: &[u8], key: &[u8], nonce: &[u8]) -> Result<Vec<u8>, ()> {
    let nonce = aead::Nonce::from_slice(nonce).unwrap();
    let key = aead::Key::from_slice(key).unwrap();
    aead::open(ciphertext, None, &nonce, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_x3dh_and_encryption() {
        use sodiumoxide::crypto::sign::ed25519::gen_keypair as gen_sign_keypair;

        init().unwrap();

        // 1. Bob's Key Generation
        let (_bob_ik_pk, bob_ik_sk) = generate_identity_keypair();
        let bob_ik_pk = PublicKey::from_slice(_bob_ik_pk.as_ref()).unwrap();

        let (_bob_sign_pk, bob_sign_sk) = gen_sign_keypair();
        let (bob_spk_pk, bob_spk_sk, _sig) = generate_signed_pre_key(&bob_sign_sk);

        let opks = generate_one_time_pre_keys(1);
        let (_opk_id, bob_opk_pk, bob_opk_sk) = &opks[0];

        // 2. Alice's Side
        let (_alice_ik_pk, alice_ik_sk) = generate_identity_keypair();
        let alice_ik_pk = PublicKey::from_slice(_alice_ik_pk.as_ref()).unwrap();

        let (_alice_ek_pk, alice_ek_sk) = generate_identity_keypair();
        let alice_ek_pk = PublicKey::from_slice(_alice_ek_pk.as_ref()).unwrap();

        let alice_shared = x3dh_sender(
            &alice_ik_sk,
            &alice_ek_sk,
            &bob_ik_pk,
            &bob_spk_pk,
            Some(bob_opk_pk),
        );

        // 3. Bob's Side
        let bob_shared = x3dh_receiver(
            &bob_ik_sk,
            &bob_spk_sk,
            Some(bob_opk_sk),
            &alice_ik_pk,
            &alice_ek_pk,
        );

        assert_eq!(alice_shared, bob_shared);

        // 4. Encrypt/Decrypt
        let message = b"Hello from Trustline!";
        let (ciphertext, nonce) = encrypt_message(message, &alice_shared);
        let decrypted = decrypt_message(&ciphertext, &bob_shared, &nonce).unwrap();

        assert_eq!(message.to_vec(), decrypted);
    }

    #[test]
    fn test_x3dh_without_opk() {
        use sodiumoxide::crypto::sign::ed25519::gen_keypair as gen_sign_keypair;

        init().unwrap();

        let (_bob_ik_pk, bob_ik_sk) = generate_identity_keypair();
        let bob_ik_pk = PublicKey::from_slice(_bob_ik_pk.as_ref()).unwrap();

        let (_bob_sign_pk, bob_sign_sk) = gen_sign_keypair();
        let (bob_spk_pk, bob_spk_sk, _sig) = generate_signed_pre_key(&bob_sign_sk);

        let (_alice_ik_pk, alice_ik_sk) = generate_identity_keypair();
        let alice_ik_pk = PublicKey::from_slice(_alice_ik_pk.as_ref()).unwrap();

        let (_alice_ek_pk, alice_ek_sk) = generate_identity_keypair();
        let alice_ek_pk = PublicKey::from_slice(_alice_ek_pk.as_ref()).unwrap();

        // X3DH without OPK — 3-way DH instead of 4-way
        let alice_shared = x3dh_sender(
            &alice_ik_sk,
            &alice_ek_sk,
            &bob_ik_pk,
            &bob_spk_pk,
            None, // no OPK available
        );

        let bob_shared = x3dh_receiver(
            &bob_ik_sk,
            &bob_spk_sk,
            None, // no OPK
            &alice_ik_pk,
            &alice_ek_pk,
        );

        assert_eq!(alice_shared, bob_shared);
        assert_eq!(alice_shared.len(), 32); // SHA-256 output
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        init().unwrap();
        let key = sodiumoxide::randombytes::randombytes(32);
        let plaintext = b"Trustline secure message roundtrip test";

        let (ciphertext, nonce) = encrypt_message(plaintext, &key);
        assert_ne!(ciphertext, plaintext.to_vec()); // encrypted is different
        assert_eq!(nonce.len(), aead::NONCEBYTES);

        let decrypted = decrypt_message(&ciphertext, &key, &nonce).unwrap();
        assert_eq!(decrypted, plaintext.to_vec());
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        init().unwrap();
        let correct_key = sodiumoxide::randombytes::randombytes(32);
        let wrong_key = sodiumoxide::randombytes::randombytes(32);
        let plaintext = b"This should not decrypt with the wrong key";

        let (ciphertext, nonce) = encrypt_message(plaintext, &correct_key);
        let result = decrypt_message(&ciphertext, &wrong_key, &nonce);
        assert!(result.is_err());
    }

    #[test]
    fn test_otpk_batch_generation() {
        init().unwrap();
        let batch = generate_otpk_batch(10);

        // Correct count
        assert_eq!(batch.len(), 10);

        // All key_ids are unique UUIDs
        let key_ids: std::collections::HashSet<_> = batch.iter().map(|k| k.key_id.clone()).collect();
        assert_eq!(key_ids.len(), 10, "All key_ids should be unique");

        // Key lengths are correct (32 bytes each)
        for pair in &batch {
            assert_eq!(pair.public_key.len(), 32);
            assert_eq!(pair.private_key.len(), 32);
            // Public and private keys should be different
            assert_ne!(pair.public_key, pair.private_key);
        }

        // UUID format validation
        for pair in &batch {
            assert!(uuid::Uuid::parse_str(&pair.key_id).is_ok(), "key_id should be valid UUID");
        }
    }
}
