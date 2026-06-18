INSERT INTO dnd5e_class (name, slug, description, hit_die, primary_ability_text, source, is_active)
VALUES
  ('Barbarian', 'barbarian', 'A fierce warrior driven by battle fury.', 12, 'Strength', 'SRD 5.1', TRUE),
  ('Bard', 'bard', 'An inspiring spellcaster whose power echoes through music and story.', 8, 'Charisma', 'SRD 5.1', TRUE),
  ('Cleric', 'cleric', 'A divine spellcaster empowered by devotion.', 8, 'Wisdom', 'SRD 5.1', TRUE),
  ('Druid', 'druid', 'A spellcaster bound to the primal power of nature.', 8, 'Wisdom', 'SRD 5.1', TRUE),
  ('Fighter', 'fighter', 'A master of martial techniques and battlefield discipline.', 10, 'Strength or Dexterity', 'SRD 5.1', TRUE),
  ('Monk', 'monk', 'A disciplined warrior who channels ki through body and mind.', 8, 'Dexterity and Wisdom', 'SRD 5.1', TRUE),
  ('Paladin', 'paladin', 'A holy warrior sworn to sacred ideals.', 10, 'Strength and Charisma', 'SRD 5.1', TRUE),
  ('Ranger', 'ranger', 'A hunter, scout, and guardian of the wilds.', 10, 'Dexterity and Wisdom', 'SRD 5.1', TRUE),
  ('Rogue', 'rogue', 'A precise specialist in stealth, skill, and opportunism.', 8, 'Dexterity', 'SRD 5.1', TRUE),
  ('Sorcerer', 'sorcerer', 'A spellcaster with innate magical power.', 6, 'Charisma', 'SRD 5.1', TRUE),
  ('Warlock', 'warlock', 'A spellcaster whose power comes from a pact with an otherworldly patron.', 8, 'Charisma', 'SRD 5.1', TRUE),
  ('Wizard', 'wizard', 'A scholarly spellcaster who masters arcane theory and practice.', 6, 'Intelligence', 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  hit_die = EXCLUDED.hit_die,
  primary_ability_text = EXCLUDED.primary_ability_text,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
