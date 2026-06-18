BEGIN;

ALTER TABLE dnd5e_scene
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_campaign_log
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_log_type_check;

ALTER TABLE dnd5e_campaign_log
  ADD CONSTRAINT dnd5e_campaign_log_type_check CHECK (
    log_type IN (
      'character_joined',
      'scene_entered',
      'scene_moved',
      'interaction_attempted',
      'flag_changed',
      'quest_updated',
      'objective_updated',
      'npc_state_changed',
      'dialogue_started',
      'dialogue_choice',
      'dialogue_ended',
      'combat_started',
      'combat_turn_advanced',
      'combat_action',
      'combat_resolved',
      'combat_round_advanced',
      'combat_ended',
      'reward_applied',
      'knowledge_discovered',
      'scene_unlocked',
      'adventure_state_updated',
      'event_triggered',
      'event_option_chosen',
      'play_action',
      'play_action_result',
      'action_window_opened',
      'action_window_closed',
      'content_hook_executed',
      'progression_window_opened',
      'progression_window_response',
      'progression_window_resolved',
      'default_action_applied',
      'catchup_generated',
      'world_beat',
      'world_change_recorded',
      'world_change_propagated',
      'world_entity_changed',
      'thread_interrupted',
      'dynamic_content_hook',
      'beat_advance_started',
      'beat_advance_completed',
      'beat_advance_skipped',
      'playtest_repair',
      'automatic_observation',
      'passive_discovery',
      'free_focus_discovery',
      'free_focus_state_change',
      'system'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_character_exploration_interaction_result (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE SET NULL,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  target_id VARCHAR(220),
  interaction_id VARCHAR(220) NOT NULL,
  interaction_version INTEGER NOT NULL DEFAULT 1,
  resolution_mode VARCHAR(40) NOT NULL,
  scene_state_version VARCHAR(120) NOT NULL DEFAULT 'default',
  target_state_version VARCHAR(120) NOT NULL DEFAULT 'default',
  status VARCHAR(40) NOT NULL DEFAULT 'current_viewed',
  check_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_visibility VARCHAR(40) NOT NULL DEFAULT 'visible',
  result_narration TEXT,
  result_summary TEXT,
  knowledge_grants_applied_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  state_changes_applied_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  canonical_event_id BIGINT REFERENCES dnd5e_campaign_log(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_exploration_result_interaction_id_check CHECK (btrim(interaction_id) <> ''),
  CONSTRAINT dnd5e_exploration_result_mode_check CHECK (
    resolution_mode IN ('automatic_observation', 'passive_discovery', 'free_focus')
  ),
  CONSTRAINT dnd5e_exploration_result_status_check CHECK (
    status IN ('current_viewed', 'stale_viewed', 'superseded', 'expired', 'unavailable')
  ),
  CONSTRAINT dnd5e_exploration_result_check_visibility_check CHECK (
    check_visibility IN ('visible', 'hidden', 'success_only', 'narrative_only')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_exploration_result_once_per_state
  ON dnd5e_character_exploration_interaction_result(
    campaign_id,
    character_id,
    scene_id,
    interaction_id,
    resolution_mode,
    scene_state_version,
    target_state_version
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_exploration_result_scene_character
  ON dnd5e_character_exploration_interaction_result(
    campaign_id,
    character_id,
    scene_id,
    resolution_mode,
    resolved_at DESC,
    id DESC
  );

COMMIT;
