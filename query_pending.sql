SELECT id, email, username, created_at
FROM users
WHERE status = 'pending_approval';
