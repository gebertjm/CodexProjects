INSERT INTO dnd5e_language (name, slug, script, is_exotic, description, source, is_active)
VALUES
  ('Common', 'common', 'Common', FALSE, 'The trade tongue used across most civilized lands.', 'SRD 5.1', TRUE),
  ('Dwarvish', 'dwarvish', 'Dwarvish', FALSE, 'The language of dwarves and many stonefolk.', 'SRD 5.1', TRUE),
  ('Elvish', 'elvish', 'Elvish', FALSE, 'The flowing language of elves.', 'SRD 5.1', TRUE),
  ('Giant', 'giant', 'Dwarvish', FALSE, 'The speech of giants and related beings.', 'SRD 5.1', TRUE),
  ('Gnomish', 'gnomish', 'Dwarvish', FALSE, 'The language of gnomes.', 'SRD 5.1', TRUE),
  ('Goblin', 'goblin', 'Dwarvish', FALSE, 'The language of goblinoids.', 'SRD 5.1', TRUE),
  ('Halfling', 'halfling', 'Common', FALSE, 'The language of halflings.', 'SRD 5.1', TRUE),
  ('Orc', 'orc', 'Dwarvish', FALSE, 'The rough language of orcs.', 'SRD 5.1', TRUE),
  ('Abyssal', 'abyssal', 'Infernal', TRUE, 'The language of demons.', 'SRD 5.1', TRUE),
  ('Celestial', 'celestial', 'Celestial', TRUE, 'The language of celestials.', 'SRD 5.1', TRUE),
  ('Draconic', 'draconic', 'Draconic', TRUE, 'The ancient language of dragons.', 'SRD 5.1', TRUE),
  ('Deep Speech', 'deep-speech', NULL, TRUE, 'The language of aberrations and the Underdark.', 'SRD 5.1', TRUE),
  ('Infernal', 'infernal', 'Infernal', TRUE, 'The language of devils.', 'SRD 5.1', TRUE),
  ('Primordial', 'primordial', 'Dwarvish', TRUE, 'The language of elemental creatures.', 'SRD 5.1', TRUE),
  ('Sylvan', 'sylvan', 'Elvish', TRUE, 'The language of fey creatures.', 'SRD 5.1', TRUE),
  ('Undercommon', 'undercommon', 'Elvish', TRUE, 'A trade language of the Underdark.', 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  script = EXCLUDED.script,
  is_exotic = EXCLUDED.is_exotic,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
