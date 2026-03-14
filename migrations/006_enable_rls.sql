-- 6. Row-Level Security (RLS) — Tenant Isolation Guarantee
-- Even if application code has a bug, the database itself prevents cross-tenant data leakage.

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_time_pre_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_messages ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
-- The Rust backend sets `app.current_org_id` per-connection before queries.
CREATE POLICY tenant_isolation_users ON users
    FOR ALL USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_devices ON devices
    FOR ALL USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_opks ON one_time_pre_keys
    FOR ALL USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_messages ON encrypted_messages
    FOR ALL USING (org_id = current_setting('app.current_org_id', true)::uuid);
