export const selectCharacterAdvancementByIdQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    world.slug AS world_slug,
    world.advancement_mode AS world_advancement_mode,
    world.advancement_config_json AS world_advancement_config_json,
    ch.name,
    ch.level,
    ch.experience_points,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.constitution,
    ch.max_hit_points,
    ch.current_hit_points,
    ch.proficiency_bonus,
    ch.class_id,
    ch.subclass_id,
    ch.is_active,
    account.is_active AS account_is_active,
    ch.updated_at
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  JOIN dnd5e_world world ON world.id = ch.world_id
  WHERE ch.id = $1;
`;

export const selectCharacterAdvancementByIdForUpdateQuery = `
  SELECT
    ch.id,
    ch.account_id,
    ch.world_id,
    world.slug AS world_slug,
    world.advancement_mode AS world_advancement_mode,
    world.advancement_config_json AS world_advancement_config_json,
    ch.name,
    ch.level,
    ch.experience_points,
    ch.pending_level_count,
    ch.level_up_available,
    ch.last_level_up_available_at,
    ch.constitution,
    ch.max_hit_points,
    ch.current_hit_points,
    ch.proficiency_bonus,
    ch.class_id,
    ch.subclass_id,
    ch.is_active,
    account.is_active AS account_is_active,
    ch.updated_at
  FROM dnd5e_character ch
  JOIN account ON account.id = ch.account_id
  JOIN dnd5e_world world ON world.id = ch.world_id
  WHERE ch.id = $1
  FOR UPDATE;
`;

export const selectActiveCampaignContextByCharacterQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.is_active,
    membership.membership_status,
    membership.is_active_context,
    membership.is_default_solo_campaign,
    membership.current_scene_id,
    campaign.world_id,
    campaign.slug AS campaign_slug,
    campaign.name AS campaign_name,
    campaign.campaign_type,
    campaign.status AS campaign_status,
    campaign.is_active AS campaign_is_active,
    campaign.advancement_mode AS campaign_advancement_mode,
    campaign.advancement_config_json AS campaign_advancement_config_json
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  WHERE membership.character_id = $1
    AND membership.is_active_context = TRUE
  ORDER BY membership.updated_at DESC, membership.id DESC
  LIMIT 1;
`;

export const selectCampaignAdvancementConfigQuery = `
  SELECT
    campaign.id,
    campaign.world_id,
    campaign.slug,
    campaign.name,
    campaign.campaign_type,
    campaign.status,
    campaign.is_active,
    campaign.advancement_mode,
    campaign.advancement_config_json,
    world.advancement_mode AS world_advancement_mode,
    world.advancement_config_json AS world_advancement_config_json
  FROM dnd5e_campaign campaign
  JOIN dnd5e_world world ON world.id = campaign.world_id
  WHERE campaign.id = $1;
`;

export const updateCampaignAdvancementConfigQuery = `
  UPDATE dnd5e_campaign
  SET
    advancement_mode = $2,
    advancement_config_json = $3::jsonb,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    world_id,
    slug,
    name,
    campaign_type,
    status,
    is_active,
    advancement_mode,
    advancement_config_json;
`;

export const updateWorldAdvancementConfigQuery = `
  UPDATE dnd5e_world
  SET
    advancement_mode = $2,
    advancement_config_json = $3::jsonb,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    slug,
    name,
    advancement_mode,
    advancement_config_json,
    updated_at;
`;

export const updateCharacterPendingAdvancementQuery = `
  UPDATE dnd5e_character
  SET
    experience_points = $2,
    pending_level_count = $3,
    level_up_available = $4,
    last_level_up_available_at = $5,
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
    constitution,
    max_hit_points,
    current_hit_points,
    proficiency_bonus,
    class_id,
    subclass_id,
    is_active,
    updated_at;
`;

export const selectPrimaryCharacterClassForUpdateQuery = `
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
    subclass.name AS subclass_name,
    subclass.slug AS subclass_slug
  FROM dnd5e_character_class cc
  JOIN dnd5e_class class ON class.id = cc.class_id
  LEFT JOIN dnd5e_subclass subclass ON subclass.id = cc.subclass_id
  WHERE cc.character_id = $1
  ORDER BY cc.is_primary DESC, cc.id ASC
  LIMIT 1
  FOR UPDATE OF cc;
`;

export const selectCharacterClassByIdForUpdateQuery = `
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
    subclass.name AS subclass_name,
    subclass.slug AS subclass_slug
  FROM dnd5e_character_class cc
  JOIN dnd5e_class class ON class.id = cc.class_id
  LEFT JOIN dnd5e_subclass subclass ON subclass.id = cc.subclass_id
  WHERE cc.id = $1
  FOR UPDATE OF cc;
`;

export const updateCharacterClassLevelQuery = `
  UPDATE dnd5e_character_class
  SET
    class_level = $2
  WHERE id = $1
  RETURNING
    id,
    character_id,
    class_id,
    subclass_id,
    class_level,
    is_primary;
`;

export const updateCharacterClassLevelAndSubclassQuery = `
  UPDATE dnd5e_character_class
  SET
    class_level = $2,
    subclass_id = $3
  WHERE id = $1
  RETURNING
    id,
    character_id,
    class_id,
    subclass_id,
    class_level,
    is_primary;
`;

export const updateCharacterLevelingSummaryQuery = `
  UPDATE dnd5e_character
  SET
    level = $2,
    pending_level_count = $3,
    level_up_available = $4,
    last_level_up_available_at = $5,
    class_id = $6,
    subclass_id = $7,
    max_hit_points = $8,
    current_hit_points = $9,
    proficiency_bonus = $10,
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
    constitution,
    max_hit_points,
    current_hit_points,
    proficiency_bonus,
    class_id,
    subclass_id,
    is_active,
    updated_at;
`;

export const insertAdvancementEventQuery = `
  INSERT INTO dnd5e_advancement_event (
    character_id,
    world_id,
    campaign_id,
    actor_account_id,
    level_up_session_id,
    event_kind,
    advancement_mode,
    source_type,
    source_entity_id,
    dedupe_key,
    amount_xp,
    granted_level_count,
    target_level,
    reason,
    metadata_json
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
  )
  RETURNING *;
`;

export const selectAdvancementEventsByCharacterQuery = `
  SELECT
    event_row.*
  FROM dnd5e_advancement_event event_row
  WHERE event_row.character_id = $1
  ORDER BY event_row.created_at DESC, event_row.id DESC
  LIMIT $2
  OFFSET $3;
`;

export const selectAdvancementEventByCharacterAndDedupeKeyQuery = `
  SELECT
    event_row.*
  FROM dnd5e_advancement_event event_row
  WHERE event_row.character_id = $1
    AND event_row.dedupe_key = $2
  ORDER BY event_row.created_at DESC, event_row.id DESC
  LIMIT 1;
`;

export const selectOpenLevelUpSessionByCharacterQuery = `
  SELECT
    session.*
  FROM dnd5e_level_up_session session
  WHERE session.character_id = $1
    AND session.session_status IN ('started', 'awaiting_choice', 'validating', 'ready_to_finalize', 'deferred')
  ORDER BY session.updated_at DESC, session.id DESC
  LIMIT 1;
`;

export const selectOpenLevelUpSessionByCharacterForUpdateQuery = `
  SELECT
    session.*
  FROM dnd5e_level_up_session session
  WHERE session.character_id = $1
    AND session.session_status IN ('started', 'awaiting_choice', 'validating', 'ready_to_finalize', 'deferred')
  ORDER BY session.updated_at DESC, session.id DESC
  LIMIT 1
  FOR UPDATE;
`;

export const selectLatestLevelUpSessionByCharacterQuery = `
  SELECT
    session.*
  FROM dnd5e_level_up_session session
  WHERE session.character_id = $1
  ORDER BY session.updated_at DESC, session.id DESC
  LIMIT 1;
`;

export const insertLevelUpSessionQuery = `
  INSERT INTO dnd5e_level_up_session (
    character_id,
    world_id,
    campaign_id,
    target_character_class_id,
    advancement_mode,
    session_status,
    from_level,
    target_level,
    current_step,
    required_steps_json,
    selected_choices_json,
    validation_state_json,
    preview_json,
    hp_choice_method,
    hp_roll_result
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15
  )
  RETURNING *;
`;

export const updateLevelUpSessionStateQuery = `
  UPDATE dnd5e_level_up_session
  SET
    session_status = $2,
    current_step = $3,
    required_steps_json = $4::jsonb,
    selected_choices_json = $5::jsonb,
    validation_state_json = $6::jsonb,
    preview_json = $7::jsonb,
    hp_choice_method = $8,
    hp_roll_result = $9,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const completeLevelUpSessionQuery = `
  UPDATE dnd5e_level_up_session
  SET
    session_status = $2,
    current_step = $3,
    required_steps_json = $4::jsonb,
    selected_choices_json = $5::jsonb,
    validation_state_json = $6::jsonb,
    preview_json = $7::jsonb,
    hp_choice_method = $8,
    hp_roll_result = $9,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const selectAvailableSubclassesForClassQuery = `
  SELECT
    subclass.id,
    subclass.class_id,
    subclass.name,
    subclass.slug,
    subclass.description,
    COALESCE(
      min_feature.minimum_level,
      CASE class_row.slug
        WHEN 'cleric' THEN 1
        WHEN 'sorcerer' THEN 1
        WHEN 'warlock' THEN 1
        WHEN 'druid' THEN 2
        WHEN 'wizard' THEN 2
        ELSE 3
      END
    ) AS unlock_level
  FROM dnd5e_subclass subclass
  JOIN dnd5e_class class_row ON class_row.id = subclass.class_id
  LEFT JOIN (
    SELECT
      subclass_id,
      MIN(granted_at_level) AS minimum_level
    FROM dnd5e_subclass_feature
    GROUP BY subclass_id
  ) min_feature
    ON min_feature.subclass_id = subclass.id
  WHERE subclass.class_id = $1
  ORDER BY unlock_level ASC, subclass.name ASC;
`;

export const selectCampaignActiveCharacterLevelsQuery = `
  SELECT
    membership.character_id,
    character.name,
    character.level,
    character.pending_level_count,
    character.level_up_available
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  WHERE membership.campaign_id = $1
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
    AND character.is_active = TRUE
  ORDER BY character.level DESC, character.id ASC;
`;

export const selectOpenProgressionWindowsForCharacterQuery = `
  SELECT
    window_row.id,
    window_row.campaign_id,
    window_row.world_id,
    window_row.status,
    window_row.threshold_at,
    window_row.created_at,
    participant.participant_status
  FROM dnd5e_progression_window window_row
  JOIN dnd5e_progression_window_participant participant
    ON participant.progression_window_id = window_row.id
  WHERE window_row.campaign_id = $1
    AND participant.character_id = $2
    AND window_row.status = 'open'
  ORDER BY window_row.threshold_at ASC, window_row.id ASC;
`;

export const selectClassSpellsByClassIdQuery = `
  SELECT
    class_spell.id,
    class_spell.class_id,
    class_spell.spell_id,
    class_spell.notes,
    spell.name AS spell_name,
    spell.slug AS spell_slug,
    spell.level AS spell_level,
    spell.school AS spell_school,
    spell.casting_time,
    spell.range_text,
    spell.duration_text,
    spell.components_text,
    spell.ritual,
    spell.concentration,
    spell.source AS spell_source,
    spell.is_active
  FROM dnd5e_class_spell class_spell
  JOIN dnd5e_spell spell ON spell.id = class_spell.spell_id
  WHERE class_spell.class_id = $1
  ORDER BY spell.level ASC, spell.name ASC;
`;

export const selectClassFeaturesAtLevelQuery = `
  SELECT
    feature.id,
    feature.name,
    feature.slug,
    feature.feature_type,
    feature.description,
    feature.source,
    class_feature.granted_at_level,
    class_feature.display_order
  FROM dnd5e_class_feature class_feature
  JOIN dnd5e_feature feature ON feature.id = class_feature.feature_id
  WHERE class_feature.class_id = $1
    AND class_feature.granted_at_level = $2
  ORDER BY class_feature.display_order ASC, feature.name ASC;
`;

export const selectSubclassFeaturesAtLevelQuery = `
  SELECT
    feature.id,
    feature.name,
    feature.slug,
    feature.feature_type,
    feature.description,
    feature.source,
    subclass_feature.granted_at_level,
    subclass_feature.display_order
  FROM dnd5e_subclass_feature subclass_feature
  JOIN dnd5e_feature feature ON feature.id = subclass_feature.feature_id
  WHERE subclass_feature.subclass_id = $1
    AND subclass_feature.granted_at_level = $2
  ORDER BY subclass_feature.display_order ASC, feature.name ASC;
`;
