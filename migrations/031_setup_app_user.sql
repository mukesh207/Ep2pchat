-- 031. Setup restricted app user for RLS enforcement
--
-- This migration ensures the `trustline_app` role can login and has a password.
-- This is critical because superusers (like the default 'trustline' user)
-- bypass all Row-Level Security policies.

DO $$ 
BEGIN
  -- Ensure the role exists (it should from migration 014)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trustline_app') THEN
    CREATE ROLE trustline_app WITH LOGIN PASSWORD 'trustline_pass_secure_123';
  ELSE
    ALTER ROLE trustline_app WITH LOGIN PASSWORD 'trustline_pass_secure_123';
  END IF;
END $$;

-- Grant permissions to the app user
GRANT CONNECT ON DATABASE trustline TO trustline_app;
GRANT USAGE ON SCHEMA public TO trustline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trustline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trustline_app;

-- Ensure future tables also grant permissions to the app user
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trustline_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO trustline_app;

-- Ensure RLS is ALWAYS forced even for the table owner (though trustline_app won't own them)
ALTER TABLE organizations      FORCE ROW LEVEL SECURITY;
ALTER TABLE users              FORCE ROW LEVEL SECURITY;
ALTER TABLE devices            FORCE ROW LEVEL SECURITY;
ALTER TABLE one_time_pre_keys  FORCE ROW LEVEL SECURITY;
ALTER TABLE encrypted_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         FORCE ROW LEVEL SECURITY;
ALTER TABLE stories            FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions           FORCE ROW LEVEL SECURITY;
