BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  affordance_key VARCHAR(160) NOT NULL,
  label TEXT NOT NULL,
  aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene_id, affordance_key),
  CONSTRAINT dnd5e_scene_affordance_key_present_check CHECK (btrim(affordance_key) <> ''),
  CONSTRAINT dnd5e_scene_affordance_label_present_check CHECK (btrim(label) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance_action (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  affordance_id BIGINT NOT NULL REFERENCES dnd5e_scene_affordance(id) ON DELETE CASCADE,
  verb VARCHAR(80) NOT NULL,
  action_key VARCHAR(180) NOT NULL,
  interaction_id BIGINT REFERENCES dnd5e_scene_interaction(id) ON DELETE SET NULL,
  transition_id BIGINT REFERENCES dnd5e_scene_transition(id) ON DELETE SET NULL,
  repeat_policy VARCHAR(80) NOT NULL DEFAULT 'once',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (affordance_id, verb, action_key),
  CONSTRAINT dnd5e_scene_affordance_action_verb_present_check CHECK (btrim(verb) <> ''),
  CONSTRAINT dnd5e_scene_affordance_action_key_present_check CHECK (btrim(action_key) <> ''),
  CONSTRAINT dnd5e_scene_affordance_action_repeat_check CHECK (
    repeat_policy IN ('once', 'repeat_with_new_context', 'repeatable', 'depleted_visible')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_affordance_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  affordance_key VARCHAR(180) NOT NULL,
  action_key VARCHAR(180),
  state VARCHAR(80) NOT NULL DEFAULT 'available',
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  resolved_by_character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  revealed_at TIMESTAMPTZ,
  source_type VARCHAR(80),
  source_key VARCHAR(180),
  context_version INTEGER NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, character_id, scene_id, affordance_key, action_key),
  CONSTRAINT dnd5e_scene_affordance_state_key_present_check CHECK (btrim(affordance_key) <> ''),
  CONSTRAINT dnd5e_scene_affordance_state_status_check CHECK (
    state IN ('available', 'hidden', 'locked', 'resolved', 'depleted', 'transformed')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_affordance_state_character
  ON dnd5e_scene_affordance_state(character_id, campaign_id, scene_id, state);

CREATE TABLE IF NOT EXISTS dnd5e_sms_intent_resolution_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  session_id TEXT,
  user_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  available_affordance_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  available_verbs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolver_status VARCHAR(80) NOT NULL,
  candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_candidate_json JSONB,
  confidence NUMERIC,
  clarification_needed BOOLEAN NOT NULL DEFAULT FALSE,
  external_ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_sms_intent_resolution_log_status_check CHECK (
    resolver_status IN ('resolved', 'ambiguous', 'invalid', 'out_of_scope')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_sms_intent_resolution_log_character
  ON dnd5e_sms_intent_resolution_log(character_id, created_at DESC, id DESC);

COMMIT;
