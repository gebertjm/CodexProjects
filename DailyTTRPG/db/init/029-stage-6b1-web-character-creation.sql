BEGIN;

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS created_via_web BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS web_creation_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS dnd5e_character_creation_draft (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  mode VARCHAR(40),
  current_step VARCHAR(80) NOT NULL DEFAULT 'mode',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT dnd5e_character_creation_draft_mode_check CHECK (
    mode IS NULL OR mode IN ('quick_start', 'guided', 'detailed')
  ),
  CONSTRAINT dnd5e_character_creation_draft_status_check CHECK (
    status IN ('active', 'completed', 'abandoned')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_character_creation_one_active_draft
  ON dnd5e_character_creation_draft(account_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_creation_draft_account_status
  ON dnd5e_character_creation_draft(account_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_created_via_web
  ON dnd5e_character(created_via_web);

COMMIT;
