INSERT INTO dnd5e_ability_score_type (code, name)
VALUES
  ('STR', 'Strength'),
  ('DEX', 'Dexterity'),
  ('CON', 'Constitution'),
  ('INT', 'Intelligence'),
  ('WIS', 'Wisdom'),
  ('CHA', 'Charisma')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;
