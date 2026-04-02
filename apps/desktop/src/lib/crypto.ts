import { invoke } from "@tauri-apps/api/core";

export interface KeyBundle {
    identity_public: string;
    identity_secret: string;
    signed_pre_key_public: string;
    signed_pre_key_secret: string;
    signed_pre_key_signature: string;
    one_time_pre_keys: { key_id: number; public_key: string; secret_key: string }[];
}

export interface EncryptedPayload {
    ciphertext: string;
    nonce: string;
}

export async function generateKeys(): Promise<KeyBundle> {
    return await invoke("generate_keys");
}

export async function aliceEncrypt(
    aliceIkSk: string,
    bobIkPk: string,
    bobSpkPk: string,
    bobOpkPk: string | null,
    message: string
): Promise<[string, EncryptedPayload]> {
    return await invoke("alice_handshake_and_encrypt", {
        alice_ik_sk: aliceIkSk,
        bob_ik_pk: bobIkPk,
        bob_spk_pk: bobSpkPk,
        bob_opk_pk: bobOpkPk,
        message
    });
}

export async function bobDecrypt(
    bobIkSk: string,
    bobSpkSk: string,
    bobOpkSk: string | null,
    aliceIkPk: string,
    aliceEkPk: string,
    ciphertext: string,
    nonce: string
): Promise<string> {
    return await invoke("bob_handshake_and_decrypt", {
        bob_ik_sk: bobIkSk,
        bob_spk_sk: bobSpkSk,
        bob_opk_sk: bobOpkSk,
        alice_ik_pk: aliceIkPk,
        alice_ek_pk: aliceEkPk,
        ciphertext,
        nonce
    });
}

// ── Standalone X3DH (used to bootstrap ratchet sessions) ─────────────────────

export interface X3dhResult {
    /** 32-byte X3DH shared secret, base64-encoded */
    shared_secret_b64: string;
    /** Alice's ephemeral public key, base64-encoded — send this to Bob */
    ephemeral_pk_b64: string;
}

/**
 * Perform X3DH as Alice (sender) WITHOUT encrypting.
 * Returns the shared secret and ephemeral PK.
 * Immediately pass shared_secret_b64 to `ratchetInitSender`.
 */
export async function aliceX3dh(
    aliceIkSk: string,
    bobIkPk: string,
    bobSpkPk: string,
    bobOpkPk: string | null,
): Promise<X3dhResult> {
    return await invoke("alice_x3dh", {
        alice_ik_sk: aliceIkSk,
        bob_ik_pk: bobIkPk,
        bob_spk_pk: bobSpkPk,
        bob_opk_pk: bobOpkPk,
    });
}

/**
 * Perform X3DH as Bob (receiver) WITHOUT decrypting.
 * Returns the shared secret as base64.
 * Immediately pass it to `ratchetInitReceiver`.
 */
export async function bobX3dh(
    bobIkSk: string,
    bobSpkSk: string,
    bobOpkSk: string | null,
    aliceIkPk: string,
    aliceEkPk: string,
): Promise<string> {
    return await invoke("bob_x3dh", {
        bob_ik_sk: bobIkSk,
        bob_spk_sk: bobSpkSk,
        bob_opk_sk: bobOpkSk,
        alice_ik_pk: aliceIkPk,
        alice_ek_pk: aliceEkPk,
    });
}

// ── Double Ratchet ────────────────────────────────────────────────────────────

/** Sent alongside every encrypted message so the receiver can ratchet. */
export interface MessageHeader {
    dh_public: number[];    // 32-byte array
    prev_counter: number;
    msg_counter: number;
}

export interface RatchetEncryptResult {
    /** Persist this back to the vault IMMEDIATELY after encrypting. */
    new_session_json: string;
    header: MessageHeader;
    /** base64-encoded ciphertext */
    ciphertext: string;
}

export interface RatchetDecryptResult {
    /** Persist this back to the vault IMMEDIATELY after decrypting. */
    new_session_json: string;
    plaintext: string;
}

/**
 * Initialize a ratchet session as the SENDER (Alice).
 * Call once per new conversation, right after the X3DH `aliceEncrypt` handshake.
 *
 * @param sharedSecretB64  32-byte X3DH SK, base64
 * @param bobSpkPublicB64  Bob's Signed Pre-Key public, base64 (from his key bundle)
 * @returns Opaque session JSON — store in vault keyed by contactId
 */
export async function ratchetInitSender(
    sharedSecretB64: string,
    bobSpkPublicB64: string,
): Promise<string> {
    return await invoke("ratchet_init_sender", {
        shared_secret_b64:  sharedSecretB64,
        bob_spk_public_b64: bobSpkPublicB64,
    });
}

/**
 * Initialize a ratchet session as the RECEIVER (Bob).
 * Call once per new conversation, right after the X3DH `bobDecrypt` handshake.
 *
 * @param sharedSecretB64   32-byte X3DH SK, base64
 * @param bobSpkPublicB64   Bob's Signed Pre-Key public, base64 (from local vault)
 * @param bobSpkPrivateB64  Bob's Signed Pre-Key private, base64 (from local vault)
 * @returns Opaque session JSON — store in vault keyed by contactId
 */
export async function ratchetInitReceiver(
    sharedSecretB64:  string,
    bobSpkPublicB64:  string,
    bobSpkPrivateB64: string,
): Promise<string> {
    return await invoke("ratchet_init_receiver", {
        shared_secret_b64:   sharedSecretB64,
        bob_spk_public_b64:  bobSpkPublicB64,
        bob_spk_private_b64: bobSpkPrivateB64,
    });
}

/**
 * Encrypt a message using the Double Ratchet.
 *
 * Pattern:
 * ```ts
 * const sessionJson = await vault.getRatchetSession(contactId);
 * const result = await ratchetEncrypt(sessionJson, text, contactId);
 * await vault.saveRatchetSession(contactId, result.new_session_json); // always persist
 * socket.send("MESSAGE_SEND", {
 *   recipient_device_id: ...,
 *   header: result.header,
 *   ciphertext: result.ciphertext,
 * });
 * ```
 */
export async function ratchetEncrypt(
    sessionJson: string,
    plaintext: string,
    convId: string,
): Promise<RatchetEncryptResult> {
    return await invoke("ratchet_encrypt", {
        session_json: sessionJson,
        plaintext,
        conv_id: convId,
    });
}

/**
 * Decrypt a received message using the Double Ratchet.
 *
 * Pattern:
 * ```ts
 * const sessionJson = await vault.getRatchetSession(contactId);
 * const result = await ratchetDecrypt(sessionJson, header, ciphertext, contactId);
 * await vault.saveRatchetSession(contactId, result.new_session_json); // always persist
 * console.log(result.plaintext);
 * ```
 */
export async function ratchetDecrypt(
    sessionJson:   string,
    header:        MessageHeader,
    ciphertextB64: string,
    convId:        string,
): Promise<RatchetDecryptResult> {
    return await invoke("ratchet_decrypt", {
        session_json:   sessionJson,
        header,
        ciphertext_b64: ciphertextB64,
        conv_id:        convId,
    });
}
