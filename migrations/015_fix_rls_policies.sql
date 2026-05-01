-- 015. Fix the RLS Catch-22 and add missing policies.
--
-- Migration 014 applied FORCE ROW LEVEL SECURITY to `organizations`,
-- `audit_logs`, and other tables, but no policies were defined for them.
-- Without a policy, FORCE RLS causes *all* queries to return zero rows
-- for non-superuser roles, effectively locking the tables.
--
-- This migration:
--   1. Adds a public-read policy to `organizations` (every authenticated
--      user needs to read their own org row during login / request-access).
--   2. Adds a write policy scoped to the current org context.
--   3. Adds tenant-isolation policies for `audit_logs`.
--   4. Adds tenant-isolation policies for `passkeys` and `webauthn_sessions`
--      which were previously unprotected.

-- ── organizations ───────────────────────────────────────────────────────────

-- Allow any authenticated role to SELECT organizations (needed for login flow
-- where the org_id is not yet known).
CREATE POLICY org_read_all ON organizations
    FOR SELECT
    USING (true);

-- INSERT / UPDATE / DELETE restricted to the current org context.
CREATE POLICY org_write_own ON organizations
    FOR ALL
    USING (id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- ── audit_logs ──────────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_audit ON audit_logs
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ── passkeys ────────────────────────────────────────────────────────────────

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_passkeys ON passkeys
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ── webauthn_sessions ───────────────────────────────────────────────────────

ALTER TABLE webauthn_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_webauthn ON webauthn_sessions
    FOR ALL
    USING (org_id = current_setting('app.current_org_id', true)::uuid);
