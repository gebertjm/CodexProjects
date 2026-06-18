export const selectWorldsQuery = `
  SELECT
    world.id,
    world.name,
    world.slug,
    world.description,
    world.theme_tags_json,
    world.status,
    world.created_at,
    world.updated_at,
    (
      SELECT COUNT(*)
      FROM dnd5e_campaign campaign
      WHERE campaign.world_id = world.id
    ) AS campaign_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_region region
      WHERE region.world_id = world.id
    ) AS region_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_world_entity entity
      WHERE entity.world_id = world.id
    ) AS entity_count
  FROM dnd5e_world world
  ORDER BY world.created_at ASC, world.id ASC;
`;

export const selectWorldByIdQuery = `
  SELECT
    world.id,
    world.name,
    world.slug,
    world.description,
    world.theme_tags_json,
    world.status,
    world.created_at,
    world.updated_at,
    (
      SELECT COUNT(*)
      FROM dnd5e_campaign campaign
      WHERE campaign.world_id = world.id
    ) AS campaign_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_region region
      WHERE region.world_id = world.id
    ) AS region_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_location location
      WHERE location.world_id = world.id
    ) AS location_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_scene scene
      WHERE scene.world_id = world.id
    ) AS scene_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_world_entity entity
      WHERE entity.world_id = world.id
    ) AS entity_count
  FROM dnd5e_world world
  WHERE world.id = $1;
`;

export const selectWorldCampaignsQuery = `
  SELECT
    campaign.id,
    campaign.world_id,
    world.name AS world_name,
    world.slug AS world_slug,
    campaign.name,
    campaign.slug,
    campaign.campaign_type,
    campaign.status,
    campaign.description,
    campaign.created_by_account_id,
    creator.display_name AS created_by_display_name,
    campaign.is_active,
    campaign.created_at,
    campaign.updated_at,
    (
      SELECT COUNT(*)
      FROM dnd5e_campaign_character membership
      WHERE membership.campaign_id = campaign.id
        AND membership.is_active = TRUE
    ) AS member_count
  FROM dnd5e_campaign campaign
  JOIN dnd5e_world world ON world.id = campaign.world_id
  LEFT JOIN account creator ON creator.id = campaign.created_by_account_id
  WHERE campaign.world_id = $1
  ORDER BY
    CASE campaign.campaign_type
      WHEN 'solo' THEN 1
      WHEN 'party' THEN 2
      WHEN 'questline' THEN 3
      ELSE 4
    END,
    campaign.created_at ASC,
    campaign.id ASC;
`;

export const selectCharacterCampaignsQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.joined_by_account_id,
    joined_by.display_name AS joined_by_display_name,
    membership.is_active,
    membership.membership_status,
    membership.is_active_context,
    membership.is_default_solo_campaign,
    membership.joined_at,
    membership.left_at,
    membership.current_scene_id,
    current_scene.name AS current_scene_name,
    current_scene.key AS current_scene_key,
    membership.current_scene_entered_at,
    membership.created_at,
    membership.updated_at,
    character.world_id AS character_world_id,
    character.name AS character_name,
    character.is_active AS character_is_active,
    campaign.world_id AS campaign_world_id,
    campaign.name AS campaign_name,
    campaign.slug AS campaign_slug,
    campaign.campaign_type,
    campaign.status AS campaign_status,
    campaign.is_active AS campaign_is_active,
    world.name AS world_name,
    world.slug AS world_slug
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_world world ON world.id = campaign.world_id
  LEFT JOIN account joined_by ON joined_by.id = membership.joined_by_account_id
  LEFT JOIN dnd5e_scene current_scene ON current_scene.id = membership.current_scene_id
  WHERE membership.character_id = $1
  ORDER BY membership.is_active_context DESC,
    membership.is_default_solo_campaign DESC,
    membership.joined_at ASC NULLS LAST,
    membership.id ASC;
`;

export const selectWorldRegionsQuery = `
  SELECT
    region.id AS region_id,
    region.world_id,
    region.template_id AS region_template_id,
    region_template.key AS region_template_key,
    region.key AS region_key,
    region.name AS region_name,
    region.description AS region_description,
    region.is_active AS region_is_active,
    location.id AS location_id,
    location.template_id AS location_template_id,
    location_template.key AS location_template_key,
    location.key AS location_key,
    location.name AS location_name,
    location.description AS location_description,
    location.is_active AS location_is_active,
    scene.id AS scene_id,
    scene.template_id AS scene_template_id,
    scene_template.key AS scene_template_key,
    scene.key AS scene_key,
    scene.name AS scene_name,
    scene.summary AS scene_summary,
    scene.is_starting_scene,
    scene.is_active AS scene_is_active
  FROM dnd5e_region region
  LEFT JOIN dnd5e_region_template region_template ON region_template.id = region.template_id
  LEFT JOIN dnd5e_location location ON location.region_id = region.id
  LEFT JOIN dnd5e_location_template location_template ON location_template.id = location.template_id
  LEFT JOIN dnd5e_scene scene ON scene.location_id = location.id
  LEFT JOIN dnd5e_scene_template scene_template ON scene_template.id = scene.template_id
  WHERE region.world_id = $1
  ORDER BY region.name ASC, location.name ASC NULLS LAST, scene.is_starting_scene DESC NULLS LAST, scene.name ASC NULLS LAST;
`;

export const selectLocationByIdQuery = `
  SELECT
    location.id,
    location.world_id,
    world.name AS world_name,
    world.slug AS world_slug,
    location.region_id,
    region.key AS region_key,
    region.name AS region_name,
    location.template_id,
    location_template.key AS template_key,
    location_template.name AS template_name,
    location.key,
    location.name,
    location.description,
    location.region_name AS legacy_region_name,
    location.is_active,
    location.created_at,
    location.updated_at
  FROM dnd5e_location location
  JOIN dnd5e_world world ON world.id = location.world_id
  JOIN dnd5e_region region ON region.id = location.region_id
  LEFT JOIN dnd5e_location_template location_template ON location_template.id = location.template_id
  WHERE location.id = $1;
`;

export const selectLocationScenesQuery = `
  SELECT
    scene.id,
    scene.location_id,
    scene.world_id,
    scene.template_id,
    scene_template.key AS template_key,
    scene.key,
    scene.name,
    scene.summary,
    scene.is_starting_scene,
    scene.is_active,
    scene.created_at,
    scene.updated_at
  FROM dnd5e_scene scene
  LEFT JOIN dnd5e_scene_template scene_template ON scene_template.id = scene.template_id
  WHERE scene.location_id = $1
  ORDER BY scene.is_starting_scene DESC, scene.name ASC, scene.id ASC;
`;

export const selectLocationCampaignStatesQuery = `
  SELECT
    state.id,
    state.campaign_id,
    campaign.name AS campaign_name,
    campaign.slug AS campaign_slug,
    campaign.campaign_type,
    state.location_id,
    state.is_discovered,
    state.is_available,
    state.overlay_json,
    state.notes,
    state.created_at,
    state.updated_at
  FROM dnd5e_campaign_location_state state
  JOIN dnd5e_campaign campaign ON campaign.id = state.campaign_id
  WHERE state.location_id = $1
  ORDER BY campaign.campaign_type ASC, campaign.name ASC, state.id ASC;
`;

export const selectSceneByIdQuery = `
  SELECT
    scene.id,
    scene.world_id,
    world.name AS world_name,
    world.slug AS world_slug,
    scene.location_id,
    location.key AS location_key,
    location.name AS location_name,
    location.region_id,
    region.key AS region_key,
    region.name AS region_name,
    scene.template_id,
    scene_template.key AS template_key,
    scene_template.name AS template_name,
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
  JOIN dnd5e_world world ON world.id = scene.world_id
  JOIN dnd5e_location location ON location.id = scene.location_id
  JOIN dnd5e_region region ON region.id = location.region_id
  LEFT JOIN dnd5e_scene_template scene_template ON scene_template.id = scene.template_id
  WHERE scene.id = $1;
`;

export const selectSceneCampaignStatesQuery = `
  SELECT
    state.id,
    state.campaign_id,
    campaign.name AS campaign_name,
    campaign.slug AS campaign_slug,
    campaign.campaign_type,
    state.scene_id,
    state.is_discovered,
    state.is_available,
    state.overlay_json,
    state.notes,
    state.created_at,
    state.updated_at
  FROM dnd5e_campaign_scene_state state
  JOIN dnd5e_campaign campaign ON campaign.id = state.campaign_id
  WHERE state.scene_id = $1
  ORDER BY campaign.campaign_type ASC, campaign.name ASC, state.id ASC;
`;

export const selectSceneWorldEntitiesQuery = `
  SELECT
    entity.id,
    entity.world_id,
    entity.entity_key,
    entity.entity_type,
    entity.npc_template_id,
    npc.name AS npc_name,
    npc.key AS npc_key,
    npc.npc_type,
    npc.role AS npc_role,
    entity.monster_template_id,
    monster.name AS monster_name,
    monster.key AS monster_key,
    entity.current_region_id,
    region.key AS current_region_key,
    region.name AS current_region_name,
    entity.current_location_id,
    location.key AS current_location_key,
    location.name AS current_location_name,
    entity.current_scene_id,
    scene.key AS current_scene_key,
    scene.name AS current_scene_name,
    entity.status,
    entity.disposition,
    entity.faction,
    entity.state_json,
    entity.notes,
    entity.created_at,
    entity.updated_at
  FROM dnd5e_world_entity entity
  LEFT JOIN dnd5e_npc npc ON npc.id = entity.npc_template_id
  LEFT JOIN dnd5e_monster monster ON monster.id = entity.monster_template_id
  LEFT JOIN dnd5e_region region ON region.id = entity.current_region_id
  LEFT JOIN dnd5e_location location ON location.id = entity.current_location_id
  LEFT JOIN dnd5e_scene scene ON scene.id = entity.current_scene_id
  WHERE entity.current_scene_id = $1
  ORDER BY entity.entity_type ASC, COALESCE(npc.name, monster.name, entity.entity_key) ASC;
`;

export const selectWorldEntitiesQuery = `
  SELECT
    entity.id,
    entity.world_id,
    world.name AS world_name,
    world.slug AS world_slug,
    entity.entity_key,
    entity.entity_type,
    entity.npc_template_id,
    npc.name AS npc_name,
    npc.key AS npc_key,
    npc.npc_type,
    npc.role AS npc_role,
    entity.monster_template_id,
    monster.name AS monster_name,
    monster.key AS monster_key,
    entity.current_region_id,
    region.key AS current_region_key,
    region.name AS current_region_name,
    entity.current_location_id,
    location.key AS current_location_key,
    location.name AS current_location_name,
    entity.current_scene_id,
    scene.key AS current_scene_key,
    scene.name AS current_scene_name,
    entity.status,
    entity.disposition,
    entity.faction,
    entity.state_json,
    entity.notes,
    entity.created_at,
    entity.updated_at
  FROM dnd5e_world_entity entity
  JOIN dnd5e_world world ON world.id = entity.world_id
  LEFT JOIN dnd5e_npc npc ON npc.id = entity.npc_template_id
  LEFT JOIN dnd5e_monster monster ON monster.id = entity.monster_template_id
  LEFT JOIN dnd5e_region region ON region.id = entity.current_region_id
  LEFT JOIN dnd5e_location location ON location.id = entity.current_location_id
  LEFT JOIN dnd5e_scene scene ON scene.id = entity.current_scene_id
  WHERE entity.world_id = $1
  ORDER BY entity.entity_type ASC, entity.status ASC, COALESCE(npc.name, monster.name, entity.entity_key) ASC;
`;

export const selectDefaultWorldQuery = `
  SELECT id
  FROM dnd5e_world
  WHERE slug = 'daily-rpg-prime'
  LIMIT 1;
`;
