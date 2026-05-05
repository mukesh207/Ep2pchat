-- 22. Add performance indexes for faster rostering and device management
-- Frequently joined columns and filters should be indexed to ensure sub-millisecond response times.

CREATE INDEX IF NOT EXISTS idx_devices_user_org ON devices(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_users_org_status ON users(org_id, status);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_recipient_delivered ON encrypted_messages(recipient_device_id, delivered_at) WHERE delivered_at IS NULL;
