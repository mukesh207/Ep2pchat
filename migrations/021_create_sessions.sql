-- 21. Create sessions table for JWT revocation
-- This table tracks active JWT IDs (JTIs) to allow instant session revocation.

CREATE TABLE IF NOT EXISTS sessions (
    jti UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Create an index to quickly purge expired sessions later
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Add an index for faster device-based revocation
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
