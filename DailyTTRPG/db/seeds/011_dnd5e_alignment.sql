INSERT INTO dnd5e_alignment (name, abbreviation, description)
VALUES
  ('Lawful Good', 'LG', 'Acts with compassion and honor while respecting order.'),
  ('Neutral Good', 'NG', 'Acts kindly with less concern for rules or chaos.'),
  ('Chaotic Good', 'CG', 'Acts with compassion while valuing personal freedom.'),
  ('Lawful Neutral', 'LN', 'Acts according to law, tradition, or personal code.'),
  ('Neutral', 'N', 'Avoids moral extremes and favors balance or pragmatism.'),
  ('Chaotic Neutral', 'CN', 'Follows personal whims and values freedom.'),
  ('Lawful Evil', 'LE', 'Uses order and structure in service of selfish ends.'),
  ('Neutral Evil', 'NE', 'Acts selfishly without loyalty to law or chaos.'),
  ('Chaotic Evil', 'CE', 'Pursues cruelty and destruction with little restraint.')
ON CONFLICT (name) DO UPDATE
SET
  abbreviation = EXCLUDED.abbreviation,
  description = EXCLUDED.description;
