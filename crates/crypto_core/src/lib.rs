use sodiumoxide::crypto::aead::chacha20poly1305_ietf as aead;
use sodiumoxide::crypto::box_::curve25519xsalsa20poly1305::{PublicKey, SecretKey, gen_keypair};
use sodiumoxide::crypto::sign::ed25519::{SecretKey as SignSecretKey, gen_keypair as gen_sign_keypair};
use sodiumoxide::crypto::scalarmult::curve25519::{Scalar, GroupElement, scalarmult};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct IdentityKeyPair {
    pub public: String, // base64
    pub secret: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SignedPreKey {
    pub public: String, // base64
    pub secret: String, // base64
    pub signature: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OneTimePreKey {
    pub key_id: u32,
    pub public_key: String, // base64
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PublicBundle {
    pub identity_key: String, // base64
    pub signed_pre_key: String, // base64
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

fn do_dh(sk: &SecretKey, pk: &PublicKey) -> Vec<u8> {
    let scalar = Scalar::from_slice(sk.as_ref()).unwrap();
    let group_element = GroupElement::from_slice(pk.as_ref()).unwrap();
    scalarmult(&scalar, &group_element).unwrap().as_ref().to_vec()
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

    sodiumoxide::crypto::hash::sha256::hash(&combined).as_ref().to_vec()
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

    sodiumoxide::crypto::hash::sha256::hash(&combined).as_ref().to_vec()
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
}
