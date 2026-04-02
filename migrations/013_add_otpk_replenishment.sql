-- 13. OTPK replenishment support
-- Adds tracking columns used = FALSE, used_at, created_at to one_time_pre_keys.
-- The existing DELETE-based consumption in the key bundle handler will continue
-- to work; these columns enable the new count/upload endpoints without breaking
-- the fetch-and-delete path.

-- NOTE: The existing table uses a DELETE approach (row removed when consumed),
-- so `used` is informational for newly inserted rows via the /keys/otpk/upload
-- endpoint which preserves rows and marks them consumed instead of deleting.
ALTER TABLE one_time_pre_keys
    ADD COLUMN IF NOT EXISTS used       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS used_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fast count for the replenishment-check endpoint (runs on login + after X3DH)
CREATE INDEX IF NOT EXISTS idx_otpk_device_unused
    ON one_time_pre_keys (device_id)
    WHERE used = FALSE;
