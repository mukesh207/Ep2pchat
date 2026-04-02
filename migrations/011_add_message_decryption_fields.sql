-- 11. Add decryption metadata fields to encrypted_messages
-- Required for X3DH key exchange - client needs these fields to decrypt messages

ALTER TABLE encrypted_messages
    ADD COLUMN IF NOT EXISTS sender_identity_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS ephemeral_public_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS nonce TEXT NOT NULL DEFAULT '';

-- Add index for efficient offline message fetch
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_recipient_undelivered
    ON encrypted_messages(recipient_device_id, created_at ASC)
    WHERE delivered_at IS NULL;
