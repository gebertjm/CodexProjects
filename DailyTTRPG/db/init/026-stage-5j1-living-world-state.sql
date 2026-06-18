BEGIN;

CREATE TABLE IF NOT EXISTS dnd5e_world_instance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_id BIGINT NOT NULL REFERENCES dnd5e_world(id) ON DELETE RESTRICT,
  instance_key VARCHAR(180) NOT NULL,
  content_package_id VARCHAR(180),
  content_package_version VARCHAR(80),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, instance_key),
  CONSTRAINT dnd5e_world_instance_key_present_check CHECK (btrim(instance_key) <> ''),
  CONSTRAINT dnd5e_world_instance_status_check CHECK (
    status IN ('active', 'paused', 'completed', 'archived')
  )
);

ALTER TABLE dnd5e_campaign
  ADD COLUMN IF NOT EXISTS world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE RESTRICT;

INSERT INTO dnd5e_world_instance (
  world_id,
  instance_key,
  content_package_id,
  content_package_version,
  status,
  metadata_json
)
SELECT
  world.id,
  world.slug || '-shared-default',
  world.slug,
  '1.0.0',
  'active',
  jsonb_build_object('created_by', 'stage_5j1_migration', 'scope', 'shared_world_default')
FROM dnd5e_world world
ON CONFLICT (world_id, instance_key) DO NOTHING;

UPDATE dnd5e_campaign campaign
SET world_instance_id = instance.id
FROM dnd5e_world_instance instance
WHERE campaign.world_instance_id IS NULL
  AND instance.world_id = campaign.world_id
  AND instance.instance_key = (
    SELECT world.slug || '-shared-default'
    FROM dnd5e_world world
    WHERE world.id = campaign.world_id
  );

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_world_instance
  ON dnd5e_campaign(world_instance_id, status);

CREATE TABLE IF NOT EXISTS dnd5e_world_entity_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  world_entity_id BIGINT REFERENCES dnd5e_world_entity(id) ON DELETE SET NULL,
  entity_key VARCHAR(180) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(80) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_instance_id, entity_key),
  CONSTRAINT dnd5e_world_entity_state_key_present_check CHECK (btrim(entity_key) <> ''),
  CONSTRAINT dnd5e_world_entity_state_type_present_check CHECK (btrim(entity_type) <> ''),
  CONSTRAINT dnd5e_world_entity_state_status_check CHECK (
    status IN ('active', 'inactive', 'hidden', 'dead', 'defeated', 'archived')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_world_location_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES dnd5e_location(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_instance_id, location_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_world_scene_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_world_scene_state_shared_unique
  ON dnd5e_world_scene_state(world_instance_id, scene_id)
  WHERE campaign_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_world_scene_state_campaign_unique
  ON dnd5e_world_scene_state(world_instance_id, campaign_id, scene_id)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dnd5e_world_scene_affordance_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  affordance_key VARCHAR(180) NOT NULL,
  action_key VARCHAR(180),
  state VARCHAR(80) NOT NULL DEFAULT 'available',
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  resolved_by_character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  revealed_at TIMESTAMPTZ,
  source_event_id BIGINT,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_world_scene_affordance_state_key_present_check CHECK (btrim(affordance_key) <> ''),
  CONSTRAINT dnd5e_world_scene_affordance_state_status_check CHECK (
    state IN ('available', 'hidden', 'locked', 'resolved', 'depleted', 'transformed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_world_affordance_state_shared_unique
  ON dnd5e_world_scene_affordance_state(world_instance_id, scene_id, affordance_key, COALESCE(action_key, ''))
  WHERE campaign_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_world_affordance_state_campaign_unique
  ON dnd5e_world_scene_affordance_state(world_instance_id, campaign_id, scene_id, affordance_key, COALESCE(action_key, ''))
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_affordance_state_scene
  ON dnd5e_world_scene_affordance_state(world_instance_id, scene_id, state);

ALTER TABLE dnd5e_scene_affordance
  ADD COLUMN IF NOT EXISTS initial_state VARCHAR(80) NOT NULL DEFAULT 'available';

ALTER TABLE dnd5e_scene_affordance
  DROP CONSTRAINT IF EXISTS dnd5e_scene_affordance_initial_state_check;

ALTER TABLE dnd5e_scene_affordance
  ADD CONSTRAINT dnd5e_scene_affordance_initial_state_check CHECK (
    initial_state IN ('available', 'hidden', 'locked', 'resolved', 'depleted', 'transformed')
  );

CREATE TABLE IF NOT EXISTS dnd5e_knowledge_definition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  content_package_id VARCHAR(180) NOT NULL DEFAULT 'default',
  content_package_version VARCHAR(80),
  knowledge_key VARCHAR(180) NOT NULL,
  knowledge_type VARCHAR(80) NOT NULL,
  public_label TEXT NOT NULL,
  canonical_text TEXT NOT NULL,
  hidden_until_discovered BOOLEAN NOT NULL DEFAULT TRUE,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (knowledge_key),
  UNIQUE (content_package_id, knowledge_key),
  CONSTRAINT dnd5e_knowledge_definition_key_present_check CHECK (btrim(knowledge_key) <> ''),
  CONSTRAINT dnd5e_knowledge_definition_type_check CHECK (
    knowledge_type IN (
      'campaign_flag',
      'character_flag',
      'event',
      'dialogue',
      'interaction',
      'combat',
      'lore',
      'fact',
      'clue',
      'rumor',
      'entity_knowledge',
      'location_knowledge',
      'journal_seed',
      'scene',
      'quest',
      'objective',
      'npc',
      'world_change',
      'world_event'
    )
  ),
  CONSTRAINT dnd5e_knowledge_definition_label_present_check CHECK (btrim(public_label) <> ''),
  CONSTRAINT dnd5e_knowledge_definition_text_present_check CHECK (btrim(canonical_text) <> '')
);

ALTER TABLE dnd5e_character_knowledge
  ADD COLUMN IF NOT EXISTS world_instance_id BIGINT REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS knowledge_definition_id BIGINT REFERENCES dnd5e_knowledge_definition(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'known',
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(50) NOT NULL DEFAULT 'observed',
  ADD COLUMN IF NOT EXISTS known_at TIMESTAMPTZ;

UPDATE dnd5e_character_knowledge
SET known_at = COALESCE(known_at, created_at)
WHERE known_at IS NULL;

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
      'fact',
      'clue',
      'rumor',
      'entity_knowledge',
      'location_knowledge',
      'journal_seed',
      'world_change',
      'world_event'
    )
  );

ALTER TABLE dnd5e_character_knowledge
  DROP CONSTRAINT IF EXISTS dnd5e_character_knowledge_status_check;

ALTER TABLE dnd5e_character_knowledge
  ADD CONSTRAINT dnd5e_character_knowledge_status_check CHECK (
    status IN ('known', 'suspected', 'disproven', 'forgotten')
  );

ALTER TABLE dnd5e_character_knowledge
  DROP CONSTRAINT IF EXISTS dnd5e_character_knowledge_confidence_check;

ALTER TABLE dnd5e_character_knowledge
  ADD CONSTRAINT dnd5e_character_knowledge_confidence_check CHECK (
    confidence IN ('observed', 'inferred', 'rumor', 'told', 'uncertain')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_character_knowledge_world_unique
  ON dnd5e_character_knowledge(character_id, world_instance_id, knowledge_key)
  WHERE world_instance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dnd5e_world_event (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  world_instance_id BIGINT NOT NULL REFERENCES dnd5e_world_instance(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES dnd5e_campaign(id) ON DELETE SET NULL,
  actor_character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  location_id BIGINT REFERENCES dnd5e_location(id) ON DELETE SET NULL,
  interaction_id BIGINT REFERENCES dnd5e_scene_interaction(id) ON DELETE SET NULL,
  event_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_granted_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_kind VARCHAR(40) NOT NULL DEFAULT 'system',
  created_by_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_world_event_type_present_check CHECK (btrim(event_type) <> ''),
  CONSTRAINT dnd5e_world_event_known_type_check CHECK (
    event_type IN (
      'interaction_resolved',
      'knowledge_granted',
      'scene_state_changed',
      'affordance_state_changed',
      'entity_state_changed',
      'objective_updated',
      'campaign_started',
      'character_entered_scene',
      'manual_adjustment'
    )
  ),
  CONSTRAINT dnd5e_world_event_created_by_kind_check CHECK (
    created_by_kind IN ('system', 'user', 'gm')
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_event_world_created
  ON dnd5e_world_event(world_instance_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_world_event_campaign_created
  ON dnd5e_world_event(campaign_id, created_at DESC, id DESC);

ALTER TABLE dnd5e_world_scene_affordance_state
  DROP CONSTRAINT IF EXISTS dnd5e_world_scene_affordance_state_source_event_fk;

ALTER TABLE dnd5e_world_scene_affordance_state
  ADD CONSTRAINT dnd5e_world_scene_affordance_state_source_event_fk
  FOREIGN KEY (source_event_id) REFERENCES dnd5e_world_event(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_character_knowledge
  ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES dnd5e_world_event(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_scene_interaction
  ADD COLUMN IF NOT EXISTS verb VARCHAR(80),
  ADD COLUMN IF NOT EXISTS target_affordance_key VARCHAR(180),
  ADD COLUMN IF NOT EXISTS result_bands_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_interaction_affordance
  ON dnd5e_scene_interaction(scene_id, target_affordance_key, verb)
  WHERE target_affordance_key IS NOT NULL;

COMMIT;
