-- Phase 2: Admin Console Polish Schema Extensions

-- 1. Device Aliasing & Remote Wipe
ALTER TABLE devices ADD COLUMN alias VARCHAR(255);
ALTER TABLE devices ADD COLUMN is_nuked BOOLEAN DEFAULT FALSE;

-- 2. User Request Metadata (IP, OS, etc.)
ALTER TABLE users ADD COLUMN request_metadata JSONB DEFAULT '{}';

-- 3. Organization Branding & Maintenance
ALTER TABLE organizations ADD COLUMN branding JSONB DEFAULT '{"primary_color": "#6e56cf", "workspace_name": ""}'::jsonb;
ALTER TABLE organizations ADD COLUMN is_maintenance_mode BOOLEAN DEFAULT FALSE;
