BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_gameplay_history (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  source_type VARCHAR(50) NOT NULL,
  source_entity_id BIGINT,
  action_key VARCHAR(100) NOT NULL,
  summary TEXT NOT NULL,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_gameplay_history_source_type_check CHECK (
    source_type IN ('command', 'event', 'progression', 'system')
  ),
  CONSTRAINT dnd5e_gameplay_history_action_key_present_check CHECK (
    btrim(action_key) <> ''
  ),
  CONSTRAINT dnd5e_gameplay_history_summary_present_check CHECK (
    btrim(summary) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_gameplay_history_character_id_created_at
  ON dnd5e_gameplay_history(character_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_gameplay_history_source_lookup
  ON dnd5e_gameplay_history(source_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_gameplay_history_actor_account_id
  ON dnd5e_gameplay_history(actor_account_id);

INSERT INTO dnd5e_event_template (
  key,
  name,
  event_type,
  description,
  prompt_text
)
SELECT
  'waystone_insight',
  'Waystone Insight',
  'exploration',
  'A progression-focused event that grants experience for studying ancient runes.',
  'An old waystone hums with faint arcane energy. How do you engage with it?'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_event_template
  WHERE key = 'waystone_insight'
);

INSERT INTO dnd5e_event_template_option (
  template_id,
  option_key,
  label,
  description,
  sort_order,
  resolution_kind,
  resolution_payload_json
)
SELECT
  template.id,
  option_data.option_key,
  option_data.label,
  option_data.description,
  option_data.sort_order,
  option_data.resolution_kind,
  option_data.resolution_payload_json
FROM dnd5e_event_template template
JOIN (
  VALUES
    (
      'study_glyphs',
      'Study the glyphs',
      'Spend time understanding the runes and gain insight.',
      1,
      'no_effect',
      '{"xp":25}'::jsonb
    ),
    (
      'trace_runes',
      'Trace the runes carefully',
      'Learn a smaller lesson from the stone.',
      2,
      'no_effect',
      '{"xp":10}'::jsonb
    ),
    (
      'walk_past',
      'Walk past it',
      'Leave the waystone alone and continue traveling.',
      3,
      'no_effect',
      '{}'::jsonb
    )
) AS option_data (
  option_key,
  label,
  description,
  sort_order,
  resolution_kind,
  resolution_payload_json
) ON TRUE
WHERE template.key = 'waystone_insight'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_event_template_option existing
    WHERE existing.template_id = template.id
      AND existing.option_key = option_data.option_key
  );

COMMIT;
