-- 20. Introduce Role-Based Access Control (RBAC)
-- Replace the binary 'is_admin' flag with a more flexible 'role' column.

ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'USER' NOT NULL;

-- Backfill existing admins
UPDATE users SET role = 'ADMIN' WHERE is_admin = TRUE;

-- Drop the legacy column
ALTER TABLE users DROP COLUMN is_admin;
