BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_player_beat_result (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  action_window_id BIGINT NOT NULL REFERENCES dnd5e_action_window(id) ON DELETE CASCADE,
  submitted_action_id BIGINT REFERENCES dnd5e_web_action_submission(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  scene_type VARCHAR(40) NOT NULL DEFAULT 'exploration',
  beat_number INTEGER,
  result_kind VARCHAR(80) NOT NULL DEFAULT 'exploration_result',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  narration TEXT,
  submitted_action_summary TEXT,
  interpreted_action_summary TEXT,
  visible_changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_gained_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  objective_updates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  safe_mechanics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_player_beat_result_scene_type_check CHECK (
    scene_type IN ('exploration', 'dialogue', 'combat', 'unknown')
  ),
  CONSTRAINT dnd5e_player_beat_result_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT dnd5e_player_beat_result_summary_check CHECK (btrim(summary) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_player_beat_result_window_character
  ON dnd5e_player_beat_result(action_window_id, character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_player_beat_result_scene_recent
  ON dnd5e_player_beat_result(campaign_id, character_id, scene_id, resolved_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_player_beat_result_history
  ON dnd5e_player_beat_result(campaign_id, character_id, resolved_at DESC, id DESC);

COMMIT;
