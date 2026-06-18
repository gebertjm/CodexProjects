INSERT INTO dnd5e_background (name, slug, description, source, is_active)
VALUES
  ('Acolyte', 'acolyte', 'A servant of a temple, shrine, or sacred order.', 'SRD 5.1', TRUE),
  ('Criminal', 'criminal', 'A person shaped by black markets, heists, or the underworld.', 'SRD 5.1', TRUE),
  ('Folk Hero', 'folk-hero', 'A champion of common people and local communities.', 'SRD 5.1', TRUE),
  ('Noble', 'noble', 'A person raised among privilege, status, and social influence.', 'SRD 5.1', TRUE),
  ('Sage', 'sage', 'A researcher, student, or collector of knowledge.', 'SRD 5.1', TRUE),
  ('Soldier', 'soldier', 'A veteran of drills, campaigns, and military structure.', 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
