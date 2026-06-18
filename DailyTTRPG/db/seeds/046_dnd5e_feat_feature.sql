WITH data(feat_slug, feature_slug, display_order) AS (
  VALUES
    ('alert', 'alert-feature', 1),
    ('healer', 'healer-feature', 1),
    ('lucky', 'lucky-feature', 1),
    ('mobile', 'mobile-feature', 1),
    ('tough', 'tough-feature', 1),
    ('war-caster', 'war-caster-feature', 1)
)
INSERT INTO dnd5e_feat_feature (feat_id, feature_id, display_order)
SELECT fe.id, f.id, d.display_order
FROM data d
JOIN dnd5e_feat fe ON fe.slug = d.feat_slug
JOIN dnd5e_feature f ON f.slug = d.feature_slug
ON CONFLICT (feat_id, feature_id) DO UPDATE
SET display_order = EXCLUDED.display_order;
