-- Add presence status column to users table
ALTER TABLE users ADD COLUMN presence_status VARCHAR(50) DEFAULT 'offline';