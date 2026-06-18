DELETE FROM dnd5e_feature_sense_grant;

WITH data(feature_slug, sense_type, range_feet, notes) AS (
  VALUES
    ('darkvision', 'darkvision', 60, 'Standard darkvision range for seeded races.')
)
INSERT INTO dnd5e_feature_sense_grant (feature_id, sense_type, range_feet, notes)
SELECT f.id, d.sense_type, d.range_feet, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug;
