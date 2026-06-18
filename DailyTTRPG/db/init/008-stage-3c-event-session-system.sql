BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_campaign (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_campaign_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_campaign_character (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  joined_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, character_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_event_template (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  description TEXT,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_event_template_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_event_template_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_event_template_prompt_present_check CHECK (btrim(prompt_text) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_event_template_option (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  template_id BIGINT NOT NULL REFERENCES dnd5e_event_template(id) ON DELETE CASCADE,
  option_key VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  resolution_kind VARCHAR(50) NOT NULL,
  resolution_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, option_key),
  CONSTRAINT dnd5e_event_template_option_key_present_check CHECK (btrim(option_key) <> ''),
  CONSTRAINT dnd5e_event_template_option_label_present_check CHECK (btrim(label) <> ''),
  CONSTRAINT dnd5e_event_template_option_resolution_kind_check CHECK (
    resolution_kind IN ('grant_currency', 'grant_item', 'no_effect')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_event_instance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES dnd5e_event_template(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  prompt_text TEXT NOT NULL,
  created_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  selected_option_id BIGINT,
  selected_option_key VARCHAR(100),
  outcome_summary TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT dnd5e_event_instance_status_check CHECK (
    status IN ('pending', 'active', 'resolved', 'expired', 'canceled')
  ),
  CONSTRAINT dnd5e_event_instance_prompt_present_check CHECK (btrim(prompt_text) <> ''),
  CONSTRAINT dnd5e_event_instance_resolution_consistency_check CHECK (
    status <> 'resolved'
    OR (selected_option_key IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_event_option (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_instance_id BIGINT NOT NULL REFERENCES dnd5e_event_instance(id) ON DELETE CASCADE,
  template_option_id BIGINT REFERENCES dnd5e_event_template_option(id) ON DELETE SET NULL,
  option_key VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  resolution_kind VARCHAR(50) NOT NULL,
  resolution_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_instance_id, option_key),
  CONSTRAINT dnd5e_event_option_key_present_check CHECK (btrim(option_key) <> ''),
  CONSTRAINT dnd5e_event_option_label_present_check CHECK (btrim(label) <> ''),
  CONSTRAINT dnd5e_event_option_resolution_kind_check CHECK (
    resolution_kind IN ('grant_currency', 'grant_item', 'no_effect')
  )
);

ALTER TABLE dnd5e_event_instance
  DROP CONSTRAINT IF EXISTS dnd5e_event_instance_selected_option_id_fkey;

ALTER TABLE dnd5e_event_instance
  ADD CONSTRAINT dnd5e_event_instance_selected_option_id_fkey
  FOREIGN KEY (selected_option_id)
  REFERENCES dnd5e_event_option(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_event_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_instance_id BIGINT NOT NULL REFERENCES dnd5e_event_instance(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  log_type VARCHAR(50) NOT NULL,
  message TEXT,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_event_log_type_check CHECK (
    log_type IN ('created', 'choice_submitted', 'resolved', 'state_changed', 'canceled', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_created_by_account_id
  ON dnd5e_campaign(created_by_account_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_character_campaign_id
  ON dnd5e_campaign_character(campaign_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_character_character_id
  ON dnd5e_campaign_character(character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_template_event_type
  ON dnd5e_event_template(event_type);

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_template_option_template_id
  ON dnd5e_event_template_option(template_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_instance_campaign_id_status
  ON dnd5e_event_instance(campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_instance_character_id_created_at
  ON dnd5e_event_instance(character_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_event_instance_one_open_event_per_character
  ON dnd5e_event_instance(campaign_id, character_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_option_event_instance_id
  ON dnd5e_event_option(event_instance_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_event_log_event_instance_id_created_at
  ON dnd5e_event_log(event_instance_id, created_at ASC, id ASC);

INSERT INTO dnd5e_event_template (
  key,
  name,
  event_type,
  description,
  prompt_text
)
SELECT
  'roadside_cache',
  'Roadside Cache',
  'exploration',
  'A deterministic early-play event that grants either coins, a simple weapon, or no effect.',
  'You discover a weathered satchel hidden beside the road. What do you take?'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_event_template
  WHERE key = 'roadside_cache'
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
      'take_coin_purse',
      'Take the coin purse',
      'Pocket the purse and keep moving.',
      1,
      'grant_currency',
      '{"gp":5,"sp":2}'::jsonb
    ),
    (
      'take_dagger',
      'Take the dagger',
      'Keep a simple weapon from the cache.',
      2,
      'grant_item',
      '{"item_slug":"dagger","quantity":1,"notes":"Granted by the Roadside Cache event."}'::jsonb
    ),
    (
      'leave_it',
      'Leave it alone',
      'Take nothing and move on.',
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
WHERE template.key = 'roadside_cache'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_event_template_option existing
    WHERE existing.template_id = template.id
      AND existing.option_key = option_data.option_key
  );

COMMIT;
