BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_damage_type (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(50) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_damage_type_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_damage_type_slug_present_check CHECK (btrim(slug) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_sense_type (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(50) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_sense_type_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_sense_type_slug_present_check CHECK (btrim(slug) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  size VARCHAR(20) NOT NULL,
  creature_type VARCHAR(100) NOT NULL,
  alignment VARCHAR(100) NOT NULL,
  armor_class INTEGER NOT NULL,
  hit_point_max INTEGER NOT NULL,
  hit_dice_text VARCHAR(100) NOT NULL,
  speed_walk INTEGER NOT NULL DEFAULT 0,
  speed_fly INTEGER NOT NULL DEFAULT 0,
  speed_swim INTEGER NOT NULL DEFAULT 0,
  speed_climb INTEGER NOT NULL DEFAULT 0,
  proficiency_bonus INTEGER NOT NULL,
  challenge_rating NUMERIC(6, 2),
  xp_value INTEGER,
  passive_perception INTEGER,
  source VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_stat_block_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_stat_block_size_check CHECK (
    size IN ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan')
  ),
  CONSTRAINT dnd5e_stat_block_creature_type_present_check CHECK (btrim(creature_type) <> ''),
  CONSTRAINT dnd5e_stat_block_alignment_present_check CHECK (btrim(alignment) <> ''),
  CONSTRAINT dnd5e_stat_block_armor_class_check CHECK (armor_class > 0),
  CONSTRAINT dnd5e_stat_block_hit_point_max_check CHECK (hit_point_max > 0),
  CONSTRAINT dnd5e_stat_block_hit_dice_text_present_check CHECK (btrim(hit_dice_text) <> ''),
  CONSTRAINT dnd5e_stat_block_speed_walk_check CHECK (speed_walk >= 0),
  CONSTRAINT dnd5e_stat_block_speed_fly_check CHECK (speed_fly >= 0),
  CONSTRAINT dnd5e_stat_block_speed_swim_check CHECK (speed_swim >= 0),
  CONSTRAINT dnd5e_stat_block_speed_climb_check CHECK (speed_climb >= 0),
  CONSTRAINT dnd5e_stat_block_proficiency_bonus_check CHECK (proficiency_bonus >= 0),
  CONSTRAINT dnd5e_stat_block_challenge_rating_check CHECK (
    challenge_rating IS NULL OR challenge_rating >= 0
  ),
  CONSTRAINT dnd5e_stat_block_xp_value_check CHECK (
    xp_value IS NULL OR xp_value >= 0
  ),
  CONSTRAINT dnd5e_stat_block_passive_perception_check CHECK (
    passive_perception IS NULL OR passive_perception >= 0
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_ability (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  ability VARCHAR(10) NOT NULL REFERENCES dnd5e_ability_score_type(code) ON DELETE RESTRICT,
  score INTEGER NOT NULL,
  UNIQUE (stat_block_id, ability),
  CONSTRAINT dnd5e_stat_block_ability_score_check CHECK (score >= 1 AND score <= 30)
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_skill (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  skill VARCHAR(100) NOT NULL REFERENCES dnd5e_skill(slug) ON DELETE RESTRICT,
  is_proficient BOOLEAN NOT NULL DEFAULT FALSE,
  modifier INTEGER NOT NULL,
  UNIQUE (stat_block_id, skill)
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_sense (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  sense_type VARCHAR(50) NOT NULL REFERENCES dnd5e_sense_type(slug) ON DELETE RESTRICT,
  range_feet INTEGER NOT NULL,
  UNIQUE (stat_block_id, sense_type),
  CONSTRAINT dnd5e_stat_block_sense_range_feet_check CHECK (range_feet >= 0)
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_resistance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  resistance_type VARCHAR(20) NOT NULL,
  damage_type VARCHAR(50) REFERENCES dnd5e_damage_type(slug) ON DELETE RESTRICT,
  notes TEXT,
  UNIQUE (stat_block_id, resistance_type, damage_type),
  CONSTRAINT dnd5e_stat_block_resistance_type_check CHECK (
    resistance_type IN ('resistance', 'immunity', 'vulnerability')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_action (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  description TEXT,
  requires_attack_roll BOOLEAN NOT NULL DEFAULT FALSE,
  range_type VARCHAR(50) NOT NULL,
  range_normal INTEGER,
  range_max INTEGER,
  saving_throw_ability VARCHAR(10) REFERENCES dnd5e_ability_score_type(code) ON DELETE RESTRICT,
  saving_throw_dc INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_action_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_action_type_check CHECK (
    action_type IN ('action', 'bonus_action', 'reaction', 'passive')
  ),
  CONSTRAINT dnd5e_action_range_type_check CHECK (
    range_type IN ('melee', 'ranged', 'self', 'touch', 'area', 'special')
  ),
  CONSTRAINT dnd5e_action_range_normal_check CHECK (
    range_normal IS NULL OR range_normal >= 0
  ),
  CONSTRAINT dnd5e_action_range_max_check CHECK (
    range_max IS NULL OR range_max >= 0
  ),
  CONSTRAINT dnd5e_action_saving_throw_dc_check CHECK (
    saving_throw_dc IS NULL OR saving_throw_dc >= 1
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_action_damage (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action_id BIGINT NOT NULL REFERENCES dnd5e_action(id) ON DELETE CASCADE,
  dice_count INTEGER NOT NULL,
  dice_size INTEGER NOT NULL,
  modifier INTEGER NOT NULL DEFAULT 0,
  damage_type VARCHAR(50) NOT NULL REFERENCES dnd5e_damage_type(slug) ON DELETE RESTRICT,
  damage_text VARCHAR(100) NOT NULL,
  CONSTRAINT dnd5e_action_damage_dice_count_check CHECK (dice_count >= 1),
  CONSTRAINT dnd5e_action_damage_dice_size_check CHECK (dice_size >= 1),
  CONSTRAINT dnd5e_action_damage_text_present_check CHECK (btrim(damage_text) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_action_requirement (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action_id BIGINT NOT NULL REFERENCES dnd5e_action(id) ON DELETE CASCADE,
  requirement_type VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  notes TEXT,
  CONSTRAINT dnd5e_action_requirement_type_present_check CHECK (btrim(requirement_type) <> ''),
  CONSTRAINT dnd5e_action_requirement_value_present_check CHECK (btrim(value) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_action_effect (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action_id BIGINT NOT NULL REFERENCES dnd5e_action(id) ON DELETE CASCADE,
  effect_type VARCHAR(100) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  CONSTRAINT dnd5e_action_effect_type_present_check CHECK (btrim(effect_type) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_action (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  action_id BIGINT NOT NULL REFERENCES dnd5e_action(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (stat_block_id, action_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_trait (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  CONSTRAINT dnd5e_trait_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_trait_effect (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  trait_id BIGINT NOT NULL REFERENCES dnd5e_trait(id) ON DELETE CASCADE,
  effect_type VARCHAR(100) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  CONSTRAINT dnd5e_trait_effect_type_present_check CHECK (btrim(effect_type) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_stat_block_trait (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stat_block_id BIGINT NOT NULL REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  trait_id BIGINT NOT NULL REFERENCES dnd5e_trait(id) ON DELETE CASCADE,
  UNIQUE (stat_block_id, trait_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_monster (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  stat_block_id BIGINT NOT NULL UNIQUE REFERENCES dnd5e_stat_block(id) ON DELETE CASCADE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_monster_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_monster_name_present_check CHECK (btrim(name) <> '')
);

ALTER TABLE dnd5e_campaign_npc_state
  ADD COLUMN IF NOT EXISTS current_hit_points INTEGER;

ALTER TABLE dnd5e_campaign_npc_state
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_npc_state_current_hit_points_check;

ALTER TABLE dnd5e_campaign_npc_state
  ADD CONSTRAINT dnd5e_campaign_npc_state_current_hit_points_check CHECK (
    current_hit_points IS NULL OR current_hit_points >= 0
  );

ALTER TABLE dnd5e_npc
  ADD COLUMN IF NOT EXISTS stat_block_id BIGINT REFERENCES dnd5e_stat_block(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_npc_stat_block_id_unique
  ON dnd5e_npc(stat_block_id)
  WHERE stat_block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_stat_block_name
  ON dnd5e_stat_block(name, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_stat_block_action_stat_block_id
  ON dnd5e_stat_block_action(stat_block_id, display_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_stat_block_trait_stat_block_id
  ON dnd5e_stat_block_trait(stat_block_id, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_action_damage_action_id
  ON dnd5e_action_damage(action_id, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_action_requirement_action_id
  ON dnd5e_action_requirement(action_id, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_action_effect_action_id
  ON dnd5e_action_effect(action_id, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_trait_effect_trait_id
  ON dnd5e_trait_effect(trait_id, id);

INSERT INTO dnd5e_damage_type (name, slug)
SELECT data.name, data.slug
FROM (
  VALUES
    ('Acid', 'acid'),
    ('Bludgeoning', 'bludgeoning'),
    ('Cold', 'cold'),
    ('Fire', 'fire'),
    ('Force', 'force'),
    ('Lightning', 'lightning'),
    ('Necrotic', 'necrotic'),
    ('Piercing', 'piercing'),
    ('Poison', 'poison'),
    ('Psychic', 'psychic'),
    ('Radiant', 'radiant'),
    ('Slashing', 'slashing'),
    ('Thunder', 'thunder')
) AS data(name, slug)
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_damage_type existing
  WHERE existing.slug = data.slug
);

INSERT INTO dnd5e_sense_type (name, slug)
SELECT data.name, data.slug
FROM (
  VALUES
    ('Blindsight', 'blindsight'),
    ('Darkvision', 'darkvision'),
    ('Tremorsense', 'tremorsense'),
    ('Truesight', 'truesight')
) AS data(name, slug)
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_sense_type existing
  WHERE existing.slug = data.slug
);

WITH inserted AS (
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
    passive_perception,
    source,
    notes
  )
  SELECT
    'Elder Rowan',
    'medium',
    'humanoid',
    'neutral good',
    10,
    18,
    '4d8',
    30,
    2,
    12,
    'DailyRPG Narrative Seed',
    'Shared stat block for the Willowmere elder.'
  WHERE EXISTS (
    SELECT 1
    FROM dnd5e_npc npc
    WHERE npc.key = 'elder_rowan'
      AND npc.stat_block_id IS NULL
  )
  RETURNING id
)
UPDATE dnd5e_npc npc
SET stat_block_id = inserted.id,
    updated_at = NOW()
FROM inserted
WHERE npc.key = 'elder_rowan'
  AND npc.stat_block_id IS NULL;

WITH inserted AS (
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
    passive_perception,
    source,
    notes
  )
  SELECT
    'Nyx Scout',
    'medium',
    'humanoid',
    'chaotic neutral',
    13,
    16,
    '3d8+3',
    30,
    2,
    13,
    'DailyRPG Narrative Seed',
    'Shared stat block for the scout in Smuggler''s Cut.'
  WHERE EXISTS (
    SELECT 1
    FROM dnd5e_npc npc
    WHERE npc.key = 'nyx_scout'
      AND npc.stat_block_id IS NULL
  )
  RETURNING id
)
UPDATE dnd5e_npc npc
SET stat_block_id = inserted.id,
    updated_at = NOW()
FROM inserted
WHERE npc.key = 'nyx_scout'
  AND npc.stat_block_id IS NULL;

INSERT INTO dnd5e_stat_block_ability (stat_block_id, ability, score)
SELECT npc.stat_block_id, data.ability, data.score
FROM dnd5e_npc npc
JOIN (
  VALUES
    ('elder_rowan', 'STR', 10),
    ('elder_rowan', 'DEX', 10),
    ('elder_rowan', 'CON', 12),
    ('elder_rowan', 'INT', 12),
    ('elder_rowan', 'WIS', 14),
    ('elder_rowan', 'CHA', 15),
    ('nyx_scout', 'STR', 10),
    ('nyx_scout', 'DEX', 14),
    ('nyx_scout', 'CON', 12),
    ('nyx_scout', 'INT', 11),
    ('nyx_scout', 'WIS', 12),
    ('nyx_scout', 'CHA', 11)
) AS data(npc_key, ability, score)
  ON data.npc_key = npc.key
WHERE npc.stat_block_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_stat_block_ability existing
    WHERE existing.stat_block_id = npc.stat_block_id
      AND existing.ability = data.ability
  );

INSERT INTO dnd5e_stat_block_skill (stat_block_id, skill, is_proficient, modifier)
SELECT npc.stat_block_id, data.skill, data.is_proficient, data.modifier
FROM dnd5e_npc npc
JOIN (
  VALUES
    ('elder_rowan', 'insight', TRUE, 4),
    ('elder_rowan', 'persuasion', TRUE, 4),
    ('nyx_scout', 'perception', TRUE, 3),
    ('nyx_scout', 'stealth', TRUE, 4)
) AS data(npc_key, skill, is_proficient, modifier)
  ON data.npc_key = npc.key
WHERE npc.stat_block_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_stat_block_skill existing
    WHERE existing.stat_block_id = npc.stat_block_id
      AND existing.skill = data.skill
  );

WITH inserted_stat_block AS (
  INSERT INTO dnd5e_stat_block (
    name,
    size,
    creature_type,
    alignment,
    armor_class,
    hit_point_max,
    hit_dice_text,
    speed_walk,
    speed_fly,
    speed_swim,
    speed_climb,
    proficiency_bonus,
    challenge_rating,
    xp_value,
    passive_perception,
    source,
    notes
  )
  SELECT
    'Goblin',
    'small',
    'humanoid',
    'neutral evil',
    15,
    7,
    '2d6',
    30,
    0,
    0,
    0,
    2,
    0.25,
    50,
    9,
    'SRD 5.1',
    'Seed monster for Stage 4B.5.'
  WHERE NOT EXISTS (
    SELECT 1
    FROM dnd5e_monster existing
    WHERE existing.key = 'goblin'
  )
  RETURNING id
),
stat_block_ref AS (
  SELECT id FROM inserted_stat_block
  UNION ALL
  SELECT stat_block_id
  FROM dnd5e_monster
  WHERE key = 'goblin'
)
INSERT INTO dnd5e_monster (
  key,
  name,
  stat_block_id,
  description,
  source
)
SELECT
  'goblin',
  'Goblin',
  stat_block_ref.id,
  'A small, sneaky raider armed with a scimitar and shortbow.',
  'SRD 5.1'
FROM stat_block_ref
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_monster existing
  WHERE existing.key = 'goblin'
);

WITH inserted_stat_block AS (
  INSERT INTO dnd5e_stat_block (
    name,
    size,
    creature_type,
    alignment,
    armor_class,
    hit_point_max,
    hit_dice_text,
    speed_walk,
    speed_fly,
    speed_swim,
    speed_climb,
    proficiency_bonus,
    challenge_rating,
    xp_value,
    passive_perception,
    source,
    notes
  )
  SELECT
    'Wolf',
    'medium',
    'beast',
    'unaligned',
    13,
    11,
    '2d8+2',
    40,
    0,
    0,
    0,
    2,
    0.25,
    50,
    13,
    'SRD 5.1',
    'Seed monster for Stage 4B.5.'
  WHERE NOT EXISTS (
    SELECT 1
    FROM dnd5e_monster existing
    WHERE existing.key = 'wolf'
  )
  RETURNING id
),
stat_block_ref AS (
  SELECT id FROM inserted_stat_block
  UNION ALL
  SELECT stat_block_id
  FROM dnd5e_monster
  WHERE key = 'wolf'
)
INSERT INTO dnd5e_monster (
  key,
  name,
  stat_block_id,
  description,
  source
)
SELECT
  'wolf',
  'Wolf',
  stat_block_ref.id,
  'A fast pack hunter with sharp senses and a dangerous bite.',
  'SRD 5.1'
FROM stat_block_ref
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_monster existing
  WHERE existing.key = 'wolf'
);

INSERT INTO dnd5e_stat_block_ability (stat_block_id, ability, score)
SELECT monster.stat_block_id, data.ability, data.score
FROM dnd5e_monster monster
JOIN (
  VALUES
    ('goblin', 'STR', 8),
    ('goblin', 'DEX', 14),
    ('goblin', 'CON', 10),
    ('goblin', 'INT', 10),
    ('goblin', 'WIS', 8),
    ('goblin', 'CHA', 8),
    ('wolf', 'STR', 12),
    ('wolf', 'DEX', 15),
    ('wolf', 'CON', 12),
    ('wolf', 'INT', 3),
    ('wolf', 'WIS', 12),
    ('wolf', 'CHA', 6)
) AS data(monster_key, ability, score)
  ON data.monster_key = monster.key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_ability existing
  WHERE existing.stat_block_id = monster.stat_block_id
    AND existing.ability = data.ability
);

INSERT INTO dnd5e_stat_block_skill (stat_block_id, skill, is_proficient, modifier)
SELECT monster.stat_block_id, data.skill, data.is_proficient, data.modifier
FROM dnd5e_monster monster
JOIN (
  VALUES
    ('goblin', 'stealth', TRUE, 6),
    ('wolf', 'perception', TRUE, 3)
) AS data(monster_key, skill, is_proficient, modifier)
  ON data.monster_key = monster.key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_skill existing
  WHERE existing.stat_block_id = monster.stat_block_id
    AND existing.skill = data.skill
);

INSERT INTO dnd5e_stat_block_sense (stat_block_id, sense_type, range_feet)
SELECT monster.stat_block_id, data.sense_type, data.range_feet
FROM dnd5e_monster monster
JOIN (
  VALUES
    ('goblin', 'darkvision', 60)
) AS data(monster_key, sense_type, range_feet)
  ON data.monster_key = monster.key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_sense existing
  WHERE existing.stat_block_id = monster.stat_block_id
    AND existing.sense_type = data.sense_type
);

INSERT INTO dnd5e_stat_block_resistance (stat_block_id, resistance_type, damage_type, notes)
SELECT monster.stat_block_id, data.resistance_type, data.damage_type, data.notes
FROM dnd5e_monster monster
JOIN (
  VALUES
    ('wolf', 'vulnerability', 'thunder', 'Seed-only vulnerability example for validation coverage.')
) AS data(monster_key, resistance_type, damage_type, notes)
  ON data.monster_key = monster.key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_resistance existing
  WHERE existing.stat_block_id = monster.stat_block_id
    AND existing.resistance_type = data.resistance_type
    AND existing.damage_type = data.damage_type
  );

INSERT INTO dnd5e_trait (name, description)
SELECT data.name, data.description
FROM (
  VALUES
    ('Nimble Escape', 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.'),
    ('Pack Tactics', 'The wolf has advantage on an attack roll against a creature if at least one of the wolf''s allies is within 5 feet of the creature and the ally isn''t incapacitated.'),
    ('Keen Hearing and Smell', 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.'),
    ('Watchful Elder', 'Elder Rowan reads small shifts in tone and body language before committing to trust.')
) AS data(name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_trait existing
  WHERE existing.name = data.name
);

INSERT INTO dnd5e_trait_effect (trait_id, effect_type, value, condition, notes)
SELECT trait.id, data.effect_type, data.value, data.condition, data.notes
FROM dnd5e_trait trait
JOIN (
  VALUES
    (
      'Nimble Escape',
      'bonus_action_options',
      '{"options":["disengage","hide"]}'::jsonb,
      '{}'::jsonb,
      'Structured options for future combat automation.'
    ),
    (
      'Pack Tactics',
      'attack_advantage',
      '{"mode":"advantage"}'::jsonb,
      '{"requires_adjacent_ally":true,"ally_distance_feet":5}'::jsonb,
      'Future combat can detect the ally condition from this payload.'
    ),
    (
      'Keen Hearing and Smell',
      'skill_advantage',
      '{"skill":"perception"}'::jsonb,
      '{"senses":["hearing","smell"]}'::jsonb,
      'Applies only when the perception check depends on hearing or smell.'
    ),
    (
      'Watchful Elder',
      'skill_bonus',
      '{"skill":"insight","bonus":2}'::jsonb,
      '{}'::jsonb,
      'Narrative NPC trait that can be interpreted later by opposed social systems.'
    )
) AS data(trait_name, effect_type, value, condition, notes)
  ON data.trait_name = trait.name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_trait_effect existing
  WHERE existing.trait_id = trait.id
    AND existing.effect_type = data.effect_type
    AND existing.notes IS NOT DISTINCT FROM data.notes
);

INSERT INTO dnd5e_stat_block_trait (stat_block_id, trait_id)
SELECT owner.stat_block_id, trait.id
FROM (
  SELECT monster.stat_block_id, monster.key AS owner_key, 'monster' AS owner_type
  FROM dnd5e_monster monster
  UNION ALL
  SELECT npc.stat_block_id, npc.key AS owner_key, 'npc' AS owner_type
  FROM dnd5e_npc npc
  WHERE npc.stat_block_id IS NOT NULL
) owner
JOIN (
  VALUES
    ('monster', 'goblin', 'Nimble Escape'),
    ('monster', 'wolf', 'Pack Tactics'),
    ('monster', 'wolf', 'Keen Hearing and Smell'),
    ('npc', 'elder_rowan', 'Watchful Elder')
) AS data(owner_type, owner_key, trait_name)
  ON data.owner_type = owner.owner_type
 AND data.owner_key = owner.owner_key
JOIN dnd5e_trait trait ON trait.name = data.trait_name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_trait existing
  WHERE existing.stat_block_id = owner.stat_block_id
    AND existing.trait_id = trait.id
);

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
SELECT data.name, data.action_type, data.description, data.requires_attack_roll, data.range_type,
       data.range_normal, data.range_max, data.saving_throw_ability, data.saving_throw_dc
FROM (
  VALUES
    (
      'Goblin Scimitar',
      'action',
      'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
      TRUE,
      'melee',
      5,
      NULL,
      NULL,
      NULL
    ),
    (
      'Goblin Shortbow',
      'action',
      'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target.',
      TRUE,
      'ranged',
      80,
      320,
      NULL,
      NULL
    ),
    (
      'Wolf Bite',
      'action',
      'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. On a hit, the target must succeed on a DC 11 Strength saving throw or be knocked prone.',
      TRUE,
      'melee',
      5,
      NULL,
      'STR',
      11
    ),
    (
      'Elder Rowan Quarterstaff',
      'action',
      'Melee Weapon Attack: +2 to hit, reach 5 ft., one target.',
      TRUE,
      'melee',
      5,
      NULL,
      NULL,
      NULL
    ),
    (
      'Nyx Scout Dagger',
      'action',
      'Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one target.',
      TRUE,
      'special',
      20,
      60,
      NULL,
      NULL
    )
) AS data(
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
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action existing
  WHERE existing.name = data.name
);

INSERT INTO dnd5e_action_damage (
  action_id,
  dice_count,
  dice_size,
  modifier,
  damage_type,
  damage_text
)
SELECT action.id, data.dice_count, data.dice_size, data.modifier, data.damage_type, data.damage_text
FROM dnd5e_action action
JOIN (
  VALUES
    ('Goblin Scimitar', 1, 6, 2, 'slashing', '1d6 + 2 slashing'),
    ('Goblin Shortbow', 1, 6, 2, 'piercing', '1d6 + 2 piercing'),
    ('Wolf Bite', 2, 4, 2, 'piercing', '2d4 + 2 piercing'),
    ('Elder Rowan Quarterstaff', 1, 6, 0, 'bludgeoning', '1d6 bludgeoning'),
    ('Nyx Scout Dagger', 1, 4, 2, 'piercing', '1d4 + 2 piercing')
) AS data(action_name, dice_count, dice_size, modifier, damage_type, damage_text)
  ON data.action_name = action.name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action_damage existing
  WHERE existing.action_id = action.id
    AND existing.damage_text = data.damage_text
);

INSERT INTO dnd5e_action_requirement (action_id, requirement_type, value, notes)
SELECT action.id, data.requirement_type, data.value, data.notes
FROM dnd5e_action action
JOIN (
  VALUES
    ('Goblin Shortbow', 'ammunition', 'arrow', 'Requires ammunition tracking once inventory-backed combat is added.'),
    ('Nyx Scout Dagger', 'weapon_mode', 'melee_or_ranged', 'Can be used at either reach or thrown range.')
) AS data(action_name, requirement_type, value, notes)
  ON data.action_name = action.name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action_requirement existing
  WHERE existing.action_id = action.id
    AND existing.requirement_type = data.requirement_type
    AND existing.value = data.value
  );

INSERT INTO dnd5e_action_effect (action_id, effect_type, value, condition, notes)
SELECT action.id, data.effect_type, data.value, data.condition, data.notes
FROM dnd5e_action action
JOIN (
  VALUES
    (
      'Goblin Scimitar',
      'attack_bonus',
      '{"bonus":4}'::jsonb,
      '{}'::jsonb,
      'Stored separately from damage for future attack-roll automation.'
    ),
    (
      'Goblin Shortbow',
      'attack_bonus',
      '{"bonus":4}'::jsonb,
      '{}'::jsonb,
      'Stored separately from damage for future attack-roll automation.'
    ),
    (
      'Wolf Bite',
      'attack_bonus',
      '{"bonus":4}'::jsonb,
      '{}'::jsonb,
      'Stored separately from damage for future attack-roll automation.'
    ),
    (
      'Wolf Bite',
      'apply_condition',
      '{"condition":"prone"}'::jsonb,
      '{"on_failed_save":true,"save_ability":"STR","save_dc":11,"target_size_max":"large"}'::jsonb,
      'Prone rider on failed Strength save.'
    ),
    (
      'Elder Rowan Quarterstaff',
      'attack_bonus',
      '{"bonus":2}'::jsonb,
      '{}'::jsonb,
      'Stored separately from damage for future attack-roll automation.'
    ),
    (
      'Nyx Scout Dagger',
      'attack_bonus',
      '{"bonus":4}'::jsonb,
      '{}'::jsonb,
      'Stored separately from damage for future attack-roll automation.'
    )
) AS data(action_name, effect_type, value, condition, notes)
  ON data.action_name = action.name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_action_effect existing
  WHERE existing.action_id = action.id
    AND existing.effect_type = data.effect_type
    AND existing.notes IS NOT DISTINCT FROM data.notes
  );

INSERT INTO dnd5e_stat_block_action (stat_block_id, action_id, display_order)
SELECT owner.stat_block_id, action.id, data.display_order
FROM (
  SELECT monster.stat_block_id, monster.key AS owner_key, 'monster' AS owner_type
  FROM dnd5e_monster monster
  UNION ALL
  SELECT npc.stat_block_id, npc.key AS owner_key, 'npc' AS owner_type
  FROM dnd5e_npc npc
  WHERE npc.stat_block_id IS NOT NULL
) owner
JOIN (
  VALUES
    ('monster', 'goblin', 'Goblin Scimitar', 1),
    ('monster', 'goblin', 'Goblin Shortbow', 2),
    ('monster', 'wolf', 'Wolf Bite', 1),
    ('npc', 'elder_rowan', 'Elder Rowan Quarterstaff', 1),
    ('npc', 'nyx_scout', 'Nyx Scout Dagger', 1)
) AS data(owner_type, owner_key, action_name, display_order)
  ON data.owner_type = owner.owner_type
 AND data.owner_key = owner.owner_key
JOIN dnd5e_action action ON action.name = data.action_name
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_stat_block_action existing
  WHERE existing.stat_block_id = owner.stat_block_id
    AND existing.action_id = action.id
);

UPDATE dnd5e_campaign_npc_state npc_state
SET current_hit_points = legacy.current_hit_points
FROM dnd5e_npc_stat_block legacy
WHERE npc_state.npc_id = legacy.npc_id
  AND npc_state.current_hit_points IS NULL;

COMMIT;
