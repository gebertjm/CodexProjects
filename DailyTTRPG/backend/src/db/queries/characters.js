export const insertCharacterQuery = `
  INSERT INTO dnd5e_character (
    account_id,
    world_id,
    name,
    race_id,
    subrace_id,
    class_id,
    subclass_id,
    background_id,
    alignment_id,
    level,
    experience_points,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    max_hit_points,
    current_hit_points,
    temporary_hit_points,
    armor_class,
    speed,
    proficiency_bonus,
    personality_traits,
    ideals,
    bonds,
    flaws,
    backstory,
    notes,
    is_active
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
  )
  RETURNING
    id,
    account_id,
    world_id,
    name,
    race_id,
    subrace_id,
    class_id,
    subclass_id,
    background_id,
    alignment_id,
    level,
    experience_points,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    max_hit_points,
    current_hit_points,
    temporary_hit_points,
    armor_class,
    speed,
    proficiency_bonus,
    inspiration,
    personality_traits,
    ideals,
    bonds,
    flaws,
    backstory,
    notes,
    is_active,
    created_at,
    updated_at;
`;

export const selectAnyActiveCharacterForAccountQuery = `
  SELECT id
  FROM dnd5e_character
  WHERE account_id = $1
    AND is_active = TRUE
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;
`;

export const selectCharacterByIdQuery = `
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

export const selectCharacterSummaryByIdQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    ch.is_active
  FROM dnd5e_character ch
  WHERE ch.id = $1
  FOR UPDATE;
`;

export const selectCharacterProgressionQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    ch.name,
    ch.level,
    ch.experience_points,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.is_active,
    ch.updated_at,
    account.is_active AS account_is_active
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  WHERE ch.id = $1;
`;

export const selectCharacterProgressionForUpdateQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    ch.name,
    ch.level,
    ch.experience_points,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.is_active,
    ch.updated_at,
    account.is_active AS account_is_active
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  WHERE ch.id = $1
  FOR UPDATE;
`;

export const updateCharacterExperiencePointsQuery = `
  UPDATE dnd5e_character
  SET
    experience_points = $2,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    account_id,
    world_id,
    name,
    level,
    experience_points,
    pending_level_count,
    level_up_available,
    last_level_up_available_at,
    is_active,
    updated_at;
`;
