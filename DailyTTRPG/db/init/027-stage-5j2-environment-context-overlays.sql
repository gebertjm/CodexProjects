BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_environment_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  scope_type VARCHAR(50) NOT NULL,
  scope_id VARCHAR(180) NOT NULL,
  weather VARCHAR(80),
  time_of_day VARCHAR(80),
  season VARCHAR(80),
  light_level VARCHAR(80),
  temperature_band VARCHAR(80),
  precipitation VARCHAR(80),
  wind VARCHAR(80),
  visibility VARCHAR(80),
  terrain_or_biome VARCHAR(120),
  location_environment VARCHAR(120),
  mood_or_tone VARCHAR(120),
  day_count INTEGER NOT NULL DEFAULT 0,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  pinned_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source VARCHAR(80) NOT NULL DEFAULT 'runtime',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_instance_id, scope_type, scope_id),
  CONSTRAINT dnd5e_environment_state_scope_check CHECK (
    scope_type IN ('world', 'region', 'location', 'scene')
  ),
  CONSTRAINT dnd5e_environment_state_source_check CHECK (
    source IN ('content_default', 'runtime', 'gm_override', 'progression', 'test')
  ),
  CONSTRAINT dnd5e_environment_state_scope_id_present_check CHECK (btrim(scope_id) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_environment_state_effective
  ON dnd5e_environment_state(world_instance_id, scope_type, scope_id);

CREATE TABLE IF NOT EXISTS dnd5e_environment_flavor (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  flavor_key VARCHAR(180) NOT NULL UNIQUE,
  slot VARCHAR(80) NOT NULL,
  text TEXT NOT NULL,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_weather_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_time_of_day_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_season_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_location_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_scene_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_biome_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_location_environment_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone_or_mood_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 1,
  reuse_cooldown INTEGER NOT NULL DEFAULT 0,
  exclusions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_known_facts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  excludes_known_facts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_world_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  excludes_world_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_once_per_scene BOOLEAN NOT NULL DEFAULT FALSE,
  author_notes TEXT,
  gm_notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_environment_flavor_key_present_check CHECK (btrim(flavor_key) <> ''),
  CONSTRAINT dnd5e_environment_flavor_slot_present_check CHECK (btrim(slot) <> ''),
  CONSTRAINT dnd5e_environment_flavor_text_present_check CHECK (btrim(text) <> ''),
  CONSTRAINT dnd5e_environment_flavor_weight_positive_check CHECK (weight > 0),
  CONSTRAINT dnd5e_environment_flavor_reuse_cooldown_check CHECK (reuse_cooldown >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_environment_flavor_slot
  ON dnd5e_environment_flavor(slot, is_active, priority DESC, id ASC);

CREATE TABLE IF NOT EXISTS dnd5e_environment_flavor_usage (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  flavor_id BIGINT REFERENCES dnd5e_environment_flavor(id) ON DELETE SET NULL,
  flavor_key VARCHAR(180) NOT NULL,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  used_slot VARCHAR(80) NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT dnd5e_environment_flavor_usage_key_present_check CHECK (btrim(flavor_key) <> ''),
  CONSTRAINT dnd5e_environment_flavor_usage_slot_present_check CHECK (btrim(used_slot) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_environment_flavor_usage_recent
  ON dnd5e_environment_flavor_usage(world_instance_id, used_slot, used_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_environment_modifier (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  modifier_key VARCHAR(180) NOT NULL UNIQUE,
  environment_key VARCHAR(120) NOT NULL,
  check_type VARCHAR(80) NOT NULL,
  skill_slug VARCHAR(120),
  context VARCHAR(120),
  modifier INTEGER NOT NULL,
  reason TEXT NOT NULL,
  narrative_hint TEXT,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_environment_modifier_key_present_check CHECK (btrim(modifier_key) <> ''),
  CONSTRAINT dnd5e_environment_modifier_environment_present_check CHECK (btrim(environment_key) <> ''),
  CONSTRAINT dnd5e_environment_modifier_check_present_check CHECK (btrim(check_type) <> ''),
  CONSTRAINT dnd5e_environment_modifier_reason_present_check CHECK (btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_environment_modifier_environment
  ON dnd5e_environment_modifier(environment_key, check_type, skill_slug, context, is_active);

ALTER TABLE dnd5e_world_event
  DROP CONSTRAINT IF EXISTS dnd5e_world_event_known_type_check;

ALTER TABLE dnd5e_world_event
  ADD CONSTRAINT dnd5e_world_event_known_type_check CHECK (
    event_type IN (
      'interaction_resolved',
      'knowledge_granted',
      'scene_state_changed',
      'affordance_state_changed',
      'entity_state_changed',
      'npc_state_changed',
      'objective_updated',
      'campaign_started',
      'character_entered_scene',
      'manual_adjustment',
      'environment_changed',
      'time_advanced',
      'weather_changed',
      'environment_override_set',
      'environment_override_cleared'
    )
  );

COMMIT;
