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
