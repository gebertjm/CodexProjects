INSERT INTO ruleset (key, name, description, is_active)
VALUES (
  'dnd5e',
  'D&D 5e',
  'SRD 5.1 starter ruleset content for DailyRPG phase 1.',
  TRUE
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
