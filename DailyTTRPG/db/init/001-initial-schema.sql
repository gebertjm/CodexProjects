BEGIN;

CREATE TABLE IF NOT EXISTS app_boot_log (
  id SERIAL PRIMARY KEY,
  boot_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email VARCHAR(255) UNIQUE,
  phone_number VARCHAR(50) UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  password_hash VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_contact_check CHECK (
    email IS NOT NULL OR phone_number IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS ruleset (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_ruleset (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  ruleset_id BIGINT NOT NULL REFERENCES ruleset(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, ruleset_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_ability_score_type (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dnd5e_alignment (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  abbreviation VARCHAR(10) UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_language (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  script VARCHAR(100),
  is_exotic BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_skill (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  ability_score_type_id BIGINT NOT NULL REFERENCES dnd5e_ability_score_type(id)
);

CREATE TABLE IF NOT EXISTS dnd5e_condition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_race (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  size VARCHAR(50),
  base_speed INTEGER,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_subrace (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  race_id BIGINT NOT NULL REFERENCES dnd5e_race(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (race_id, name)
);

CREATE TABLE IF NOT EXISTS dnd5e_class (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  hit_die INTEGER NOT NULL,
  primary_ability_text VARCHAR(255),
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_subclass (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  class_id BIGINT NOT NULL REFERENCES dnd5e_class(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (class_id, name)
);

CREATE TABLE IF NOT EXISTS dnd5e_background (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_feat (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  prerequisites_text TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_spell (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL UNIQUE,
  slug VARCHAR(150) NOT NULL UNIQUE,
  level INTEGER NOT NULL,
  school VARCHAR(100),
  casting_time VARCHAR(100),
  range_text VARCHAR(100),
  duration_text VARCHAR(100),
  components_text VARCHAR(255),
  ritual BOOLEAN NOT NULL DEFAULT FALSE,
  concentration BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_item (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL UNIQUE,
  slug VARCHAR(150) NOT NULL UNIQUE,
  item_type VARCHAR(100),
  rarity VARCHAR(100),
  weight NUMERIC(10, 2),
  value_cp INTEGER,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_weapon (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  item_id BIGINT NOT NULL UNIQUE REFERENCES dnd5e_item(id) ON DELETE CASCADE,
  weapon_category VARCHAR(100),
  damage_dice VARCHAR(50),
  damage_type VARCHAR(50),
  properties_text TEXT,
  range_normal INTEGER,
  range_long INTEGER
);

CREATE TABLE IF NOT EXISTS dnd5e_armor (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  item_id BIGINT NOT NULL UNIQUE REFERENCES dnd5e_item(id) ON DELETE CASCADE,
  armor_category VARCHAR(100),
  armor_class_base INTEGER,
  dex_bonus_rule VARCHAR(100),
  strength_requirement INTEGER,
  stealth_disadvantage BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS dnd5e_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  feature_type VARCHAR(50) NOT NULL,
  description TEXT,
  source VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dnd5e_race_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  race_id BIGINT NOT NULL REFERENCES dnd5e_race(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  granted_at_level INTEGER,
  display_order INTEGER,
  UNIQUE (race_id, feature_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_subrace_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  subrace_id BIGINT NOT NULL REFERENCES dnd5e_subrace(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  granted_at_level INTEGER,
  display_order INTEGER,
  UNIQUE (subrace_id, feature_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_class_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  class_id BIGINT NOT NULL REFERENCES dnd5e_class(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  granted_at_level INTEGER NOT NULL,
  display_order INTEGER,
  UNIQUE (class_id, feature_id, granted_at_level)
);

CREATE TABLE IF NOT EXISTS dnd5e_subclass_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  subclass_id BIGINT NOT NULL REFERENCES dnd5e_subclass(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  granted_at_level INTEGER NOT NULL,
  display_order INTEGER,
  UNIQUE (subclass_id, feature_id, granted_at_level)
);

CREATE TABLE IF NOT EXISTS dnd5e_background_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  background_id BIGINT NOT NULL REFERENCES dnd5e_background(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  display_order INTEGER,
  UNIQUE (background_id, feature_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_feat_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feat_id BIGINT NOT NULL REFERENCES dnd5e_feat(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  display_order INTEGER,
  UNIQUE (feat_id, feature_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_ability_modifier (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  ability_score_type_id BIGINT NOT NULL REFERENCES dnd5e_ability_score_type(id),
  modifier_value INTEGER NOT NULL,
  modifier_type VARCHAR(50) NOT NULL DEFAULT 'bonus',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_skill_proficiency (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  skill_id BIGINT NOT NULL REFERENCES dnd5e_skill(id),
  proficiency_type VARCHAR(50) NOT NULL DEFAULT 'proficient',
  notes TEXT,
  UNIQUE (feature_id, skill_id, proficiency_type)
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_language_grant (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES dnd5e_language(id),
  notes TEXT,
  UNIQUE (feature_id, language_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_spell_grant (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  spell_id BIGINT NOT NULL REFERENCES dnd5e_spell(id),
  grant_type VARCHAR(50) NOT NULL,
  granted_at_level INTEGER,
  notes TEXT,
  UNIQUE (feature_id, spell_id, grant_type, granted_at_level)
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_speed_modifier (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  speed_type VARCHAR(50) NOT NULL,
  modifier_value INTEGER NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_sense_grant (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  sense_type VARCHAR(50) NOT NULL,
  range_feet INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_resistance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  resistance_type VARCHAR(50) NOT NULL,
  damage_type VARCHAR(50),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_character (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  ruleset_version VARCHAR(50),
  race_id BIGINT REFERENCES dnd5e_race(id),
  subrace_id BIGINT REFERENCES dnd5e_subrace(id),
  class_id BIGINT REFERENCES dnd5e_class(id),
  subclass_id BIGINT REFERENCES dnd5e_subclass(id),
  background_id BIGINT REFERENCES dnd5e_background(id),
  alignment_id BIGINT REFERENCES dnd5e_alignment(id),
  level INTEGER NOT NULL DEFAULT 1,
  experience_points INTEGER NOT NULL DEFAULT 0,
  strength INTEGER NOT NULL DEFAULT 10,
  dexterity INTEGER NOT NULL DEFAULT 10,
  constitution INTEGER NOT NULL DEFAULT 10,
  intelligence INTEGER NOT NULL DEFAULT 10,
  wisdom INTEGER NOT NULL DEFAULT 10,
  charisma INTEGER NOT NULL DEFAULT 10,
  max_hit_points INTEGER,
  current_hit_points INTEGER,
  temporary_hit_points INTEGER NOT NULL DEFAULT 0,
  armor_class INTEGER,
  speed INTEGER,
  proficiency_bonus INTEGER,
  inspiration BOOLEAN NOT NULL DEFAULT FALSE,
  personality_traits TEXT,
  ideals TEXT,
  bonds TEXT,
  flaws TEXT,
  backstory TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_character_level_check CHECK (level >= 1),
  CONSTRAINT dnd5e_character_xp_check CHECK (experience_points >= 0)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_class (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  class_id BIGINT NOT NULL REFERENCES dnd5e_class(id),
  subclass_id BIGINT REFERENCES dnd5e_subclass(id),
  class_level INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (character_id, class_id),
  CONSTRAINT dnd5e_character_class_level_check CHECK (class_level >= 1)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_language (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES dnd5e_language(id),
  UNIQUE (character_id, language_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_feat (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  feat_id BIGINT NOT NULL REFERENCES dnd5e_feat(id),
  acquired_level INTEGER,
  notes TEXT,
  UNIQUE (character_id, feat_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_feature (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id),
  source_type VARCHAR(50),
  source_id BIGINT,
  notes TEXT,
  -- Narrow correction: Postgres UNIQUE allows repeated NULL combinations, so this
  -- preserves the intended uniqueness even when source_type/source_id are null.
  UNIQUE NULLS NOT DISTINCT (character_id, feature_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_item (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES dnd5e_item(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  is_attuned BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  CONSTRAINT dnd5e_character_item_quantity_check CHECK (quantity >= 1)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_spell (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  spell_id BIGINT NOT NULL REFERENCES dnd5e_spell(id),
  spell_source VARCHAR(50),
  is_known BOOLEAN NOT NULL DEFAULT TRUE,
  is_prepared BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  UNIQUE (character_id, spell_id)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_condition (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  condition_id BIGINT NOT NULL REFERENCES dnd5e_condition(id),
  source_text TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dnd5e_feature_choice (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  feature_id BIGINT NOT NULL REFERENCES dnd5e_feature(id) ON DELETE CASCADE,
  choice_type VARCHAR(50) NOT NULL,
  choice_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  CONSTRAINT dnd5e_feature_choice_count_check CHECK (choice_count >= 1)
);

CREATE TABLE IF NOT EXISTS dnd5e_character_feature_choice (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  feature_choice_id BIGINT NOT NULL REFERENCES dnd5e_feature_choice(id) ON DELETE CASCADE,
  selected_entity_type VARCHAR(50) NOT NULL,
  selected_entity_id BIGINT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_display_name ON account(display_name);

CREATE INDEX IF NOT EXISTS idx_account_ruleset_account_id ON account_ruleset(account_id);
CREATE INDEX IF NOT EXISTS idx_account_ruleset_ruleset_id ON account_ruleset(ruleset_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_subrace_race_id ON dnd5e_subrace(race_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_subclass_class_id ON dnd5e_subclass(class_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_account_id ON dnd5e_character(account_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_race_id ON dnd5e_character(race_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_class_id ON dnd5e_character(class_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_background_id ON dnd5e_character(background_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_class_character_id ON dnd5e_character_class(character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_item_character_id ON dnd5e_character_item(character_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_spell_character_id ON dnd5e_character_spell(character_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_feat_character_id ON dnd5e_character_feat(character_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_feature_character_id ON dnd5e_character_feature(character_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_character_condition_character_id ON dnd5e_character_condition(character_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_race_feature_race_id ON dnd5e_race_feature(race_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_subrace_feature_subrace_id ON dnd5e_subrace_feature(subrace_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_class_feature_class_id ON dnd5e_class_feature(class_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_subclass_feature_subclass_id ON dnd5e_subclass_feature(subclass_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_background_feature_background_id ON dnd5e_background_feature(background_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_feat_feature_feat_id ON dnd5e_feat_feature(feat_id);

CREATE INDEX IF NOT EXISTS idx_dnd5e_feature_ability_modifier_feature_id ON dnd5e_feature_ability_modifier(feature_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_feature_skill_proficiency_feature_id ON dnd5e_feature_skill_proficiency(feature_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_feature_language_grant_feature_id ON dnd5e_feature_language_grant(feature_id);
CREATE INDEX IF NOT EXISTS idx_dnd5e_feature_spell_grant_feature_id ON dnd5e_feature_spell_grant(feature_id);

COMMIT;
