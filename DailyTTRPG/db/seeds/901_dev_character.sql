DELETE FROM dnd5e_character_condition
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_spell
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_item
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_feature
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_feat
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_language
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character_class
WHERE character_id IN (
  SELECT id FROM dnd5e_character WHERE name = 'Dev Hero'
);

DELETE FROM dnd5e_character
WHERE name = 'Dev Hero';

INSERT INTO dnd5e_character (
  account_id,
  name,
  ruleset_version,
  race_id,
  class_id,
  background_id,
  alignment_id,
  level,
  strength,
  dexterity,
  constitution,
  intelligence,
  wisdom,
  charisma,
  max_hit_points,
  current_hit_points,
  armor_class,
  speed,
  proficiency_bonus,
  inspiration,
  notes,
  is_active
)
SELECT
  a.id,
  'Dev Hero',
  'SRD 5.1',
  r.id,
  c.id,
  b.id,
  al.id,
  1,
  16,
  12,
  14,
  10,
  10,
  10,
  12,
  12,
  16,
  30,
  2,
  FALSE,
  'Development-only sample character for DailyRPG seed testing.',
  TRUE
FROM account a
JOIN dnd5e_race r ON r.slug = 'human'
JOIN dnd5e_class c ON c.slug = 'fighter'
JOIN dnd5e_background b ON b.slug = 'soldier'
JOIN dnd5e_alignment al ON al.abbreviation = 'NG'
WHERE a.email = 'dev@dailyrpg.local';

UPDATE account
SET active_character_id = ch.id,
    updated_at = NOW()
FROM dnd5e_character ch
WHERE account.email = 'dev@dailyrpg.local'
  AND ch.name = 'Dev Hero'
  AND ch.account_id = account.id;

INSERT INTO dnd5e_character_class (character_id, class_id, class_level, is_primary)
SELECT ch.id, c.id, 1, TRUE
FROM dnd5e_character ch
JOIN dnd5e_class c ON c.slug = 'fighter'
WHERE ch.name = 'Dev Hero'
ON CONFLICT (character_id, class_id) DO UPDATE
SET
  class_level = EXCLUDED.class_level,
  is_primary = EXCLUDED.is_primary;

INSERT INTO dnd5e_character_language (character_id, language_id)
SELECT ch.id, l.id
FROM dnd5e_character ch
JOIN dnd5e_language l ON l.slug = 'common'
WHERE ch.name = 'Dev Hero'
ON CONFLICT (character_id, language_id) DO NOTHING;

INSERT INTO dnd5e_character_item (character_id, item_id, quantity, is_equipped, is_attuned, notes)
SELECT ch.id, i.id, 1, TRUE, FALSE, 'Development-only sample equipment.'
FROM dnd5e_character ch
JOIN dnd5e_item i ON i.slug = 'longsword'
WHERE ch.name = 'Dev Hero';

INSERT INTO dnd5e_character_feature (character_id, feature_id, source_type, source_id, notes)
SELECT ch.id, f.id, 'race', r.id, 'Granted from the seeded human race.'
FROM dnd5e_character ch
JOIN dnd5e_race r ON r.slug = 'human'
JOIN dnd5e_feature f ON f.slug = 'human-versatility'
WHERE ch.name = 'Dev Hero'
ON CONFLICT (character_id, feature_id, source_type, source_id) DO NOTHING;
