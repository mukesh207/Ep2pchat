-- Add Double Ratchet header storage for per-message forward secrecy.
-- Make legacy X3DH fields (ephemeral_public_key, nonce) nullable:
--   - ephemeral_public_key is only sent on the first (X3DH handshake) message.
--   - nonce is derived from the message key in Double Ratchet (not transmitted).
ALTER TABLE encrypted_messages
    ADD COLUMN IF NOT EXISTS ratchet_header JSONB;

ALTER TABLE encrypted_messages
    ALTER COLUMN ephemeral_public_key DROP NOT NULL;

ALTER TABLE encrypted_messages
    ALTER COLUMN nonce DROP NOT NULL;
