DO $$
BEGIN
  IF EXISTS (
    WITH data(race_slug, name, slug, description, source, is_active) AS (
      VALUES
        ('dwarf', 'Hill Dwarf', 'hill-dwarf', 'A resilient dwarf line known for wisdom and toughness.', 'SRD 5.1', TRUE),
        ('dwarf', 'Mountain Dwarf', 'mountain-dwarf', 'A hardy dwarf line known for martial training and strength.', 'SRD 5.1', TRUE),
        ('elf', 'High Elf', 'high-elf', 'An elven people known for scholarship and cantrips.', 'SRD 5.1', TRUE),
        ('elf', 'Wood Elf', 'wood-elf', 'An elven people known for keen senses and swift movement.', 'SRD 5.1', TRUE),
        ('gnome', 'Forest Gnome', 'forest-gnome', 'A subtle gnome line with natural magic and woodland affinity.', 'SRD 5.1', TRUE),
        ('gnome', 'Rock Gnome', 'rock-gnome', 'A practical gnome line drawn to invention and craft.', 'SRD 5.1', TRUE),
        ('halfling', 'Lightfoot Halfling', 'lightfoot-halfling', 'A sociable halfling line that can hide with ease.', 'SRD 5.1', TRUE),
        ('halfling', 'Stout Halfling', 'stout-halfling', 'A sturdy halfling line known for poison resistance.', 'SRD 5.1', TRUE)
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_race r ON r.slug = d.race_slug
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing race reference while seeding dnd5e_subrace';
  END IF;
END $$;

WITH data(race_slug, name, slug, description, source, is_active) AS (
  VALUES
    ('dwarf', 'Hill Dwarf', 'hill-dwarf', 'A resilient dwarf line known for wisdom and toughness.', 'SRD 5.1', TRUE),
    ('dwarf', 'Mountain Dwarf', 'mountain-dwarf', 'A hardy dwarf line known for martial training and strength.', 'SRD 5.1', TRUE),
    ('elf', 'High Elf', 'high-elf', 'An elven people known for scholarship and cantrips.', 'SRD 5.1', TRUE),
    ('elf', 'Wood Elf', 'wood-elf', 'An elven people known for keen senses and swift movement.', 'SRD 5.1', TRUE),
    ('gnome', 'Forest Gnome', 'forest-gnome', 'A subtle gnome line with natural magic and woodland affinity.', 'SRD 5.1', TRUE),
    ('gnome', 'Rock Gnome', 'rock-gnome', 'A practical gnome line drawn to invention and craft.', 'SRD 5.1', TRUE),
    ('halfling', 'Lightfoot Halfling', 'lightfoot-halfling', 'A sociable halfling line that can hide with ease.', 'SRD 5.1', TRUE),
    ('halfling', 'Stout Halfling', 'stout-halfling', 'A sturdy halfling line known for poison resistance.', 'SRD 5.1', TRUE)
)
INSERT INTO dnd5e_subrace (race_id, name, slug, description, source, is_active)
SELECT r.id, d.name, d.slug, d.description, d.source, d.is_active
FROM data d
JOIN dnd5e_race r ON r.slug = d.race_slug
ON CONFLICT (slug) DO UPDATE
SET
  race_id = EXCLUDED.race_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
