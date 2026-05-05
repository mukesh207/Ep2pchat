-- 23. Create stories table for temporary status updates
-- These are E2EE blobs that expire automatically after 24 hours.

CREATE TABLE IF NOT EXISTS stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ciphertext BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for efficient organization-wide story lookups and expiration filtering
CREATE INDEX IF NOT EXISTS idx_stories_org_expires ON stories(org_id, expires_at);

-- Enable RLS on stories
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_stories ON stories
    FOR ALL USING (org_id = current_setting('app.current_org_id', true)::uuid);
