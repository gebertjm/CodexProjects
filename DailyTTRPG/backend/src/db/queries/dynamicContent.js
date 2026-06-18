export const selectContentHooksForContextQuery = `
  SELECT
    hook.id,
    hook.world_id,
    hook.campaign_id,
    hook.scene_id,
    hook.npc_id,
    hook.hook_key,
    hook.hook_point,
    hook.scope_type,
    hook.scope_key,
    hook.label,
    hook.description,
    hook.conditions_json,
    hook.effects_json,
    hook.event_triggers_json,
    hook.feedback_json,
    hook.priority,
    hook.is_active,
    hook.created_at,
    hook.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name
  FROM dnd5e_content_hook hook
  JOIN dnd5e_campaign campaign ON campaign.world_id = hook.world_id
  LEFT JOIN dnd5e_scene scene ON scene.id = hook.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = hook.npc_id
  WHERE campaign.id = $1
    AND hook.is_active = TRUE
    AND (
      ($2::BIGINT IS NULL AND hook.scene_id IS NULL)
      OR
      ($2::BIGINT IS NOT NULL AND (hook.scene_id IS NULL OR hook.scene_id = $2))
    )
    AND ($3::TEXT IS NULL OR hook.hook_point = $3)
    AND (hook.campaign_id IS NULL OR hook.campaign_id = $1)
  ORDER BY hook.priority DESC, hook.id ASC;
`;

export const selectContentHookByKeyQuery = `
  SELECT
    hook.id,
    hook.world_id,
    hook.campaign_id,
    hook.scene_id,
    hook.npc_id,
    hook.hook_key,
    hook.hook_point,
    hook.scope_type,
    hook.scope_key,
    hook.label,
    hook.description,
    hook.conditions_json,
    hook.effects_json,
    hook.event_triggers_json,
    hook.feedback_json,
    hook.priority,
    hook.is_active,
    hook.created_at,
    hook.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name
  FROM dnd5e_content_hook hook
  LEFT JOIN dnd5e_scene scene ON scene.id = hook.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = hook.npc_id
  WHERE hook.world_id = $1
    AND hook.hook_key = $2
  LIMIT 1;
`;

export const selectCharacterKnowledgeKeysQuery = `
  SELECT
    knowledge.knowledge_type,
    knowledge.knowledge_key
  FROM dnd5e_character_knowledge knowledge
  WHERE knowledge.campaign_id = $1
    AND knowledge.character_id = $2;
`;

export const selectWorldEntitiesForContextQuery = `
  SELECT
    entity.id,
    entity.entity_key,
    entity.entity_type,
    entity.status,
    entity.disposition,
    entity.faction,
    entity.state_json,
    entity.current_region_id,
    entity.current_location_id,
    entity.current_scene_id,
    npc.key AS npc_key,
    monster.key AS monster_key
  FROM dnd5e_world_entity entity
  LEFT JOIN dnd5e_npc npc ON npc.id = entity.npc_template_id
  LEFT JOIN dnd5e_monster monster ON monster.id = entity.monster_template_id
  WHERE entity.world_id = (
    SELECT world_id FROM dnd5e_campaign WHERE id = $1
  )
    AND ($2::BIGINT IS NULL OR entity.current_scene_id IS NULL OR entity.current_scene_id = $2)
  ORDER BY entity.entity_key ASC, entity.id ASC;
`;
