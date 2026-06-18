BEGIN;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS phone_number_normalized VARCHAR(50),
  ADD COLUMN IF NOT EXISTS phone_number_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(20) NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS active_character_id BIGINT;

WITH normalized_phone AS (
  SELECT
    id,
    CASE
      WHEN phone_number IS NULL THEN NULL
      ELSE regexp_replace(phone_number, '[^0-9]+', '', 'g')
    END AS digits_only
  FROM account
)
UPDATE account AS a
SET phone_number_normalized = CASE
  WHEN np.digits_only IS NULL OR np.digits_only = '' THEN NULL
  WHEN char_length(np.digits_only) = 10 THEN '+1' || np.digits_only
  WHEN char_length(np.digits_only) = 11 AND left(np.digits_only, 1) = '1' THEN '+' || np.digits_only
  ELSE '+' || np.digits_only
END
FROM normalized_phone AS np
WHERE np.id = a.id
  AND a.phone_number_normalized IS NULL;

WITH ranked_active_characters AS (
  SELECT
    id,
    account_id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY created_at DESC, id DESC
    ) AS rank_in_account
  FROM dnd5e_character
  WHERE is_active = TRUE
)
UPDATE dnd5e_character AS character_row
SET is_active = FALSE
FROM ranked_active_characters AS rac
WHERE rac.id = character_row.id
  AND rac.rank_in_account > 1;

UPDATE account AS a
SET active_character_id = active_character.id
FROM (
  SELECT
    account_id,
    id
  FROM dnd5e_character
  WHERE is_active = TRUE
) AS active_character
WHERE active_character.account_id = a.id;

UPDATE account
SET active_character_id = NULL
WHERE active_character_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dnd5e_character
    WHERE dnd5e_character.id = account.active_character_id
      AND dnd5e_character.account_id = account.id
      AND dnd5e_character.is_active = TRUE
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_active_character_id_fkey'
  ) THEN
    ALTER TABLE account
      ADD CONSTRAINT account_active_character_id_fkey
      FOREIGN KEY (active_character_id)
      REFERENCES dnd5e_character(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_phone_number_normalized_unique
  ON account(phone_number_normalized)
  WHERE phone_number_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnd5e_character_one_active_per_account
  ON dnd5e_character(account_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_account_active_character_id
  ON account(active_character_id);

COMMIT;
