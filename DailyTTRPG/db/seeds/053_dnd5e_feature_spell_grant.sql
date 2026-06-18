WITH data(feature_slug, spell_slug, grant_type, granted_at_level, notes) AS (
  VALUES
    ('high-elf-cantrip', 'mage-hand', 'known', 1, 'Representative SRD cantrip for high elf starter content.'),
    ('minor-illusion-grant', 'minor-illusion', 'known', 1, 'Forest gnome racial cantrip.'),
    ('tiefling-legacy', 'thaumaturgy', 'known', 1, 'Tiefling racial cantrip.'),
    ('tiefling-legacy', 'hellish-rebuke', 'known', 3, 'Tiefling racial spell.'),
    ('tiefling-legacy', 'darkness', 'known', 5, 'Tiefling racial spell.')
)
INSERT INTO dnd5e_feature_spell_grant (feature_id, spell_id, grant_type, granted_at_level, notes)
SELECT f.id, s.id, d.grant_type, d.granted_at_level, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug
JOIN dnd5e_spell s ON s.slug = d.spell_slug
ON CONFLICT (feature_id, spell_id, grant_type, granted_at_level) DO UPDATE
SET notes = EXCLUDED.notes;
