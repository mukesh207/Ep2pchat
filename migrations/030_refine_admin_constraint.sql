-- 030. Refine admin constraint to be per-organization
-- Migration 027 incorrectly enforced a global single-admin constraint.
-- This migration drops that global index and replaces it with a per-organization index.

DROP INDEX IF EXISTS single_admin_idx;
CREATE UNIQUE INDEX IF NOT EXISTS single_admin_per_org_idx ON users (org_id, role) WHERE (role = 'ADMIN');
