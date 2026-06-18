export const selectDialogueByIdQuery = `
  SELECT
    dialogue.id,
    dialogue.scene_id,
    dialogue.npc_id,
    dialogue.dialogue_key,
    dialogue.name,
    dialogue.summary,
    dialogue.description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order,
    dialogue.availability_conditions_json,
    dialogue.is_repeatable,
    dialogue.is_active,
    dialogue.created_at,
    dialogue.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.disposition AS npc_base_disposition,
    npc.role AS npc_role
  FROM dnd5e_dialogue dialogue
  LEFT JOIN dnd5e_scene scene ON scene.id = dialogue.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = dialogue.npc_id
  WHERE dialogue.id = $1;
`;

export const selectDialogueByKeyQuery = `
  SELECT
    dialogue.id,
    dialogue.scene_id,
    dialogue.npc_id,
    dialogue.dialogue_key,
    dialogue.name,
    dialogue.summary,
    dialogue.description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order,
    dialogue.availability_conditions_json,
    dialogue.is_repeatable,
    dialogue.is_active,
    dialogue.created_at,
    dialogue.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.disposition AS npc_base_disposition,
    npc.role AS npc_role
  FROM dnd5e_dialogue dialogue
  LEFT JOIN dnd5e_scene scene ON scene.id = dialogue.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = dialogue.npc_id
  WHERE dialogue.dialogue_key = $1;
`;

export const selectNpcTalkDialoguesBySceneAndNpcQuery = `
  SELECT
    dialogue.id,
    dialogue.scene_id,
    dialogue.npc_id,
    dialogue.dialogue_key,
    dialogue.name,
    dialogue.summary,
    dialogue.description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order,
    dialogue.availability_conditions_json,
    dialogue.is_repeatable,
    dialogue.is_active,
    dialogue.created_at,
    dialogue.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.disposition AS npc_base_disposition,
    npc.role AS npc_role
  FROM dnd5e_dialogue dialogue
  JOIN dnd5e_scene scene ON scene.id = dialogue.scene_id
  JOIN dnd5e_npc npc ON npc.id = dialogue.npc_id
  WHERE dialogue.scene_id = $1
    AND dialogue.npc_id = $2
    AND dialogue.trigger_type = 'player'
    AND dialogue.trigger_event = 'npc_talk'
    AND dialogue.is_active = TRUE
  ORDER BY dialogue.sort_order ASC, dialogue.id ASC;
`;

export const selectSceneEnterDialoguesBySceneQuery = `
  SELECT
    dialogue.id,
    dialogue.scene_id,
    dialogue.npc_id,
    dialogue.dialogue_key,
    dialogue.name,
    dialogue.summary,
    dialogue.description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order,
    dialogue.availability_conditions_json,
    dialogue.is_repeatable,
    dialogue.is_active,
    dialogue.created_at,
    dialogue.updated_at,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.disposition AS npc_base_disposition,
    npc.role AS npc_role
  FROM dnd5e_dialogue dialogue
  LEFT JOIN dnd5e_scene scene ON scene.id = dialogue.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = dialogue.npc_id
  WHERE dialogue.scene_id = $1
    AND dialogue.trigger_type = 'system'
    AND dialogue.trigger_event = 'scene_enter'
    AND dialogue.is_active = TRUE
  ORDER BY dialogue.sort_order ASC, dialogue.id ASC;
`;

export const selectDialogueEntryNodesQuery = `
  SELECT
    node.id,
    node.dialogue_id,
    node.speaker_npc_id,
    node.node_key,
    node.title,
    node.speaker_type,
    node.text_content,
    node.sort_order,
    node.is_entry_node,
    node.is_terminal,
    node.availability_conditions_json,
    node.entry_effects_json,
    node.created_at,
    node.updated_at,
    npc.key AS speaker_npc_key,
    npc.name AS speaker_npc_name,
    npc.role AS speaker_npc_role
  FROM dnd5e_dialogue_node node
  LEFT JOIN dnd5e_npc npc ON npc.id = node.speaker_npc_id
  WHERE node.dialogue_id = $1
    AND node.is_entry_node = TRUE
  ORDER BY node.sort_order ASC, node.id ASC;
`;

export const selectDialogueNodeByIdQuery = `
  SELECT
    node.id,
    node.dialogue_id,
    node.speaker_npc_id,
    node.node_key,
    node.title,
    node.speaker_type,
    node.text_content,
    node.sort_order,
    node.is_entry_node,
    node.is_terminal,
    node.availability_conditions_json,
    node.entry_effects_json,
    node.created_at,
    node.updated_at,
    npc.key AS speaker_npc_key,
    npc.name AS speaker_npc_name,
    npc.role AS speaker_npc_role
  FROM dnd5e_dialogue_node node
  LEFT JOIN dnd5e_npc npc ON npc.id = node.speaker_npc_id
  WHERE node.id = $1;
`;

export const selectDialogueOptionsByNodeQuery = `
  SELECT
    option_row.id,
    option_row.node_id,
    option_row.option_key,
    option_row.label,
    option_row.description,
    option_row.sort_order,
    option_row.availability_conditions_json,
    option_row.check_mode,
    option_row.skill_id,
    option_row.difficulty_class,
    option_row.check_visibility,
    option_row.is_active,
    option_row.created_at,
    option_row.updated_at,
    skill.name AS skill_name,
    skill.slug AS skill_slug
  FROM dnd5e_dialogue_option option_row
  LEFT JOIN dnd5e_skill skill ON skill.id = option_row.skill_id
  WHERE option_row.node_id = $1
    AND option_row.is_active = TRUE
  ORDER BY option_row.sort_order ASC, option_row.id ASC;
`;

export const selectDialogueOptionByIdQuery = `
  SELECT
    option_row.id,
    option_row.node_id,
    option_row.option_key,
    option_row.label,
    option_row.description,
    option_row.sort_order,
    option_row.availability_conditions_json,
    option_row.check_mode,
    option_row.skill_id,
    option_row.difficulty_class,
    option_row.check_visibility,
    option_row.is_active,
    option_row.created_at,
    option_row.updated_at,
    skill.name AS skill_name,
    skill.slug AS skill_slug
  FROM dnd5e_dialogue_option option_row
  LEFT JOIN dnd5e_skill skill ON skill.id = option_row.skill_id
  WHERE option_row.id = $1;
`;

export const selectDialogueOptionByNodeAndKeyQuery = `
  SELECT
    option_row.id,
    option_row.node_id,
    option_row.option_key,
    option_row.label,
    option_row.description,
    option_row.sort_order,
    option_row.availability_conditions_json,
    option_row.check_mode,
    option_row.skill_id,
    option_row.difficulty_class,
    option_row.check_visibility,
    option_row.is_active,
    option_row.created_at,
    option_row.updated_at,
    skill.name AS skill_name,
    skill.slug AS skill_slug
  FROM dnd5e_dialogue_option option_row
  LEFT JOIN dnd5e_skill skill ON skill.id = option_row.skill_id
  WHERE option_row.node_id = $1
    AND option_row.option_key = $2;
`;

export const selectDialogueOutcomesByOptionQuery = `
  SELECT
    outcome.id,
    outcome.option_id,
    outcome.next_node_id,
    outcome.outcome_key,
    outcome.label,
    outcome.sort_order,
    outcome.conditions_json,
    outcome.effects_json,
    outcome.result_text,
    outcome.is_terminal,
    outcome.is_active,
    outcome.created_at,
    outcome.updated_at,
    next_node.node_key AS next_node_key,
    next_node.title AS next_node_title,
    next_node.speaker_type AS next_node_speaker_type
  FROM dnd5e_dialogue_outcome outcome
  LEFT JOIN dnd5e_dialogue_node next_node ON next_node.id = outcome.next_node_id
  WHERE outcome.option_id = $1
    AND outcome.is_active = TRUE
  ORDER BY outcome.sort_order ASC, outcome.id ASC;
`;

export const selectDialogueSessionByIdQuery = `
  SELECT
    session.id,
    session.campaign_id,
    session.character_id,
    session.dialogue_id,
    session.npc_id,
    session.scene_id,
    session.started_by_account_id,
    session.ended_by_account_id,
    session.status,
    session.started_at,
    session.ended_at,
    session.created_at,
    session.updated_at,
    state.current_node_id,
    state.pending_option_id,
    state.session_memory_json,
    state.visited_node_keys_json,
    state.choice_history_json,
    state.updated_at AS state_updated_at,
    dialogue.dialogue_key,
    dialogue.name AS dialogue_name,
    dialogue.summary AS dialogue_summary,
    dialogue.description AS dialogue_description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order AS dialogue_sort_order,
    dialogue.availability_conditions_json AS dialogue_availability_conditions_json,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.role AS npc_role,
    started_by.display_name AS started_by_display_name,
    ended_by.display_name AS ended_by_display_name
  FROM dnd5e_dialogue_session session
  JOIN dnd5e_dialogue_session_state state ON state.dialogue_session_id = session.id
  JOIN dnd5e_dialogue dialogue ON dialogue.id = session.dialogue_id
  LEFT JOIN dnd5e_scene scene ON scene.id = session.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = session.npc_id
  LEFT JOIN account started_by ON started_by.id = session.started_by_account_id
  LEFT JOIN account ended_by ON ended_by.id = session.ended_by_account_id
  WHERE session.id = $1;
`;

export const selectDialogueSessionByIdForUpdateQuery = `
  SELECT
    session.id,
    session.campaign_id,
    session.character_id,
    session.dialogue_id,
    session.npc_id,
    session.scene_id,
    session.started_by_account_id,
    session.ended_by_account_id,
    session.status,
    session.started_at,
    session.ended_at,
    session.created_at,
    session.updated_at,
    state.current_node_id,
    state.pending_option_id,
    state.session_memory_json,
    state.visited_node_keys_json,
    state.choice_history_json,
    state.updated_at AS state_updated_at,
    dialogue.dialogue_key,
    dialogue.name AS dialogue_name,
    dialogue.summary AS dialogue_summary,
    dialogue.description AS dialogue_description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order AS dialogue_sort_order,
    dialogue.availability_conditions_json AS dialogue_availability_conditions_json,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.role AS npc_role,
    started_by.display_name AS started_by_display_name,
    ended_by.display_name AS ended_by_display_name
  FROM dnd5e_dialogue_session session
  JOIN dnd5e_dialogue_session_state state ON state.dialogue_session_id = session.id
  JOIN dnd5e_dialogue dialogue ON dialogue.id = session.dialogue_id
  LEFT JOIN dnd5e_scene scene ON scene.id = session.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = session.npc_id
  LEFT JOIN account started_by ON started_by.id = session.started_by_account_id
  LEFT JOIN account ended_by ON ended_by.id = session.ended_by_account_id
  WHERE session.id = $1
  FOR UPDATE OF session, state;
`;

export const selectActiveDialogueSessionByCampaignAndCharacterQuery = `
  SELECT
    session.id,
    session.campaign_id,
    session.character_id,
    session.dialogue_id,
    session.npc_id,
    session.scene_id,
    session.started_by_account_id,
    session.ended_by_account_id,
    session.status,
    session.started_at,
    session.ended_at,
    session.created_at,
    session.updated_at,
    state.current_node_id,
    state.pending_option_id,
    state.session_memory_json,
    state.visited_node_keys_json,
    state.choice_history_json,
    state.updated_at AS state_updated_at,
    dialogue.dialogue_key,
    dialogue.name AS dialogue_name,
    dialogue.summary AS dialogue_summary,
    dialogue.description AS dialogue_description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order AS dialogue_sort_order,
    dialogue.availability_conditions_json AS dialogue_availability_conditions_json,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.role AS npc_role,
    started_by.display_name AS started_by_display_name,
    ended_by.display_name AS ended_by_display_name
  FROM dnd5e_dialogue_session session
  JOIN dnd5e_dialogue_session_state state ON state.dialogue_session_id = session.id
  JOIN dnd5e_dialogue dialogue ON dialogue.id = session.dialogue_id
  LEFT JOIN dnd5e_scene scene ON scene.id = session.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = session.npc_id
  LEFT JOIN account started_by ON started_by.id = session.started_by_account_id
  LEFT JOIN account ended_by ON ended_by.id = session.ended_by_account_id
  WHERE session.campaign_id = $1
    AND session.character_id = $2
    AND session.status = 'active'
  ORDER BY session.created_at DESC, session.id DESC
  LIMIT 1;
`;

export const selectDialogueSessionsByCampaignAndCharacterQuery = `
  SELECT
    session.id,
    session.campaign_id,
    session.character_id,
    session.dialogue_id,
    session.npc_id,
    session.scene_id,
    session.started_by_account_id,
    session.ended_by_account_id,
    session.status,
    session.started_at,
    session.ended_at,
    session.created_at,
    session.updated_at,
    state.current_node_id,
    state.pending_option_id,
    state.session_memory_json,
    state.visited_node_keys_json,
    state.choice_history_json,
    state.updated_at AS state_updated_at,
    dialogue.dialogue_key,
    dialogue.name AS dialogue_name,
    dialogue.summary AS dialogue_summary,
    dialogue.description AS dialogue_description,
    dialogue.trigger_type,
    dialogue.trigger_event,
    dialogue.sort_order AS dialogue_sort_order,
    dialogue.availability_conditions_json AS dialogue_availability_conditions_json,
    scene.key AS scene_key,
    scene.name AS scene_name,
    npc.key AS npc_key,
    npc.name AS npc_name,
    npc.npc_type,
    npc.role AS npc_role,
    started_by.display_name AS started_by_display_name,
    ended_by.display_name AS ended_by_display_name
  FROM dnd5e_dialogue_session session
  JOIN dnd5e_dialogue_session_state state ON state.dialogue_session_id = session.id
  JOIN dnd5e_dialogue dialogue ON dialogue.id = session.dialogue_id
  LEFT JOIN dnd5e_scene scene ON scene.id = session.scene_id
  LEFT JOIN dnd5e_npc npc ON npc.id = session.npc_id
  LEFT JOIN account started_by ON started_by.id = session.started_by_account_id
  LEFT JOIN account ended_by ON ended_by.id = session.ended_by_account_id
  WHERE session.campaign_id = $1
    AND session.character_id = $2
  ORDER BY session.created_at DESC, session.id DESC
  LIMIT $3 OFFSET $4;
`;

export const insertDialogueSessionQuery = `
  INSERT INTO dnd5e_dialogue_session (
    campaign_id,
    character_id,
    dialogue_id,
    npc_id,
    scene_id,
    started_by_account_id,
    status
  )
  VALUES ($1, $2, $3, $4, $5, $6, 'active')
  RETURNING *;
`;

export const insertDialogueSessionStateQuery = `
  INSERT INTO dnd5e_dialogue_session_state (
    dialogue_session_id,
    current_node_id,
    pending_option_id,
    session_memory_json,
    visited_node_keys_json,
    choice_history_json
  )
  VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
  RETURNING *;
`;

export const updateDialogueSessionStateQuery = `
  UPDATE dnd5e_dialogue_session_state
  SET
    current_node_id = $2,
    pending_option_id = $3,
    session_memory_json = $4::jsonb,
    visited_node_keys_json = $5::jsonb,
    choice_history_json = $6::jsonb,
    updated_at = NOW()
  WHERE dialogue_session_id = $1
  RETURNING *;
`;

export const updateDialogueSessionStatusQuery = `
  UPDATE dnd5e_dialogue_session
  SET
    status = $2,
    ended_by_account_id = $3,
    ended_at = CASE WHEN $2::varchar = 'active' THEN NULL ELSE NOW() END,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const insertDialogueSessionVisitQuery = `
  INSERT INTO dnd5e_dialogue_session_visit (
    dialogue_session_id,
    node_id
  )
  VALUES ($1, $2)
  RETURNING *;
`;

export const insertDialogueSessionChoiceQuery = `
  INSERT INTO dnd5e_dialogue_session_choice (
    dialogue_session_id,
    node_id,
    option_id,
    outcome_id,
    actor_account_id,
    check_mode,
    skill_id,
    difficulty_class,
    check_visibility,
    roll_value,
    skill_modifier,
    total_value,
    margin_value,
    was_success,
    result_summary,
    applied_effects_json
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13,
    $14,
    $15,
    $16::jsonb
  )
  RETURNING *;
`;

export const selectDialogueSessionVisitsQuery = `
  SELECT
    visit.id,
    visit.dialogue_session_id,
    visit.node_id,
    node.node_key,
    node.title,
    node.speaker_type,
    visit.entered_at
  FROM dnd5e_dialogue_session_visit visit
  JOIN dnd5e_dialogue_node node ON node.id = visit.node_id
  WHERE visit.dialogue_session_id = $1
  ORDER BY visit.entered_at ASC, visit.id ASC;
`;

export const selectDialogueSessionChoicesQuery = `
  SELECT
    choice_row.id,
    choice_row.dialogue_session_id,
    choice_row.node_id,
    node.node_key,
    node.title AS node_title,
    choice_row.option_id,
    option_row.option_key,
    option_row.label AS option_label,
    choice_row.outcome_id,
    outcome.outcome_key,
    outcome.label AS outcome_label,
    choice_row.actor_account_id,
    actor.display_name AS actor_display_name,
    choice_row.check_mode,
    choice_row.skill_id,
    skill.name AS skill_name,
    skill.slug AS skill_slug,
    choice_row.difficulty_class,
    choice_row.check_visibility,
    choice_row.roll_value,
    choice_row.skill_modifier,
    choice_row.total_value,
    choice_row.margin_value,
    choice_row.was_success,
    choice_row.result_summary,
    choice_row.applied_effects_json,
    choice_row.created_at
  FROM dnd5e_dialogue_session_choice choice_row
  JOIN dnd5e_dialogue_node node ON node.id = choice_row.node_id
  JOIN dnd5e_dialogue_option option_row ON option_row.id = choice_row.option_id
  LEFT JOIN dnd5e_dialogue_outcome outcome ON outcome.id = choice_row.outcome_id
  LEFT JOIN dnd5e_skill skill ON skill.id = choice_row.skill_id
  LEFT JOIN account actor ON actor.id = choice_row.actor_account_id
  WHERE choice_row.dialogue_session_id = $1
  ORDER BY choice_row.created_at ASC, choice_row.id ASC;
`;
