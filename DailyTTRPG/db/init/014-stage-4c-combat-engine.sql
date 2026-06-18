BEGIN;

ALTER TABLE dnd5e_gameplay_history
  DROP CONSTRAINT IF EXISTS dnd5e_gameplay_history_source_type_check;

ALTER TABLE dnd5e_gameplay_history
  ADD CONSTRAINT dnd5e_gameplay_history_source_type_check CHECK (
    source_type IN ('command', 'event', 'progression', 'system', 'narrative', 'combat')
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
      'system'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_combat (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  event_id BIGINT REFERENCES dnd5e_event_instance(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  round_number INTEGER NOT NULL DEFAULT 0,
  current_turn_index INTEGER NOT NULL DEFAULT 0,
  current_participant_id BIGINT,
  visibility_mode VARCHAR(50) NOT NULL DEFAULT 'narrative',
  auto_advance_turns BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  outcome_faction VARCHAR(50),
  outcome_summary TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT dnd5e_combat_status_check CHECK (
    status IN ('pending', 'active', 'resolved', 'canceled')
  ),
  CONSTRAINT dnd5e_combat_round_number_check CHECK (round_number >= 0),
  CONSTRAINT dnd5e_combat_current_turn_index_check CHECK (current_turn_index >= 0),
  CONSTRAINT dnd5e_combat_visibility_mode_check CHECK (
    visibility_mode IN ('narrative', 'debug')
  ),
  CONSTRAINT dnd5e_combat_outcome_faction_check CHECK (
    outcome_faction IS NULL OR btrim(outcome_faction) <> ''
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_combat_participant (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  combat_id BIGINT NOT NULL REFERENCES dnd5e_combat(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT NOT NULL,
  stat_block_id BIGINT REFERENCES dnd5e_stat_block(id) ON DELETE SET NULL,
  display_name VARCHAR(150) NOT NULL,
  initiative INTEGER,
  turn_order INTEGER,
  current_hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  temporary_hp INTEGER NOT NULL DEFAULT 0,
  armor_class INTEGER NOT NULL,
  faction VARCHAR(50) NOT NULL,
  control_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_defeated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_combat_participant_entity_type_check CHECK (
    entity_type IN ('character', 'npc', 'monster')
  ),
  CONSTRAINT dnd5e_combat_participant_display_name_present_check CHECK (
    btrim(display_name) <> ''
  ),
  CONSTRAINT dnd5e_combat_participant_max_hp_check CHECK (max_hp > 0),
  CONSTRAINT dnd5e_combat_participant_current_hp_check CHECK (
    current_hp >= 0 AND current_hp <= max_hp
  ),
  CONSTRAINT dnd5e_combat_participant_temporary_hp_check CHECK (temporary_hp >= 0),
  CONSTRAINT dnd5e_combat_participant_armor_class_check CHECK (armor_class > 0),
  CONSTRAINT dnd5e_combat_participant_faction_present_check CHECK (btrim(faction) <> ''),
  CONSTRAINT dnd5e_combat_participant_control_mode_check CHECK (
    control_mode IN ('manual', 'ai', 'system')
  )
);

ALTER TABLE dnd5e_combat
  DROP CONSTRAINT IF EXISTS dnd5e_combat_current_participant_id_fkey;

ALTER TABLE dnd5e_combat
  ADD CONSTRAINT dnd5e_combat_current_participant_id_fkey
  FOREIGN KEY (current_participant_id)
  REFERENCES dnd5e_combat_participant(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_combat_action_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  combat_id BIGINT NOT NULL REFERENCES dnd5e_combat(id) ON DELETE CASCADE,
  participant_id BIGINT NOT NULL REFERENCES dnd5e_combat_participant(id) ON DELETE CASCADE,
  action_id BIGINT REFERENCES dnd5e_action(id) ON DELETE SET NULL,
  command_type VARCHAR(100),
  round_number INTEGER NOT NULL DEFAULT 0,
  turn_index INTEGER NOT NULL DEFAULT 0,
  target_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT,
  narrative_text TEXT,
  mechanical_detail_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_combat_action_log_round_number_check CHECK (round_number >= 0),
  CONSTRAINT dnd5e_combat_action_log_turn_index_check CHECK (turn_index >= 0)
);

CREATE TABLE IF NOT EXISTS dnd5e_combat_condition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  combat_participant_id BIGINT NOT NULL REFERENCES dnd5e_combat_participant(id) ON DELETE CASCADE,
  condition_type VARCHAR(100) NOT NULL,
  source VARCHAR(150),
  duration_type VARCHAR(50),
  duration_value INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_combat_condition_type_present_check CHECK (btrim(condition_type) <> ''),
  CONSTRAINT dnd5e_combat_condition_duration_value_check CHECK (
    duration_value IS NULL OR duration_value >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_campaign_id_status
  ON dnd5e_combat(campaign_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_scene_id_status
  ON dnd5e_combat(scene_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_event_id
  ON dnd5e_combat(event_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_combat_one_open_per_event
  ON dnd5e_combat(event_id)
  WHERE event_id IS NOT NULL
    AND status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_participant_combat_id_turn_order
  ON dnd5e_combat_participant(combat_id, turn_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_combat_participant_unique_entity
  ON dnd5e_combat_participant(combat_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_action_log_combat_id_created_at
  ON dnd5e_combat_action_log(combat_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_combat_condition_participant_id
  ON dnd5e_combat_condition(combat_participant_id, id);

INSERT INTO dnd5e_action (
  name,
  action_type,
  description,
  requires_attack_roll,
  range_type,
  range_normal,
  range_max,
  saving_throw_ability,
  saving_throw_dc
)
SELECT
  'Character Basic Strike',
  'action',
  'A basic melee attack used by characters before equipment-specific combat automation is added.',
  TRUE,
  'melee',
  5,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action
  WHERE name = 'Character Basic Strike'
);

INSERT INTO dnd5e_action_damage (
  action_id,
  dice_count,
  dice_size,
  modifier,
  damage_type,
  damage_text
)
SELECT
  action.id,
  1,
  4,
  0,
  'bludgeoning',
  '1d4 bludgeoning plus Strength modifier'
FROM dnd5e_action action
WHERE action.name = 'Character Basic Strike'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_action_damage existing
    WHERE existing.action_id = action.id
      AND existing.damage_text = '1d4 bludgeoning plus Strength modifier'
  );

INSERT INTO dnd5e_action_effect (
  action_id,
  effect_type,
  value,
  condition,
  notes
)
SELECT
  action.id,
  effect_data.effect_type,
  effect_data.value,
  effect_data.condition,
  effect_data.notes
FROM dnd5e_action action
JOIN (
  VALUES
    (
      'attack_ability_modifier',
      '{"ability":"STR","add_proficiency":true}'::jsonb,
      '{}'::jsonb,
      'Use Strength plus proficiency to resolve the attack roll.'
    ),
    (
      'damage_ability_modifier',
      '{"ability":"STR"}'::jsonb,
      '{}'::jsonb,
      'Add the Strength modifier to damage.'
    )
) AS effect_data(effect_type, value, condition, notes) ON TRUE
WHERE action.name = 'Character Basic Strike'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_action_effect existing
    WHERE existing.action_id = action.id
      AND existing.effect_type = effect_data.effect_type
      AND existing.notes IS NOT DISTINCT FROM effect_data.notes
  );

COMMIT;
