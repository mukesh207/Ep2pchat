-- Phase 4: Organizational Hierarchy Support
ALTER TABLE users ADD COLUMN department VARCHAR(100);
CREATE INDEX idx_users_org_department ON users(org_id, department);
