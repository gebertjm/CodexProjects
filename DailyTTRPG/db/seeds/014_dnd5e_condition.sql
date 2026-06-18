INSERT INTO dnd5e_condition (name, slug, description, source, is_active)
VALUES
  ('Blinded', 'blinded', 'A blinded creature cannot see and automatically fails sight-based checks.', 'SRD 5.1', TRUE),
  ('Charmed', 'charmed', 'A charmed creature cannot attack the charmer or target it with harmful abilities.', 'SRD 5.1', TRUE),
  ('Deafened', 'deafened', 'A deafened creature cannot hear and automatically fails hearing-based checks.', 'SRD 5.1', TRUE),
  ('Exhaustion', 'exhaustion', 'Exhaustion imposes escalating penalties as levels increase.', 'SRD 5.1', TRUE),
  ('Frightened', 'frightened', 'A frightened creature has disadvantage while it can see the source of its fear.', 'SRD 5.1', TRUE),
  ('Grappled', 'grappled', 'A grappled creature has speed 0 until the grapple ends.', 'SRD 5.1', TRUE),
  ('Incapacitated', 'incapacitated', 'An incapacitated creature cannot take actions or reactions.', 'SRD 5.1', TRUE),
  ('Invisible', 'invisible', 'An invisible creature cannot be seen without special senses or magic.', 'SRD 5.1', TRUE),
  ('Paralyzed', 'paralyzed', 'A paralyzed creature is incapacitated and cannot move or speak.', 'SRD 5.1', TRUE),
  ('Petrified', 'petrified', 'A petrified creature is transformed into a solid inanimate substance.', 'SRD 5.1', TRUE),
  ('Poisoned', 'poisoned', 'A poisoned creature has disadvantage on attack rolls and ability checks.', 'SRD 5.1', TRUE),
  ('Prone', 'prone', 'A prone creature can only crawl unless it stands up.', 'SRD 5.1', TRUE),
  ('Restrained', 'restrained', 'A restrained creature has speed 0 and disadvantage on Dexterity saves.', 'SRD 5.1', TRUE),
  ('Stunned', 'stunned', 'A stunned creature is incapacitated, cannot move, and can speak only falteringly.', 'SRD 5.1', TRUE),
  ('Unconscious', 'unconscious', 'An unconscious creature is incapacitated and unaware of its surroundings.', 'SRD 5.1', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
