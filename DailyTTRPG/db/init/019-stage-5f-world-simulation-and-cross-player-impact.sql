BEGIN;

ALTER TABLE dnd5e_gameplay_history
  DROP CONSTRAINT IF EXISTS dnd5e_gameplay_history_source_type_check;

ALTER TABLE dnd5e_gameplay_history
  ADD CONSTRAINT dnd5e_gameplay_history_source_type_check CHECK (
    source_type IN (
      'command',
      'event',
      'progression',
      'system',
      'narrative',
      'combat',
      'adventure',
      'world_simulation'
    )
  );

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
      'world_change_recorded',
      'world_change_propagated',
      'world_entity_changed',
      'progression_window_opened',
      'progression_window_response',
      'progression_window_resolved',
      'default_action_applied',
      'catchup_generated',
      'world_beat',
      'system'
    )
  );

ALTER TABLE dnd5e_character_knowledge
  DROP CONSTRAINT IF EXISTS dnd5e_character_knowledge_type_check;

ALTER TABLE dnd5e_character_knowledge
  ADD CONSTRAINT dnd5e_character_knowledge_type_check CHECK (
    knowledge_type IN (
      'campaign_flag',
      'quest',
      'objective',
      'scene',
      'lore',
      'event',
      'dialogue',
      'interaction',
      'combat',
      'reward',
      'world_change',
      'world_event',
      'rumor',
      'world_entity'
    )
  );

ALTER TABLE dnd5e_world_entity
  DROP CONSTRAINT IF EXISTS dnd5e_world_entity_status_check;

ALTER TABLE dnd5e_world_entity
  ADD CONSTRAINT dnd5e_world_entity_status_check CHECK (
    status IN (
      'active',
      'inactive',
      'hidden',
      'defeated',
      'archived',
      'alive',
      'dead',
      'injured',
      'unavailable',
      'traveling',
      'engaged'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_world_change (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  change_key VARCHAR(160) NOT NULL,
  change_type VARCHAR(80) NOT NULL,
  propagation_scope VARCHAR(40) NOT NULL DEFAULT 'campaign_local',
  propagation_status VARCHAR(40) NOT NULL DEFAULT 'recorded',
  region_id BIGINT REFERENCES dnd5e_region(id) ON DELETE SET NULL,
  location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  world_entity_id BIGINT REFERENCES dnd5e_world_entity(id) ON DELETE SET NULL,
  source_type VARCHAR(80),
  source_entity_id BIGINT,
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  narrative_text TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  truth_delta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, change_key),
  CONSTRAINT dnd5e_world_change_key_present_check CHECK (btrim(change_key) <> ''),
  CONSTRAINT dnd5e_world_change_type_present_check CHECK (btrim(change_type) <> ''),
  CONSTRAINT dnd5e_world_change_title_present_check CHECK (btrim(title) <> ''),
  CONSTRAINT dnd5e_world_change_summary_present_check CHECK (btrim(summary) <> ''),
  CONSTRAINT dnd5e_world_change_scope_check CHECK (
    propagation_scope IN ('campaign_local', 'regional', 'global')
  ),
  CONSTRAINT dnd5e_world_change_status_check CHECK (
    propagation_status IN ('recorded', 'propagated', 'superseded', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_change_world_created
  ON dnd5e_world_change(world_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_change_campaign_created
  ON dnd5e_world_change(campaign_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_change_scope
  ON dnd5e_world_change(world_id, propagation_scope, propagation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS dnd5e_world_entity_event (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  world_entity_id BIGINT NOT NULL REFERENCES dnd5e_world_entity(id) ON DELETE CASCADE,
  world_change_id BIGINT REFERENCES dnd5e_world_change(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  from_region_id BIGINT REFERENCES dnd5e_region(id) ON DELETE SET NULL,
  from_location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  from_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  to_region_id BIGINT REFERENCES dnd5e_region(id) ON DELETE SET NULL,
  to_location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  to_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  from_disposition VARCHAR(50),
  to_disposition VARCHAR(50),
  state_delta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_world_entity_event_type_check CHECK (
    event_type IN ('state_change', 'movement', 'disposition_change', 'status_change', 'beat')
  ),
  CONSTRAINT dnd5e_world_entity_event_summary_present_check CHECK (btrim(summary) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_entity_event_entity_created
  ON dnd5e_world_entity_event(world_entity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_entity_event_world_created
  ON dnd5e_world_entity_event(world_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_world_propagation_receipt (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_change_id BIGINT NOT NULL REFERENCES dnd5e_world_change(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  propagation_channel VARCHAR(40) NOT NULL DEFAULT 'system',
  knowledge_status VARCHAR(40) NOT NULL DEFAULT 'available',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovered_at TIMESTAMPTZ,
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (
    world_change_id,
    campaign_id,
    character_id,
    propagation_channel
  ),
  CONSTRAINT dnd5e_world_propagation_channel_check CHECK (
    propagation_channel IN ('direct', 'proximity', 'rumor', 'time_delay', 'system')
  ),
  CONSTRAINT dnd5e_world_propagation_status_check CHECK (
    knowledge_status IN ('hidden', 'available', 'discovered', 'acknowledged')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_propagation_campaign
  ON dnd5e_world_propagation_receipt(campaign_id, knowledge_status, available_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_propagation_character
  ON dnd5e_world_propagation_receipt(character_id, knowledge_status, available_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_progression_window (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  window_key VARCHAR(160) NOT NULL,
  scope_type VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  prompt_text TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  threshold_at TIMESTAMPTZ NOT NULL,
  resolves_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  threshold_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_summary TEXT,
  source_type VARCHAR(80),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, window_key),
  CONSTRAINT dnd5e_progression_window_key_present_check CHECK (btrim(window_key) <> ''),
  CONSTRAINT dnd5e_progression_window_prompt_present_check CHECK (btrim(prompt_text) <> ''),
  CONSTRAINT dnd5e_progression_window_scope_check CHECK (
    scope_type IN ('solo', 'party', 'campaign', 'world')
  ),
  CONSTRAINT dnd5e_progression_window_status_check CHECK (
    status IN ('open', 'threshold_reached', 'resolved', 'canceled', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_progression_window_world_status
  ON dnd5e_progression_window(world_id, status, threshold_at, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_progression_window_campaign_status
  ON dnd5e_progression_window(campaign_id, status, threshold_at, id);

CREATE TABLE IF NOT EXISTS dnd5e_progression_window_participant (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  progression_window_id BIGINT NOT NULL REFERENCES dnd5e_progression_window(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  participant_status VARCHAR(40) NOT NULL DEFAULT 'expected',
  default_action_type VARCHAR(80) NOT NULL DEFAULT 'wait',
  default_action_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  responded_at TIMESTAMPTZ,
  defaulted_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (progression_window_id, character_id),
  CONSTRAINT dnd5e_progression_window_participant_status_check CHECK (
    participant_status IN ('expected', 'responded', 'defaulted', 'excused')
  ),
  CONSTRAINT dnd5e_progression_window_default_action_check CHECK (
    default_action_type IN ('wait', 'observe', 'defend', 'continue', 'first_available_action', 'end_turn')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_progression_window_participant_character
  ON dnd5e_progression_window_participant(character_id, participant_status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_progression_window_response (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  progression_window_id BIGINT NOT NULL REFERENCES dnd5e_progression_window(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  response_key VARCHAR(160) NOT NULL,
  response_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (progression_window_id, character_id),
  CONSTRAINT dnd5e_progression_window_response_key_present_check CHECK (btrim(response_key) <> ''),
  CONSTRAINT dnd5e_progression_window_response_summary_present_check CHECK (btrim(response_summary) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_progression_window_response_window
  ON dnd5e_progression_window_response(progression_window_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_default_action_application (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  progression_window_id BIGINT NOT NULL REFERENCES dnd5e_progression_window(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  action_type VARCHAR(80) NOT NULL,
  action_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  result_summary TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (progression_window_id, character_id),
  CONSTRAINT dnd5e_default_action_application_type_present_check CHECK (btrim(action_type) <> ''),
  CONSTRAINT dnd5e_default_action_application_reason_present_check CHECK (btrim(reason) <> ''),
  CONSTRAINT dnd5e_default_action_application_result_present_check CHECK (btrim(result_summary) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_default_action_application_character
  ON dnd5e_default_action_application(character_id, applied_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dnd5e_character_catchup_ack (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  last_seen_world_change_id BIGINT REFERENCES dnd5e_world_change(id) ON DELETE SET NULL,
  last_seen_campaign_log_id BIGINT REFERENCES dnd5e_campaign_log(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (world_id, campaign_id, character_id)
);

CREATE OR REPLACE FUNCTION dnd5e_assert_world_simulation_world_match()
RETURNS TRIGGER AS $$
DECLARE
  campaign_world_id BIGINT;
  character_world_id BIGINT;
  region_world_id BIGINT;
  location_world_id BIGINT;
  scene_world_id BIGINT;
  entity_world_id BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'dnd5e_world_change' THEN
    IF NEW.campaign_id IS NOT NULL THEN
      SELECT world_id INTO campaign_world_id
      FROM dnd5e_campaign
      WHERE id = NEW.campaign_id;

      IF campaign_world_id IS NULL OR campaign_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change campaign must belong to the change world';
      END IF;
    END IF;

    IF NEW.character_id IS NOT NULL THEN
      SELECT world_id INTO character_world_id
      FROM dnd5e_character
      WHERE id = NEW.character_id;

      IF character_world_id IS NULL OR character_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change character must belong to the change world';
      END IF;
    END IF;

    IF NEW.region_id IS NOT NULL THEN
      SELECT world_id INTO region_world_id
      FROM dnd5e_region
      WHERE id = NEW.region_id;

      IF region_world_id IS NULL OR region_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change region must belong to the change world';
      END IF;
    END IF;

    IF NEW.location_id IS NOT NULL THEN
      SELECT world_id INTO location_world_id
      FROM dnd5e_location
      WHERE id = NEW.location_id;

      IF location_world_id IS NULL OR location_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change location must belong to the change world';
      END IF;
    END IF;

    IF NEW.scene_id IS NOT NULL THEN
      SELECT world_id INTO scene_world_id
      FROM dnd5e_scene
      WHERE id = NEW.scene_id;

      IF scene_world_id IS NULL OR scene_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change scene must belong to the change world';
      END IF;
    END IF;

    IF NEW.world_entity_id IS NOT NULL THEN
      SELECT world_id INTO entity_world_id
      FROM dnd5e_world_entity
      WHERE id = NEW.world_entity_id;

      IF entity_world_id IS NULL OR entity_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'World change entity must belong to the change world';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'dnd5e_progression_window' THEN
    IF NEW.campaign_id IS NOT NULL THEN
      SELECT world_id INTO campaign_world_id
      FROM dnd5e_campaign
      WHERE id = NEW.campaign_id;

      IF campaign_world_id IS NULL OR campaign_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'Progression window campaign must belong to the window world';
      END IF;
    END IF;

    IF NEW.scene_id IS NOT NULL THEN
      SELECT world_id INTO scene_world_id
      FROM dnd5e_scene
      WHERE id = NEW.scene_id;

      IF scene_world_id IS NULL OR scene_world_id <> NEW.world_id THEN
        RAISE EXCEPTION 'Progression window scene must belong to the window world';
      END IF;
    END IF;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd5e_world_change_world_match
  ON dnd5e_world_change;

CREATE TRIGGER trg_dnd5e_world_change_world_match
BEFORE INSERT OR UPDATE OF world_id, campaign_id, character_id, region_id, location_id, scene_id, world_entity_id
ON dnd5e_world_change
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_world_simulation_world_match();

DROP TRIGGER IF EXISTS trg_dnd5e_progression_window_world_match
  ON dnd5e_progression_window;

CREATE TRIGGER trg_dnd5e_progression_window_world_match
BEFORE INSERT OR UPDATE OF world_id, campaign_id, scene_id
ON dnd5e_progression_window
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_world_simulation_world_match();

COMMIT;
