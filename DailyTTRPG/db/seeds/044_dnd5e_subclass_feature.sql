WITH data(subclass_slug, feature_slug, granted_at_level, display_order) AS (
  VALUES
    ('path-of-the-berserker', 'path-of-the-berserker', 3, 1),
    ('college-of-lore', 'college-of-lore', 3, 1),
    ('life-domain', 'life-domain', 1, 1),
    ('circle-of-the-land', 'circle-of-the-land', 2, 1),
    ('champion', 'champion-archetype', 3, 1),
    ('way-of-the-open-hand', 'way-of-the-open-hand', 3, 1),
    ('oath-of-devotion', 'oath-of-devotion', 3, 1),
    ('hunter', 'hunter-archetype', 3, 1),
    ('thief', 'thief-archetype', 3, 1),
    ('draconic-bloodline', 'draconic-bloodline', 1, 1),
    ('the-fiend', 'the-fiend', 1, 1),
    ('school-of-evocation', 'school-of-evocation', 2, 1)
)
INSERT INTO dnd5e_subclass_feature (subclass_id, feature_id, granted_at_level, display_order)
SELECT s.id, f.id, d.granted_at_level, d.display_order
FROM data d
JOIN dnd5e_subclass s ON s.slug = d.subclass_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (subclass_id, feature_id, granted_at_level) DO UPDATE
SET display_order = EXCLUDED.display_order;
