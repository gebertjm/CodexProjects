export const selectCampaignByIdForCombatQuery = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.description,
    campaign.is_active,
    campaign.created_by_account_id,
    campaign.created_at,
    campaign.updated_at
  FROM dnd5e_campaign campaign
  WHERE campaign.id = $1;
`;

export const selectSceneByIdForCombatQuery = `
  SELECT
    scene.id,
    scene.location_id,
    scene.key,
    scene.name,
    scene.summary,
    scene.is_active
  FROM dnd5e_scene scene
  WHERE scene.id = $1;
`;

export const selectEventByIdForCombatQuery = `
  SELECT
    event_instance.id,
    event_instance.campaign_id,
    event_instance.character_id,
    event_instance.template_id,
    event_instance.status,
    event_instance.prompt_text,
    template.key AS template_key,
    template.name AS template_name,
    template.event_type
  FROM dnd5e_event_instance event_instance
  JOIN dnd5e_event_template template ON template.id = event_instance.template_id
  WHERE event_instance.id = $1;
`;

export const selectCampaignCharacterMembershipForCombatQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.is_active,
    membership.current_scene_id,
    membership.current_scene_entered_at,
    character.name AS character_name,
    character.account_id,
    character.is_active AS character_is_active,
    account.is_active AS account_is_active
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN account ON account.id = character.account_id
  WHERE membership.campaign_id = $1
    AND membership.character_id = $2;
`;

export const selectCharacterCombatSourceQuery = `
  SELECT
    character.id,
    character.account_id,
    character.name,
    character.is_active,
    character.level,
    account.is_active AS account_is_active,
    character.max_hit_points,
    character.current_hit_points,
    character.temporary_hit_points,
    character.armor_class,
    character.speed,
    character.proficiency_bonus,
    character.strength,
    character.dexterity,
    character.constitution,
    character.intelligence,
    character.wisdom,
    character.charisma
  FROM dnd5e_character character
  JOIN account ON account.id = character.account_id
  WHERE character.id = $1;
`;

export const selectNpcCombatSourceQuery = `
  SELECT
    npc.id,
    npc.key,
    npc.name,
    npc.npc_type,
    npc.disposition,
    npc.role,
    npc.is_active,
    stat_block.id AS stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    COALESCE(npc_state.current_hit_points, stat_block.hit_point_max) AS current_hit_points,
    stat_block.speed_walk,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value,
    MAX(CASE WHEN ability.ability = 'STR' THEN ability.score END) AS strength,
    MAX(CASE WHEN ability.ability = 'DEX' THEN ability.score END) AS dexterity,
    MAX(CASE WHEN ability.ability = 'CON' THEN ability.score END) AS constitution,
    MAX(CASE WHEN ability.ability = 'INT' THEN ability.score END) AS intelligence,
    MAX(CASE WHEN ability.ability = 'WIS' THEN ability.score END) AS wisdom,
    MAX(CASE WHEN ability.ability = 'CHA' THEN ability.score END) AS charisma
  FROM dnd5e_npc npc
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = npc.stat_block_id
  LEFT JOIN dnd5e_stat_block_ability ability ON ability.stat_block_id = stat_block.id
  LEFT JOIN dnd5e_campaign_npc_state npc_state
    ON npc_state.campaign_id = $2
   AND npc_state.npc_id = npc.id
  WHERE npc.id = $1
  GROUP BY
    npc.id,
    npc.key,
    npc.name,
    npc.npc_type,
    npc.disposition,
    npc.role,
    npc.is_active,
    stat_block.id,
    stat_block.name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    npc_state.current_hit_points,
    stat_block.speed_walk,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value;
`;

export const selectMonsterCombatSourceQuery = `
  SELECT
    monster.id,
    monster.key,
    monster.name,
    monster.description,
    monster.source,
    monster.is_active,
    stat_block.id AS stat_block_id,
    stat_block.name AS stat_block_name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    stat_block.speed_walk,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value,
    MAX(CASE WHEN ability.ability = 'STR' THEN ability.score END) AS strength,
    MAX(CASE WHEN ability.ability = 'DEX' THEN ability.score END) AS dexterity,
    MAX(CASE WHEN ability.ability = 'CON' THEN ability.score END) AS constitution,
    MAX(CASE WHEN ability.ability = 'INT' THEN ability.score END) AS intelligence,
    MAX(CASE WHEN ability.ability = 'WIS' THEN ability.score END) AS wisdom,
    MAX(CASE WHEN ability.ability = 'CHA' THEN ability.score END) AS charisma
  FROM dnd5e_monster monster
  JOIN dnd5e_stat_block stat_block ON stat_block.id = monster.stat_block_id
  LEFT JOIN dnd5e_stat_block_ability ability ON ability.stat_block_id = stat_block.id
  WHERE monster.id = $1
  GROUP BY
    monster.id,
    monster.key,
    monster.name,
    monster.description,
    monster.source,
    monster.is_active,
    stat_block.id,
    stat_block.name,
    stat_block.armor_class,
    stat_block.hit_point_max,
    stat_block.speed_walk,
    stat_block.proficiency_bonus,
    stat_block.challenge_rating,
    stat_block.xp_value;
`;

export const selectSceneNpcPresenceQuery = `
  SELECT
    scene_npc.id,
    scene_npc.scene_id,
    scene_npc.npc_id,
    scene_npc.is_active
  FROM dnd5e_scene_npc scene_npc
  LEFT JOIN dnd5e_campaign_npc_state npc_state
    ON npc_state.campaign_id = $3
   AND npc_state.npc_id = scene_npc.npc_id
  WHERE scene_npc.scene_id = $1
    AND scene_npc.npc_id = $2
    AND scene_npc.is_active = TRUE
    AND (npc_state.current_hit_points IS NULL OR npc_state.current_hit_points > 0);
`;

export const insertCombatQuery = `
  INSERT INTO dnd5e_combat (
    campaign_id,
    scene_id,
    event_id,
    status,
    round_number,
    current_turn_index,
    current_participant_id,
    visibility_mode,
    auto_advance_turns,
    created_by_account_id,
    outcome_faction,
    outcome_summary,
    result_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
  RETURNING *;
`;

export const insertCombatParticipantQuery = `
  INSERT INTO dnd5e_combat_participant (
    combat_id,
    entity_type,
    entity_id,
    stat_block_id,
    display_name,
    initiative,
    turn_order,
    current_hp,
    max_hp,
    temporary_hp,
    armor_class,
    faction,
    control_mode,
    is_active,
    is_defeated,
    notes
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  RETURNING *;
`;

export const selectCombatByIdQuery = `
  SELECT
    combat.id,
    combat.campaign_id,
    combat.scene_id,
    combat.event_id,
    combat.status,
    combat.round_number,
    combat.current_turn_index,
    combat.current_participant_id,
    combat.visibility_mode,
    combat.auto_advance_turns,
    combat.created_by_account_id,
    combat.outcome_faction,
    combat.outcome_summary,
    combat.result_json,
    combat.created_at,
    combat.updated_at,
    combat.resolved_at,
    campaign.name AS campaign_name,
    scene.key AS scene_key,
    scene.name AS scene_name,
    event_instance.prompt_text AS event_prompt_text,
    event_template.key AS event_template_key,
    event_template.name AS event_template_name,
    current_participant.display_name AS current_participant_name
  FROM dnd5e_combat combat
  LEFT JOIN dnd5e_campaign campaign ON campaign.id = combat.campaign_id
  LEFT JOIN dnd5e_scene scene ON scene.id = combat.scene_id
  LEFT JOIN dnd5e_event_instance event_instance ON event_instance.id = combat.event_id
  LEFT JOIN dnd5e_event_template event_template ON event_template.id = event_instance.template_id
  LEFT JOIN dnd5e_combat_participant current_participant ON current_participant.id = combat.current_participant_id
  WHERE combat.id = $1;
`;

export const selectCombatByIdForUpdateQuery = `
  SELECT
    combat.id,
    combat.campaign_id,
    combat.scene_id,
    combat.event_id,
    combat.status,
    combat.round_number,
    combat.current_turn_index,
    combat.current_participant_id,
    combat.visibility_mode,
    combat.auto_advance_turns,
    combat.created_by_account_id,
    combat.outcome_faction,
    combat.outcome_summary,
    combat.result_json,
    combat.created_at,
    combat.updated_at,
    combat.resolved_at,
    campaign.name AS campaign_name,
    scene.key AS scene_key,
    scene.name AS scene_name,
    event_instance.prompt_text AS event_prompt_text,
    event_template.key AS event_template_key,
    event_template.name AS event_template_name,
    current_participant.display_name AS current_participant_name
  FROM dnd5e_combat combat
  LEFT JOIN dnd5e_campaign campaign ON campaign.id = combat.campaign_id
  LEFT JOIN dnd5e_scene scene ON scene.id = combat.scene_id
  LEFT JOIN dnd5e_event_instance event_instance ON event_instance.id = combat.event_id
  LEFT JOIN dnd5e_event_template event_template ON event_template.id = event_instance.template_id
  LEFT JOIN dnd5e_combat_participant current_participant ON current_participant.id = combat.current_participant_id
  WHERE combat.id = $1
  FOR UPDATE OF combat;
`;

export const selectCombatParticipantsByCombatQuery = `
  SELECT
    participant.id,
    participant.combat_id,
    participant.entity_type,
    participant.entity_id,
    participant.stat_block_id,
    participant.display_name,
    participant.initiative,
    participant.turn_order,
    participant.current_hp,
    participant.max_hp,
    participant.temporary_hp,
    participant.armor_class,
    participant.faction,
    participant.control_mode,
    participant.is_active,
    participant.is_defeated,
    participant.notes,
    participant.created_at,
    participant.updated_at,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    monster.key AS monster_key,
    monster.name AS monster_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    character.name AS character_name
  FROM dnd5e_combat_participant participant
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = participant.stat_block_id
  LEFT JOIN dnd5e_monster monster
    ON participant.entity_type = 'monster'
   AND monster.id = participant.entity_id
  LEFT JOIN dnd5e_npc npc
    ON participant.entity_type = 'npc'
   AND npc.id = participant.entity_id
  LEFT JOIN dnd5e_character character
    ON participant.entity_type = 'character'
   AND character.id = participant.entity_id
  WHERE participant.combat_id = $1
  ORDER BY
    COALESCE(participant.turn_order, 2147483647) ASC,
    participant.initiative DESC NULLS LAST,
    participant.id ASC;
`;

export const selectCombatParticipantsByCombatForUpdateQuery = `
  SELECT
    participant.id,
    participant.combat_id,
    participant.entity_type,
    participant.entity_id,
    participant.stat_block_id,
    participant.display_name,
    participant.initiative,
    participant.turn_order,
    participant.current_hp,
    participant.max_hp,
    participant.temporary_hp,
    participant.armor_class,
    participant.faction,
    participant.control_mode,
    participant.is_active,
    participant.is_defeated,
    participant.notes,
    participant.created_at,
    participant.updated_at,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    monster.key AS monster_key,
    monster.name AS monster_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    character.name AS character_name
  FROM dnd5e_combat_participant participant
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = participant.stat_block_id
  LEFT JOIN dnd5e_monster monster
    ON participant.entity_type = 'monster'
   AND monster.id = participant.entity_id
  LEFT JOIN dnd5e_npc npc
    ON participant.entity_type = 'npc'
   AND npc.id = participant.entity_id
  LEFT JOIN dnd5e_character character
    ON participant.entity_type = 'character'
   AND character.id = participant.entity_id
  WHERE participant.combat_id = $1
  ORDER BY
    COALESCE(participant.turn_order, 2147483647) ASC,
    participant.initiative DESC NULLS LAST,
    participant.id ASC
  FOR UPDATE OF participant;
`;

export const selectCombatParticipantByIdForUpdateQuery = `
  SELECT
    participant.id,
    participant.combat_id,
    participant.entity_type,
    participant.entity_id,
    participant.stat_block_id,
    participant.display_name,
    participant.initiative,
    participant.turn_order,
    participant.current_hp,
    participant.max_hp,
    participant.temporary_hp,
    participant.armor_class,
    participant.faction,
    participant.control_mode,
    participant.is_active,
    participant.is_defeated,
    participant.notes,
    participant.created_at,
    participant.updated_at,
    stat_block.name AS stat_block_name,
    stat_block.challenge_rating,
    stat_block.xp_value,
    monster.key AS monster_key,
    monster.name AS monster_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    character.name AS character_name
  FROM dnd5e_combat_participant participant
  LEFT JOIN dnd5e_stat_block stat_block ON stat_block.id = participant.stat_block_id
  LEFT JOIN dnd5e_monster monster
    ON participant.entity_type = 'monster'
   AND monster.id = participant.entity_id
  LEFT JOIN dnd5e_npc npc
    ON participant.entity_type = 'npc'
   AND npc.id = participant.entity_id
  LEFT JOIN dnd5e_character character
    ON participant.entity_type = 'character'
   AND character.id = participant.entity_id
  WHERE participant.id = $1
  FOR UPDATE OF participant;
`;

export const updateCombatParticipantInitiativeQuery = `
  UPDATE dnd5e_combat_participant
  SET
    initiative = $2,
    turn_order = $3,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const updateCombatStateQuery = `
  UPDATE dnd5e_combat
  SET
    status = $2,
    round_number = $3,
    current_turn_index = $4,
    current_participant_id = $5,
    outcome_faction = $6,
    outcome_summary = $7,
    result_json = $8::jsonb,
    resolved_at = $9,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const updateCombatParticipantStateQuery = `
  UPDATE dnd5e_combat_participant
  SET
    current_hp = $2,
    temporary_hp = $3,
    is_defeated = $4,
    is_active = $5,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const insertCombatActionLogQuery = `
  INSERT INTO dnd5e_combat_action_log (
    combat_id,
    participant_id,
    action_id,
    command_type,
    round_number,
    turn_index,
    target_metadata_json,
    result_summary,
    narrative_text,
    mechanical_detail_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
  RETURNING *;
`;

export const selectCombatActionLogsByCombatQuery = `
  SELECT
    log.id,
    log.combat_id,
    log.participant_id,
    log.action_id,
    log.command_type,
    log.round_number,
    log.turn_index,
    log.target_metadata_json,
    log.result_summary,
    log.narrative_text,
    log.mechanical_detail_json,
    log.created_at,
    participant.display_name AS participant_name,
    action.name AS action_name
  FROM dnd5e_combat_action_log log
  JOIN dnd5e_combat_participant participant ON participant.id = log.participant_id
  LEFT JOIN dnd5e_action action ON action.id = log.action_id
  WHERE log.combat_id = $1
  ORDER BY log.created_at ASC, log.id ASC;
`;

export const selectCombatConditionsByCombatQuery = `
  SELECT
    condition.id,
    condition.combat_participant_id,
    condition.condition_type,
    condition.source,
    condition.duration_type,
    condition.duration_value,
    condition.notes,
    condition.created_at
  FROM dnd5e_combat_condition condition
  JOIN dnd5e_combat_participant participant ON participant.id = condition.combat_participant_id
  WHERE participant.combat_id = $1
  ORDER BY condition.created_at ASC, condition.id ASC;
`;

export const selectActionIdByNameQuery = `
  SELECT
    action.id
  FROM dnd5e_action action
  WHERE action.name = $1;
`;

export const updateCharacterHitPointStateQuery = `
  UPDATE dnd5e_character
  SET
    current_hit_points = $2,
    temporary_hit_points = $3,
    updated_at = NOW()
  WHERE id = $1
  RETURNING
    id,
    name,
    current_hit_points,
    temporary_hit_points,
    updated_at;
`;

export const upsertCampaignNpcCombatStateQuery = `
  INSERT INTO dnd5e_campaign_npc_state (
    campaign_id,
    npc_id,
    current_hit_points
  )
  VALUES ($1, $2, $3)
  ON CONFLICT (campaign_id, npc_id)
  DO UPDATE SET
    current_hit_points = EXCLUDED.current_hit_points,
    updated_at = NOW()
  RETURNING *;
`;
