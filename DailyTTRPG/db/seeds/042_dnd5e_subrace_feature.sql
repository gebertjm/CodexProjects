DO $$
BEGIN
  IF EXISTS (
    WITH data(subrace_slug, feature_slug) AS (
      VALUES
        ('hill-dwarf', 'hill-dwarf-wisdom'), ('hill-dwarf', 'dwarven-toughness'),
        ('mountain-dwarf', 'mountain-dwarf-strength'), ('mountain-dwarf', 'dwarf-armor-training'),
        ('high-elf', 'high-elf-intellect'), ('high-elf', 'high-elf-cantrip'), ('high-elf', 'high-elf-extra-language'), ('high-elf', 'elf-weapon-training'),
        ('wood-elf', 'wood-elf-wisdom'), ('wood-elf', 'fleet-of-foot'), ('wood-elf', 'mask-of-the-wild'), ('wood-elf', 'elf-weapon-training'),
        ('forest-gnome', 'forest-gnome-dexterity'), ('forest-gnome', 'minor-illusion-grant'), ('forest-gnome', 'speak-with-small-beasts'),
        ('rock-gnome', 'rock-gnome-constitution'), ('rock-gnome', 'artificers-lore'), ('rock-gnome', 'tinker'),
        ('lightfoot-halfling', 'lightfoot-charisma'), ('lightfoot-halfling', 'naturally-stealthy'),
        ('stout-halfling', 'stout-constitution'), ('stout-halfling', 'stout-resilience')
    )
    SELECT 1
    FROM data d
    LEFT JOIN dnd5e_subrace s ON s.slug = d.subrace_slug
    LEFT JOIN dnd5e_feature f ON f.slug = d.feature_slug
    WHERE s.id IS NULL OR f.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing subrace or feature reference while seeding dnd5e_subrace_feature';
  END IF;
END $$;

WITH data(subrace_slug, feature_slug, granted_at_level, display_order) AS (
  VALUES
    ('hill-dwarf', 'hill-dwarf-wisdom', 1, 1), ('hill-dwarf', 'dwarven-toughness', 1, 2),
    ('mountain-dwarf', 'mountain-dwarf-strength', 1, 1), ('mountain-dwarf', 'dwarf-armor-training', 1, 2),
    ('high-elf', 'high-elf-intellect', 1, 1), ('high-elf', 'high-elf-cantrip', 1, 2), ('high-elf', 'high-elf-extra-language', 1, 3), ('high-elf', 'elf-weapon-training', 1, 4),
    ('wood-elf', 'wood-elf-wisdom', 1, 1), ('wood-elf', 'fleet-of-foot', 1, 2), ('wood-elf', 'mask-of-the-wild', 1, 3), ('wood-elf', 'elf-weapon-training', 1, 4),
    ('forest-gnome', 'forest-gnome-dexterity', 1, 1), ('forest-gnome', 'minor-illusion-grant', 1, 2), ('forest-gnome', 'speak-with-small-beasts', 1, 3),
    ('rock-gnome', 'rock-gnome-constitution', 1, 1), ('rock-gnome', 'artificers-lore', 1, 2), ('rock-gnome', 'tinker', 1, 3),
    ('lightfoot-halfling', 'lightfoot-charisma', 1, 1), ('lightfoot-halfling', 'naturally-stealthy', 1, 2),
    ('stout-halfling', 'stout-constitution', 1, 1), ('stout-halfling', 'stout-resilience', 1, 2)
)
INSERT INTO dnd5e_subrace_feature (subrace_id, feature_id, granted_at_level, display_order)
SELECT s.id, f.id, d.granted_at_level, d.display_order
FROM data d
JOIN dnd5e_subrace s ON s.slug = d.subrace_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (subrace_id, feature_id) DO UPDATE
SET
  granted_at_level = EXCLUDED.granted_at_level,
  display_order = EXCLUDED.display_order;
