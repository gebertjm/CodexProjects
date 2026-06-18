export const selectCampaignCharacterNarrativeContextQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.joined_by_account_id,
    membership.is_active AS membership_is_active,
    membership.current_scene_id,
    membership.current_scene_entered_at,
    membership.created_at AS membership_created_at,
    membership.updated_at AS membership_updated_at,
    campaign.name AS campaign_name,
    campaign.description AS campaign_description,
    campaign.world_id AS campaign_world_id,
    campaign.campaign_type,
    campaign.status AS campaign_status,
    campaign.is_active AS campaign_is_active,
    character.name AS character_name,
    character.account_id,
    character.is_active AS character_is_active,
    account.display_name AS account_display_name,
    account.is_active AS account_is_active,
    alignment.id AS alignment_id,
    alignment.name AS alignment_name,
    alignment.abbreviation AS alignment_abbreviation
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN account ON account.id = character.account_id
  LEFT JOIN dnd5e_alignment alignment ON alignment.id = character.alignment_id
  WHERE membership.campaign_id = $1
    AND membership.character_id = $2;
`;

export const selectCampaignCharacterNarrativeContextForUpdateQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.joined_by_account_id,
    membership.is_active AS membership_is_active,
    membership.current_scene_id,
    membership.current_scene_entered_at,
    membership.created_at AS membership_created_at,
    membership.updated_at AS membership_updated_at,
    campaign.name AS campaign_name,
    campaign.description AS campaign_description,
    campaign.world_id AS campaign_world_id,
    campaign.campaign_type,
    campaign.status AS campaign_status,
    campaign.is_active AS campaign_is_active,
    character.name AS character_name,
    character.account_id,
    character.is_active AS character_is_active,
    account.display_name AS account_display_name,
    account.is_active AS account_is_active,
    alignment.id AS alignment_id,
    alignment.name AS alignment_name,
    alignment.abbreviation AS alignment_abbreviation
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN account ON account.id = character.account_id
  LEFT JOIN dnd5e_alignment alignment ON alignment.id = character.alignment_id
  WHERE membership.campaign_id = $1
    AND membership.character_id = $2
  FOR UPDATE OF membership;
`;

export const selectCampaignScenesQuery = `
  SELECT
    scene.id,
    scene.location_id,
    location.key AS location_key,
    location.name AS location_name,
    location.region_name,
    scene.key,
    scene.name,
    scene.summary,
    scene.description,
    scene.entry_text,
    scene.is_starting_scene,
    scene.entry_conditions_json,
    scene.is_active,
    scene.created_at,
    scene.updated_at
  FROM dnd5e_scene scene
  JOIN dnd5e_location location ON location.id = scene.location_id
  WHERE scene.is_active = TRUE
    AND location.is_active = TRUE
    AND (
      ($1::bigint IS NOT NULL AND location.world_id = $1::bigint)
      OR ($1::bigint IS NULL AND location.world_id IS NULL)
    )
  ORDER BY scene.is_starting_scene DESC, location.name ASC, scene.name ASC, scene.id ASC;
`;

export const selectSceneByIdQuery = `
  SELECT
    scene.id,
    scene.location_id,
    location.key AS location_key,
    location.name AS location_name,
    location.region_name,
    scene.key,
    scene.name,
    scene.summary,
    scene.description,
    scene.entry_text,
    scene.is_starting_scene,
    scene.entry_conditions_json,
    scene.is_active,
    scene.created_at,
    scene.updated_at
  FROM dnd5e_scene scene
  JOIN dnd5e_location location ON location.id = scene.location_id
  WHERE scene.id = $1;
`;

export const selectSceneByKeyQuery = `
  SELECT
    scene.id,
    scene.location_id,
    location.key AS location_key,
    location.name AS location_name,
    location.region_name,
    scene.key,
    scene.name,
    scene.summary,
    scene.description,
    scene.entry_text,
    scene.is_starting_scene,
    scene.entry_conditions_json,
    scene.is_active,
    scene.created_at,
    scene.updated_at
  FROM dnd5e_scene scene
  JOIN dnd5e_location location ON location.id = scene.location_id
  WHERE scene.key = $1;
`;

export const selectStartingScenesQuery = `
  SELECT
    scene.id,
    scene.location_id,
    location.key AS location_key,
    location.name AS location_name,
    location.region_name,
    scene.key,
    scene.name,
    scene.summary,
    scene.description,
    scene.entry_text,
    scene.is_starting_scene,
    scene.entry_conditions_json,
    scene.is_active,
    scene.created_at,
    scene.updated_at
  FROM dnd5e_scene scene
  JOIN dnd5e_location location ON location.id = scene.location_id
  WHERE scene.is_starting_scene = TRUE
    AND scene.is_active = TRUE
    AND location.is_active = TRUE
    AND (
      ($1::bigint IS NOT NULL AND location.world_id = $1::bigint)
      OR ($1::bigint IS NULL AND location.world_id IS NULL)
    )
  ORDER BY scene.id ASC;
`;

export const deleteCharacterQuestByIdQuery = `
  DELETE FROM dnd5e_character_quest
  WHERE id = $1
  RETURNING id;
`;

export const selectSceneTransitionsByFromSceneQuery = `
  SELECT
    transition.id,
    transition.from_scene_id,
    transition.to_scene_id,
    transition.transition_key,
    transition.label,
    transition.description,
    transition.sort_order,
    transition.is_default_path,
    transition.recommendation_json,
    transition.conditions_json,
    transition.is_active,
    transition.created_at,
    to_scene.key AS to_scene_key,
    to_scene.name AS to_scene_name,
    to_scene.summary AS to_scene_summary,
    to_scene.entry_text AS to_scene_entry_text,
    to_scene.is_starting_scene AS to_scene_is_starting_scene,
    to_scene.entry_conditions_json AS to_scene_entry_conditions_json,
    to_location.id AS to_location_id,
    to_location.key AS to_location_key,
    to_location.name AS to_location_name,
    to_location.region_name AS to_region_name
  FROM dnd5e_scene_transition transition
  JOIN dnd5e_scene to_scene ON to_scene.id = transition.to_scene_id
  JOIN dnd5e_location to_location ON to_location.id = to_scene.location_id
  WHERE transition.from_scene_id = $1
    AND transition.is_active = TRUE
  ORDER BY transition.sort_order ASC, transition.id ASC;
`;

export const selectSceneTransitionByIdQuery = `
  SELECT
    transition.id,
    transition.from_scene_id,
    transition.to_scene_id,
    transition.transition_key,
    transition.label,
    transition.description,
    transition.sort_order,
    transition.is_default_path,
    transition.recommendation_json,
    transition.conditions_json,
    transition.is_active,
    transition.created_at,
    to_scene.key AS to_scene_key,
    to_scene.name AS to_scene_name,
    to_scene.summary AS to_scene_summary,
    to_scene.entry_text AS to_scene_entry_text,
    to_scene.is_starting_scene AS to_scene_is_starting_scene,
    to_scene.entry_conditions_json AS to_scene_entry_conditions_json,
    to_location.id AS to_location_id,
    to_location.key AS to_location_key,
    to_location.name AS to_location_name,
    to_location.region_name AS to_region_name
  FROM dnd5e_scene_transition transition
  JOIN dnd5e_scene to_scene ON to_scene.id = transition.to_scene_id
  JOIN dnd5e_location to_location ON to_location.id = to_scene.location_id
  WHERE transition.id = $1;
`;

export const selectSceneTransitionByFromSceneAndKeyQuery = `
  SELECT
    transition.id,
    transition.from_scene_id,
    transition.to_scene_id,
    transition.transition_key,
    transition.label,
    transition.description,
    transition.sort_order,
    transition.is_default_path,
    transition.recommendation_json,
    transition.conditions_json,
    transition.is_active,
    transition.created_at,
    to_scene.key AS to_scene_key,
    to_scene.name AS to_scene_name,
    to_scene.summary AS to_scene_summary,
    to_scene.entry_text AS to_scene_entry_text,
    to_scene.is_starting_scene AS to_scene_is_starting_scene,
    to_scene.entry_conditions_json AS to_scene_entry_conditions_json,
    to_location.id AS to_location_id,
    to_location.key AS to_location_key,
    to_location.name AS to_location_name,
    to_location.region_name AS to_region_name
  FROM dnd5e_scene_transition transition
  JOIN dnd5e_scene to_scene ON to_scene.id = transition.to_scene_id
  JOIN dnd5e_location to_location ON to_location.id = to_scene.location_id
  WHERE transition.from_scene_id = $1
    AND transition.transition_key = $2;
`;

export const selectSceneNpcsBySceneQuery = `
  SELECT
    scene_npc.id,
    scene_npc.scene_id,
    scene_npc.npc_id,
    scene_npc.world_entity_id,
    scene_npc.presence_text,
    scene_npc.sort_order,
    scene_npc.availability_conditions_json,
    scene_npc.is_active,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.disposition AS base_disposition,
    npc.role,
    npc.description AS npc_description,
    npc_state.id AS campaign_npc_state_id,
    npc_state.disposition AS campaign_disposition,
    npc_state.notes AS campaign_disposition_notes,
    world_entity.entity_key AS world_entity_key,
    world_entity.status AS world_entity_status,
    world_entity.disposition AS world_entity_disposition,
    world_entity.current_scene_id AS world_entity_current_scene_id,
    world_entity.state_json AS world_entity_state_json,
    stat_block.id AS stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    COALESCE(npc_state.current_hit_points, stat_block.hit_point_max) AS current_hit_points,
    stat_block.speed_walk,
    stat_block.speed_fly,
    stat_block.speed_swim,
    stat_block.speed_climb,
    stat_block.proficiency_bonus,
    MAX(CASE WHEN ability.ability = 'STR' THEN ability.score END) AS strength,
    MAX(CASE WHEN ability.ability = 'DEX' THEN ability.score END) AS dexterity,
    MAX(CASE WHEN ability.ability = 'CON' THEN ability.score END) AS constitution,
    MAX(CASE WHEN ability.ability = 'INT' THEN ability.score END) AS intelligence,
    MAX(CASE WHEN ability.ability = 'WIS' THEN ability.score END) AS wisdom,
    MAX(CASE WHEN ability.ability = 'CHA' THEN ability.score END) AS charisma
  FROM dnd5e_scene_npc scene_npc
  JOIN dnd5e_npc npc ON npc.id = scene_npc.npc_id
  LEFT JOIN dnd5e_world_entity world_entity ON world_entity.id = scene_npc.world_entity_id
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = npc.stat_block_id
  LEFT JOIN dnd5e_stat_block_ability ability ON ability.stat_block_id = stat_block.id
  LEFT JOIN dnd5e_campaign_npc_state npc_state
    ON npc_state.campaign_id = $2
   AND npc_state.npc_id = npc.id
  WHERE scene_npc.scene_id = $1
    AND scene_npc.is_active = TRUE
    AND npc.is_active = TRUE
    AND (npc_state.current_hit_points IS NULL OR npc_state.current_hit_points > 0)
    AND (
      scene_npc.world_entity_id IS NULL
      OR (
        world_entity.current_scene_id = $1
        AND world_entity.status NOT IN ('inactive', 'archived', 'dead', 'defeated', 'unavailable')
      )
    )
  GROUP BY
    scene_npc.id,
    scene_npc.scene_id,
    scene_npc.npc_id,
    scene_npc.world_entity_id,
    scene_npc.presence_text,
    scene_npc.sort_order,
    scene_npc.availability_conditions_json,
    scene_npc.is_active,
    npc.key,
    npc.name,
    npc.npc_type,
    npc.disposition,
    npc.role,
    npc.description,
    npc_state.id,
    npc_state.disposition,
    npc_state.notes,
    npc_state.current_hit_points,
    world_entity.entity_key,
    world_entity.status,
    world_entity.disposition,
    world_entity.current_scene_id,
    world_entity.state_json,
    stat_block.id,
    stat_block.name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    stat_block.speed_walk,
    stat_block.speed_fly,
    stat_block.speed_swim,
    stat_block.speed_climb,
    stat_block.proficiency_bonus
  ORDER BY scene_npc.sort_order ASC, scene_npc.id ASC;
`;

export const selectSceneInteractionsBySceneQuery = `
  SELECT
    interaction.id,
    interaction.scene_id,
    interaction.npc_id,
    interaction.interaction_key,
    interaction.label,
    interaction.description,
    interaction.interaction_type,
    interaction.skill_id,
    skill.name AS skill_name,
    skill.slug AS skill_slug,
    interaction.difficulty_class,
    interaction.sort_order,
    interaction.is_repeatable,
    interaction.availability_conditions_json,
    interaction.success_effects_json,
    interaction.failure_effects_json,
    interaction.success_text,
    interaction.failure_text,
    interaction.is_active,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.role AS npc_role
  FROM dnd5e_scene_interaction interaction
  LEFT JOIN dnd5e_npc npc ON npc.id = interaction.npc_id
  LEFT JOIN dnd5e_skill skill ON skill.id = interaction.skill_id
  WHERE interaction.scene_id = $1
    AND interaction.is_active = TRUE
  ORDER BY interaction.sort_order ASC, interaction.id ASC;
`;

export const selectSceneInteractionByIdQuery = `
  SELECT
    interaction.id,
    interaction.scene_id,
    interaction.npc_id,
    interaction.interaction_key,
    interaction.label,
    interaction.description,
    interaction.interaction_type,
    interaction.skill_id,
    skill.name AS skill_name,
    skill.slug AS skill_slug,
    interaction.difficulty_class,
    interaction.sort_order,
    interaction.is_repeatable,
    interaction.availability_conditions_json,
    interaction.success_effects_json,
    interaction.failure_effects_json,
    interaction.success_text,
    interaction.failure_text,
    interaction.is_active,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.role AS npc_role
  FROM dnd5e_scene_interaction interaction
  LEFT JOIN dnd5e_npc npc ON npc.id = interaction.npc_id
  LEFT JOIN dnd5e_skill skill ON skill.id = interaction.skill_id
  WHERE interaction.id = $1;
`;

export const selectSceneInteractionBySceneAndKeyQuery = `
  SELECT
    interaction.id,
    interaction.scene_id,
    interaction.npc_id,
    interaction.interaction_key,
    interaction.label,
    interaction.description,
    interaction.interaction_type,
    interaction.skill_id,
    skill.name AS skill_name,
    skill.slug AS skill_slug,
    interaction.difficulty_class,
    interaction.sort_order,
    interaction.is_repeatable,
    interaction.availability_conditions_json,
    interaction.success_effects_json,
    interaction.failure_effects_json,
    interaction.success_text,
    interaction.failure_text,
    interaction.is_active,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.role AS npc_role
  FROM dnd5e_scene_interaction interaction
  LEFT JOIN dnd5e_npc npc ON npc.id = interaction.npc_id
  LEFT JOIN dnd5e_skill skill ON skill.id = interaction.skill_id
  WHERE interaction.scene_id = $1
    AND interaction.interaction_key = $2;
`;

export const selectInteractionResultByInteractionAndCharacterQuery = `
  SELECT
    result.id,
    result.interaction_id,
    result.campaign_id,
    result.character_id,
    result.npc_id,
    result.actor_account_id,
    result.skill_id,
    result.difficulty_class,
    result.roll_value,
    result.skill_modifier,
    result.total_value,
    result.was_success,
    result.result_summary,
    result.applied_effects_json,
    result.created_at
  FROM dnd5e_scene_interaction_result result
  WHERE result.interaction_id = $1
    AND result.campaign_id = $2
    AND result.character_id = $3
  ORDER BY result.created_at DESC, result.id DESC
  LIMIT 1;
`;

export const selectInteractionResultsBySceneAndCharacterQuery = `
  SELECT
    result.id,
    result.interaction_id,
    result.campaign_id,
    result.character_id,
    result.npc_id,
    result.actor_account_id,
    result.skill_id,
    result.difficulty_class,
    result.roll_value,
    result.skill_modifier,
    result.total_value,
    result.was_success,
    result.result_summary,
    result.applied_effects_json,
    result.created_at
  FROM dnd5e_scene_interaction_result result
  JOIN dnd5e_scene_interaction interaction ON interaction.id = result.interaction_id
  WHERE result.campaign_id = $1
    AND result.character_id = $2
    AND interaction.scene_id = $3
  ORDER BY result.created_at DESC, result.id DESC;
`;

export const insertInteractionResultQuery = `
  INSERT INTO dnd5e_scene_interaction_result (
    interaction_id,
    campaign_id,
    character_id,
    npc_id,
    actor_account_id,
    skill_id,
    difficulty_class,
    roll_value,
    skill_modifier,
    total_value,
    was_success,
    result_summary,
    applied_effects_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
  RETURNING *;
`;

export const selectCampaignFlagsByCampaignQuery = `
  SELECT
    flag.id,
    flag.campaign_id,
    flag.flag_key,
    flag.flag_value_json,
    flag.flag_category,
    flag.metadata_json,
    flag.notes,
    flag.source_type,
    flag.source_entity_id,
    flag.created_at,
    flag.updated_at
  FROM dnd5e_campaign_flag flag
  WHERE flag.campaign_id = $1
  ORDER BY flag.flag_key ASC, flag.id ASC;
`;

export const selectCharacterFlagsByCampaignQuery = `
  SELECT
    flag.id,
    flag.campaign_id,
    flag.character_id,
    flag.flag_key,
    flag.flag_value_json,
    flag.flag_category,
    flag.metadata_json,
    flag.notes,
    flag.source_type,
    flag.source_entity_id,
    flag.created_at,
    flag.updated_at
  FROM dnd5e_character_flag flag
  WHERE flag.campaign_id = $1
    AND flag.character_id = $2
  ORDER BY flag.flag_key ASC, flag.id ASC;
`;

export const upsertCampaignFlagQuery = `
  INSERT INTO dnd5e_campaign_flag (
    campaign_id,
    flag_key,
    flag_value_json,
    notes,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3::jsonb, $4, $5, $6)
  ON CONFLICT (campaign_id, flag_key)
  DO UPDATE SET
    flag_value_json = EXCLUDED.flag_value_json,
    notes = EXCLUDED.notes,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    updated_at = NOW()
  RETURNING *;
`;

export const upsertCharacterFlagQuery = `
  INSERT INTO dnd5e_character_flag (
    campaign_id,
    character_id,
    flag_key,
    flag_value_json,
    notes,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
  ON CONFLICT (campaign_id, character_id, flag_key)
  DO UPDATE SET
    flag_value_json = EXCLUDED.flag_value_json,
    notes = EXCLUDED.notes,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    updated_at = NOW()
  RETURNING *;
`;

export const selectCharacterQuestsByCampaignQuery = `
  SELECT
    character_quest.id,
    character_quest.campaign_id,
    character_quest.character_id,
    character_quest.quest_id,
    character_quest.status,
    character_quest.started_at,
    character_quest.completed_at,
    character_quest.failed_at,
    character_quest.created_at,
    character_quest.updated_at,
    quest.key AS quest_key,
    quest.name AS quest_name,
    quest.summary AS quest_summary,
    quest.description AS quest_description,
    quest.availability_conditions_json,
    quest.discovery_summary,
    quest.is_active AS quest_is_active
  FROM dnd5e_character_quest character_quest
  JOIN dnd5e_quest quest ON quest.id = character_quest.quest_id
  WHERE character_quest.campaign_id = $1
    AND character_quest.character_id = $2
  ORDER BY character_quest.created_at ASC, character_quest.id ASC;
`;

export const selectCharacterObjectiveRowsByCampaignQuery = `
  SELECT
    character_objective.id,
    character_objective.character_quest_id,
    character_objective.objective_id,
    character_objective.status,
    character_objective.progress_count,
    character_objective.completed_at,
    character_objective.created_at,
    character_objective.updated_at,
    objective.quest_id,
    objective.key AS objective_key,
    objective.title AS objective_title,
    objective.description AS objective_description,
    objective.sort_order,
    objective.activation_conditions_json,
    objective.completion_conditions_json,
    objective.failure_conditions_json,
    objective.progress_target,
    objective.hard_gate,
    quest.key AS quest_key
  FROM dnd5e_character_objective character_objective
  JOIN dnd5e_quest_objective objective ON objective.id = character_objective.objective_id
  JOIN dnd5e_quest quest ON quest.id = objective.quest_id
  JOIN dnd5e_character_quest character_quest ON character_quest.id = character_objective.character_quest_id
  WHERE character_quest.campaign_id = $1
    AND character_quest.character_id = $2
  ORDER BY objective.sort_order ASC, character_objective.id ASC;
`;

export const selectQuestByKeyQuery = `
  SELECT
    quest.id,
    quest.key,
    quest.name,
    quest.summary,
    quest.description,
    quest.is_active,
    quest.created_at,
    quest.updated_at
  FROM dnd5e_quest quest
  WHERE quest.key = $1;
`;

export const selectQuestObjectiveByQuestAndKeyQuery = `
  SELECT
    objective.id,
    objective.quest_id,
    objective.key,
    objective.title,
    objective.description,
    objective.sort_order,
    objective.created_at
  FROM dnd5e_quest_objective objective
  WHERE objective.quest_id = $1
    AND objective.key = $2;
`;

export const selectCharacterQuestByQuestIdQuery = `
  SELECT
    character_quest.id,
    character_quest.campaign_id,
    character_quest.character_id,
    character_quest.quest_id,
    character_quest.status,
    character_quest.started_at,
    character_quest.completed_at,
    character_quest.failed_at,
    character_quest.created_at,
    character_quest.updated_at
  FROM dnd5e_character_quest character_quest
  WHERE character_quest.campaign_id = $1
    AND character_quest.character_id = $2
    AND character_quest.quest_id = $3;
`;

export const insertCharacterQuestQuery = `
  INSERT INTO dnd5e_character_quest (
    campaign_id,
    character_id,
    quest_id,
    status,
    started_at,
    completed_at,
    failed_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING *;
`;

export const updateCharacterQuestStatusQuery = `
  UPDATE dnd5e_character_quest
  SET
    status = $2,
    started_at = $3,
    completed_at = $4,
    failed_at = $5,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const selectCharacterObjectiveByObjectiveIdQuery = `
  SELECT
    character_objective.id,
    character_objective.character_quest_id,
    character_objective.objective_id,
    character_objective.status,
    character_objective.progress_count,
    character_objective.completed_at,
    character_objective.created_at,
    character_objective.updated_at
  FROM dnd5e_character_objective character_objective
  WHERE character_objective.character_quest_id = $1
    AND character_objective.objective_id = $2;
`;

export const insertCharacterObjectiveQuery = `
  INSERT INTO dnd5e_character_objective (
    character_quest_id,
    objective_id,
    status,
    progress_count,
    completed_at
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *;
`;

export const updateCharacterObjectiveStatusQuery = `
  UPDATE dnd5e_character_objective
  SET
    status = $2,
    progress_count = $3,
    completed_at = $4,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const selectNpcByKeyQuery = `
  SELECT
    npc.id,
    npc.key,
    npc.name,
    npc.npc_type,
    npc.disposition,
    npc.role,
    npc.description,
    npc.is_active,
    npc.created_at,
    npc.updated_at
  FROM dnd5e_npc npc
  WHERE npc.key = $1;
`;

export const upsertCampaignNpcStateQuery = `
  INSERT INTO dnd5e_campaign_npc_state (
    campaign_id,
    npc_id,
    disposition,
    notes
  )
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (campaign_id, npc_id)
  DO UPDATE SET
    disposition = EXCLUDED.disposition,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING *;
`;

export const updateCampaignCharacterCurrentSceneQuery = `
  UPDATE dnd5e_campaign_character
  SET
    current_scene_id = $3,
    current_scene_entered_at = NOW(),
    updated_at = NOW()
  WHERE campaign_id = $1
    AND character_id = $2
  RETURNING *;
`;

export const insertCharacterSceneHistoryQuery = `
  INSERT INTO dnd5e_character_scene_history (
    campaign_id,
    character_id,
    from_scene_id,
    to_scene_id,
    transition_id,
    transition_key,
    reason,
    actor_account_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING *;
`;

export const selectCharacterSceneHistoryQuery = `
  SELECT
    history.id,
    history.campaign_id,
    history.character_id,
    history.from_scene_id,
    from_scene.key AS from_scene_key,
    from_scene.name AS from_scene_name,
    history.to_scene_id,
    to_scene.key AS to_scene_key,
    to_scene.name AS to_scene_name,
    history.transition_id,
    history.transition_key,
    history.reason,
    history.actor_account_id,
    actor.display_name AS actor_display_name,
    history.created_at
  FROM dnd5e_character_scene_history history
  LEFT JOIN dnd5e_scene from_scene ON from_scene.id = history.from_scene_id
  JOIN dnd5e_scene to_scene ON to_scene.id = history.to_scene_id
  LEFT JOIN account actor ON actor.id = history.actor_account_id
  WHERE history.campaign_id = $1
    AND history.character_id = $2
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT $3;
`;

export const insertCampaignLogQuery = `
  INSERT INTO dnd5e_campaign_log (
    campaign_id,
    character_id,
    actor_account_id,
    log_type,
    message,
    data_json
  )
  VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  RETURNING *;
`;

export const selectCampaignLogsQuery = `
  SELECT
    log.id,
    log.campaign_id,
    log.character_id,
    log.actor_account_id,
    actor.display_name AS actor_display_name,
    character.name AS character_name,
    log.log_type,
    log.message,
    log.data_json,
    log.created_at
  FROM dnd5e_campaign_log log
  LEFT JOIN account actor ON actor.id = log.actor_account_id
  LEFT JOIN dnd5e_character character ON character.id = log.character_id
  WHERE log.campaign_id = $1
  ORDER BY log.created_at DESC, log.id DESC
  LIMIT $2 OFFSET $3;
`;
