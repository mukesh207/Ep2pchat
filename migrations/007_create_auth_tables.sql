-- 1. Passkeys (WebAuthn Credentials)
CREATE TABLE IF NOT EXISTS passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    passkey_id BYTEA UNIQUE NOT NULL,
    passkey_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Webauthn Sessions (Ephemeral states for registration/login)
CREATE TABLE IF NOT EXISTS webauthn_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    challenge JSONB NOT NULL,
    session_type VARCHAR(50) NOT NULL, -- 'registration' or 'authentication'
    expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_passkeys ON passkeys 
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_webauthn_sessions ON webauthn_sessions 
    FOR ALL USING (org_id = current_setting('app.current_org_id')::uuid);
