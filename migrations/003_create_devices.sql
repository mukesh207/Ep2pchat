-- 3. Devices (The Cryptographic Identities)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,

    -- Public Keys (uploaded by client, NEVER private keys)
    identity_key_public BYTEA NOT NULL,
    signed_pre_key_public BYTEA NOT NULL,
    signed_pre_key_signature BYTEA NOT NULL,

    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMPTZ DEFAULT NOW()
);
