BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_content_hook (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  hook_key VARCHAR(120) NOT NULL,
  hook_point VARCHAR(80) NOT NULL,
  scope_type VARCHAR(40) NOT NULL,
  scope_key VARCHAR(120),
  label VARCHAR(160) NOT NULL,
  description TEXT,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_triggers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  feedback_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, hook_key),
  CONSTRAINT dnd5e_content_hook_key_present_check CHECK (btrim(hook_key) <> ''),
  CONSTRAINT dnd5e_content_hook_label_present_check CHECK (btrim(label) <> ''),
  CONSTRAINT dnd5e_content_hook_point_check CHECK (
    hook_point IN (
      'scene_enter',
      'scene_exit',
      'dialogue_node_enter',
      'dialogue_option_select',
      'interaction_attempt',
      'interaction_success',
      'interaction_failure',
      'combat_start',
      'combat_end',
      'objective_start',
      'objective_complete',
      'time_beat',
      'event_triggered',
      'event_resolved'
    )
  ),
  CONSTRAINT dnd5e_content_hook_scope_type_check CHECK (
    scope_type IN (
      'world',
      'campaign',
      'scene',
      'entity',
      'dialogue',
      'interaction',
      'objective',
      'event',
      'time'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_content_hook_world_point
  ON dnd5e_content_hook(world_id, hook_point, is_active, priority DESC, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_content_hook_campaign_scene
  ON dnd5e_content_hook(campaign_id, scene_id, hook_point, is_active, priority DESC, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_content_hook_scene
  ON dnd5e_content_hook(scene_id, hook_point, is_active, priority DESC, id);

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
      'reward_applied',
      'knowledge_discovered',
      'scene_unlocked',
      'adventure_state_updated',
      'play_action',
      'thread_interrupted',
      'action_window_opened',
      'action_window_closed',
      'content_hook_executed',
      'system'
    )
  );

CREATE OR REPLACE FUNCTION dnd5e_assert_content_hook_world_match()
RETURNS TRIGGER AS $$
DECLARE
  campaign_world_id BIGINT;
  scene_world_id BIGINT;
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT world_id INTO campaign_world_id
    FROM dnd5e_campaign
    WHERE id = NEW.campaign_id;

    IF campaign_world_id IS NULL OR campaign_world_id <> NEW.world_id THEN
      RAISE EXCEPTION 'Content hook campaign must belong to the hook world';
    END IF;
  END IF;

  IF NEW.scene_id IS NOT NULL THEN
    SELECT world_id INTO scene_world_id
    FROM dnd5e_scene
    WHERE id = NEW.scene_id;

    IF scene_world_id IS NULL OR scene_world_id <> NEW.world_id THEN
      RAISE EXCEPTION 'Content hook scene must belong to the hook world';
    END IF;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd5e_content_hook_world_match
  ON dnd5e_content_hook;

CREATE TRIGGER trg_dnd5e_content_hook_world_match
BEFORE INSERT OR UPDATE OF world_id, campaign_id, scene_id
ON dnd5e_content_hook
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_content_hook_world_match();

COMMIT;
