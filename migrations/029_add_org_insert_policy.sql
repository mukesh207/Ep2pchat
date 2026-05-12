-- 029. Add organization insert policy
-- This policy allows the creation of new organizations during the request-access flow.
-- It was originally incorrectly added to migration 015 after it was already applied in production.

DROP POLICY IF EXISTS org_insert_all ON organizations;
CREATE POLICY org_insert_all ON organizations
    FOR INSERT
    WITH CHECK (true);
