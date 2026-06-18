BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(160),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_mode VARCHAR(40) NOT NULL DEFAULT 'disabled';

UPDATE account
SET
  sms_enabled = FALSE,
  sms_mode = 'disabled'
WHERE firebase_uid IS NOT NULL
  AND (sms_mode IS NULL OR sms_mode = '' OR sms_mode = 'full');

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_firebase_uid_unique
  ON account(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_last_seen_at
  ON account(last_seen_at);

ALTER TABLE account
  DROP CONSTRAINT IF EXISTS account_sms_mode_check;

ALTER TABLE account
  ADD CONSTRAINT account_sms_mode_check CHECK (
    sms_mode IN ('disabled', 'alerts_only', 'fallback_input', 'full')
  );

ALTER TABLE account
  DROP CONSTRAINT IF EXISTS account_contact_check;

ALTER TABLE account
  ADD CONSTRAINT account_contact_check CHECK (
    email IS NOT NULL OR phone_number IS NOT NULL OR firebase_uid IS NOT NULL
  );

COMMIT;
