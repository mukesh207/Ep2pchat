-- Create auth_challenges table for temporary session authentication challenges.
-- This was likely deleted by a previous migration (025_remove_passkeys) but is still used by the signature-based auth system.

CREATE TABLE IF NOT EXISTS auth_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_expires ON auth_challenges (user_id, expires_at);
