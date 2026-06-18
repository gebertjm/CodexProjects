WITH data(feature_slug, language_slug, notes) AS (
  VALUES
    ('dwarvish-language', 'dwarvish', 'Dwarf racial language.'),
    ('elvish-language', 'elvish', 'Elf racial language.'),
    ('halfling-language', 'halfling', 'Halfling racial language.'),
    ('draconic-language', 'draconic', 'Dragonborn racial language.'),
    ('gnomish-language', 'gnomish', 'Gnome racial language.'),
    ('orc-language', 'orc', 'Half-orc racial language.'),
    ('infernal-language', 'infernal', 'Tiefling racial language.')
)
INSERT INTO dnd5e_feature_language_grant (feature_id, language_id, notes)
SELECT f.id, l.id, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug
JOIN dnd5e_language l ON l.slug = d.language_slug
ON CONFLICT (feature_id, language_id) DO UPDATE
SET notes = EXCLUDED.notes;
