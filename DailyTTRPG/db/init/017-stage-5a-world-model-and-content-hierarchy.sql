BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_world (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  theme_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_world_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_world_slug_present_check CHECK (btrim(slug) <> ''),
  CONSTRAINT dnd5e_world_status_check CHECK (
    status IN ('active', 'archived')
  )
);

INSERT INTO dnd5e_world (
  name,
  slug,
  description,
  theme_tags_json,
  status
)
VALUES (
  'DailyRPG Prime',
  'daily-rpg-prime',
  'Default shared world instance for migrated DailyRPG development content.',
  '["5e","willowmere","default"]'::jsonb,
  'active'
)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS dnd5e_world_flag (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL,
  flag_value_json JSONB NOT NULL DEFAULT 'true'::jsonb,
  flag_category VARCHAR(50),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, flag_key),
  CONSTRAINT dnd5e_world_flag_key_present_check CHECK (btrim(flag_key) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_world_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  log_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_world_log_type_present_check CHECK (btrim(log_type) <> ''),
  CONSTRAINT dnd5e_world_log_message_present_check CHECK (btrim(message) <> '')
);

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE RESTRICT;

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50) NOT NULL DEFAULT 'party';

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';

UPDATE dnd5e_campaign
SET world_id = (
  SELECT id
  FROM dnd5e_world
  WHERE slug = 'daily-rpg-prime'
)
WHERE world_id IS NULL;

UPDATE dnd5e_campaign
SET slug = 'campaign-' || id
WHERE slug IS NULL OR btrim(slug) = '';

UPDATE dnd5e_campaign
SET
  campaign_type = COALESCE(NULLIF(campaign_type, ''), 'party'),
  status = CASE WHEN is_active THEN 'active' ELSE 'archived' END
WHERE campaign_type IS NULL
   OR status IS NULL
   OR status = '';

ALTER TABLE dnd5e_campaign
  ALTER COLUMN world_id SET NOT NULL;

ALTER TABLE dnd5e_campaign
  ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_campaign_world_slug_unique'
      AND conrelid = 'dnd5e_campaign'::regclass
  ) THEN
    ALTER TABLE dnd5e_campaign
      ADD CONSTRAINT dnd5e_campaign_world_slug_unique UNIQUE (world_id, slug);
  END IF;
END $$;

ALTER TABLE dnd5e_campaign
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_type_check;

ALTER TABLE dnd5e_campaign
  ADD CONSTRAINT dnd5e_campaign_type_check CHECK (
    campaign_type IN ('solo', 'party', 'questline', 'world_event')
  );

ALTER TABLE dnd5e_campaign
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_status_check;

ALTER TABLE dnd5e_campaign
  ADD CONSTRAINT dnd5e_campaign_status_check CHECK (
    status IN ('active', 'dormant', 'completed', 'archived')
  );

ALTER TABLE dnd5e_character
  ADD COLUMN IF NOT EXISTS world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE RESTRICT;

UPDATE dnd5e_character
SET world_id = (
  SELECT id
  FROM dnd5e_world
  WHERE slug = 'daily-rpg-prime'
)
WHERE world_id IS NULL;

ALTER TABLE dnd5e_character
  ALTER COLUMN world_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS dnd5e_region_template (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  source VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_region_template_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_region_template_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_location_template (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  region_template_id BIGINT REFERENCES dnd5e_region_template(id) ON DELETE SET NULL,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  source VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_location_template_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_location_template_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_template (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  location_template_id BIGINT REFERENCES dnd5e_location_template(id) ON DELETE SET NULL,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  summary TEXT,
  description TEXT,
  entry_text TEXT,
  entry_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_scene_template_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_scene_template_name_present_check CHECK (btrim(name) <> '')
);

INSERT INTO dnd5e_region_template (
  key,
  name,
  description,
  source
)
SELECT DISTINCT
  regexp_replace(
    lower(COALESCE(NULLIF(location.region_name, ''), 'default-region')),
    '[^a-z0-9]+',
    '-',
    'g'
  ) AS key,
  COALESCE(NULLIF(location.region_name, ''), 'Default Region') AS name,
  'Template generated from pre-5A location region names.',
  'stage_5a_migration'
FROM dnd5e_location location
ON CONFLICT (key) DO NOTHING;

INSERT INTO dnd5e_location_template (
  region_template_id,
  key,
  name,
  description,
  source
)
SELECT
  region_template.id,
  location.key,
  location.name,
  location.description,
  'stage_5a_migration'
FROM dnd5e_location location
LEFT JOIN dnd5e_region_template region_template
  ON region_template.key = regexp_replace(
    lower(COALESCE(NULLIF(location.region_name, ''), 'default-region')),
    '[^a-z0-9]+',
    '-',
    'g'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO dnd5e_scene_template (
  location_template_id,
  key,
  name,
  summary,
  description,
  entry_text,
  entry_conditions_json,
  source
)
SELECT
  location_template.id,
  scene.key,
  scene.name,
  scene.summary,
  scene.description,
  scene.entry_text,
  scene.entry_conditions_json,
  'stage_5a_migration'
FROM dnd5e_scene scene
JOIN dnd5e_location location ON location.id = scene.location_id
LEFT JOIN dnd5e_location_template location_template ON location_template.key = location.key
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS dnd5e_region (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  template_id BIGINT REFERENCES dnd5e_region_template(id) ON DELETE SET NULL,
  key VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, key),
  CONSTRAINT dnd5e_region_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_region_name_present_check CHECK (btrim(name) <> '')
);

INSERT INTO dnd5e_region (
  world_id,
  template_id,
  key,
  name,
  description
)
SELECT DISTINCT
  world.id,
  region_template.id,
  region_template.key,
  region_template.name,
  region_template.description
FROM dnd5e_world world
JOIN dnd5e_region_template region_template ON TRUE
WHERE world.slug = 'daily-rpg-prime'
ON CONFLICT (world_id, key) DO NOTHING;

ALTER TABLE dnd5e_location
  ADD COLUMN IF NOT EXISTS world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE CASCADE;

ALTER TABLE dnd5e_location
  ADD COLUMN IF NOT EXISTS region_id BIGINT REFERENCES dnd5e_region(id) ON DELETE RESTRICT;

ALTER TABLE dnd5e_location
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES dnd5e_location_template(id) ON DELETE SET NULL;

UPDATE dnd5e_location location
SET
  world_id = COALESCE(
    location.world_id,
    (
      SELECT id
      FROM dnd5e_world
      WHERE slug = 'daily-rpg-prime'
    )
  ),
  template_id = COALESCE(
    location.template_id,
    (
      SELECT location_template.id
      FROM dnd5e_location_template location_template
      WHERE location_template.key = location.key
    )
  );

UPDATE dnd5e_location location
SET region_id = region.id
FROM dnd5e_region region
WHERE location.region_id IS NULL
  AND region.world_id = location.world_id
  AND region.key = regexp_replace(
    lower(COALESCE(NULLIF(location.region_name, ''), 'default-region')),
    '[^a-z0-9]+',
    '-',
    'g'
  );

ALTER TABLE dnd5e_location
  ALTER COLUMN world_id SET NOT NULL;

ALTER TABLE dnd5e_location
  ALTER COLUMN region_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_location_world_key_unique
  ON dnd5e_location(world_id, key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_location_region_id
  ON dnd5e_location(region_id, key);

ALTER TABLE dnd5e_scene
  ADD COLUMN IF NOT EXISTS world_id BIGINT REFERENCES dnd5e_world(id) ON DELETE CASCADE;

ALTER TABLE dnd5e_scene
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES dnd5e_scene_template(id) ON DELETE SET NULL;

UPDATE dnd5e_scene scene
SET
  world_id = location.world_id,
  template_id = COALESCE(
    scene.template_id,
    (
      SELECT scene_template.id
      FROM dnd5e_scene_template scene_template
      WHERE scene_template.key = scene.key
    )
  )
FROM dnd5e_location location
WHERE location.id = scene.location_id
  AND (scene.world_id IS NULL OR scene.template_id IS NULL);

ALTER TABLE dnd5e_scene
  ALTER COLUMN world_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_scene_world_key_unique
  ON dnd5e_scene(world_id, key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_world_location
  ON dnd5e_scene(world_id, location_id, key);

CREATE TABLE IF NOT EXISTS dnd5e_world_entity (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE CASCADE,
  entity_key VARCHAR(120) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  npc_template_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE RESTRICT,
  monster_template_id BIGINT REFERENCES dnd5e_monster(id) ON DELETE RESTRICT,
  current_region_id BIGINT REFERENCES dnd5e_region(id) ON DELETE SET NULL,
  current_location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  current_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  disposition VARCHAR(50),
  faction VARCHAR(50),
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, entity_key),
  CONSTRAINT dnd5e_world_entity_key_present_check CHECK (btrim(entity_key) <> ''),
  CONSTRAINT dnd5e_world_entity_type_check CHECK (entity_type IN ('npc', 'monster')),
  CONSTRAINT dnd5e_world_entity_status_check CHECK (
    status IN ('active', 'inactive', 'hidden', 'defeated', 'archived')
  ),
  CONSTRAINT dnd5e_world_entity_disposition_check CHECK (
    disposition IS NULL OR disposition IN ('friendly', 'neutral', 'hostile')
  ),
  CONSTRAINT dnd5e_world_entity_template_check CHECK (
    (entity_type = 'npc' AND npc_template_id IS NOT NULL AND monster_template_id IS NULL)
    OR
    (entity_type = 'monster' AND monster_template_id IS NOT NULL AND npc_template_id IS NULL)
  )
);

ALTER TABLE dnd5e_scene_npc
  ADD COLUMN IF NOT EXISTS world_entity_id BIGINT REFERENCES dnd5e_world_entity(id) ON DELETE SET NULL;

INSERT INTO dnd5e_world_entity (
  world_id,
  entity_key,
  entity_type,
  npc_template_id,
  current_region_id,
  current_location_id,
  current_scene_id,
  status,
  disposition,
  faction,
  notes
)
SELECT DISTINCT ON (scene.world_id, npc.id)
  scene.world_id,
  'npc-' || npc.key,
  'npc',
  npc.id,
  location.region_id,
  scene.location_id,
  scene.id,
  CASE WHEN npc.is_active THEN 'active' ELSE 'archived' END,
  npc.disposition,
  'neutral',
  'Migrated from Stage 4 scene NPC presence.'
FROM dnd5e_scene_npc scene_npc
JOIN dnd5e_scene scene ON scene.id = scene_npc.scene_id
JOIN dnd5e_location location ON location.id = scene.location_id
JOIN dnd5e_npc npc ON npc.id = scene_npc.npc_id
ORDER BY scene.world_id, npc.id, scene_npc.sort_order ASC, scene_npc.id ASC
ON CONFLICT (world_id, entity_key) DO NOTHING;

INSERT INTO dnd5e_world_entity (
  world_id,
  entity_key,
  entity_type,
  monster_template_id,
  status,
  faction,
  notes
)
SELECT
  world.id,
  'monster-' || monster.key,
  'monster',
  monster.id,
  CASE WHEN monster.is_active THEN 'active' ELSE 'archived' END,
  'enemy',
  'Unplaced reusable monster instance seeded for Stage 5A validation.'
FROM dnd5e_world world
JOIN dnd5e_monster monster ON TRUE
WHERE world.slug = 'daily-rpg-prime'
ON CONFLICT (world_id, entity_key) DO NOTHING;

UPDATE dnd5e_scene_npc scene_npc
SET world_entity_id = entity.id
FROM dnd5e_scene scene
JOIN dnd5e_npc npc ON TRUE
JOIN dnd5e_world_entity entity
  ON entity.world_id = scene.world_id
 AND entity.entity_type = 'npc'
 AND entity.npc_template_id = npc.id
WHERE scene.id = scene_npc.scene_id
  AND npc.id = scene_npc.npc_id
  AND scene_npc.world_entity_id IS NULL;

CREATE TABLE IF NOT EXISTS dnd5e_campaign_location_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES dnd5e_location(id) ON DELETE CASCADE,
  is_discovered BOOLEAN NOT NULL DEFAULT FALSE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  overlay_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, location_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_campaign_scene_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  is_discovered BOOLEAN NOT NULL DEFAULT FALSE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  overlay_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, scene_id)
);

INSERT INTO dnd5e_campaign_location_state (
  campaign_id,
  location_id,
  is_discovered,
  is_available,
  notes
)
SELECT
  campaign.id,
  location.id,
  TRUE,
  TRUE,
  'Auto-seeded Stage 5A campaign location overlay.'
FROM dnd5e_campaign campaign
JOIN dnd5e_location location ON location.world_id = campaign.world_id
ON CONFLICT (campaign_id, location_id) DO NOTHING;

INSERT INTO dnd5e_campaign_scene_state (
  campaign_id,
  scene_id,
  is_discovered,
  is_available,
  notes
)
SELECT
  campaign.id,
  scene.id,
  TRUE,
  TRUE,
  'Auto-seeded Stage 5A campaign scene overlay.'
FROM dnd5e_campaign campaign
JOIN dnd5e_scene scene ON scene.world_id = campaign.world_id
ON CONFLICT (campaign_id, scene_id) DO NOTHING;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS membership_status VARCHAR(50) NOT NULL DEFAULT 'active';

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS is_active_context BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS is_default_solo_campaign BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

UPDATE dnd5e_campaign_character
SET
  membership_status = CASE WHEN is_active THEN 'active' ELSE 'dormant' END,
  joined_at = COALESCE(joined_at, created_at);

ALTER TABLE dnd5e_campaign_character
  DROP CONSTRAINT IF EXISTS dnd5e_campaign_character_membership_status_check;

ALTER TABLE dnd5e_campaign_character
  ADD CONSTRAINT dnd5e_campaign_character_membership_status_check CHECK (
    membership_status IN ('active', 'dormant', 'completed', 'left')
  );

INSERT INTO dnd5e_campaign (
  world_id,
  name,
  slug,
  campaign_type,
  status,
  description,
  created_by_account_id,
  is_active
)
SELECT
  character.world_id,
  character.name || ' Solo Free-Roam',
  'solo-character-' || character.id,
  'solo',
  'active',
  'Default solo campaign for fallback free-roam play.',
  character.account_id,
  TRUE
FROM dnd5e_character character
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_campaign campaign
  WHERE campaign.world_id = character.world_id
    AND campaign.slug = 'solo-character-' || character.id
)
ON CONFLICT (world_id, slug) DO NOTHING;

INSERT INTO dnd5e_campaign_character (
  campaign_id,
  character_id,
  joined_by_account_id,
  is_active,
  membership_status,
  is_default_solo_campaign,
  joined_at
)
SELECT
  campaign.id,
  character.id,
  character.account_id,
  TRUE,
  'active',
  TRUE,
  NOW()
FROM dnd5e_character character
JOIN dnd5e_campaign campaign
  ON campaign.world_id = character.world_id
 AND campaign.slug = 'solo-character-' || character.id
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_campaign_character membership
  WHERE membership.campaign_id = campaign.id
    AND membership.character_id = character.id
)
ON CONFLICT (campaign_id, character_id) DO NOTHING;

WITH characters_without_active_context AS (
  SELECT DISTINCT membership.character_id
  FROM dnd5e_campaign_character membership
  WHERE NOT EXISTS (
    SELECT 1
    FROM dnd5e_campaign_character active_membership
    WHERE active_membership.character_id = membership.character_id
      AND active_membership.is_active_context = TRUE
  )
),
ranked_memberships AS (
  SELECT
    membership.id,
    ROW_NUMBER() OVER (
      PARTITION BY membership.character_id
      ORDER BY
        CASE
          WHEN membership.is_active = TRUE AND membership.is_default_solo_campaign = FALSE THEN 0
          WHEN membership.is_active = TRUE AND membership.is_default_solo_campaign = TRUE THEN 1
          ELSE 2
        END,
        membership.created_at DESC,
        membership.id DESC
    ) AS rank
  FROM dnd5e_campaign_character membership
  JOIN characters_without_active_context missing_context
    ON missing_context.character_id = membership.character_id
)
UPDATE dnd5e_campaign_character membership
SET is_active_context = ranked.rank = 1
FROM ranked_memberships ranked
WHERE ranked.id = membership.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_campaign_character_one_active_context
  ON dnd5e_campaign_character(character_id)
  WHERE is_active_context = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_campaign_character_one_default_solo
  ON dnd5e_campaign_character(character_id)
  WHERE is_default_solo_campaign = TRUE;

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_world_type_status
  ON dnd5e_campaign(world_id, campaign_type, status, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_world_id
  ON dnd5e_character(world_id, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_region_world_id
  ON dnd5e_region(world_id, key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_template_location_id
  ON dnd5e_scene_template(location_template_id, key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_entity_world_type_status
  ON dnd5e_world_entity(world_id, entity_type, status, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_entity_scene
  ON dnd5e_world_entity(current_scene_id, status, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_location_state_campaign
  ON dnd5e_campaign_location_state(campaign_id, location_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_scene_state_campaign
  ON dnd5e_campaign_scene_state(campaign_id, scene_id);

CREATE OR REPLACE FUNCTION dnd5e_assert_campaign_character_world_match()
RETURNS TRIGGER AS $$
DECLARE
  campaign_world_id BIGINT;
  character_world_id BIGINT;
  scene_world_id BIGINT;
  campaign_type_value VARCHAR(50);
BEGIN
  SELECT world_id, campaign_type
  INTO campaign_world_id, campaign_type_value
  FROM dnd5e_campaign
  WHERE id = NEW.campaign_id;

  SELECT world_id
  INTO character_world_id
  FROM dnd5e_character
  WHERE id = NEW.character_id;

  IF campaign_world_id IS NULL OR character_world_id IS NULL OR campaign_world_id <> character_world_id THEN
    RAISE EXCEPTION 'Campaign and character must belong to the same world';
  END IF;

  IF NEW.current_scene_id IS NOT NULL THEN
    SELECT world_id
    INTO scene_world_id
    FROM dnd5e_scene
    WHERE id = NEW.current_scene_id;

    IF scene_world_id IS NULL OR scene_world_id <> campaign_world_id THEN
      RAISE EXCEPTION 'Current scene must belong to the same world as the campaign';
    END IF;
  END IF;

  IF NEW.is_default_solo_campaign = TRUE AND campaign_type_value <> 'solo' THEN
    RAISE EXCEPTION 'Default solo campaign membership must point to a solo campaign';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd5e_campaign_character_world_match
  ON dnd5e_campaign_character;

CREATE TRIGGER trg_dnd5e_campaign_character_world_match
BEFORE INSERT OR UPDATE OF campaign_id, character_id, current_scene_id, is_default_solo_campaign
ON dnd5e_campaign_character
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_campaign_character_world_match();

CREATE OR REPLACE FUNCTION dnd5e_assert_campaign_location_state_world_match()
RETURNS TRIGGER AS $$
DECLARE
  campaign_world_id BIGINT;
  location_world_id BIGINT;
BEGIN
  SELECT world_id INTO campaign_world_id FROM dnd5e_campaign WHERE id = NEW.campaign_id;
  SELECT world_id INTO location_world_id FROM dnd5e_location WHERE id = NEW.location_id;

  IF campaign_world_id IS NULL OR location_world_id IS NULL OR campaign_world_id <> location_world_id THEN
    RAISE EXCEPTION 'Campaign location overlay must belong to the same world as the location';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd5e_campaign_location_state_world_match
  ON dnd5e_campaign_location_state;

CREATE TRIGGER trg_dnd5e_campaign_location_state_world_match
BEFORE INSERT OR UPDATE OF campaign_id, location_id
ON dnd5e_campaign_location_state
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_campaign_location_state_world_match();

CREATE OR REPLACE FUNCTION dnd5e_assert_campaign_scene_state_world_match()
RETURNS TRIGGER AS $$
DECLARE
  campaign_world_id BIGINT;
  scene_world_id BIGINT;
BEGIN
  SELECT world_id INTO campaign_world_id FROM dnd5e_campaign WHERE id = NEW.campaign_id;
  SELECT world_id INTO scene_world_id FROM dnd5e_scene WHERE id = NEW.scene_id;

  IF campaign_world_id IS NULL OR scene_world_id IS NULL OR campaign_world_id <> scene_world_id THEN
    RAISE EXCEPTION 'Campaign scene overlay must belong to the same world as the scene';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dnd5e_campaign_scene_state_world_match
  ON dnd5e_campaign_scene_state;

CREATE TRIGGER trg_dnd5e_campaign_scene_state_world_match
BEFORE INSERT OR UPDATE OF campaign_id, scene_id
ON dnd5e_campaign_scene_state
FOR EACH ROW
EXECUTE FUNCTION dnd5e_assert_campaign_scene_state_world_match();

COMMIT;
