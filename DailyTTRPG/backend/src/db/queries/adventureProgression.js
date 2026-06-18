export const selectAdventureQuestDefinitionsQuery = `
  SELECT
    quest.id AS quest_id,
    quest.key AS quest_key,
    quest.name AS quest_name,
    quest.summary AS quest_summary,
    quest.description AS quest_description,
    quest.availability_conditions_json,
    quest.discovery_summary,
    objective.id AS objective_id,
    objective.key AS objective_key,
    objective.title AS objective_title,
    objective.description AS objective_description,
    objective.sort_order,
    objective.activation_conditions_json,
    objective.completion_conditions_json,
    objective.failure_conditions_json,
    objective.progress_target,
    objective.hard_gate
  FROM dnd5e_quest quest
  LEFT JOIN dnd5e_quest_objective objective ON objective.quest_id = quest.id
  WHERE quest.is_active = TRUE
  ORDER BY quest.id ASC, objective.sort_order ASC NULLS LAST, objective.id ASC NULLS LAST;
`;

export const selectSceneUnlockDefinitionsBySceneIdsQuery = `
  SELECT
    unlock.id,
    unlock.scene_id,
    unlock.unlock_key,
    unlock.unlock_type,
    unlock.condition_data_json,
    unlock.description,
    unlock.is_active,
    unlock.created_at,
    unlock.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name
  FROM dnd5e_scene_unlock unlock
  JOIN dnd5e_scene scene ON scene.id = unlock.scene_id
  WHERE unlock.scene_id = ANY($1::bigint[])
    AND unlock.is_active = TRUE
  ORDER BY unlock.scene_id ASC, unlock.id ASC;
`;

export const upsertCampaignFlagWithMetadataQuery = `
  INSERT INTO dnd5e_campaign_flag (
    campaign_id,
    flag_key,
    flag_value_json,
    flag_category,
    metadata_json,
    notes,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)
  ON CONFLICT (campaign_id, flag_key)
  DO UPDATE SET
    flag_value_json = EXCLUDED.flag_value_json,
    flag_category = EXCLUDED.flag_category,
    metadata_json = EXCLUDED.metadata_json,
    notes = EXCLUDED.notes,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    updated_at = NOW()
  RETURNING *;
`;

export const upsertCharacterFlagWithMetadataQuery = `
  INSERT INTO dnd5e_character_flag (
    campaign_id,
    character_id,
    flag_key,
    flag_value_json,
    flag_category,
    metadata_json,
    notes,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9)
  ON CONFLICT (campaign_id, character_id, flag_key)
  DO UPDATE SET
    flag_value_json = EXCLUDED.flag_value_json,
    flag_category = EXCLUDED.flag_category,
    metadata_json = EXCLUDED.metadata_json,
    notes = EXCLUDED.notes,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    updated_at = NOW()
  RETURNING *;
`;

export const insertAdventureRewardQuery = `
  INSERT INTO dnd5e_reward (
    reward_type,
    value_json,
    metadata_json,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
  RETURNING *;
`;

export const insertAdventureRewardApplicationQuery = `
  INSERT INTO dnd5e_reward_application (
    character_id,
    campaign_id,
    reward_id,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *;
`;

export const selectRewardApplicationsByCharacterQuery = `
  SELECT
    application.id,
    application.character_id,
    application.campaign_id,
    application.reward_id,
    application.source_type,
    application.source_entity_id,
    application.applied_at,
    reward.reward_type,
    reward.value_json,
    reward.metadata_json,
    reward.source_type AS reward_source_type,
    reward.source_entity_id AS reward_source_entity_id,
    reward.created_at AS reward_created_at
  FROM dnd5e_reward_application application
  JOIN dnd5e_reward reward ON reward.id = application.reward_id
  WHERE application.character_id = $1
    AND ($2::bigint IS NULL OR application.campaign_id = $2)
  ORDER BY application.applied_at DESC, application.id DESC;
`;

export const selectRewardApplicationsByCampaignQuery = `
  SELECT
    application.id,
    application.character_id,
    application.campaign_id,
    application.reward_id,
    application.source_type,
    application.source_entity_id,
    application.applied_at,
    reward.reward_type,
    reward.value_json,
    reward.metadata_json,
    reward.source_type AS reward_source_type,
    reward.source_entity_id AS reward_source_entity_id,
    reward.created_at AS reward_created_at
  FROM dnd5e_reward_application application
  JOIN dnd5e_reward reward ON reward.id = application.reward_id
  WHERE application.campaign_id = $1
  ORDER BY application.applied_at DESC, application.id DESC;
`;

export const upsertCharacterKnowledgeQuery = `
  INSERT INTO dnd5e_character_knowledge (
    campaign_id,
    character_id,
    knowledge_type,
    knowledge_key,
    title,
    summary,
    metadata_json,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
  ON CONFLICT (campaign_id, character_id, knowledge_type, knowledge_key)
  DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    metadata_json = EXCLUDED.metadata_json,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    updated_at = NOW()
  RETURNING *;
`;

export const selectCharacterKnowledgeByCampaignQuery = `
  SELECT
    knowledge.id,
    knowledge.campaign_id,
    knowledge.character_id,
    knowledge.knowledge_type,
    knowledge.knowledge_key,
    knowledge.title,
    knowledge.summary,
    knowledge.metadata_json,
    knowledge.source_type,
    knowledge.source_entity_id,
    knowledge.created_at,
    knowledge.updated_at
  FROM dnd5e_character_knowledge knowledge
  WHERE knowledge.campaign_id = $1
    AND knowledge.character_id = $2
  ORDER BY knowledge.created_at DESC, knowledge.id DESC;
`;
