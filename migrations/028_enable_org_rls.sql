-- 028. Enable RLS on organizations table
-- This migration completes the RLS hardening by enabling security on the organizations table.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

-- Note: Policies (org_read_all, org_write_own, org_insert_all) were already 
-- defined in migration 015 but were inactive without this ENABLE command.
