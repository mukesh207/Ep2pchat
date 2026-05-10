-- Optimization: Partitioning for encrypted_messages by created_at
-- This improves performance for large message volumes and enables efficient purging.

-- Step 1: Create a temporary table with the current data
CREATE TABLE encrypted_messages_old AS SELECT * FROM encrypted_messages;

-- Step 2: Drop the existing table and its dependencies (policies, etc.)
DROP TABLE encrypted_messages CASCADE;

-- Step 3: Create the partitioned table
-- Note: 'nonce' is removed as it is now derived in Double Ratchet.
CREATE TABLE encrypted_messages (
    id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES organizations(id),
    sender_device_id UUID NOT NULL REFERENCES devices(id),
    recipient_device_id UUID NOT NULL REFERENCES devices(id),
    ciphertext BYTEA NOT NULL,
    sender_identity_key TEXT NOT NULL,
    ephemeral_public_key TEXT,
    ratchet_header JSONB,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 4: Create initial partitions (Current month and next month)
CREATE TABLE encrypted_messages_2026_05 PARTITION OF encrypted_messages
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE encrypted_messages_2026_06 PARTITION OF encrypted_messages
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Step 5: Restore data with explicit column mapping
INSERT INTO encrypted_messages (
    id, org_id, sender_device_id, recipient_device_id, ciphertext, 
    sender_identity_key, ephemeral_public_key, ratchet_header, 
    delivered_at, read_at, created_at
) 
SELECT 
    id, org_id, sender_device_id, recipient_device_id, ciphertext, 
    sender_identity_key, ephemeral_public_key, ratchet_header, 
    delivered_at, read_at, created_at
FROM encrypted_messages_old;

-- Step 6: Cleanup
DROP TABLE encrypted_messages_old;

-- Step 7: Re-enable RLS and Policies
ALTER TABLE encrypted_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON encrypted_messages
    FOR ALL
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- Step 8: Add indexes for performance
CREATE INDEX idx_messages_recipient_delivered ON encrypted_messages (recipient_device_id) WHERE delivered_at IS NULL;
CREATE INDEX idx_messages_org_created ON encrypted_messages (org_id, created_at);
