-- 015. Fix the RLS Catch-22 and add missing policies.
--
-- This migration ensures idempotent policy creation by dropping existing ones first.

-- ── organizations ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS org_read_all ON organizations;
CREATE POLICY org_read_all ON organizations
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS org_write_own ON organizations;
CREATE POLICY org_write_own ON organizations
    FOR ALL
    USING (id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- ── audit_logs ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
CREATE POLICY tenant_isolation_audit ON audit_logs
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ── passkeys ────────────────────────────────────────────────────────────────

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_passkeys ON passkeys;
CREATE POLICY tenant_isolation_passkeys ON passkeys
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ── webauthn_sessions ───────────────────────────────────────────────────────

ALTER TABLE webauthn_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_webauthn ON webauthn_sessions;
CREATE POLICY tenant_isolation_webauthn ON webauthn_sessions
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);
