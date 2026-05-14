import { consumeOtpkPrivateKey, getRatchetSession, saveRatchetSession } from "./vault";
import { bobX3dh, ratchetInitReceiver, ratchetDecrypt } from "./crypto";

// Ensure sequential processing per conversation to prevent X3DH/ratchet state races (H2 bug)
const incomingMessageQueue: Record<string, Promise<any>> = {};

export async function processIncomingMessage(
    payload: any,
    localKeys: any,
    activeContactId: string | null
): Promise<{ conversationId: string; plaintext: string; newSessionJson: string } | null> {
    const conversationId: string | null = payload.sender_user_id || activeContactId;
    if (!conversationId) return null;

    if (!incomingMessageQueue[conversationId]) {
        incomingMessageQueue[conversationId] = Promise.resolve();
    }

    // Capture the current promise chain for this conversation
    const currentQueue = incomingMessageQueue[conversationId]!;

    // Create the next step in the queue
    incomingMessageQueue[conversationId] = currentQueue.then(async () => {
        let sessionJson = await getRatchetSession(conversationId).catch(() => null);

        if (!sessionJson) {
            if (!payload.ephemeral_public_key || !payload.sender_identity_key) {
                console.warn("[ratchet] no session and no X3DH fields — cannot decrypt");
                return null;
            }

            // Execute X3DH Handshake
            let opkSecretBytes: Uint8Array | null = null;
            if (payload.used_opk_id) {
                opkSecretBytes = await consumeOtpkPrivateKey(payload.used_opk_id);
                if (!opkSecretBytes) {
                    throw new Error(`OPK ${payload.used_opk_id} already consumed or not found.`);
                }
            }
            const opkB64 = opkSecretBytes ? btoa(String.fromCharCode(...opkSecretBytes)) : null;

            const sharedSecretB64 = await bobX3dh(
                localKeys.identity_secret,
                localKeys.signed_pre_key_secret,
                opkB64,
                payload.sender_identity_key,
                payload.ephemeral_public_key
            );

            sessionJson = await ratchetInitReceiver(
                sharedSecretB64,
                localKeys.signed_pre_key_public,
                localKeys.signed_pre_key_secret
            );
        }

        if (!payload.header) {
            console.warn("[ratchet] MESSAGE_RECEIVE missing ratchet header");
            return null;
        }

        const decResult = await ratchetDecrypt(
            sessionJson,
            payload.header,
            payload.ciphertext,
            conversationId
        );

        try {
            await saveRatchetSession(conversationId, decResult.new_session_json);
        } catch (err) {
            console.error("[ratchet] CRITICAL: failed to persist session state for", conversationId, "— stopping to prevent desync:", err);
            throw new Error(`Failed to save ratchet session: ${err}`);
        }

        return {
            conversationId,
            plaintext: decResult.plaintext,
            newSessionJson: decResult.new_session_json
        };
    }).catch(err => {
        console.error("[ratchet] queue processing failed for", conversationId, ":", err);
        return null;
    });

    return incomingMessageQueue[conversationId]!;
}
