export const selectCampaignWorldForEncounterQuery = `
  SELECT
    campaign.id,
    campaign.world_id,
    campaign.slug,
    campaign.name,
    campaign.campaign_type
  FROM dnd5e_campaign campaign
  WHERE campaign.id = $1;
`;

export const selectEncounterTemplateBySlugAndWorldQuery = `
  SELECT
    encounter.*,
    world.slug AS world_slug,
    campaign.slug AS campaign_slug,
    scene.key AS scene_slug
  FROM dnd5e_encounter_template encounter
  JOIN dnd5e_world world ON world.id = encounter.world_id
  LEFT JOIN dnd5e_campaign campaign ON campaign.id = encounter.campaign_id
  LEFT JOIN dnd5e_scene scene ON scene.id = encounter.scene_id
  WHERE encounter.world_id = $1
    AND encounter.slug = $2
    AND encounter.is_active = TRUE
  ORDER BY encounter.campaign_id NULLS LAST, encounter.id DESC
  LIMIT 1;
`;

export const selectEncounterTemplateBySlugAndCampaignQuery = `
  SELECT
    encounter.*,
    world.slug AS world_slug,
    campaign.slug AS campaign_slug,
    scene.key AS scene_slug
  FROM dnd5e_campaign context_campaign
  JOIN dnd5e_encounter_template encounter
    ON encounter.world_id = context_campaign.world_id
  JOIN dnd5e_world world ON world.id = encounter.world_id
  LEFT JOIN dnd5e_campaign campaign ON campaign.id = encounter.campaign_id
  LEFT JOIN dnd5e_scene scene ON scene.id = encounter.scene_id
  WHERE context_campaign.id = $1
    AND encounter.slug = $2
    AND encounter.is_active = TRUE
  ORDER BY
    CASE WHEN encounter.campaign_id = context_campaign.id THEN 0 ELSE 1 END,
    encounter.id DESC
  LIMIT 1;
`;

export const selectCharacterForEncounterStrengthQuery = `
  SELECT
    character.id,
    character.name,
    character.level,
    character.pending_level_count,
    character.level_up_available,
    character.is_active
  FROM dnd5e_character character
  WHERE character.id = $1;
`;

export const selectCampaignCharactersForEncounterStrengthQuery = `
  SELECT
    character.id,
    character.name,
    character.level,
    character.pending_level_count,
    character.level_up_available,
    membership.membership_status,
    membership.is_active
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  WHERE membership.campaign_id = $1
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
    AND character.is_active = TRUE
  ORDER BY character.id ASC;
`;

export const selectNpcPowerByKeyQuery = `
  SELECT
    'npc' AS entity_type,
    npc.id AS entity_id,
    npc.key AS entity_slug,
    npc.name,
    npc.stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    stat_block.hit_point_max,
    stat_block.armor_class
  FROM dnd5e_npc npc
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = npc.stat_block_id
  WHERE npc.key = $1
  LIMIT 1;
`;

export const selectMonsterPowerByKeyQuery = `
  SELECT
    'monster' AS entity_type,
    monster.id AS entity_id,
    monster.key AS entity_slug,
    monster.name,
    monster.stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    stat_block.hit_point_max,
    stat_block.armor_class
  FROM dnd5e_monster monster
  JOIN dnd5e_stat_block stat_block ON stat_block.id = monster.stat_block_id
  WHERE monster.key = $1
  LIMIT 1;
`;

export const selectWorldEntityPowerByKeyQuery = `
  SELECT
    world_entity.entity_type,
    CASE
      WHEN world_entity.entity_type = 'npc' THEN npc.id
      ELSE monster.id
    END AS entity_id,
    world_entity.entity_key AS entity_slug,
    COALESCE(npc.name, monster.name) AS name,
    COALESCE(npc.stat_block_id, monster.stat_block_id) AS stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    stat_block.hit_point_max,
    stat_block.armor_class
  FROM dnd5e_world_entity world_entity
  LEFT JOIN dnd5e_npc npc
    ON world_entity.entity_type = 'npc'
   AND npc.id = world_entity.npc_template_id
  LEFT JOIN dnd5e_monster monster
    ON world_entity.entity_type = 'monster'
   AND monster.id = world_entity.monster_template_id
  LEFT JOIN dnd5e_stat_block stat_block
    ON stat_block.id = COALESCE(npc.stat_block_id, monster.stat_block_id)
  WHERE world_entity.world_id = $1
    AND world_entity.entity_key = $2
  LIMIT 1;
`;
