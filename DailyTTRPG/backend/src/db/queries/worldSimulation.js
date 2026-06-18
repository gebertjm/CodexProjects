export const selectWorldSimulationWorldQuery = `
  SELECT id, name, slug, status
  FROM dnd5e_world
  WHERE id = $1;
`;

export const selectWorldSimulationCampaignQuery = `
  SELECT id, world_id, name, slug, campaign_type, status, is_active
  FROM dnd5e_campaign
  WHERE id = $1;
`;

export const selectWorldSimulationCharacterQuery = `
  SELECT id, account_id, world_id, name, is_active
  FROM dnd5e_character
  WHERE id = $1;
`;

export const selectCampaignMembershipQuery = `
  SELECT
    membership.id,
    membership.campaign_id,
    membership.character_id,
    membership.is_active,
    membership.membership_status,
    membership.current_scene_id,
    campaign.world_id,
    campaign.name AS campaign_name,
    character.account_id,
    character.name AS character_name
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  WHERE membership.campaign_id = $1
    AND membership.character_id = $2;
`;

export const insertWorldChangeQuery = `
  INSERT INTO dnd5e_world_change (
    world_id,
    campaign_id,
    character_id,
    actor_account_id,
    change_key,
    change_type,
    propagation_scope,
    propagation_status,
    region_id,
    location_id,
    scene_id,
    world_entity_id,
    source_type,
    source_entity_id,
    title,
    summary,
    narrative_text,
    payload_json,
    truth_delta_json,
    knowledge_policy_json,
    effective_at
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, 'recorded', $8, $9, $10, $11, $12, $13,
    $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, COALESCE($20, NOW())
  )
  ON CONFLICT (world_id, change_key)
  DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id,
    character_id = EXCLUDED.character_id,
    actor_account_id = EXCLUDED.actor_account_id,
    change_type = EXCLUDED.change_type,
    propagation_scope = EXCLUDED.propagation_scope,
    region_id = EXCLUDED.region_id,
    location_id = EXCLUDED.location_id,
    scene_id = EXCLUDED.scene_id,
    world_entity_id = EXCLUDED.world_entity_id,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    narrative_text = EXCLUDED.narrative_text,
    payload_json = EXCLUDED.payload_json,
    truth_delta_json = EXCLUDED.truth_delta_json,
    knowledge_policy_json = EXCLUDED.knowledge_policy_json,
    effective_at = EXCLUDED.effective_at,
    updated_at = NOW()
  RETURNING *;
`;

export const updateWorldChangePropagationStatusQuery = `
  UPDATE dnd5e_world_change
  SET
    propagation_status = $2,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const upsertWorldFlagQuery = `
  INSERT INTO dnd5e_world_flag (
    world_id,
    flag_key,
    flag_value_json,
    flag_category,
    metadata_json,
    notes,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)
  ON CONFLICT (world_id, flag_key)
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

export const insertWorldLogQuery = `
  INSERT INTO dnd5e_world_log (
    world_id,
    campaign_id,
    character_id,
    actor_account_id,
    log_type,
    message,
    data_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
  RETURNING *;
`;

export const selectWorldEntityForUpdateQuery = `
  SELECT *
  FROM dnd5e_world_entity
  WHERE id = $1
  FOR UPDATE;
`;

export const updateWorldEntityProjectionQuery = `
  UPDATE dnd5e_world_entity
  SET
    current_region_id = COALESCE($2, current_region_id),
    current_location_id = COALESCE($3, current_location_id),
    current_scene_id = COALESCE($4, current_scene_id),
    status = COALESCE($5, status),
    disposition = COALESCE($6, disposition),
    faction = COALESCE($7, faction),
    state_json = COALESCE(state_json, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb),
    notes = COALESCE($9, notes),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const insertWorldEntityEventQuery = `
  INSERT INTO dnd5e_world_entity_event (
    world_id,
    world_entity_id,
    world_change_id,
    event_type,
    from_region_id,
    from_location_id,
    from_scene_id,
    to_region_id,
    to_location_id,
    to_scene_id,
    from_status,
    to_status,
    from_disposition,
    to_disposition,
    state_delta_json,
    summary
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
  RETURNING *;
`;

export const selectCampaignLocalPropagationTargetsQuery = `
  SELECT
    membership.campaign_id,
    membership.character_id,
    character.account_id,
    membership.current_scene_id,
    campaign.world_id
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  WHERE membership.campaign_id = $1
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
  ORDER BY membership.character_id ASC;
`;

export const selectGlobalPropagationTargetsQuery = `
  SELECT
    membership.campaign_id,
    membership.character_id,
    character.account_id,
    membership.current_scene_id,
    campaign.world_id
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  WHERE campaign.world_id = $1
    AND campaign.status = 'active'
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
  ORDER BY membership.campaign_id ASC, membership.character_id ASC;
`;

export const selectRegionalPropagationTargetsQuery = `
  SELECT
    membership.campaign_id,
    membership.character_id,
    character.account_id,
    membership.current_scene_id,
    campaign.world_id
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_campaign campaign ON campaign.id = membership.campaign_id
  JOIN dnd5e_character character ON character.id = membership.character_id
  LEFT JOIN dnd5e_scene scene ON scene.id = membership.current_scene_id
  LEFT JOIN dnd5e_location location ON location.id = scene.location_id
  WHERE campaign.world_id = $1
    AND campaign.status = 'active'
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
    AND (
      $2::bigint IS NULL
      OR location.region_id = $2
      OR scene.id = $4
      OR location.id = $3
    )
  ORDER BY membership.campaign_id ASC, membership.character_id ASC;
`;

export const insertPropagationReceiptQuery = `
  INSERT INTO dnd5e_world_propagation_receipt (
    world_change_id,
    campaign_id,
    character_id,
    propagation_channel,
    knowledge_status,
    available_at,
    discovered_at,
    summary,
    metadata_json
  )
  VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9::jsonb)
  ON CONFLICT (world_change_id, campaign_id, character_id, propagation_channel)
  DO UPDATE SET
    knowledge_status = EXCLUDED.knowledge_status,
    available_at = EXCLUDED.available_at,
    discovered_at = EXCLUDED.discovered_at,
    summary = EXCLUDED.summary,
    metadata_json = EXCLUDED.metadata_json,
    updated_at = NOW()
  RETURNING *;
`;

export const updatePropagationReceiptDiscoveredQuery = `
  UPDATE dnd5e_world_propagation_receipt receipt
  SET
    knowledge_status = $3,
    discovered_at = COALESCE(receipt.discovered_at, NOW()),
    updated_at = NOW()
  WHERE receipt.id = $1
    AND receipt.knowledge_status = $2
  RETURNING *;
`;

export const upsertWorldChangeKnowledgeQuery = `
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
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'world_simulation', $8)
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

export const selectWorldChangesQuery = `
  SELECT
    change.*,
    campaign.name AS campaign_name,
    character.name AS character_name,
    entity.entity_key AS world_entity_key
  FROM dnd5e_world_change change
  LEFT JOIN dnd5e_campaign campaign ON campaign.id = change.campaign_id
  LEFT JOIN dnd5e_character character ON character.id = change.character_id
  LEFT JOIN dnd5e_world_entity entity ON entity.id = change.world_entity_id
  WHERE change.world_id = $1
  ORDER BY change.created_at DESC, change.id DESC
  LIMIT $2 OFFSET $3;
`;

export const selectWorldChangeByIdQuery = `
  SELECT *
  FROM dnd5e_world_change
  WHERE id = $1;
`;

export const selectWorldFlagsQuery = `
  SELECT *
  FROM dnd5e_world_flag
  WHERE world_id = $1
  ORDER BY flag_key ASC;
`;

export const selectWorldEntityEventsQuery = `
  SELECT *
  FROM dnd5e_world_entity_event
  WHERE world_id = $1
    AND ($2::bigint IS NULL OR world_entity_id = $2)
  ORDER BY created_at DESC, id DESC
  LIMIT $3 OFFSET $4;
`;

export const selectWorldPropagationReceiptsQuery = `
  SELECT
    receipt.*,
    change.world_id,
    change.change_key,
    change.title,
    change.summary AS change_summary,
    change.propagation_scope
  FROM dnd5e_world_propagation_receipt receipt
  JOIN dnd5e_world_change change ON change.id = receipt.world_change_id
  WHERE change.world_id = $1
    AND ($2::bigint IS NULL OR receipt.campaign_id = $2)
    AND ($3::bigint IS NULL OR receipt.character_id = $3)
  ORDER BY receipt.available_at DESC, receipt.id DESC
  LIMIT $4 OFFSET $5;
`;

export const selectCharacterWorldKnowledgeQuery = `
  SELECT
    knowledge.*
  FROM dnd5e_character_knowledge knowledge
  JOIN dnd5e_campaign campaign ON campaign.id = knowledge.campaign_id
  WHERE campaign.world_id = $1
    AND knowledge.character_id = $2
    AND ($3::bigint IS NULL OR knowledge.campaign_id = $3)
  ORDER BY knowledge.created_at DESC, knowledge.id DESC;
`;

export const selectDiscoverableReceiptsQuery = `
  SELECT
    receipt.*,
    change.world_id,
    change.change_key,
    change.title,
    change.summary AS change_summary,
    change.knowledge_policy_json
  FROM dnd5e_world_propagation_receipt receipt
  JOIN dnd5e_world_change change ON change.id = receipt.world_change_id
  WHERE change.world_id = $1
    AND receipt.knowledge_status IN ('available', 'hidden')
    AND receipt.available_at <= NOW()
    AND ($2::text IS NULL OR receipt.propagation_channel = $2)
  ORDER BY receipt.available_at ASC, receipt.id ASC
  LIMIT $3;
`;

export const insertProgressionWindowQuery = `
  INSERT INTO dnd5e_progression_window (
    world_id,
    campaign_id,
    scene_id,
    window_key,
    scope_type,
    status,
    prompt_text,
    threshold_at,
    resolves_at,
    threshold_policy_json,
    default_policy_json,
    source_type,
    source_entity_id
  )
  VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
  ON CONFLICT (world_id, window_key)
  DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id,
    scene_id = EXCLUDED.scene_id,
    scope_type = EXCLUDED.scope_type,
    status = 'open',
    prompt_text = EXCLUDED.prompt_text,
    threshold_at = EXCLUDED.threshold_at,
    resolves_at = EXCLUDED.resolves_at,
    threshold_policy_json = EXCLUDED.threshold_policy_json,
    default_policy_json = EXCLUDED.default_policy_json,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    resolved_at = NULL,
    resolution_summary = NULL,
    updated_at = NOW()
  RETURNING *;
`;

export const selectProgressionWindowByIdQuery = `
  SELECT *
  FROM dnd5e_progression_window
  WHERE id = $1;
`;

export const selectProgressionWindowForUpdateQuery = `
  SELECT *
  FROM dnd5e_progression_window
  WHERE id = $1
  FOR UPDATE;
`;

export const selectProgressionWindowsQuery = `
  SELECT *
  FROM dnd5e_progression_window
  WHERE ($1::bigint IS NULL OR world_id = $1)
    AND ($2::bigint IS NULL OR campaign_id = $2)
    AND ($3::text IS NULL OR status = $3)
  ORDER BY created_at DESC, id DESC
  LIMIT $4 OFFSET $5;
`;

export const selectCampaignMembersForWindowQuery = `
  SELECT
    membership.campaign_id,
    membership.character_id,
    character.account_id,
    membership.current_scene_id,
    policy.default_action_type,
    policy.default_action_payload_json
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  LEFT JOIN dnd5e_character_default_action_policy policy
    ON policy.campaign_id = membership.campaign_id
   AND policy.character_id = membership.character_id
   AND policy.is_active = TRUE
  WHERE membership.campaign_id = $1
    AND membership.is_active = TRUE
    AND membership.membership_status = 'active'
    AND character.is_active = TRUE
    AND ($2::bigint[] IS NULL OR membership.character_id = ANY($2::bigint[]))
  ORDER BY membership.character_id ASC;
`;

export const insertProgressionWindowParticipantQuery = `
  INSERT INTO dnd5e_progression_window_participant (
    progression_window_id,
    campaign_id,
    character_id,
    account_id,
    participant_status,
    default_action_type,
    default_action_payload_json
  )
  VALUES ($1, $2, $3, $4, 'expected', $5, $6::jsonb)
  ON CONFLICT (progression_window_id, character_id)
  DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id,
    account_id = EXCLUDED.account_id,
    participant_status = 'expected',
    default_action_type = EXCLUDED.default_action_type,
    default_action_payload_json = EXCLUDED.default_action_payload_json,
    responded_at = NULL,
    defaulted_at = NULL,
    updated_at = NOW()
  RETURNING *;
`;

export const selectProgressionWindowParticipantsQuery = `
  SELECT
    participant.*,
    character.name AS character_name
  FROM dnd5e_progression_window_participant participant
  JOIN dnd5e_character character ON character.id = participant.character_id
  WHERE participant.progression_window_id = $1
  ORDER BY participant.character_id ASC;
`;

export const insertProgressionWindowResponseQuery = `
  INSERT INTO dnd5e_progression_window_response (
    progression_window_id,
    character_id,
    actor_account_id,
    response_key,
    response_payload_json,
    response_summary
  )
  VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  ON CONFLICT (progression_window_id, character_id)
  DO UPDATE SET
    actor_account_id = EXCLUDED.actor_account_id,
    response_key = EXCLUDED.response_key,
    response_payload_json = EXCLUDED.response_payload_json,
    response_summary = EXCLUDED.response_summary
  RETURNING *;
`;

export const updateProgressionWindowParticipantRespondedQuery = `
  UPDATE dnd5e_progression_window_participant
  SET
    participant_status = 'responded',
    responded_at = NOW(),
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE progression_window_id = $1
    AND character_id = $2
  RETURNING *;
`;

export const selectProgressionWindowResponsesQuery = `
  SELECT
    response.*,
    character.name AS character_name
  FROM dnd5e_progression_window_response response
  JOIN dnd5e_character character ON character.id = response.character_id
  WHERE response.progression_window_id = $1
  ORDER BY response.created_at ASC, response.id ASC;
`;

export const updateProgressionWindowStatusQuery = `
  UPDATE dnd5e_progression_window
  SET
    status = $2::text,
    resolved_at = CASE WHEN $2::text = 'resolved' THEN NOW() ELSE resolved_at END,
    resolution_summary = COALESCE($3::text, resolution_summary),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const updateProgressionWindowParticipantDefaultedQuery = `
  UPDATE dnd5e_progression_window_participant
  SET
    participant_status = 'defaulted',
    defaulted_at = NOW(),
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const insertDefaultActionApplicationQuery = `
  INSERT INTO dnd5e_default_action_application (
    progression_window_id,
    campaign_id,
    character_id,
    action_type,
    action_payload_json,
    reason,
    result_summary,
    metadata_json
  )
  VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
  ON CONFLICT (progression_window_id, character_id)
  DO UPDATE SET
    action_type = EXCLUDED.action_type,
    action_payload_json = EXCLUDED.action_payload_json,
    reason = EXCLUDED.reason,
    result_summary = EXCLUDED.result_summary,
    metadata_json = EXCLUDED.metadata_json
  RETURNING *;
`;

export const selectDefaultActionApplicationsByCharacterQuery = `
  SELECT
    application.*,
    window_row.window_key,
    window_row.prompt_text
  FROM dnd5e_default_action_application application
  JOIN dnd5e_progression_window window_row ON window_row.id = application.progression_window_id
  WHERE application.character_id = $1
    AND ($2::bigint IS NULL OR application.campaign_id = $2)
  ORDER BY application.applied_at DESC, application.id DESC
  LIMIT $3;
`;

export const selectCatchupAckQuery = `
  SELECT *
  FROM dnd5e_character_catchup_ack
  WHERE world_id = $1
    AND campaign_id IS NOT DISTINCT FROM $2::bigint
    AND character_id = $3;
`;

export const upsertCatchupAckQuery = `
  INSERT INTO dnd5e_character_catchup_ack (
    world_id,
    campaign_id,
    character_id,
    last_seen_world_change_id,
    last_seen_campaign_log_id,
    last_seen_at,
    summary_json
  )
  VALUES ($1, $2, $3, $4, $5, NOW(), $6::jsonb)
  ON CONFLICT (world_id, campaign_id, character_id)
  DO UPDATE SET
    last_seen_world_change_id = EXCLUDED.last_seen_world_change_id,
    last_seen_campaign_log_id = EXCLUDED.last_seen_campaign_log_id,
    last_seen_at = NOW(),
    summary_json = EXCLUDED.summary_json,
    updated_at = NOW()
  RETURNING *;
`;

export const selectCatchupWorldChangesQuery = `
  SELECT
    receipt.*,
    change.world_id,
    change.change_key,
    change.change_type,
    change.title,
    change.summary AS change_summary,
    change.narrative_text,
    change.propagation_scope,
    change.created_at AS change_created_at
  FROM dnd5e_world_propagation_receipt receipt
  JOIN dnd5e_world_change change ON change.id = receipt.world_change_id
  WHERE change.world_id = $1
    AND receipt.character_id = $2
    AND ($3::bigint IS NULL OR receipt.campaign_id = $3)
    AND receipt.knowledge_status IN ('discovered', 'acknowledged')
    AND ($4::bigint IS NULL OR change.id > $4)
  ORDER BY change.id ASC
  LIMIT $5;
`;
