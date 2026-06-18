WITH data(feature_slug, skill_slug, proficiency_type, notes) AS (
  VALUES
    ('keen-senses', 'perception', 'proficient', 'Elf racial skill proficiency.'),
    ('menacing', 'intimidation', 'proficient', 'Half-orc racial skill proficiency.'),
    ('shelter-of-the-faithful', 'insight', 'proficient', 'Acolyte skill proficiency.'),
    ('shelter-of-the-faithful', 'religion', 'proficient', 'Acolyte skill proficiency.'),
    ('criminal-contact', 'deception', 'proficient', 'Criminal skill proficiency.'),
    ('criminal-contact', 'stealth', 'proficient', 'Criminal skill proficiency.'),
    ('rustic-hospitality', 'animal-handling', 'proficient', 'Folk hero skill proficiency.'),
    ('rustic-hospitality', 'survival', 'proficient', 'Folk hero skill proficiency.'),
    ('position-of-privilege', 'history', 'proficient', 'Noble skill proficiency.'),
    ('position-of-privilege', 'persuasion', 'proficient', 'Noble skill proficiency.'),
    ('researcher', 'arcana', 'proficient', 'Sage skill proficiency.'),
    ('researcher', 'history', 'proficient', 'Sage skill proficiency.'),
    ('military-rank', 'athletics', 'proficient', 'Soldier skill proficiency.'),
    ('military-rank', 'intimidation', 'proficient', 'Soldier skill proficiency.')
)
INSERT INTO dnd5e_feature_skill_proficiency (feature_id, skill_id, proficiency_type, notes)
SELECT f.id, s.id, d.proficiency_type, d.notes
FROM data d
JOIN dnd5e_feature f ON f.slug = d.feature_slug
JOIN dnd5e_skill s ON s.slug = d.skill_slug
ON CONFLICT (feature_id, skill_id, proficiency_type) DO UPDATE
SET notes = EXCLUDED.notes;
