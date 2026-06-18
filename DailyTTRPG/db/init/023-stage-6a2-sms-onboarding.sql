BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS onboarding_state VARCHAR(80) NOT NULL DEFAULT 'awaiting_start',
  ADD COLUMN IF NOT EXISTS onboarding_substate VARCHAR(80),
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_onboarding_draft_character_id BIGINT,
  ADD COLUMN IF NOT EXISTS sms_onboarding_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_via_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS draft_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_onboarding_state_check'
  ) THEN
    ALTER TABLE account
      ADD CONSTRAINT account_onboarding_state_check
      CHECK (
        onboarding_state IN (
          'unknown_phone',
          'awaiting_start',
          'onboarding_intro',
          'creating_character',
          'character_created',
          'assigning_campaign',
          'campaign_ready',
          'intro_started',
          'active_play'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_sms_onboarding_draft_character_id_fkey'
  ) THEN
    ALTER TABLE account
      ADD CONSTRAINT account_sms_onboarding_draft_character_id_fkey
      FOREIGN KEY (sms_onboarding_draft_character_id)
      REFERENCES dnd5e_character(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_character_status_check'
  ) THEN
    ALTER TABLE dnd5e_character
      ADD CONSTRAINT dnd5e_character_status_check
      CHECK (status IN ('draft', 'active', 'dead', 'retired'));
  END IF;
END $$;

UPDATE account
SET onboarding_state = 'active_play'
WHERE active_character_id IS NOT NULL
  AND onboarding_state = 'awaiting_start';

UPDATE dnd5e_character
SET status = CASE
  WHEN is_active THEN 'active'
  ELSE status
END
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_account_onboarding_state
  ON account(onboarding_state);

CREATE INDEX IF NOT EXISTS idx_account_last_active_at
  ON account(last_active_at);

CREATE INDEX IF NOT EXISTS idx_account_sms_onboarding_draft_character_id
  ON account(sms_onboarding_draft_character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_status
  ON dnd5e_character(status);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_created_via_sms
  ON dnd5e_character(created_via_sms);

COMMIT;
