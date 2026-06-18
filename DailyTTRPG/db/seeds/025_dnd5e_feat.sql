INSERT INTO dnd5e_feat (name, slug, description, prerequisites_text, source, is_active)
VALUES
  ('Alert', 'alert', 'You are always on the lookout for danger.', NULL, 'SRD 5.1', TRUE),
  ('Healer', 'healer', 'You are an able physician, letting you mend wounds quickly.', NULL, 'SRD 5.1', TRUE),
  ('Lucky', 'lucky', 'You have inexplicable luck that seems to kick in at just the right moment.', NULL, 'SRD 5.1', TRUE),
  ('Mobile', 'mobile', 'You are exceptionally speedy and agile.', NULL, 'SRD 5.1', TRUE),
  ('Tough', 'tough', 'Your hit point maximum increases beyond the norm.', NULL, 'SRD 5.1', TRUE),
  ('War Caster', 'war-caster', 'You have practiced casting spells in the midst of combat.', 'The ability to cast at least one spell', 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  prerequisites_text = EXCLUDED.prerequisites_text,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
