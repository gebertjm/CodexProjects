BEGIN;

ALTER TABLE dnd5e_gameplay_history
  DROP CONSTRAINT IF EXISTS dnd5e_gameplay_history_source_type_check;

ALTER TABLE dnd5e_gameplay_history
  ADD CONSTRAINT dnd5e_gameplay_history_source_type_check CHECK (
    source_type IN ('command', 'event', 'progression', 'system', 'narrative', 'combat', 'adventure')
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
      'system'
    )
  );

ALTER TABLE dnd5e_quest
  ADD COLUMN IF NOT EXISTS availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_quest
  ADD COLUMN IF NOT EXISTS discovery_summary TEXT;

ALTER TABLE dnd5e_quest_objective
  ADD COLUMN IF NOT EXISTS activation_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_quest_objective
  ADD COLUMN IF NOT EXISTS completion_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_quest_objective
  ADD COLUMN IF NOT EXISTS failure_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_quest_objective
  ADD COLUMN IF NOT EXISTS progress_target INTEGER;

ALTER TABLE dnd5e_quest_objective
  ADD COLUMN IF NOT EXISTS hard_gate BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dnd5e_quest_objective
  DROP CONSTRAINT IF EXISTS dnd5e_quest_objective_progress_target_check;

ALTER TABLE dnd5e_quest_objective
  ADD CONSTRAINT dnd5e_quest_objective_progress_target_check CHECK (
    progress_target IS NULL OR progress_target >= 0
  );

ALTER TABLE dnd5e_campaign_flag
  ADD COLUMN IF NOT EXISTS flag_category VARCHAR(50);

ALTER TABLE dnd5e_campaign_flag
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dnd5e_character_flag
  ADD COLUMN IF NOT EXISTS flag_category VARCHAR(50);

ALTER TABLE dnd5e_character_flag
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS dnd5e_reward (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  reward_type VARCHAR(50) NOT NULL,
  value_json JSONB NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_reward_type_check CHECK (
    reward_type IN (
      'xp',
      'item',
      'currency',
      'campaign_flag',
      'character_flag',
      'scene_unlock',
      'npc_disposition',
      'knowledge'
    )
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_reward_application (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  reward_id BIGINT NOT NULL REFERENCES dnd5e_reward(id) ON DELETE CASCADE,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_unlock (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  unlock_key VARCHAR(100) NOT NULL UNIQUE,
  unlock_type VARCHAR(50) NOT NULL,
  condition_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_scene_unlock_key_present_check CHECK (btrim(unlock_key) <> ''),
  CONSTRAINT dnd5e_scene_unlock_type_check CHECK (
    unlock_type IN ('explicit', 'flag-based', 'quest-based', 'objective-based')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_character_knowledge (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  knowledge_type VARCHAR(50) NOT NULL,
  knowledge_key VARCHAR(150) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, character_id, knowledge_type, knowledge_key),
  CONSTRAINT dnd5e_character_knowledge_type_check CHECK (
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
      'reward'
    )
  ),
  CONSTRAINT dnd5e_character_knowledge_key_present_check CHECK (btrim(knowledge_key) <> ''),
  CONSTRAINT dnd5e_character_knowledge_title_present_check CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_reward_application_character_id_applied_at
  ON dnd5e_reward_application(character_id, applied_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_reward_application_campaign_id_applied_at
  ON dnd5e_reward_application(campaign_id, applied_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_unlock_scene_id
  ON dnd5e_scene_unlock(scene_id, is_active, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_knowledge_character_id_created_at
  ON dnd5e_character_knowledge(character_id, created_at DESC, id DESC);

UPDATE dnd5e_quest
SET
  availability_conditions_json = jsonb_build_object(
    'required_campaign_flags',
    jsonb_build_object('waystone_story_started', true)
  ),
  discovery_summary = 'Elder Rowan has shared enough of Willowmere''s trouble to frame the mystery of the waking waystones.'
WHERE key = 'waystone_whispers';

UPDATE dnd5e_quest_objective objective
SET
  activation_conditions_json = '{}'::jsonb,
  completion_conditions_json = jsonb_build_object(
    'required_character_flags',
    jsonb_build_object('rowan_trust', true)
  ),
  failure_conditions_json = '{}'::jsonb,
  progress_target = 1,
  hard_gate = FALSE
FROM dnd5e_quest quest
WHERE objective.quest_id = quest.id
  AND quest.key = 'waystone_whispers'
  AND objective.key = 'earn_rowan_trust';

UPDATE dnd5e_quest_objective objective
SET
  activation_conditions_json = jsonb_build_object(
    'required_objective_states',
    jsonb_build_array(
      jsonb_build_object(
        'quest_key', 'waystone_whispers',
        'objective_key', 'earn_rowan_trust',
        'status', 'completed'
      )
    )
  ),
  completion_conditions_json = jsonb_build_object(
    'required_campaign_flags',
    jsonb_build_object('waystone_glyphs_understood', true),
    'required_character_flags',
    jsonb_build_object('waystone_clue_found', true)
  ),
  failure_conditions_json = '{}'::jsonb,
  progress_target = 1,
  hard_gate = FALSE
FROM dnd5e_quest quest
WHERE objective.quest_id = quest.id
  AND quest.key = 'waystone_whispers'
  AND objective.key = 'investigate_waystone';

INSERT INTO dnd5e_scene_unlock (
  scene_id,
  unlock_key,
  unlock_type,
  condition_data_json,
  description
)
SELECT
  scene.id,
  'unlock_waystone_road',
  'explicit',
  jsonb_build_object(
    'required_character_flags',
    jsonb_build_object('rowan_trust', true)
  ),
  'Waystone Road opens once Rowan trusts the character enough to share the trail.'
FROM dnd5e_scene scene
WHERE scene.key = 'waystone_road'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_scene_unlock existing
    WHERE existing.unlock_key = 'unlock_waystone_road'
  );

INSERT INTO dnd5e_scene_unlock (
  scene_id,
  unlock_key,
  unlock_type,
  condition_data_json,
  description
)
SELECT
  scene.id,
  'unlock_smugglers_cut',
  'quest-based',
  jsonb_build_object(
    'required_quest_states',
    jsonb_build_array(
      jsonb_build_object(
        'quest_key', 'waystone_whispers',
        'status', 'completed'
      )
    )
  ),
  'Smuggler''s Cut becomes a meaningful destination after the first Willowmere mystery is resolved.'
FROM dnd5e_scene scene
WHERE scene.key = 'smugglers_cut'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_scene_unlock existing
    WHERE existing.unlock_key = 'unlock_smugglers_cut'
  );

COMMIT;
