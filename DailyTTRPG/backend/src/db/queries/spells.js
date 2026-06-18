export const selectSpellsQuery = `
  SELECT
    id,
    name,
    slug,
    level,
    school,
    casting_time,
    range_text,
    duration_text,
    components_text,
    ritual,
    concentration,
    source,
    is_active
  FROM dnd5e_spell
  ORDER BY level ASC, name ASC;
`;

export const selectSpellByIdQuery = `
  SELECT
    id,
    name,
    slug,
    level,
    school,
    casting_time,
    range_text,
    duration_text,
    components_text,
    ritual,
    concentration,
    description,
    source,
    is_active
  FROM dnd5e_spell
  WHERE id = $1;
`;

export const selectCharacterManualSpellsQuery = `
  SELECT
    cs.id,
    cs.character_id,
    cs.spell_id,
    cs.spell_source,
    cs.source_class_id,
    cs.is_known,
    cs.is_prepared,
    cs.is_always_prepared,
    cs.notes,
    cs.created_at,
    cs.updated_at,
    spell.name AS spell_name,
    spell.slug AS spell_slug,
    spell.level AS spell_level,
    spell.school AS spell_school,
    spell.ritual,
    spell.concentration,
    spell.source AS spell_book_source,
    class.name AS source_class_name,
    class.slug AS source_class_slug
  FROM dnd5e_character_spell cs
  JOIN dnd5e_spell spell ON spell.id = cs.spell_id
  LEFT JOIN dnd5e_class class ON class.id = cs.source_class_id
  WHERE cs.character_id = $1
  ORDER BY spell.level ASC, spell.name ASC;
`;

export const selectCharacterSpellByIdQuery = `
  SELECT
    cs.id,
    cs.character_id,
    cs.spell_id,
    cs.spell_source,
    cs.source_class_id,
    cs.is_known,
    cs.is_prepared,
    cs.is_always_prepared,
    cs.notes,
    cs.created_at,
    cs.updated_at,
    spell.name AS spell_name,
    spell.slug AS spell_slug,
    spell.level AS spell_level,
    spell.school AS spell_school,
    spell.ritual,
    spell.concentration,
    spell.source AS spell_book_source,
    class.name AS source_class_name,
    class.slug AS source_class_slug
  FROM dnd5e_character_spell cs
  JOIN dnd5e_spell spell ON spell.id = cs.spell_id
  LEFT JOIN dnd5e_class class ON class.id = cs.source_class_id
  WHERE cs.id = $1;
`;

export const insertCharacterSpellQuery = `
  INSERT INTO dnd5e_character_spell (
    character_id,
    spell_id,
    spell_source,
    source_class_id,
    is_known,
    is_prepared,
    is_always_prepared,
    notes
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id;
`;

export const updateCharacterSpellQuery = `
  UPDATE dnd5e_character_spell
  SET
    is_known = $2,
    is_prepared = $3,
    notes = $4,
    updated_at = NOW()
  WHERE id = $1
  RETURNING id;
`;

export const selectDerivedSpellGrantsQuery = `
  SELECT DISTINCT
    spell.id AS spell_id,
    spell.name AS spell_name,
    spell.slug AS spell_slug,
    spell.level AS spell_level,
    spell.school AS spell_school,
    spell.ritual,
    spell.concentration,
    spell.source AS spell_book_source,
    feature.id AS feature_id,
    feature.name AS feature_name,
    feature.slug AS feature_slug,
    fsg.grant_type,
    fsg.granted_at_level
  FROM (
    SELECT rf.feature_id
    FROM dnd5e_character ch
    JOIN dnd5e_race_feature rf ON rf.race_id = ch.race_id
    WHERE ch.id = $1
    UNION
    SELECT srf.feature_id
    FROM dnd5e_character ch
    JOIN dnd5e_subrace_feature srf ON srf.subrace_id = ch.subrace_id
    WHERE ch.id = $1
    UNION
    SELECT bf.feature_id
    FROM dnd5e_character ch
    JOIN dnd5e_background_feature bf ON bf.background_id = ch.background_id
    WHERE ch.id = $1
    UNION
    SELECT ccf.feature_id
    FROM dnd5e_character_class cc
    JOIN dnd5e_class_feature ccf
      ON ccf.class_id = cc.class_id
     AND ccf.granted_at_level <= cc.class_level
    WHERE cc.character_id = $1
    UNION
    SELECT scf.feature_id
    FROM dnd5e_character_class cc
    JOIN dnd5e_subclass_feature scf
      ON scf.subclass_id = cc.subclass_id
     AND scf.granted_at_level <= cc.class_level
    WHERE cc.character_id = $1
      AND cc.subclass_id IS NOT NULL
    UNION
    SELECT ff.feature_id
    FROM dnd5e_character_feat cf
    JOIN dnd5e_feat_feature ff ON ff.feat_id = cf.feat_id
    WHERE cf.character_id = $1
  ) feature_sources
  JOIN dnd5e_feature feature ON feature.id = feature_sources.feature_id
  JOIN dnd5e_feature_spell_grant fsg ON fsg.feature_id = feature.id
  JOIN dnd5e_spell spell ON spell.id = fsg.spell_id
  ORDER BY spell.level ASC, spell.name ASC;
`;

export const selectSpellSlotStateQuery = `
  SELECT
    id,
    character_id,
    slot_pool,
    slot_level,
    slots_used,
    created_at,
    updated_at
  FROM dnd5e_character_spell_slot
  WHERE character_id = $1
  ORDER BY slot_pool ASC, slot_level ASC;
`;

export const selectSpellSlotStateRowForUpdateQuery = `
  SELECT
    id,
    character_id,
    slot_pool,
    slot_level,
    slots_used,
    created_at,
    updated_at
  FROM dnd5e_character_spell_slot
  WHERE character_id = $1
    AND slot_pool = $2
    AND slot_level = $3
  FOR UPDATE;
`;

export const insertSpellSlotStateRowQuery = `
  INSERT INTO dnd5e_character_spell_slot (
    character_id,
    slot_pool,
    slot_level,
    slots_used
  )
  VALUES ($1, $2, $3, $4)
  RETURNING
    id,
    character_id,
    slot_pool,
    slot_level,
    slots_used,
    created_at,
    updated_at;
`;

export const updateSpellSlotStateRowQuery = `
  UPDATE dnd5e_character_spell_slot
  SET
    slots_used = $2,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    character_id,
    slot_pool,
    slot_level,
    slots_used,
    created_at,
    updated_at;
`;
