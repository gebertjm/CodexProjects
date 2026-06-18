DELETE FROM dnd5e_feature_speed_modifier;

WITH data(feature_slug, speed_type, modifier_value, operation_type, notes) AS (
  VALUES
    ('fleet-of-foot', 'walk', 5, 'increase', 'Wood elf walking speed bonus.')
)
INSERT INTO dnd5e_feature_speed_modifier (feature_id, speed_type, modifier_value, operation_type, notes)
SELECT f.id, d.speed_type, d.modifier_value, d.operation_type, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug;
