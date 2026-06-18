ALTER TABLE dnd5e_event_template_option
  DROP CONSTRAINT IF EXISTS dnd5e_event_template_option_resolution_kind_check;

ALTER TABLE dnd5e_event_template_option
  ADD CONSTRAINT dnd5e_event_template_option_resolution_kind_check CHECK (
    resolution_kind IN ('grant_currency', 'grant_item', 'no_effect', 'apply_effects')
  );

ALTER TABLE dnd5e_event_option
  DROP CONSTRAINT IF EXISTS dnd5e_event_option_resolution_kind_check;

ALTER TABLE dnd5e_event_option
  ADD CONSTRAINT dnd5e_event_option_resolution_kind_check CHECK (
    resolution_kind IN ('grant_currency', 'grant_item', 'no_effect', 'apply_effects')
  );

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
  'Rusk Bandit Rusted Blade',
  'action',
  'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 1d6 + 2 slashing damage.',
  TRUE,
  'melee',
  5,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action
  WHERE name = 'Rusk Bandit Rusted Blade'
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
  6,
  2,
  'slashing',
  '1d6 + 2 slashing'
FROM dnd5e_action action_row
WHERE action_row.name = 'Rusk Bandit Rusted Blade'
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
  'Rusk Bandit',
  'medium',
  'humanoid',
  'chaotic evil',
  12,
  22,
  '4d8 + 4',
  30,
  2,
  0.125,
  25,
  10,
  'DailyRPG Stage 5G',
  'Combat-ready surface antagonist for Shadows on the Grey Road.'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block
  WHERE name = 'Rusk Bandit'
    AND source = 'DailyRPG Stage 5G'
);

INSERT INTO dnd5e_stat_block_ability (stat_block_id, ability, score)
SELECT
  stat_block.id,
  ability_data.ability,
  ability_data.score
FROM dnd5e_stat_block stat_block
CROSS JOIN (
  VALUES
    ('STR', 11),
    ('DEX', 14),
    ('CON', 12),
    ('INT', 10),
    ('WIS', 10),
    ('CHA', 11)
) AS ability_data(ability, score)
WHERE stat_block.name = 'Rusk Bandit'
  AND stat_block.source = 'DailyRPG Stage 5G'
ON CONFLICT (stat_block_id, ability) DO UPDATE
SET score = EXCLUDED.score;

INSERT INTO dnd5e_stat_block_action (stat_block_id, action_id, display_order)
SELECT
  stat_block.id,
  action_row.id,
  0
FROM dnd5e_stat_block stat_block
JOIN dnd5e_action action_row
  ON action_row.name = 'Rusk Bandit Rusted Blade'
WHERE stat_block.name = 'Rusk Bandit'
  AND stat_block.source = 'DailyRPG Stage 5G'
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
  'rusk-bandit',
  'Rusk',
  'humanoid',
  'hostile',
  'surface_antagonist',
  'Leader of the bandits near the ruined shrine. Violent, unstable, and not as fully in control as he believes.',
  TRUE,
  stat_block.id
FROM dnd5e_stat_block stat_block
WHERE stat_block.name = 'Rusk Bandit'
  AND stat_block.source = 'DailyRPG Stage 5G'
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
