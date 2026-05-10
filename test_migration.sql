CREATE TABLE encrypted_messages_old (
    id UUID, org_id UUID, sender_device_id UUID, recipient_device_id UUID, ciphertext BYTEA, 
    sender_identity_key TEXT, ephemeral_public_key TEXT, nonce TEXT, ratchet_header JSONB, 
    delivered_at TIMESTAMPTZ, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ
);

CREATE TABLE encrypted_messages_new (
    id UUID NOT NULL,
    org_id UUID NOT NULL,
    sender_device_id UUID NOT NULL,
    recipient_device_id UUID NOT NULL,
    ciphertext BYTEA NOT NULL,
    sender_identity_key TEXT NOT NULL,
    ephemeral_public_key TEXT,
    ratchet_header JSONB,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE encrypted_messages_new_2026_05 PARTITION OF encrypted_messages_new
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

INSERT INTO encrypted_messages_new (
    id, org_id, sender_device_id, recipient_device_id, ciphertext, 
    sender_identity_key, ephemeral_public_key, ratchet_header, 
    delivered_at, read_at, created_at
) 
SELECT 
    id, org_id, sender_device_id, recipient_device_id, ciphertext, 
    sender_identity_key, ephemeral_public_key, ratchet_header, 
    delivered_at, read_at, created_at
FROM encrypted_messages_old;
