-- 4. One-Time Pre-Keys (consumed during X3DH session establishment)
CREATE TABLE IF NOT EXISTS one_time_pre_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    key_id INT NOT NULL,
    public_key BYTEA NOT NULL
);
