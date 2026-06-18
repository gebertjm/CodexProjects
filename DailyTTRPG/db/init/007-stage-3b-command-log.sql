BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_command_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  command_type VARCHAR(100) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL,
  result_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_command_log_character_id_created_at
  ON dnd5e_command_log(character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_command_log_command_type
  ON dnd5e_command_log(command_type);

COMMIT;
