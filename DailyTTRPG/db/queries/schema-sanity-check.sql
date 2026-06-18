SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dnd5e_character'
ORDER BY ordinal_position;

SELECT code, name
FROM dnd5e_ability_score_type
ORDER BY id;

INSERT INTO account (email, display_name)
VALUES ('schema-test@example.com', 'Schema Test Account')
ON CONFLICT (email) DO UPDATE
SET display_name = EXCLUDED.display_name
RETURNING id, email, display_name;

SELECT a.id, a.display_name, c.name AS character_name
FROM account AS a
LEFT JOIN dnd5e_character AS c
  ON c.account_id = a.id
ORDER BY a.id;
