-- Add policy columns to organizations
ALTER TABLE organizations ADD COLUMN audit_retention_days INT DEFAULT 365;
ALTER TABLE organizations ADD COLUMN force_rls BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN allow_p2p BOOLEAN DEFAULT TRUE; -- Placeholder for future P2P settings
