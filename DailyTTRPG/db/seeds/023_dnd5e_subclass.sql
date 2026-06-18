DO $$
BEGIN
  IF EXISTS (
    WITH data(class_slug, name, slug, description, source, is_active) AS (
      VALUES
        ('barbarian', 'Path of the Berserker', 'path-of-the-berserker', 'Barbarians who lose themselves in reckless fury.', 'SRD 5.1', TRUE),
        ('bard', 'College of Lore', 'college-of-lore', 'Bards devoted to broad knowledge and sharp wit.', 'SRD 5.1', TRUE),
        ('cleric', 'Life Domain', 'life-domain', 'Clerics devoted to healing, vitality, and restoration.', 'SRD 5.1', TRUE),
        ('druid', 'Circle of the Land', 'circle-of-the-land', 'Druids tied to ancient natural traditions.', 'SRD 5.1', TRUE),
        ('fighter', 'Champion', 'champion', 'Fighters who pursue straightforward martial excellence.', 'SRD 5.1', TRUE),
        ('monk', 'Way of the Open Hand', 'way-of-the-open-hand', 'Monks who perfect martial technique and inner focus.', 'SRD 5.1', TRUE),
        ('paladin', 'Oath of Devotion', 'oath-of-devotion', 'Paladins devoted to courage, honesty, and justice.', 'SRD 5.1', TRUE),
        ('ranger', 'Hunter', 'hunter', 'Rangers who specialize in bringing down dangerous foes.', 'SRD 5.1', TRUE),
        ('rogue', 'Thief', 'thief', 'Rogues focused on agility, infiltration, and daring skill.', 'SRD 5.1', TRUE),
        ('sorcerer', 'Draconic Bloodline', 'draconic-bloodline', 'Sorcerers whose magic comes from draconic ancestry.', 'SRD 5.1', TRUE),
        ('warlock', 'The Fiend', 'the-fiend', 'Warlocks bound to fiendish patrons.', 'SRD 5.1', TRUE),
        ('wizard', 'School of Evocation', 'school-of-evocation', 'Wizards who master destructive arcane energy.', 'SRD 5.1', TRUE)
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_class c ON c.slug = d.class_slug
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing class reference while seeding dnd5e_subclass';
  END IF;
END $$;

WITH data(class_slug, name, slug, description, source, is_active) AS (
  VALUES
    ('barbarian', 'Path of the Berserker', 'path-of-the-berserker', 'Barbarians who lose themselves in reckless fury.', 'SRD 5.1', TRUE),
    ('bard', 'College of Lore', 'college-of-lore', 'Bards devoted to broad knowledge and sharp wit.', 'SRD 5.1', TRUE),
    ('cleric', 'Life Domain', 'life-domain', 'Clerics devoted to healing, vitality, and restoration.', 'SRD 5.1', TRUE),
    ('druid', 'Circle of the Land', 'circle-of-the-land', 'Druids tied to ancient natural traditions.', 'SRD 5.1', TRUE),
    ('fighter', 'Champion', 'champion', 'Fighters who pursue straightforward martial excellence.', 'SRD 5.1', TRUE),
    ('monk', 'Way of the Open Hand', 'way-of-the-open-hand', 'Monks who perfect martial technique and inner focus.', 'SRD 5.1', TRUE),
    ('paladin', 'Oath of Devotion', 'oath-of-devotion', 'Paladins devoted to courage, honesty, and justice.', 'SRD 5.1', TRUE),
    ('ranger', 'Hunter', 'hunter', 'Rangers who specialize in bringing down dangerous foes.', 'SRD 5.1', TRUE),
    ('rogue', 'Thief', 'thief', 'Rogues focused on agility, infiltration, and daring skill.', 'SRD 5.1', TRUE),
    ('sorcerer', 'Draconic Bloodline', 'draconic-bloodline', 'Sorcerers whose magic comes from draconic ancestry.', 'SRD 5.1', TRUE),
    ('warlock', 'The Fiend', 'the-fiend', 'Warlocks bound to fiendish patrons.', 'SRD 5.1', TRUE),
    ('wizard', 'School of Evocation', 'school-of-evocation', 'Wizards who master destructive arcane energy.', 'SRD 5.1', TRUE)
)
INSERT INTO dnd5e_subclass (class_id, name, slug, description, source, is_active)
SELECT c.id, d.name, d.slug, d.description, d.source, d.is_active
FROM data d
JOIN dnd5e_class c ON c.slug = d.class_slug
ON CONFLICT (slug) DO UPDATE
SET
  class_id = EXCLUDED.class_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
