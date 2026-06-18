BEGIN;

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS web_runtime_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS dnd5e_web_action_submission (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action_window_id BIGINT NOT NULL REFERENCES dnd5e_action_window(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  resolved_verb VARCHAR(80) NOT NULL,
  target_affordance_id VARCHAR(220),
  target_label TEXT,
  target_type VARCHAR(80),
  interaction_id VARCHAR(220),
  response_key VARCHAR(220) NOT NULL,
  response_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  submission_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_web_action_submission_raw_text_check CHECK (btrim(raw_text) <> ''),
  CONSTRAINT dnd5e_web_action_submission_verb_check CHECK (btrim(resolved_verb) <> ''),
  CONSTRAINT dnd5e_web_action_submission_response_key_check CHECK (btrim(response_key) <> ''),
  CONSTRAINT dnd5e_web_action_submission_version_check CHECK (version >= 1),
  CONSTRAINT dnd5e_web_action_submission_status_check CHECK (
    status IN ('submitted', 'updated', 'locked', 'canceled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_web_action_submission_window_character
  ON dnd5e_web_action_submission(action_window_id, character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_web_action_submission_campaign_character
  ON dnd5e_web_action_submission(campaign_id, character_id, updated_at DESC, id DESC);

COMMIT;
