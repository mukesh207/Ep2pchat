-- 2. Users (The Employees)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending_approval',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, email)
);
