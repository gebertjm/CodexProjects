DELETE FROM dnd5e_feature_resistance;

WITH data(feature_slug, resistance_type, damage_type, notes) AS (
  VALUES
    ('dwarven-resilience', 'damage', 'poison', 'Dwarf poison damage resistance.'),
    ('stout-resilience', 'damage', 'poison', 'Stout halfling poison damage resistance.'),
    ('hellish-resistance', 'damage', 'fire', 'Tiefling fire resistance.')
)
INSERT INTO dnd5e_feature_resistance (feature_id, resistance_type, damage_type, notes)
SELECT f.id, d.resistance_type, d.damage_type, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug;
