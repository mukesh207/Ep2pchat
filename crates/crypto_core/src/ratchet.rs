//! Double Ratchet Algorithm — sits on top of X3DH.
//!
//! X3DH produces an initial shared secret → pass it to `RatchetSession::init_as_sender`
//! or `init_as_receiver`. Every subsequent `encrypt` / `decrypt` call advances the
//! ratchet automatically and persists new session state to the vault.
//!
//! Reference: https://signal.org/docs/specifications/doubleratchet/

use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sodiumoxide::crypto::aead::chacha20poly1305_ietf::{self as aead, Key, Nonce};
use sodiumoxide::crypto::scalarmult::curve25519::{self, GroupElement, Scalar};
use std::collections::HashMap;
use zeroize::{Zeroize, ZeroizeOnDrop};

// ── Constants ────────────────────────────────────────────────────────────────

/// Maximum number of out-of-order messages to buffer per chain.
pub const MAX_SKIP: u32 = 1000;

const KDF_RK_INFO: &[u8] = b"TrustlineRatchetRootKey_v1";
const KDF_CK_INFO: &[u8] = b"TrustlineRatchetChainKey_v1";
const KDF_MSG_INFO: &[u8] = b"TrustlineRatchetMsgKey_v1";

// ── Errors ───────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum RatchetError {
    #[error("decrypt failed — wrong key or tampered ciphertext")]
    DecryptFailed,
    #[error("skipped too many messages (>{MAX_SKIP})")]
    TooManySkipped,
    #[error("session not fully initialized — missing chain key or DH keypair")]
    NotInitialized,
    #[error("invalid key bytes")]
    InvalidKey,
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

// ── Key types ────────────────────────────────────────────────────────────────

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
struct RootKey([u8; 32]);

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
struct ChainKey([u8; 32]);

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
struct MessageKey([u8; 32]);

// ── DH Ratchet Keypair ───────────────────────────────────────────────────────

/// A Curve25519 keypair used exclusively for the DH ratchet steps.
pub struct DhRatchetKeyPair {
    pub public: [u8; 32],
    pub private: Scalar,
}

impl DhRatchetKeyPair {
    /// Generate a fresh ratchet keypair using libsodium randomness.
    pub fn generate() -> Self {
        sodiumoxide::init().ok();
        let bytes = sodiumoxide::randombytes::randombytes(32);
        let private = Scalar::from_slice(&bytes).expect("32 bytes is always a valid Scalar");
        let public = curve25519::scalarmult_base(&private).0;
        Self { public, private }
    }

    /// Reconstruct from raw bytes (e.g. after deserialising from the vault).
    pub fn from_bytes(public: [u8; 32], private: [u8; 32]) -> Result<Self, RatchetError> {
        let private = Scalar::from_slice(&private).ok_or(RatchetError::InvalidKey)?;
        Ok(Self { public, private })
    }
}

/// Serde-friendly wrapper — Scalar isn't Serialize/Deserialize directly.
#[derive(Serialize, Deserialize, Clone)]
struct DhKpSerde {
    public: [u8; 32],
    private: [u8; 32],
}

impl From<&DhRatchetKeyPair> for DhKpSerde {
    fn from(kp: &DhRatchetKeyPair) -> Self {
        Self {
            public: kp.public,
            private: kp.private.0,
        }
    }
}

impl TryFrom<&DhKpSerde> for DhRatchetKeyPair {
    type Error = RatchetError;
    fn try_from(s: &DhKpSerde) -> Result<Self, RatchetError> {
        DhRatchetKeyPair::from_bytes(s.public, s.private)
    }
}

// ── KDF helpers ──────────────────────────────────────────────────────────────

fn dh(our_private: &Scalar, their_public: &[u8; 32]) -> [u8; 32] {
    let pk = GroupElement(*their_public);
    curve25519::scalarmult(our_private, &pk)
        .expect("scalarmult always succeeds for valid inputs")
        .0
}

/// KDF_RK — used after each DH ratchet step.
/// Input: current root key + DH output.
/// Output: new root key + new chain key.
fn kdf_rk(root_key: &RootKey, dh_out: &[u8; 32]) -> (RootKey, ChainKey) {
    let hk = Hkdf::<Sha256>::new(Some(&root_key.0), dh_out);
    let mut okm = [0u8; 64];
    hk.expand(KDF_RK_INFO, &mut okm)
        .expect("64 bytes ≤ 255*HashLen — always valid");
    let rk = RootKey(okm[..32].try_into().unwrap());
    let ck = ChainKey(okm[32..].try_into().unwrap());
    okm.zeroize();
    (rk, ck)
}

/// KDF_CK — advances the symmetric chain by one step.
/// Input: current chain key.
/// Output: new chain key + single-use message key.
fn kdf_ck(ck: &ChainKey) -> (ChainKey, MessageKey) {
    let hk = Hkdf::<Sha256>::new(None, &ck.0);
    let mut okm = [0u8; 64];
    hk.expand(KDF_CK_INFO, &mut okm).expect("always valid");
    let new_ck = ChainKey(okm[..32].try_into().unwrap());
    let mk = MessageKey(okm[32..].try_into().unwrap());
    okm.zeroize();
    (new_ck, mk)
}

/// Stretch a MessageKey into the AEAD key+nonce pair used for one message.
fn derive_aead(mk: &MessageKey) -> (Key, Nonce) {
    let hk = Hkdf::<Sha256>::new(None, &mk.0);
    let mut okm = [0u8; 44]; // 32 key + 12 nonce
    hk.expand(KDF_MSG_INFO, &mut okm)
        .expect("44 ≤ 255*32 — always valid");
    let key = Key::from_slice(&okm[..32]).unwrap();
    let nonce = Nonce::from_slice(&okm[32..44]).unwrap();
    okm.zeroize();
    (key, nonce)
}

// ── Message Header (sent alongside every ciphertext) ───────────────────────

/// Must be sent with every message so the receiver can advance their ratchet.
/// Serialize this to JSON and include it in the WebSocket `MESSAGE_SEND` payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageHeader {
    /// Sender's current DH ratchet public key (32 bytes).
    pub dh_public: [u8; 32],
    /// Number of messages sent in the *previous* sending chain.
    pub prev_counter: u32,
    /// Sequence number within the *current* sending chain.
    pub msg_counter: u32,
}

// ── Ratchet Session ──────────────────────────────────────────────────────────

/// The full Double Ratchet session. **Must be persisted after every
/// `encrypt` or `decrypt` call** — store it in the local SQLite vault
/// keyed by `conversation_id`.
#[derive(Serialize, Deserialize)]
pub struct RatchetSession {
    // ── DH ratchet state
    dh_self: Option<DhKpSerde>,  // our current ratchet keypair
    dh_remote: Option<[u8; 32]>, // remote's most recent DH public key

    // ── Chain key state (None until first message)
    root_key: [u8; 32],
    send_chain_key: Option<[u8; 32]>,
    recv_chain_key: Option<[u8; 32]>,

    // ── Counters
    send_count: u32,
    recv_count: u32,
    prev_send_count: u32,

    // ── Skipped message keys for out-of-order delivery
    // Map key: "<hex(dh_public)>-<msg_counter>"   value: 32-byte message key
    skipped_keys: HashMap<String, [u8; 32]>,
}

// ── Session init ─────────────────────────────────────────────────────────────

impl RatchetSession {
    /// **Alice / Sender** — call immediately after `x3dh_sender` returns.
    ///
    /// - `shared_secret`: the 32-byte SK from X3DH
    /// - `bob_spk_public`: Bob's Signed Pre-Key public bytes (already in the key bundle)
    pub fn init_as_sender(shared_secret: &[u8; 32], bob_spk_public: &[u8; 32]) -> Self {
        let dh_self = DhRatchetKeyPair::generate();

        // Perform the first DH ratchet step with the X3DH secret as root key.
        let (root_key, send_chain_key) = kdf_rk(
            &RootKey(*shared_secret),
            &dh(&dh_self.private, bob_spk_public),
        );

        Self {
            dh_self: Some(DhKpSerde::from(&dh_self)),
            dh_remote: Some(*bob_spk_public),
            root_key: root_key.0,
            send_chain_key: Some(send_chain_key.0),
            recv_chain_key: None,
            send_count: 0,
            recv_count: 0,
            prev_send_count: 0,
            skipped_keys: HashMap::new(),
        }
    }

    /// **Bob / Receiver** — call immediately after `x3dh_receiver` returns.
    ///
    /// - `shared_secret`: the 32-byte SK from X3DH
    /// - `bob_spk_kp`: Bob's Signed Pre-Key keypair (reuse from vault, it IS the first DH ratchet key)
    pub fn init_as_receiver(
        shared_secret: &[u8; 32],
        bob_spk_public: [u8; 32],
        bob_spk_private: [u8; 32],
    ) -> Result<Self, RatchetError> {
        let dh_self = DhRatchetKeyPair::from_bytes(bob_spk_public, bob_spk_private)?;
        Ok(Self {
            dh_self: Some(DhKpSerde::from(&dh_self)),
            dh_remote: None, // populated on first incoming message header
            root_key: *shared_secret,
            send_chain_key: None,
            recv_chain_key: None,
            send_count: 0,
            recv_count: 0,
            prev_send_count: 0,
            skipped_keys: HashMap::new(),
        })
    }
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

impl RatchetSession {
    /// Encrypt `plaintext`.
    ///
    /// Returns `(header, ciphertext)`. Include **both** in the WS payload.
    /// `associated_data` cryptographically binds the message to its conversation;
    /// use `conversation_id.as_bytes()`.
    ///
    /// ⚠️ Persist session state to vault immediately after this call.
    pub fn encrypt(
        &mut self,
        plaintext: &[u8],
        associated_data: &[u8],
    ) -> Result<(MessageHeader, Vec<u8>), RatchetError> {
        let ck_bytes = self.send_chain_key.ok_or(RatchetError::NotInitialized)?;
        let dh_self = self.dh_self.as_ref().ok_or(RatchetError::NotInitialized)?;

        let (new_ck, mk) = kdf_ck(&ChainKey(ck_bytes));
        self.send_chain_key = Some(new_ck.0);

        let header = MessageHeader {
            dh_public: dh_self.public,
            prev_counter: self.prev_send_count,
            msg_counter: self.send_count,
        };
        self.send_count += 1;

        let (key, nonce) = derive_aead(&mk);
        let ciphertext = aead::seal(plaintext, Some(associated_data), &nonce, &key);

        Ok((header, ciphertext))
    }

    /// Decrypt a `(header, ciphertext)` pair received over the WebSocket.
    ///
    /// Handles out-of-order delivery transparently via the skipped-key buffer.
    ///
    /// ⚠️ Persist session state to vault immediately after this call.
    pub fn decrypt(
        &mut self,
        header: &MessageHeader,
        ciphertext: &[u8],
        associated_data: &[u8],
    ) -> Result<Vec<u8>, RatchetError> {
        // 1. Try skipped-key buffer first (out-of-order message arriving late).
        let skip_key = skip_map_key(&header.dh_public, header.msg_counter);
        if let Some(mk_bytes) = self.skipped_keys.remove(&skip_key) {
            return decrypt_with_mk(&MessageKey(mk_bytes), ciphertext, associated_data);
        }

        // 2. If a new DH key arrives — perform a DH ratchet step.
        let is_new_dh = self
            .dh_remote
            .map(|r| r != header.dh_public)
            .unwrap_or(true);

        if is_new_dh {
            // Save skipped keys in the *current* receive chain before switching.
            self.skip_until(header.prev_counter)?;
            self.ratchet_dh(&header.dh_public)?;
        }

        // 3. Buffer any skipped messages in the new receive chain.
        self.skip_until(header.msg_counter)?;

        // 4. Advance the symmetric ratchet one step to get this message's key.
        let ck_bytes = self.recv_chain_key.ok_or(RatchetError::NotInitialized)?;
        let (new_ck, mk) = kdf_ck(&ChainKey(ck_bytes));
        self.recv_chain_key = Some(new_ck.0);
        self.recv_count += 1;

        decrypt_with_mk(&mk, ciphertext, associated_data)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// Buffer message keys for all receive-chain messages from `recv_count` up to
    /// (but not including) `until`. Enables out-of-order decryption later.
    fn skip_until(&mut self, until: u32) -> Result<(), RatchetError> {
        if self.recv_count + MAX_SKIP < until {
            return Err(RatchetError::TooManySkipped);
        }
        if let Some(mut ck_bytes) = self.recv_chain_key {
            while self.recv_count < until {
                let (new_ck, mk) = kdf_ck(&ChainKey(ck_bytes));
                ck_bytes = new_ck.0;
                let key = skip_map_key(&self.dh_remote.unwrap_or([0u8; 32]), self.recv_count);
                self.skipped_keys.insert(key, mk.0);
                self.recv_count += 1;
            }
            self.recv_chain_key = Some(ck_bytes);
        }
        Ok(())
    }

    /// Perform a full DH ratchet step when we see a new remote public key.
    fn ratchet_dh(&mut self, new_remote_pk: &[u8; 32]) -> Result<(), RatchetError> {
        let our_kp = self.dh_self.as_ref().ok_or(RatchetError::NotInitialized)?;
        let our_kp = DhRatchetKeyPair::try_from(our_kp)?;

        self.prev_send_count = self.send_count;
        self.send_count = 0;
        self.recv_count = 0;
        self.dh_remote = Some(*new_remote_pk);

        // Receiving chain: old self × new remote → new recv chain key.
        let (new_rk, recv_ck) =
            kdf_rk(&RootKey(self.root_key), &dh(&our_kp.private, new_remote_pk));
        self.root_key = new_rk.0;
        self.recv_chain_key = Some(recv_ck.0);

        // Generate a fresh DH keypair for our next sending chain.
        let new_self = DhRatchetKeyPair::generate();
        let (new_rk2, send_ck) = kdf_rk(
            &RootKey(self.root_key),
            &dh(&new_self.private, new_remote_pk),
        );
        self.root_key = new_rk2.0;
        self.send_chain_key = Some(send_ck.0);
        self.dh_self = Some(DhKpSerde::from(&new_self));

        Ok(())
    }

    // ── Vault serialisation helpers ───────────────────────────────────────────

    /// Serialise session to a JSON string for storage in the SQLite vault.
    pub fn to_json(&self) -> Result<String, RatchetError> {
        Ok(serde_json::to_string(self)?)
    }

    /// Deserialise from a JSON string stored in the vault.
    pub fn from_json(json: &str) -> Result<Self, RatchetError> {
        Ok(serde_json::from_str(json)?)
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn skip_map_key(dh_public: &[u8; 32], counter: u32) -> String {
    format!("{}-{}", hex::encode(dh_public), counter)
}

fn decrypt_with_mk(
    mk: &MessageKey,
    ciphertext: &[u8],
    associated_data: &[u8],
) -> Result<Vec<u8>, RatchetError> {
    let (key, nonce) = derive_aead(mk);
    aead::open(ciphertext, Some(associated_data), &nonce, &key)
        .map_err(|_| RatchetError::DecryptFailed)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_secret() -> [u8; 32] {
        let mut s = [0u8; 32];
        sodiumoxide::init().ok();
        let r = sodiumoxide::randombytes::randombytes(32);
        s.copy_from_slice(&r);
        s
    }

    #[test]
    fn test_basic_encrypt_decrypt() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"conv-alice-bob";
        let (header, ct) = alice.encrypt(b"Hello Bob!", ad).unwrap();
        let pt = bob.decrypt(&header, &ct, ad).unwrap();
        assert_eq!(pt, b"Hello Bob!");
    }

    #[test]
    fn test_multiple_messages_both_directions() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"conv-test";

        // Alice → Bob × 3
        for i in 0u8..3 {
            let msg = format!("A→B msg {i}");
            let (h, ct) = alice.encrypt(msg.as_bytes(), ad).unwrap();
            let pt = bob.decrypt(&h, &ct, ad).unwrap();
            assert_eq!(pt, msg.as_bytes());
        }

        // Bob → Alice × 2
        for i in 0u8..2 {
            let msg = format!("B→A msg {i}");
            let (h, ct) = bob.encrypt(msg.as_bytes(), ad).unwrap();
            let pt = alice.decrypt(&h, &ct, ad).unwrap();
            assert_eq!(pt, msg.as_bytes());
        }
    }

    #[test]
    fn test_out_of_order_delivery() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"ooo-test";

        // Encrypt 3 messages
        let (h0, ct0) = alice.encrypt(b"msg 0", ad).unwrap();
        let (h1, ct1) = alice.encrypt(b"msg 1", ad).unwrap();
        let (h2, ct2) = alice.encrypt(b"msg 2", ad).unwrap();

        // Deliver out of order: 2, 0, 1
        let pt2 = bob.decrypt(&h2, &ct2, ad).unwrap();
        let pt0 = bob.decrypt(&h0, &ct0, ad).unwrap();
        let pt1 = bob.decrypt(&h1, &ct1, ad).unwrap();
        assert_eq!(pt0, b"msg 0");
        assert_eq!(pt1, b"msg 1");
        assert_eq!(pt2, b"msg 2");
    }

    #[test]
    fn test_session_serialization_roundtrip() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"serial-test";

        // Send one message, then serialize Alice's state
        let (h, ct) = alice.encrypt(b"persist me", ad).unwrap();
        let json = alice.to_json().unwrap();

        // Restore Alice from JSON, then send a second message
        let mut alice2 = RatchetSession::from_json(&json).unwrap();
        let (h2, ct2) = alice2.encrypt(b"after restore", ad).unwrap();

        let pt = bob.decrypt(&h, &ct, ad).unwrap();
        let pt2 = bob.decrypt(&h2, &ct2, ad).unwrap();
        assert_eq!(pt, b"persist me");
        assert_eq!(pt2, b"after restore");
    }

    #[test]
    fn test_wrong_session_decrypt_fails() {
        sodiumoxide::init().unwrap();

        // Create two independent sessions (different shared secrets)
        let secret_a = mock_secret();
        let secret_b = mock_secret();
        let spk_a = DhRatchetKeyPair::generate();
        let spk_b = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret_a, &spk_a.public);
        let mut unrelated_bob =
            RatchetSession::init_as_receiver(&secret_b, spk_b.public, spk_b.private.0).unwrap();

        let ad = b"wrong-session-test";
        let (header, ct) = alice.encrypt(b"secret message", ad).unwrap();

        // Decryption with an unrelated session should fail
        let result = unrelated_bob.decrypt(&header, &ct, ad);
        assert!(result.is_err());
    }

    #[test]
    fn test_extended_bidirectional_conversation() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"extended-conv";

        // 10-message alternating conversation
        for i in 0u8..10 {
            if i % 2 == 0 {
                let msg = format!("Alice says {i}");
                let (h, ct) = alice.encrypt(msg.as_bytes(), ad).unwrap();
                let pt = bob.decrypt(&h, &ct, ad).unwrap();
                assert_eq!(pt, msg.as_bytes());
            } else {
                let msg = format!("Bob replies {i}");
                let (h, ct) = bob.encrypt(msg.as_bytes(), ad).unwrap();
                let pt = alice.decrypt(&h, &ct, ad).unwrap();
                assert_eq!(pt, msg.as_bytes());
            }
        }
    }

    #[test]
    fn test_ratchet_empty_plaintext() {
        sodiumoxide::init().unwrap();
        let secret = mock_secret();
        let bob_spk = DhRatchetKeyPair::generate();

        let mut alice = RatchetSession::init_as_sender(&secret, &bob_spk.public);
        let mut bob =
            RatchetSession::init_as_receiver(&secret, bob_spk.public, bob_spk.private.0).unwrap();

        let ad = b"empty-test";
        let (header, ct) = alice.encrypt(b"", ad).unwrap();
        let pt = bob.decrypt(&header, &ct, ad).unwrap();
        assert_eq!(pt, b"");
    }
}
