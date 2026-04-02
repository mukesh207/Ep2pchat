-- 010. Add username to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- Populate existing users with a default username derived from email
UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;
