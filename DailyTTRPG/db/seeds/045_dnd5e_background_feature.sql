WITH data(background_slug, feature_slug, display_order) AS (
  VALUES
    ('acolyte', 'shelter-of-the-faithful', 1),
    ('criminal', 'criminal-contact', 1),
    ('folk-hero', 'rustic-hospitality', 1),
    ('noble', 'position-of-privilege', 1),
    ('sage', 'researcher', 1),
    ('soldier', 'military-rank', 1)
)
INSERT INTO dnd5e_background_feature (background_id, feature_id, display_order)
SELECT b.id, f.id, d.display_order
FROM data d
JOIN dnd5e_background b ON b.slug = d.background_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (background_id, feature_id) DO UPDATE
SET display_order = EXCLUDED.display_order;
