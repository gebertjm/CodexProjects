ALTER TABLE dnd5e_character_item
  ADD COLUMN IF NOT EXISTS parent_character_item_id bigint,
  ADD COLUMN IF NOT EXISTS current_uses integer,
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_character_item_parent_fkey'
  ) THEN
    ALTER TABLE dnd5e_character_item
      ADD CONSTRAINT dnd5e_character_item_parent_fkey
      FOREIGN KEY (parent_character_item_id)
      REFERENCES dnd5e_character_item(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_character_item_parent_not_self_check'
  ) THEN
    ALTER TABLE dnd5e_character_item
      ADD CONSTRAINT dnd5e_character_item_parent_not_self_check
      CHECK (parent_character_item_id IS NULL OR parent_character_item_id <> id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_character_item_uses_nonnegative_check'
  ) THEN
    ALTER TABLE dnd5e_character_item
      ADD CONSTRAINT dnd5e_character_item_uses_nonnegative_check
      CHECK (
        (current_uses IS NULL OR current_uses >= 0)
        AND (max_uses IS NULL OR max_uses >= 0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dnd5e_character_item_uses_bounds_check'
  ) THEN
    ALTER TABLE dnd5e_character_item
      ADD CONSTRAINT dnd5e_character_item_uses_bounds_check
      CHECK (
        (current_uses IS NULL AND max_uses IS NULL)
        OR (current_uses IS NOT NULL AND max_uses IS NOT NULL AND current_uses <= max_uses)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_item_parent_character_item_id
  ON dnd5e_character_item(parent_character_item_id);

CREATE TABLE IF NOT EXISTS dnd5e_character_currency (
  id bigint primary key generated always as identity,
  character_id bigint not null unique references dnd5e_character(id) on delete cascade,
  cp integer not null default 0,
  sp integer not null default 0,
  ep integer not null default 0,
  gp integer not null default 0,
  pp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dnd5e_character_currency_nonnegative_check check (
    cp >= 0
    and sp >= 0
    and ep >= 0
    and gp >= 0
    and pp >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_dnd5e_character_currency_character_id
  ON dnd5e_character_currency(character_id);
