BEGIN;

ALTER TABLE dnd5e_world
  ADD COLUMN IF NOT EXISTS advancement_mode VARCHAR(50) NOT NULL DEFAULT 'event_weighted_xp';

ALTER TABLE dnd5e_world
  ADD COLUMN IF NOT EXISTS advancement_config_json JSONB NOT NULL DEFAULT
    '{
      "xp_weights": {
        "objective": 100,
        "quest": 300,
        "combat": 50,
        "discovery": 75,
        "dialogue": 25,
        "system": 25,
        "gm": 100
      },
      "catch_up_enabled": true,
      "soft_sync_enabled": true,
      "catch_up_multiplier_per_level_gap": 0.25,
      "catch_up_multiplier_cap": 1.75
    }'::jsonb;

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS advancement_mode VARCHAR(50) NOT NULL DEFAULT 'event_weighted_xp';

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS advancement_config_json JSONB NOT NULL DEFAULT
    '{
      "xp_weights": {
        "objective": 100,
        "quest": 300,
        "combat": 50,
        "discovery": 75,
        "dialogue": 25,
        "system": 25,
        "gm": 100
      },
      "catch_up_enabled": true,
      "soft_sync_enabled": true,
      "catch_up_multiplier_per_level_gap": 0.25,
      "catch_up_multiplier_cap": 1.75
    }'::jsonb;

ALTER TABLE dnd5e_world
  DROP CONSTRAINT IF EXISTS dnd5e_world_advancement_mode_check;

ALTER TABLE dnd5e_world
  ADD CONSTRAINT dnd5e_world_advancement_mode_check CHECK (
    advancement_mode IN ('milestone', 'event_weighted_xp', 'gm_controlled')
  );

ALTER TABLE dnd5e_campaign
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_advancement_mode_check;

ALTER TABLE dnd5e_campaign
  ADD CONSTRAINT dnd5e_campaign_advancement_mode_check CHECK (
    advancement_mode IN ('milestone', 'event_weighted_xp', 'gm_controlled')
  );

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS pending_level_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS level_up_available BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS last_level_up_available_at TIMESTAMPTZ;

ALTER TABLE dnd5e_character
  DROP CONSTRAINT IF EXISTS dnd5e_character_pending_level_count_check;

ALTER TABLE dnd5e_character
  ADD CONSTRAINT dnd5e_character_pending_level_count_check CHECK (pending_level_count >= 0);

ALTER TABLE dnd5e_reward
  DROP CONSTRAINT IF EXISTS dnd5e_reward_type_check;

ALTER TABLE dnd5e_reward
  ADD CONSTRAINT dnd5e_reward_type_check CHECK (
    reward_type IN (
      'xp',
      'level_grant',
      'item',
      'currency',
      'campaign_flag',
      'character_flag',
      'scene_unlock',
      'npc_disposition',
      'knowledge'
    )
  );

CREATE TABLE IF NOT EXISTS dnd5e_advancement_event (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  level_up_session_id BIGINT,
  event_kind VARCHAR(50) NOT NULL,
  advancement_mode VARCHAR(50) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_entity_id BIGINT,
  dedupe_key VARCHAR(200),
  amount_xp INTEGER NOT NULL DEFAULT 0,
  granted_level_count INTEGER NOT NULL DEFAULT 0,
  target_level INTEGER,
  reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_advancement_event_kind_check CHECK (
    event_kind IN (
      'xp_grant',
      'level_grant',
      'level_up_started',
      'level_up_deferred',
      'level_up_completed',
      'hp_roll'
    )
  ),
  CONSTRAINT dnd5e_advancement_event_mode_check CHECK (
    advancement_mode IN ('milestone', 'event_weighted_xp', 'gm_controlled')
  ),
  CONSTRAINT dnd5e_advancement_event_amount_xp_check CHECK (amount_xp >= 0),
  CONSTRAINT dnd5e_advancement_event_granted_level_count_check CHECK (granted_level_count >= 0),
  CONSTRAINT dnd5e_advancement_event_target_level_check CHECK (
    target_level IS NULL OR target_level >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_advancement_event_character_created
  ON dnd5e_advancement_event(character_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_advancement_event_campaign_created
  ON dnd5e_advancement_event(campaign_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_advancement_event_character_dedupe
  ON dnd5e_advancement_event(character_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS dnd5e_level_up_session (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  target_character_class_id BIGINT REFERENCES dnd5e_character_class(id) ON DELETE RESTRICT,
  advancement_mode VARCHAR(50) NOT NULL,
  session_status VARCHAR(50) NOT NULL,
  from_level INTEGER NOT NULL,
  target_level INTEGER NOT NULL,
  current_step VARCHAR(100),
  required_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_choices_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hp_choice_method VARCHAR(20),
  hp_roll_result INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_level_up_session_mode_check CHECK (
    advancement_mode IN ('milestone', 'event_weighted_xp', 'gm_controlled')
  ),
  CONSTRAINT dnd5e_level_up_session_status_check CHECK (
    session_status IN (
      'started',
      'awaiting_choice',
      'validating',
      'ready_to_finalize',
      'completed',
      'deferred',
      'canceled'
    )
  ),
  CONSTRAINT dnd5e_level_up_session_from_level_check CHECK (from_level >= 1),
  CONSTRAINT dnd5e_level_up_session_target_level_check CHECK (target_level >= 2),
  CONSTRAINT dnd5e_level_up_session_level_order_check CHECK (target_level > from_level),
  CONSTRAINT dnd5e_level_up_session_hp_choice_check CHECK (
    hp_choice_method IS NULL OR hp_choice_method IN ('fixed', 'roll')
  ),
  CONSTRAINT dnd5e_level_up_session_hp_roll_result_check CHECK (
    hp_roll_result IS NULL OR hp_roll_result >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_level_up_session_character_created
  ON dnd5e_level_up_session(character_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_level_up_session_open_character
  ON dnd5e_level_up_session(character_id)
  WHERE session_status IN ('started', 'awaiting_choice', 'validating', 'ready_to_finalize', 'deferred');

ALTER TABLE dnd5e_advancement_event
  DROP CONSTRAINT IF EXISTS dnd5e_advancement_event_level_up_session_fkey;

ALTER TABLE dnd5e_advancement_event
  ADD CONSTRAINT dnd5e_advancement_event_level_up_session_fkey FOREIGN KEY (level_up_session_id)
  REFERENCES dnd5e_level_up_session(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dnd5e_class_spell (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  class_id BIGINT NOT NULL REFERENCES dnd5e_class(id) ON DELETE CASCADE,
  spell_id BIGINT NOT NULL REFERENCES dnd5e_spell(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, spell_id)
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_class_spell_class
  ON dnd5e_class_spell(class_id, spell_id);

WITH class_spell_seed(class_slug, spell_slug) AS (
  VALUES
    ('cleric', 'cure-wounds'),
    ('cleric', 'detect-magic'),
    ('cleric', 'healing-word'),
    ('cleric', 'light'),
    ('cleric', 'thaumaturgy'),
    ('sorcerer', 'blade-ward'),
    ('sorcerer', 'chill-touch'),
    ('sorcerer', 'dancing-lights'),
    ('sorcerer', 'fire-bolt'),
    ('sorcerer', 'light'),
    ('sorcerer', 'mage-hand'),
    ('sorcerer', 'message'),
    ('sorcerer', 'minor-illusion'),
    ('sorcerer', 'poison-spray'),
    ('sorcerer', 'prestidigitation'),
    ('sorcerer', 'ray-of-frost'),
    ('sorcerer', 'shocking-grasp'),
    ('sorcerer', 'burning-hands'),
    ('sorcerer', 'detect-magic'),
    ('sorcerer', 'disguise-self'),
    ('sorcerer', 'mage-armor'),
    ('sorcerer', 'magic-missile'),
    ('sorcerer', 'shield'),
    ('sorcerer', 'sleep'),
    ('sorcerer', 'thunderwave'),
    ('sorcerer', 'darkness'),
    ('sorcerer', 'invisibility'),
    ('sorcerer', 'scorching-ray'),
    ('sorcerer', 'shatter'),
    ('sorcerer', 'spider-climb'),
    ('sorcerer', 'dispel-magic'),
    ('sorcerer', 'fireball'),
    ('sorcerer', 'fly'),
    ('sorcerer', 'haste'),
    ('wizard', 'acid-splash'),
    ('wizard', 'blade-ward'),
    ('wizard', 'chill-touch'),
    ('wizard', 'dancing-lights'),
    ('wizard', 'fire-bolt'),
    ('wizard', 'light'),
    ('wizard', 'mage-hand'),
    ('wizard', 'mending'),
    ('wizard', 'message'),
    ('wizard', 'minor-illusion'),
    ('wizard', 'poison-spray'),
    ('wizard', 'prestidigitation'),
    ('wizard', 'ray-of-frost'),
    ('wizard', 'shocking-grasp'),
    ('wizard', 'true-strike'),
    ('wizard', 'burning-hands'),
    ('wizard', 'detect-magic'),
    ('wizard', 'disguise-self'),
    ('wizard', 'mage-armor'),
    ('wizard', 'magic-missile'),
    ('wizard', 'shield'),
    ('wizard', 'sleep'),
    ('wizard', 'thunderwave'),
    ('wizard', 'darkness'),
    ('wizard', 'invisibility'),
    ('wizard', 'scorching-ray'),
    ('wizard', 'shatter'),
    ('wizard', 'spider-climb'),
    ('wizard', 'dispel-magic'),
    ('wizard', 'fireball'),
    ('wizard', 'fly'),
    ('wizard', 'haste'),
    ('warlock', 'blade-ward'),
    ('warlock', 'chill-touch'),
    ('warlock', 'mage-hand'),
    ('warlock', 'minor-illusion'),
    ('warlock', 'poison-spray'),
    ('warlock', 'true-strike'),
    ('warlock', 'hellish-rebuke'),
    ('warlock', 'darkness'),
    ('warlock', 'invisibility'),
    ('bard', 'dancing-lights'),
    ('bard', 'light'),
    ('bard', 'mage-hand'),
    ('bard', 'mending'),
    ('bard', 'message'),
    ('bard', 'minor-illusion'),
    ('bard', 'prestidigitation'),
    ('bard', 'cure-wounds'),
    ('bard', 'detect-magic'),
    ('bard', 'disguise-self'),
    ('bard', 'healing-word'),
    ('bard', 'sleep'),
    ('bard', 'thunderwave'),
    ('bard', 'invisibility'),
    ('bard', 'shatter'),
    ('bard', 'dispel-magic'),
    ('bard', 'fly'),
    ('bard', 'haste')
)
INSERT INTO dnd5e_class_spell (class_id, spell_id, notes)
SELECT
  class_row.id,
  spell_row.id,
  'Stage 5H seed class spell list.'
FROM class_spell_seed seed
JOIN dnd5e_class class_row ON class_row.slug = seed.class_slug
JOIN dnd5e_spell spell_row ON spell_row.slug = seed.spell_slug
ON CONFLICT (class_id, spell_id) DO NOTHING;

INSERT INTO dnd5e_character_class (
  character_id,
  class_id,
  subclass_id,
  class_level,
  is_primary
)
SELECT
  13,
  class_row.id,
  NULL,
  1,
  TRUE
FROM dnd5e_class class_row
WHERE class_row.slug = 'fighter'
  AND EXISTS (SELECT 1 FROM dnd5e_character WHERE id = 13)
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_character_class existing
    WHERE existing.character_id = 13
  )
ON CONFLICT (character_id, class_id) DO NOTHING;

UPDATE dnd5e_character
SET
  class_id = class_row.id,
  subclass_id = NULL
FROM dnd5e_class class_row
WHERE dnd5e_character.id = 13
  AND class_row.slug = 'fighter'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_character_class existing
    WHERE existing.character_id = 13
      AND existing.class_id <> class_row.id
  );

INSERT INTO dnd5e_character_class (
  character_id,
  class_id,
  subclass_id,
  class_level,
  is_primary
)
SELECT
  14,
  class_row.id,
  subclass_row.id,
  1,
  TRUE
FROM dnd5e_class class_row
JOIN dnd5e_subclass subclass_row
  ON subclass_row.class_id = class_row.id
 AND subclass_row.slug = 'draconic-bloodline'
WHERE class_row.slug = 'sorcerer'
  AND EXISTS (SELECT 1 FROM dnd5e_character WHERE id = 14)
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_character_class existing
    WHERE existing.character_id = 14
  )
ON CONFLICT (character_id, class_id) DO NOTHING;

UPDATE dnd5e_character
SET
  class_id = class_row.id,
  subclass_id = subclass_row.id,
  max_hit_points = 7,
  current_hit_points = 7,
  proficiency_bonus = COALESCE(proficiency_bonus, 2)
FROM dnd5e_class class_row
JOIN dnd5e_subclass subclass_row
  ON subclass_row.class_id = class_row.id
 AND subclass_row.slug = 'draconic-bloodline'
WHERE dnd5e_character.id = 14
  AND class_row.slug = 'sorcerer'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_character_class existing
    WHERE existing.character_id = 14
      AND existing.class_id <> class_row.id
  );

WITH sorcerer_manual_spells(character_id, spell_slug, is_prepared) AS (
  VALUES
    (14, 'fire-bolt', FALSE),
    (14, 'mage-hand', FALSE),
    (14, 'prestidigitation', FALSE),
    (14, 'ray-of-frost', FALSE),
    (14, 'magic-missile', FALSE),
    (14, 'shield', FALSE)
)
INSERT INTO dnd5e_character_spell (
  character_id,
  spell_id,
  spell_source,
  source_class_id,
  is_known,
  is_prepared,
  is_always_prepared,
  notes
)
SELECT
  seed.character_id,
  spell_row.id,
  'stage5h_seed',
  class_row.id,
  TRUE,
  seed.is_prepared,
  FALSE,
  'Stage 5H seeded sorcerer spell.'
FROM sorcerer_manual_spells seed
JOIN dnd5e_spell spell_row ON spell_row.slug = seed.spell_slug
JOIN dnd5e_class class_row ON class_row.slug = 'sorcerer'
WHERE EXISTS (SELECT 1 FROM dnd5e_character WHERE id = seed.character_id)
ON CONFLICT (character_id, spell_id) DO NOTHING;

COMMIT;
