BEGIN;

ALTER TABLE dnd5e_gameplay_history
  DROP CONSTRAINT IF EXISTS dnd5e_gameplay_history_source_type_check;

ALTER TABLE dnd5e_gameplay_history
  ADD CONSTRAINT dnd5e_gameplay_history_source_type_check CHECK (
    source_type IN ('command', 'event', 'progression', 'system', 'narrative')
  );

CREATE TABLE IF NOT EXISTS dnd5e_location (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  region_name VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_location_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_location_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_scene (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  location_id BIGINT NOT NULL REFERENCES dnd5e_location(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  summary TEXT,
  description TEXT,
  entry_text TEXT,
  is_starting_scene BOOLEAN NOT NULL DEFAULT FALSE,
  entry_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_scene_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_scene_name_present_check CHECK (btrim(name) <> '')
);

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS current_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS current_scene_entered_at TIMESTAMPTZ;

ALTER TABLE dnd5e_campaign_character
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dnd5e_character_scene_history (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  from_scene_id BIGINT REFERENCES dnd5e_scene(id) ON DELETE SET NULL,
  to_scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE RESTRICT,
  transition_id BIGINT,
  transition_key VARCHAR(100),
  reason TEXT,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dnd5e_npc (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  npc_type VARCHAR(100) NOT NULL DEFAULT 'humanoid',
  disposition VARCHAR(50) NOT NULL DEFAULT 'neutral',
  role VARCHAR(100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_npc_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_npc_name_present_check CHECK (btrim(name) <> ''),
  CONSTRAINT dnd5e_npc_disposition_check CHECK (
    disposition IN ('friendly', 'neutral', 'hostile')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_npc_stat_block (
  npc_id BIGINT PRIMARY KEY REFERENCES dnd5e_npc(id) ON DELETE CASCADE,
  armor_class INTEGER NOT NULL DEFAULT 10,
  max_hit_points INTEGER NOT NULL DEFAULT 1,
  current_hit_points INTEGER NOT NULL DEFAULT 1,
  speed INTEGER NOT NULL DEFAULT 30,
  strength INTEGER NOT NULL DEFAULT 10,
  dexterity INTEGER NOT NULL DEFAULT 10,
  constitution INTEGER NOT NULL DEFAULT 10,
  intelligence INTEGER NOT NULL DEFAULT 10,
  wisdom INTEGER NOT NULL DEFAULT 10,
  charisma INTEGER NOT NULL DEFAULT 10,
  proficiency_bonus INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_npc_stat_block_armor_class_check CHECK (armor_class > 0),
  CONSTRAINT dnd5e_npc_stat_block_hit_points_check CHECK (
    max_hit_points > 0 AND current_hit_points >= 0 AND current_hit_points <= max_hit_points
  ),
  CONSTRAINT dnd5e_npc_stat_block_speed_check CHECK (speed >= 0)
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_npc (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  npc_id BIGINT NOT NULL REFERENCES dnd5e_npc(id) ON DELETE CASCADE,
  presence_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene_id, npc_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_campaign_npc_state (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  npc_id BIGINT NOT NULL REFERENCES dnd5e_npc(id) ON DELETE CASCADE,
  disposition VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, npc_id),
  CONSTRAINT dnd5e_campaign_npc_state_disposition_check CHECK (
    disposition IS NULL OR disposition IN ('friendly', 'neutral', 'hostile')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_quest (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  summary TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_quest_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_quest_name_present_check CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_quest_objective (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  quest_id BIGINT NOT NULL REFERENCES dnd5e_quest(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quest_id, key),
  CONSTRAINT dnd5e_quest_objective_key_present_check CHECK (btrim(key) <> ''),
  CONSTRAINT dnd5e_quest_objective_title_present_check CHECK (btrim(title) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_character_quest (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  quest_id BIGINT NOT NULL REFERENCES dnd5e_quest(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, character_id, quest_id),
  CONSTRAINT dnd5e_character_quest_status_check CHECK (
    status IN ('available', 'active', 'completed', 'failed', 'abandoned')
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_character_objective (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_quest_id BIGINT NOT NULL REFERENCES dnd5e_character_quest(id) ON DELETE CASCADE,
  objective_id BIGINT NOT NULL REFERENCES dnd5e_quest_objective(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'locked',
  progress_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (character_quest_id, objective_id),
  CONSTRAINT dnd5e_character_objective_status_check CHECK (
    status IN ('locked', 'active', 'completed', 'failed')
  ),
  CONSTRAINT dnd5e_character_objective_progress_count_check CHECK (progress_count >= 0)
);

CREATE TABLE IF NOT EXISTS dnd5e_campaign_flag (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL,
  flag_value_json JSONB NOT NULL DEFAULT 'true'::jsonb,
  notes TEXT,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, flag_key),
  CONSTRAINT dnd5e_campaign_flag_key_present_check CHECK (btrim(flag_key) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_character_flag (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL,
  flag_value_json JSONB NOT NULL DEFAULT 'true'::jsonb,
  notes TEXT,
  source_type VARCHAR(50),
  source_entity_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, character_id, flag_key),
  CONSTRAINT dnd5e_character_flag_key_present_check CHECK (btrim(flag_key) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_transition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  from_scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  to_scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  transition_key VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default_path BOOLEAN NOT NULL DEFAULT FALSE,
  recommendation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_scene_id, transition_key),
  CONSTRAINT dnd5e_scene_transition_key_present_check CHECK (btrim(transition_key) <> ''),
  CONSTRAINT dnd5e_scene_transition_label_present_check CHECK (btrim(label) <> '')
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_interaction (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scene_id BIGINT NOT NULL REFERENCES dnd5e_scene(id) ON DELETE CASCADE,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  interaction_key VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  interaction_type VARCHAR(50) NOT NULL DEFAULT 'skill_check',
  skill_id BIGINT REFERENCES dnd5e_skill(id) ON DELETE RESTRICT,
  difficulty_class INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_repeatable BOOLEAN NOT NULL DEFAULT FALSE,
  availability_conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_text TEXT,
  failure_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene_id, interaction_key),
  CONSTRAINT dnd5e_scene_interaction_key_present_check CHECK (btrim(interaction_key) <> ''),
  CONSTRAINT dnd5e_scene_interaction_label_present_check CHECK (btrim(label) <> ''),
  CONSTRAINT dnd5e_scene_interaction_type_check CHECK (
    interaction_type IN ('skill_check')
  ),
  CONSTRAINT dnd5e_scene_interaction_difficulty_class_check CHECK (difficulty_class >= 1)
);

CREATE TABLE IF NOT EXISTS dnd5e_scene_interaction_result (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  interaction_id BIGINT NOT NULL REFERENCES dnd5e_scene_interaction(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  npc_id BIGINT REFERENCES dnd5e_npc(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  skill_id BIGINT REFERENCES dnd5e_skill(id) ON DELETE RESTRICT,
  difficulty_class INTEGER NOT NULL,
  roll_value INTEGER NOT NULL,
  skill_modifier INTEGER NOT NULL,
  total_value INTEGER NOT NULL,
  was_success BOOLEAN NOT NULL,
  result_summary TEXT,
  applied_effects_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_scene_interaction_result_roll_value_check CHECK (
    roll_value >= 1 AND roll_value <= 20
  )
);

CREATE TABLE IF NOT EXISTS dnd5e_campaign_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id BIGINT NOT NULL REFERENCES dnd5e_campaign(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES dnd5e_character(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES account(id) ON DELETE SET NULL,
  log_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_campaign_log_type_check CHECK (
    log_type IN (
      'character_joined',
      'scene_entered',
      'scene_moved',
      'interaction_attempted',
      'flag_changed',
      'quest_updated',
      'objective_updated',
      'npc_state_changed',
      'system'
    )
  ),
  CONSTRAINT dnd5e_campaign_log_message_present_check CHECK (btrim(message) <> '')
);

ALTER TABLE dnd5e_character_scene_history
  DROP CONSTRAINT IF EXISTS dnd5e_character_scene_history_transition_id_fkey;

ALTER TABLE dnd5e_character_scene_history
  ADD CONSTRAINT dnd5e_character_scene_history_transition_id_fkey
  FOREIGN KEY (transition_id)
  REFERENCES dnd5e_scene_transition(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_character_current_scene_id
  ON dnd5e_campaign_character(current_scene_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_scene_history_character_id_created_at
  ON dnd5e_character_scene_history(character_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_location_id
  ON dnd5e_scene(location_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_starting
  ON dnd5e_scene(is_starting_scene, is_active);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_npc_scene_id
  ON dnd5e_scene_npc(scene_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_transition_from_scene_id
  ON dnd5e_scene_transition(from_scene_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_interaction_scene_id
  ON dnd5e_scene_interaction(scene_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_scene_interaction_result_character_id_created_at
  ON dnd5e_scene_interaction_result(character_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_quest_character_id
  ON dnd5e_character_quest(character_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_objective_character_quest_id
  ON dnd5e_character_objective(character_quest_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_flag_campaign_id
  ON dnd5e_campaign_flag(campaign_id, flag_key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_flag_character_id
  ON dnd5e_character_flag(character_id, flag_key);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_npc_state_campaign_id
  ON dnd5e_campaign_npc_state(campaign_id, npc_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_campaign_log_campaign_id_created_at
  ON dnd5e_campaign_log(campaign_id, created_at DESC, id DESC);

INSERT INTO dnd5e_location (
  key,
  name,
  description,
  region_name
)
SELECT
  'willowmere-hinterlands',
  'Willowmere Hinterlands',
  'A frontier stretch of road, scrubland, and half-remembered waystones on the edge of settled lands.',
  'Willowmere'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_location
  WHERE key = 'willowmere-hinterlands'
);

INSERT INTO dnd5e_scene (
  location_id,
  key,
  name,
  summary,
  description,
  entry_text,
  is_starting_scene,
  entry_conditions_json
)
SELECT
  location.id,
  scene_data.key,
  scene_data.name,
  scene_data.summary,
  scene_data.description,
  scene_data.entry_text,
  scene_data.is_starting_scene,
  scene_data.entry_conditions_json
FROM dnd5e_location location
JOIN (
  VALUES
    (
      'willowmere_square',
      'Willowmere Square',
      'The quiet heart of Willowmere, watched over by a weathered elder and a cracked standing stone.',
      'Merchants are sparse, the air smells faintly of rain, and Elder Rowan keeps a careful eye on newcomers.',
      'You arrive in Willowmere Square as the evening bells settle over the market stalls.',
      TRUE,
      '{}'::jsonb
    ),
    (
      'waystone_road',
      'Waystone Road',
      'An old trade road where ancient stones hum beneath the wind.',
      'Mossy waystones line the road. Strange glyphs shimmer when you look at them from the corner of your eye.',
      'The road grows quieter as the waystones begin to thrum around you.',
      FALSE,
      '{"required_campaign_flags":{"waystone_story_started":true}}'::jsonb
    ),
    (
      'smugglers_cut',
      'Smuggler''s Cut',
      'A narrow ravine path used by those who prefer not to be seen.',
      'Bootprints disappear into damp soil and the walls of the cut make every whisper feel conspiratorial.',
      'You slip away from the square and into a hidden path worn by secret travelers.',
      FALSE,
      '{}'::jsonb
    )
) AS scene_data (
  key,
  name,
  summary,
  description,
  entry_text,
  is_starting_scene,
  entry_conditions_json
) ON TRUE
WHERE location.key = 'willowmere-hinterlands'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_scene existing
    WHERE existing.key = scene_data.key
  );

INSERT INTO dnd5e_npc (
  key,
  name,
  npc_type,
  disposition,
  role,
  description
)
SELECT
  npc_data.key,
  npc_data.name,
  npc_data.npc_type,
  npc_data.disposition,
  npc_data.role,
  npc_data.description
FROM (
  VALUES
    (
      'elder_rowan',
      'Elder Rowan',
      'humanoid',
      'neutral',
      'quest_giver',
      'A cautious village elder who watches strangers closely but still believes Willowmere can be defended.'
    ),
    (
      'nyx_scout',
      'Nyx Scout',
      'humanoid',
      'neutral',
      'lookout',
      'A silent scout who studies the road from the shadows of the cut.'
    )
) AS npc_data (
  key,
  name,
  npc_type,
  disposition,
  role,
  description
)
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_npc existing
  WHERE existing.key = npc_data.key
);

INSERT INTO dnd5e_npc_stat_block (
  npc_id,
  armor_class,
  max_hit_points,
  current_hit_points,
  speed,
  strength,
  dexterity,
  constitution,
  intelligence,
  wisdom,
  charisma,
  proficiency_bonus
)
SELECT
  npc.id,
  stat_data.armor_class,
  stat_data.max_hit_points,
  stat_data.current_hit_points,
  stat_data.speed,
  stat_data.strength,
  stat_data.dexterity,
  stat_data.constitution,
  stat_data.intelligence,
  stat_data.wisdom,
  stat_data.charisma,
  stat_data.proficiency_bonus
FROM dnd5e_npc npc
JOIN (
  VALUES
    ('elder_rowan', 10, 18, 18, 30, 10, 10, 12, 12, 14, 15, 2),
    ('nyx_scout', 13, 16, 16, 30, 10, 14, 12, 11, 12, 11, 2)
  ) AS stat_data (
    npc_key,
    armor_class,
    max_hit_points,
    current_hit_points,
    speed,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    proficiency_bonus
  ) ON stat_data.npc_key = npc.key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_npc_stat_block existing
  WHERE existing.npc_id = npc.id
);

INSERT INTO dnd5e_scene_npc (
  scene_id,
  npc_id,
  presence_text,
  sort_order,
  availability_conditions_json
)
SELECT
  scene.id,
  npc.id,
  scene_npc_data.presence_text,
  scene_npc_data.sort_order,
  scene_npc_data.availability_conditions_json
FROM dnd5e_scene scene
JOIN (
  VALUES
    (
      'willowmere_square',
      'elder_rowan',
      'Elder Rowan stands near the broken waystone, measuring every traveler who crosses the square.',
      1,
      '{}'::jsonb
    ),
    (
      'smugglers_cut',
      'nyx_scout',
      'A cloaked scout lingers near the rocks, ready to vanish if approached carelessly.',
      1,
      '{}'::jsonb
    )
) AS scene_npc_data (
  scene_key,
  npc_key,
  presence_text,
  sort_order,
  availability_conditions_json
) ON scene_npc_data.scene_key = scene.key
JOIN dnd5e_npc npc ON npc.key = scene_npc_data.npc_key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_scene_npc existing
  WHERE existing.scene_id = scene.id
    AND existing.npc_id = npc.id
);

INSERT INTO dnd5e_quest (
  key,
  name,
  summary,
  description
)
SELECT
  'waystone_whispers',
  'Waystone Whispers',
  'Earn Rowan''s trust and learn why Willowmere''s waystones have begun to stir.',
  'Ancient stones on the road outside Willowmere are waking. Elder Rowan wants proof before panic takes hold.'
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_quest
  WHERE key = 'waystone_whispers'
);

INSERT INTO dnd5e_quest_objective (
  quest_id,
  key,
  title,
  description,
  sort_order
)
SELECT
  quest.id,
  objective_data.key,
  objective_data.title,
  objective_data.description,
  objective_data.sort_order
FROM dnd5e_quest quest
JOIN (
  VALUES
    (
      'earn_rowan_trust',
      'Earn Rowan''s trust',
      'Convince Elder Rowan that you can help Willowmere.',
      1
    ),
    (
      'investigate_waystone',
      'Investigate the humming waystone',
      'Travel the old road and study the glyphs carved into the waystone.',
      2
    )
) AS objective_data (
  key,
  title,
  description,
  sort_order
) ON TRUE
WHERE quest.key = 'waystone_whispers'
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_quest_objective existing
    WHERE existing.quest_id = quest.id
      AND existing.key = objective_data.key
  );

INSERT INTO dnd5e_scene_transition (
  from_scene_id,
  to_scene_id,
  transition_key,
  label,
  description,
  sort_order,
  is_default_path,
  recommendation_json,
  conditions_json
)
SELECT
  from_scene.id,
  to_scene.id,
  transition_data.transition_key,
  transition_data.label,
  transition_data.description,
  transition_data.sort_order,
  transition_data.is_default_path,
  transition_data.recommendation_json,
  transition_data.conditions_json
FROM (
  VALUES
    (
      'willowmere_square',
      'waystone_road',
      'follow_waystone_road',
      'Follow the waystone road',
      'Leave the square and trace the old road toward the humming stones.',
      1,
      TRUE,
      '{"preferred_alignment_abbreviations":["LG","NG","CG","LN","N"]}'::jsonb,
      '{"required_character_flags":{"rowan_trust":true}}'::jsonb
    ),
    (
      'willowmere_square',
      'smugglers_cut',
      'slip_into_smugglers_cut',
      'Slip into Smuggler''s Cut',
      'Take the shadowed path that skirts the village and its questions.',
      2,
      FALSE,
      '{"preferred_alignment_abbreviations":["CN","NE","CE"]}'::jsonb,
      '{}'::jsonb
    ),
    (
      'waystone_road',
      'willowmere_square',
      'return_to_square',
      'Return to Willowmere Square',
      'Head back to the square and report what you found.',
      1,
      FALSE,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'smugglers_cut',
      'willowmere_square',
      'return_to_square',
      'Return to Willowmere Square',
      'Climb out of the cut and head back toward the market square.',
      1,
      FALSE,
      '{}'::jsonb,
      '{}'::jsonb
    )
) AS transition_data (
  from_scene_key,
  to_scene_key,
  transition_key,
  label,
  description,
  sort_order,
  is_default_path,
  recommendation_json,
  conditions_json
) 
JOIN dnd5e_scene from_scene ON from_scene.key = transition_data.from_scene_key
JOIN dnd5e_scene to_scene ON to_scene.key = transition_data.to_scene_key
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_scene_transition existing
  WHERE existing.from_scene_id = from_scene.id
    AND existing.transition_key = transition_data.transition_key
);

INSERT INTO dnd5e_scene_interaction (
  scene_id,
  npc_id,
  interaction_key,
  label,
  description,
  interaction_type,
  skill_id,
  difficulty_class,
  sort_order,
  is_repeatable,
  availability_conditions_json,
  success_effects_json,
  failure_effects_json,
  success_text,
  failure_text
)
SELECT
  scene.id,
  npc.id,
  interaction_data.interaction_key,
  interaction_data.label,
  interaction_data.description,
  'skill_check',
  skill.id,
  interaction_data.difficulty_class,
  interaction_data.sort_order,
  interaction_data.is_repeatable,
  interaction_data.availability_conditions_json,
  interaction_data.success_effects_json,
  interaction_data.failure_effects_json,
  interaction_data.success_text,
  interaction_data.failure_text
FROM (
  VALUES
    (
      'willowmere_square',
      'elder_rowan',
      'calm_rowan',
      'Calm Rowan''s doubts',
      'Appeal to Elder Rowan''s sense of duty and persuade him that you can help.',
      'persuasion',
      12,
      1,
      FALSE,
      '{}'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_trust":true},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"friendly","notes":"Rowan now trusts this character."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[
          {"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"completed","progress_count":1},
          {"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}
        ],
        "xp":25
      }'::jsonb,
      '{
        "campaign_flags":{"waystone_story_started":true},
        "character_flags":{"rowan_trust":false},
        "npc_states":[{"npc_key":"elder_rowan","disposition":"neutral","notes":"Rowan remains unconvinced."}],
        "quests":[{"quest_key":"waystone_whispers","status":"active"}],
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"earn_rowan_trust","status":"active","progress_count":0}],
        "xp":5
      }'::jsonb,
      'Rowan exhales, nods once, and trusts you enough to share what he knows about the waystone road.',
      'Rowan stays guarded, offering only a warning to tread carefully beyond the village.'
    ),
    (
      'waystone_road',
      NULL,
      'study_waystone',
      'Study the waystone glyphs',
      'Examine the humming glyphs and try to understand what has awakened them.',
      'investigation',
      11,
      1,
      FALSE,
      '{
        "required_campaign_flags":{"waystone_story_started":true},
        "required_objective_states":[{"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active"}]
      }'::jsonb,
      '{
        "campaign_flags":{"waystone_glyphs_understood":true},
        "character_flags":{"waystone_clue_found":true},
        "quests":[{"quest_key":"waystone_whispers","status":"completed"}],
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"completed","progress_count":1}],
        "xp":20
      }'::jsonb,
      '{
        "character_flags":{"waystone_clue_found":false},
        "objectives":[{"quest_key":"waystone_whispers","objective_key":"investigate_waystone","status":"active","progress_count":0}],
        "xp":5
      }'::jsonb,
      'The glyphs resolve into a warning: the waystones answer to will, not just bloodline.',
      'The glyphs blur before you can grasp their meaning, leaving only a faint ache behind your eyes.'
    )
) AS interaction_data (
  scene_key,
  npc_key,
  interaction_key,
  label,
  description,
  skill_slug,
  difficulty_class,
  sort_order,
  is_repeatable,
  availability_conditions_json,
  success_effects_json,
  failure_effects_json,
  success_text,
  failure_text
) 
JOIN dnd5e_scene scene ON scene.key = interaction_data.scene_key
LEFT JOIN dnd5e_npc npc ON npc.key = interaction_data.npc_key
JOIN dnd5e_skill skill ON skill.slug = interaction_data.skill_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM dnd5e_scene_interaction existing
  WHERE existing.scene_id = scene.id
    AND existing.interaction_key = interaction_data.interaction_key
);

COMMIT;
