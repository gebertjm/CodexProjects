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
      'world_simulation',
      'encounter'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_encounter_template (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  slug VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  encounter_type VARCHAR(50) NOT NULL,
  difficulty_intent VARCHAR(50) NOT NULL,
  scaling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  story_fixed_by_default BOOLEAN NOT NULL DEFAULT FALSE,
  explicit_story_scaling BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_scaling_methods_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  disallowed_scaling_methods_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  party_size_min INTEGER NOT NULL,
  party_size_max INTEGER NOT NULL,
  level_min INTEGER NOT NULL,
  level_max INTEGER NOT NULL,
  async_beat_min INTEGER NOT NULL,
  async_beat_max INTEGER NOT NULL,
  base_variant VARCHAR(120),
  variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution_paths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reward_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fail_forward BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, slug),
  CONSTRAINT dnd5e_encounter_template_slug_present_check CHECK (btrim(slug) <> ''),
  CONSTRAINT dnd5e_encounter_template_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_encounter_template_type_check CHECK (
    encounter_type IN ('tutorial', 'minor', 'major', 'story', 'final', 'optional', 'non_combat')
  ),
  CONSTRAINT dnd5e_encounter_template_difficulty_check CHECK (
    difficulty_intent IN ('trivial', 'easy', 'medium', 'hard', 'deadly', 'story', 'avoidable', 'tutorial')
  ),
  CONSTRAINT dnd5e_encounter_template_party_range_check CHECK (
    party_size_min >= 1 AND party_size_max >= party_size_min
  ),
  CONSTRAINT dnd5e_encounter_template_level_range_check CHECK (
    level_min >= 1 AND level_max >= level_min
  ),
  CONSTRAINT dnd5e_encounter_template_beat_range_check CHECK (
    async_beat_min >= 1 AND async_beat_max >= async_beat_min AND async_beat_max <= 8
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_encounter_template_world_active
  ON dnd5e_encounter_template(world_id, is_active, slug);

CREATE INDEX IF NOT EXISTS idx_dnd5e_encounter_template_campaign
  ON dnd5e_encounter_template(campaign_id, slug)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_encounter_template_scene
  ON dnd5e_encounter_template(scene_id, slug)
  WHERE scene_id IS NOT NULL;

INSERT INTO dnd5e_action (
  name,
  action_type,
  description,
  requires_attack_roll,
  range_type,
  range_normal,
  range_max
)
SELECT
  'Bandit Lackey Knife',
  'action',
  'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 1d4 + 1 slashing damage.',
  TRUE,
  'melee',
  5,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action
  WHERE name = 'Bandit Lackey Knife'
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
  action_row.id,
  1,
  4,
  1,
  'slashing',
  '1d4 + 1 slashing'
FROM dnd5e_action action_row
WHERE action_row.name = 'Bandit Lackey Knife'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_action_damage damage
    WHERE damage.action_id = action_row.id
  );

INSERT INTO dnd5e_stat_block (
  name,
  size,
  creature_type,
  alignment,
  armor_class,
  hit_point_max,
  hit_dice_text,
  speed_walk,
  proficiency_bonus,
  challenge_rating,
  xp_value,
  passive_perception,
  source,
  notes
)
SELECT
  'Bandit Lackey',
  'medium',
  'humanoid',
  'neutral evil',
  11,
  9,
  '2d8',
  30,
  2,
  0.0625,
  10,
  10,
  'DailyRPG Stage 5I',
  'Low-power optional encounter support actor for bounded party scaling.'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block
  WHERE name = 'Bandit Lackey'
    AND source = 'DailyRPG Stage 5I'
);

INSERT INTO dnd5e_stat_block_ability (stat_block_id, ability, score)
SELECT
  stat_block.id,
  ability_data.ability,
  ability_data.score
FROM dnd5e_stat_block stat_block
CROSS JOIN (
  VALUES
    ('STR', 10),
    ('DEX', 12),
    ('CON', 10),
    ('INT', 9),
    ('WIS', 10),
    ('CHA', 8)
) AS ability_data(ability, score)
WHERE stat_block.name = 'Bandit Lackey'
  AND stat_block.source = 'DailyRPG Stage 5I'
ON CONFLICT (stat_block_id, ability) DO UPDATE
SET score = EXCLUDED.score;

INSERT INTO dnd5e_stat_block_action (stat_block_id, action_id, display_order)
SELECT
  stat_block.id,
  action_row.id,
  0
FROM dnd5e_stat_block stat_block
JOIN dnd5e_action action_row
  ON action_row.name = 'Bandit Lackey Knife'
WHERE stat_block.name = 'Bandit Lackey'
  AND stat_block.source = 'DailyRPG Stage 5I'
ON CONFLICT (stat_block_id, action_id) DO UPDATE
SET display_order = EXCLUDED.display_order;

INSERT INTO dnd5e_npc (
  key,
  name,
  npc_type,
  disposition,
  role,
  description,
  is_active,
  stat_block_id
)
SELECT
  'bandit-lackey',
  'Bandit Lackey',
  'humanoid',
  'hostile',
  'encounter_support',
  'A frightened, opportunistic bandit used only when authored scaling permits extra pressure.',
  TRUE,
  stat_block.id
FROM dnd5e_stat_block stat_block
WHERE stat_block.name = 'Bandit Lackey'
  AND stat_block.source = 'DailyRPG Stage 5I'
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  npc_type = EXCLUDED.npc_type,
  disposition = EXCLUDED.disposition,
  role = EXCLUDED.role,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  stat_block_id = COALESCE(dnd5e_npc.stat_block_id, EXCLUDED.stat_block_id),
  updated_at = NOW();

COMMIT;
