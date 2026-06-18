export const selectCharacterDefaultActionPolicyQuery = `
  SELECT
    policy.id,
    policy.campaign_id,
    policy.character_id,
    policy.response_timeout_seconds,
    policy.default_action_type,
    policy.default_action_payload_json,
    policy.is_active,
    policy.notes,
    policy.created_at,
    policy.updated_at
  FROM dnd5e_character_default_action_policy policy
  WHERE policy.campaign_id = $1
    AND policy.character_id = $2;
`;

export const selectOpenActionWindowByCampaignAndCharacterQuery = `
  SELECT
    window_row.id,
    window_row.campaign_id,
    window_row.character_id,
    window_row.scene_id,
    window_row.dialogue_session_id,
    window_row.combat_id,
    window_row.event_instance_id,
    window_row.window_type,
    window_row.status,
    window_row.prompt_text,
    window_row.suggested_action_key,
    window_row.default_action_type,
    window_row.default_action_payload_json,
    window_row.opens_at,
    window_row.expires_at,
    window_row.resolved_at,
    window_row.resolution_summary,
    window_row.created_at,
    window_row.updated_at
  FROM dnd5e_action_window window_row
  WHERE window_row.campaign_id = $1
    AND window_row.character_id = $2
    AND window_row.status IN ('open', 'closing', 'resolving')
  ORDER BY window_row.updated_at DESC, window_row.id DESC
  LIMIT 1;
`;

export const insertActionWindowQuery = `
  INSERT INTO dnd5e_action_window (
    campaign_id,
    character_id,
    scene_id,
    dialogue_session_id,
    combat_id,
    event_instance_id,
    window_type,
    status,
    prompt_text,
    suggested_action_key,
    default_action_type,
    default_action_payload_json,
    opens_at,
    expires_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, $11::jsonb, $12, $13)
  RETURNING *;
`;

export const updateActionWindowQuery = `
  UPDATE dnd5e_action_window
  SET
    scene_id = $2,
    dialogue_session_id = $3,
    combat_id = $4,
    event_instance_id = $5,
    window_type = $6,
    prompt_text = $7,
    suggested_action_key = $8,
    default_action_type = $9,
    default_action_payload_json = $10::jsonb,
    expires_at = $11,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const closeActionWindowQuery = `
  UPDATE dnd5e_action_window
  SET
    status = $2,
    closed_at = COALESCE(closed_at, NOW()),
    resolved_at = NOW(),
    resolution_summary = $3,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *;
`;

export const selectActiveCombatByCampaignAndCharacterQuery = `
  SELECT
    combat.id
  FROM dnd5e_combat combat
  JOIN dnd5e_combat_participant participant
    ON participant.combat_id = combat.id
  WHERE combat.campaign_id = $1
    AND participant.entity_type = 'character'
    AND participant.entity_id = $2
    AND combat.status IN ('pending', 'active')
  ORDER BY
    CASE combat.status WHEN 'active' THEN 0 ELSE 1 END,
    combat.updated_at DESC,
    combat.id DESC
  LIMIT 1;
`;

export const selectActiveEventByCampaignAndCharacterQuery = `
  SELECT
    event_instance.id
  FROM dnd5e_event_instance event_instance
  WHERE event_instance.campaign_id = $1
    AND event_instance.character_id = $2
    AND event_instance.status = 'active'
  ORDER BY event_instance.updated_at DESC, event_instance.id DESC
  LIMIT 1;
`;
