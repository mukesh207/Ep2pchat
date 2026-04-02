-- 5. Encrypted Messages (The Blind Router Payload)
CREATE TABLE IF NOT EXISTS encrypted_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    sender_device_id UUID REFERENCES devices(id),
    recipient_device_id UUID REFERENCES devices(id),

    -- The actual encrypted data (XChaCha20-Poly1305)
    ciphertext BYTEA NOT NULL,

    -- Decryption metadata required by the client (X3DH + Double Ratchet)
    sender_identity_key TEXT NOT NULL DEFAULT '',
    ephemeral_public_key TEXT NOT NULL DEFAULT '',
    nonce TEXT NOT NULL DEFAULT '',

    -- Ephemeral routing metadata
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
