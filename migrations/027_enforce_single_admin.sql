-- Enforce a single administrator constraint per organization.
-- This ensures that each organization can have exactly one user holding the 'ADMIN' role.

CREATE UNIQUE INDEX IF NOT EXISTS single_admin_per_org_idx ON users (org_id, role) WHERE (role = 'ADMIN');
