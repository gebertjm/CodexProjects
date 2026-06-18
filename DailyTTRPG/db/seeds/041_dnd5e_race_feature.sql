DO $$
BEGIN
  IF EXISTS (
    WITH data(race_slug, feature_slug) AS (
      VALUES
        ('dragonborn', 'dragonborn-ability-increase'), ('dragonborn', 'draconic-ancestry'), ('dragonborn', 'breath-weapon'), ('dragonborn', 'draconic-language'),
        ('dwarf', 'darkvision'), ('dwarf', 'dwarven-hardiness'), ('dwarf', 'dwarven-resilience'), ('dwarf', 'stonecunning'), ('dwarf', 'dwarvish-language'),
        ('elf', 'darkvision'), ('elf', 'elven-agility'), ('elf', 'keen-senses'), ('elf', 'fey-ancestry'), ('elf', 'trance'), ('elf', 'elvish-language'),
        ('gnome', 'darkvision'), ('gnome', 'gnome-intelligence'), ('gnome', 'gnome-cunning'), ('gnome', 'gnomish-language'),
        ('half-elf', 'darkvision'), ('half-elf', 'half-elf-charisma'), ('half-elf', 'fey-ancestry'),
        ('half-orc', 'darkvision'), ('half-orc', 'half-orc-might'), ('half-orc', 'menacing'), ('half-orc', 'relentless-endurance'), ('half-orc', 'savage-attacks'), ('half-orc', 'orc-language'),
        ('halfling', 'halfling-agility'), ('halfling', 'halfling-lucky'), ('halfling', 'brave'), ('halfling', 'halfling-nimbleness'), ('halfling', 'halfling-language'),
        ('human', 'human-versatility'),
        ('tiefling', 'darkvision'), ('tiefling', 'tiefling-legacy'), ('tiefling', 'hellish-resistance'), ('tiefling', 'infernal-language')
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_race r ON r.slug = d.race_slug
    LEFT JOIN dnd5e_feature f ON f.slug = d.feature_slug
    WHERE r.id IS NULL OR f.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing race or feature reference while seeding dnd5e_race_feature';
  END IF;
END $$;

WITH data(race_slug, feature_slug, granted_at_level, display_order) AS (
  VALUES
    ('dragonborn', 'dragonborn-ability-increase', 1, 1), ('dragonborn', 'draconic-ancestry', 1, 2), ('dragonborn', 'breath-weapon', 1, 3), ('dragonborn', 'draconic-language', 1, 4),
    ('dwarf', 'darkvision', 1, 1), ('dwarf', 'dwarven-hardiness', 1, 2), ('dwarf', 'dwarven-resilience', 1, 3), ('dwarf', 'stonecunning', 1, 4), ('dwarf', 'dwarvish-language', 1, 5),
    ('elf', 'darkvision', 1, 1), ('elf', 'elven-agility', 1, 2), ('elf', 'keen-senses', 1, 3), ('elf', 'fey-ancestry', 1, 4), ('elf', 'trance', 1, 5), ('elf', 'elvish-language', 1, 6),
    ('gnome', 'darkvision', 1, 1), ('gnome', 'gnome-intelligence', 1, 2), ('gnome', 'gnome-cunning', 1, 3), ('gnome', 'gnomish-language', 1, 4),
    ('half-elf', 'darkvision', 1, 1), ('half-elf', 'half-elf-charisma', 1, 2), ('half-elf', 'fey-ancestry', 1, 3),
    ('half-orc', 'darkvision', 1, 1), ('half-orc', 'half-orc-might', 1, 2), ('half-orc', 'menacing', 1, 3), ('half-orc', 'relentless-endurance', 1, 4), ('half-orc', 'savage-attacks', 1, 5), ('half-orc', 'orc-language', 1, 6),
    ('halfling', 'halfling-agility', 1, 1), ('halfling', 'halfling-lucky', 1, 2), ('halfling', 'brave', 1, 3), ('halfling', 'halfling-nimbleness', 1, 4), ('halfling', 'halfling-language', 1, 5),
    ('human', 'human-versatility', 1, 1),
    ('tiefling', 'darkvision', 1, 1), ('tiefling', 'tiefling-legacy', 1, 2), ('tiefling', 'hellish-resistance', 1, 3), ('tiefling', 'infernal-language', 1, 4)
)
INSERT INTO dnd5e_race_feature (race_id, feature_id, granted_at_level, display_order)
SELECT r.id, f.id, d.granted_at_level, d.display_order
FROM data d
JOIN dnd5e_race r ON r.slug = d.race_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (race_id, feature_id) DO UPDATE
SET
  granted_at_level = EXCLUDED.granted_at_level,
  display_order = EXCLUDED.display_order;
