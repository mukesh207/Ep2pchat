-- Enforce a single global administrator constraint.
-- This ensures that only one user across the entire system can hold the 'ADMIN' role.

CREATE UNIQUE INDEX IF NOT EXISTS single_admin_idx ON users (role) WHERE (role = 'ADMIN');
