SELECT key, name
FROM ruleset;

SELECT code, name
FROM dnd5e_ability_score_type
ORDER BY id;

SELECT name
FROM dnd5e_race
ORDER BY name
LIMIT 10;

SELECT name
FROM dnd5e_class
ORDER BY name
LIMIT 10;

SELECT name, level
FROM dnd5e_spell
ORDER BY level, name
LIMIT 20;

SELECT name
FROM dnd5e_item
ORDER BY name
LIMIT 20;

SELECT COUNT(*) AS feature_count
FROM dnd5e_feature;

SELECT r.name AS race_name, f.name AS feature_name
FROM dnd5e_race_feature rf
JOIN dnd5e_race r ON r.id = rf.race_id
JOIN dnd5e_feature f ON f.id = rf.feature_id
WHERE r.slug = 'dwarf'
ORDER BY rf.display_order, f.name;

SELECT f.name AS feature_name, a.code, fam.modifier_value, fam.modifier_type
FROM dnd5e_feature_ability_modifier fam
JOIN dnd5e_feature f ON f.id = fam.feature_id
JOIN dnd5e_ability_score_type a ON a.id = fam.ability_score_type_id
WHERE f.slug = 'human-versatility'
ORDER BY a.id;
