WITH data(class_slug, feature_slug, granted_at_level, display_order) AS (
  VALUES
    ('barbarian', 'rage', 1, 1), ('barbarian', 'unarmored-defense-barbarian', 1, 2),
    ('bard', 'bardic-inspiration', 1, 1), ('bard', 'spellcasting-bard', 1, 2),
    ('cleric', 'spellcasting-cleric', 1, 1),
    ('druid', 'druidic', 1, 1), ('druid', 'spellcasting-druid', 1, 2),
    ('fighter', 'fighting-style', 1, 1), ('fighter', 'second-wind', 1, 2),
    ('monk', 'martial-arts', 1, 1), ('monk', 'unarmored-defense-monk', 1, 2),
    ('paladin', 'divine-sense', 1, 1), ('paladin', 'lay-on-hands', 1, 2), ('paladin', 'spellcasting-paladin', 2, 3),
    ('ranger', 'natural-explorer', 1, 1), ('ranger', 'spellcasting-ranger', 2, 2),
    ('rogue', 'sneak-attack', 1, 1), ('rogue', 'thieves-cant', 1, 2),
    ('sorcerer', 'spellcasting-sorcerer', 1, 1),
    ('warlock', 'pact-magic', 1, 1), ('warlock', 'otherworldly-patron', 1, 2),
    ('wizard', 'spellcasting-wizard', 1, 1), ('wizard', 'arcane-recovery', 1, 2)
)
INSERT INTO dnd5e_class_feature (class_id, feature_id, granted_at_level, display_order)
SELECT c.id, f.id, d.granted_at_level, d.display_order
FROM data d
JOIN dnd5e_class c ON c.slug = d.class_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (class_id, feature_id, granted_at_level) DO UPDATE
SET display_order = EXCLUDED.display_order;
