export const selectCharacterForCompositionQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    ch.name,
    ch.level,
    ch.is_active,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.race_id,
    ch.subrace_id,
    ch.background_id,
    ch.class_id,
    ch.subclass_id,
    ch.strength,
    ch.dexterity,
    ch.constitution,
    ch.intelligence,
    ch.wisdom,
    ch.charisma,
    account.is_active AS account_is_active
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  WHERE ch.id = $1
  FOR UPDATE;
`;

export const selectCharacterForReadQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    world.name AS world_name,
    world.slug AS world_slug,
    ch.name,
    ch.ruleset_version,
    ch.level,
    ch.experience_points,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.strength,
    ch.dexterity,
    ch.constitution,
    ch.intelligence,
    ch.wisdom,
    ch.charisma,
    ch.max_hit_points,
    ch.current_hit_points,
    ch.temporary_hit_points,
    ch.armor_class,
    ch.speed,
    ch.proficiency_bonus,
    ch.inspiration,
    ch.personality_traits,
    ch.ideals,
    ch.bonds,
    ch.flaws,
    ch.backstory,
    ch.notes,
    ch.is_active,
    ch.created_at,
    ch.updated_at,
    race.id AS race_id,
    race.name AS race_name,
    race.slug AS race_slug,
    subrace.id AS subrace_id,
    subrace.name AS subrace_name,
    subrace.slug AS subrace_slug,
    class.id AS class_id,
    class.name AS class_name,
    class.slug AS class_slug,
    subclass.id AS subclass_id,
    subclass.name AS subclass_name,
    subclass.slug AS subclass_slug,
    background.id AS background_id,
    background.name AS background_name,
    background.slug AS background_slug,
    alignment.id AS alignment_id,
    alignment.name AS alignment_name,
    alignment.abbreviation AS alignment_abbreviation
  FROM dnd5e_character ch
  JOIN dnd5e_world world ON world.id = ch.world_id
  LEFT JOIN dnd5e_race race ON race.id = ch.race_id
  LEFT JOIN dnd5e_subrace subrace ON subrace.id = ch.subrace_id
  LEFT JOIN dnd5e_class class ON class.id = ch.class_id
  LEFT JOIN dnd5e_subclass subclass ON subclass.id = ch.subclass_id
  LEFT JOIN dnd5e_background background ON background.id = ch.background_id
  LEFT JOIN dnd5e_alignment alignment ON alignment.id = ch.alignment_id
  WHERE ch.id = $1;
`;

export const selectCharacterClassesQuery = `
  SELECT
    cc.id,
    cc.character_id,
    cc.class_id,
    cc.subclass_id,
    cc.class_level,
    cc.is_primary,
    class.name AS class_name,
    class.slug AS class_slug,
    class.hit_die,
    class.primary_ability_text,
    subclass.name AS subclass_name,
    subclass.slug AS subclass_slug
  FROM dnd5e_character_class cc
  JOIN dnd5e_class class ON class.id = cc.class_id
  LEFT JOIN dnd5e_subclass subclass ON subclass.id = cc.subclass_id
  WHERE cc.character_id = $1
  ORDER BY cc.is_primary DESC, class.name ASC, cc.id ASC;
`;

export const selectCharacterLanguagesManualQuery = `
  SELECT
    cl.id,
    cl.character_id,
    language.id AS language_id,
    language.name,
    language.slug,
    language.script,
    language.is_exotic,
    language.source,
    'manual' AS source_type
  FROM dnd5e_character_language cl
  JOIN dnd5e_language language ON language.id = cl.language_id
  WHERE cl.character_id = $1
  ORDER BY language.name ASC;
`;

export const selectCharacterFeatsQuery = `
  SELECT
    cf.id,
    cf.character_id,
    feat.id AS feat_id,
    feat.name,
    feat.slug,
    feat.prerequisites_text,
    feat.source,
    cf.acquired_level,
    cf.notes
  FROM dnd5e_character_feat cf
  JOIN dnd5e_feat feat ON feat.id = cf.feat_id
  WHERE cf.character_id = $1
  ORDER BY feat.name ASC;
`;

export const selectSubclassByIdQuery = `
  SELECT
    id,
    class_id,
    name,
    slug
  FROM dnd5e_subclass
  WHERE id = $1;
`;

export const selectClassByIdQuery = `
  SELECT
    id,
    name,
    slug
  FROM dnd5e_class
  WHERE id = $1;
`;

export const selectLanguageByIdQuery = `
  SELECT
    id,
    name,
    slug,
    script,
    is_exotic,
    source
  FROM dnd5e_language
  WHERE id = $1;
`;

export const selectFeatByIdQuery = `
  SELECT
    id,
    name,
    slug,
    prerequisites_text,
    source
  FROM dnd5e_feat
  WHERE id = $1;
`;

export const insertCharacterClassQuery = `
  INSERT INTO dnd5e_character_class (
    character_id,
    class_id,
    subclass_id,
    class_level,
    is_primary
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id;
`;

export const insertCharacterLanguageQuery = `
  INSERT INTO dnd5e_character_language (
    character_id,
    language_id
  )
  VALUES ($1, $2)
  RETURNING id;
`;

export const insertCharacterFeatQuery = `
  INSERT INTO dnd5e_character_feat (
    character_id,
    feat_id,
    acquired_level,
    notes
  )
  VALUES ($1, $2, $3, $4)
  RETURNING id;
`;

export const clearPrimaryCharacterClassesQuery = `
  UPDATE dnd5e_character_class
  SET is_primary = FALSE
  WHERE character_id = $1;
`;

export const updateCharacterClassSummaryQuery = `
  UPDATE dnd5e_character
  SET
    class_id = $2,
    subclass_id = $3,
    updated_at = NOW()
  WHERE id = $1;
`;

export const selectDerivedFeaturesQuery = `
  WITH class_sources AS (
    SELECT
      ccf.feature_id,
      'class'::text AS source_type,
      ccf.class_id AS source_entity_id,
      class.name AS source_entity_name,
      ccf.granted_at_level,
      ccf.display_order
    FROM dnd5e_character_class cc
    JOIN dnd5e_class_feature ccf
      ON ccf.class_id = cc.class_id
     AND ccf.granted_at_level <= cc.class_level
    JOIN dnd5e_class class ON class.id = cc.class_id
    WHERE cc.character_id = $1
  ),
  subclass_sources AS (
    SELECT
      scf.feature_id,
      'subclass'::text AS source_type,
      scf.subclass_id AS source_entity_id,
      subclass.name AS source_entity_name,
      scf.granted_at_level,
      scf.display_order
    FROM dnd5e_character_class cc
    JOIN dnd5e_subclass_feature scf
      ON scf.subclass_id = cc.subclass_id
     AND scf.granted_at_level <= cc.class_level
    JOIN dnd5e_subclass subclass ON subclass.id = cc.subclass_id
    WHERE cc.character_id = $1
      AND cc.subclass_id IS NOT NULL
  ),
  race_sources AS (
    SELECT
      rf.feature_id,
      'race'::text AS source_type,
      rf.race_id AS source_entity_id,
      race.name AS source_entity_name,
      rf.granted_at_level,
      rf.display_order
    FROM dnd5e_character ch
    JOIN dnd5e_race_feature rf ON rf.race_id = ch.race_id
    JOIN dnd5e_race race ON race.id = rf.race_id
    WHERE ch.id = $1
      AND ch.race_id IS NOT NULL
  ),
  subrace_sources AS (
    SELECT
      srf.feature_id,
      'subrace'::text AS source_type,
      srf.subrace_id AS source_entity_id,
      subrace.name AS source_entity_name,
      srf.granted_at_level,
      srf.display_order
    FROM dnd5e_character ch
    JOIN dnd5e_subrace_feature srf ON srf.subrace_id = ch.subrace_id
    JOIN dnd5e_subrace subrace ON subrace.id = srf.subrace_id
    WHERE ch.id = $1
      AND ch.subrace_id IS NOT NULL
  ),
  background_sources AS (
    SELECT
      bf.feature_id,
      'background'::text AS source_type,
      bf.background_id AS source_entity_id,
      background.name AS source_entity_name,
      NULL::integer AS granted_at_level,
      bf.display_order
    FROM dnd5e_character ch
    JOIN dnd5e_background_feature bf ON bf.background_id = ch.background_id
    JOIN dnd5e_background background ON background.id = bf.background_id
    WHERE ch.id = $1
      AND ch.background_id IS NOT NULL
  ),
  feat_sources AS (
    SELECT
      ff.feature_id,
      'feat'::text AS source_type,
      cf.feat_id AS source_entity_id,
      feat.name AS source_entity_name,
      cf.acquired_level AS granted_at_level,
      ff.display_order
    FROM dnd5e_character_feat cf
    JOIN dnd5e_feat_feature ff ON ff.feat_id = cf.feat_id
    JOIN dnd5e_feat feat ON feat.id = cf.feat_id
    WHERE cf.character_id = $1
  ),
  all_sources AS (
    SELECT * FROM class_sources
    UNION ALL
    SELECT * FROM subclass_sources
    UNION ALL
    SELECT * FROM race_sources
    UNION ALL
    SELECT * FROM subrace_sources
    UNION ALL
    SELECT * FROM background_sources
    UNION ALL
    SELECT * FROM feat_sources
  )
  SELECT
    feature.id,
    feature.name,
    feature.slug,
    feature.feature_type,
    feature.description,
    feature.source,
    all_sources.source_type,
    all_sources.source_entity_id,
    all_sources.source_entity_name,
    all_sources.granted_at_level,
    all_sources.display_order
  FROM all_sources
  JOIN dnd5e_feature feature ON feature.id = all_sources.feature_id
  ORDER BY
    all_sources.source_type ASC,
    COALESCE(all_sources.granted_at_level, 0) ASC,
    COALESCE(all_sources.display_order, 0) ASC,
    feature.name ASC;
`;

export const selectDerivedLanguageGrantsQuery = `
  SELECT DISTINCT
    language.id AS language_id,
    language.name,
    language.slug,
    language.script,
    language.is_exotic,
    language.source,
    feature.id AS feature_id,
    feature.name AS feature_name,
    feature.slug AS feature_slug
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
  JOIN dnd5e_feature_language_grant language_grant ON language_grant.feature_id = feature.id
  JOIN dnd5e_language language ON language.id = language_grant.language_id
  ORDER BY language.name ASC, feature.name ASC;
`;
