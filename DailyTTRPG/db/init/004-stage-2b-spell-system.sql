BEGIN;

ALTER TABLE dnd5e_character_spell
  ADD COLUMN IF NOT EXISTS source_class_id BIGINT REFERENCES dnd5e_class(id),
  ADD COLUMN IF NOT EXISTS is_always_prepared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_spell_source_class_id
  ON dnd5e_character_spell(source_class_id);

CREATE TABLE IF NOT EXISTS dnd5e_character_spell_slot (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  character_id BIGINT NOT NULL REFERENCES dnd5e_character(id) ON DELETE CASCADE,
  slot_pool VARCHAR(30) NOT NULL DEFAULT 'standard',
  slot_level INTEGER NOT NULL,
  slots_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnd5e_character_spell_slot_pool_check CHECK (slot_pool IN ('standard', 'pact_magic')),
  CONSTRAINT dnd5e_character_spell_slot_level_check CHECK (slot_level BETWEEN 1 AND 9),
  CONSTRAINT dnd5e_character_spell_slot_used_check CHECK (slots_used >= 0),
  UNIQUE (character_id, slot_pool, slot_level)
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_spell_slot_character_id
  ON dnd5e_character_spell_slot(character_id);

COMMIT;
