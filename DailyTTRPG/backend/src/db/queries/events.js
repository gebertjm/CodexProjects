export const selectCampaignsQuery = `
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
    ) AS member_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_event_instance event_instance
      WHERE event_instance.campaign_id = campaign.id
        AND event_instance.status IN ('pending', 'active')
    ) AS open_event_count
  FROM dnd5e_campaign campaign
  JOIN dnd5e_world world ON world.id = campaign.world_id
  LEFT JOIN account creator ON creator.id = campaign.created_by_account_id
  ORDER BY campaign.created_at DESC, campaign.id DESC;
`;

export const selectCampaignByIdQuery = `
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
    ) AS member_count,
    (
      SELECT COUNT(*)
      FROM dnd5e_event_instance event_instance
      WHERE event_instance.campaign_id = campaign.id
        AND event_instance.status IN ('pending', 'active')
    ) AS open_event_count
  FROM dnd5e_campaign campaign
  JOIN dnd5e_world world ON world.id = campaign.world_id
  LEFT JOIN account creator ON creator.id = campaign.created_by_account_id
  WHERE campaign.id = $1;
`;

export const insertCampaignQuery = `
  INSERT INTO dnd5e_campaign (
    world_id,
    name,
    slug,
    campaign_type,
    status,
    description,
    created_by_account_id,
    is_active
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id;
`;

export const insertCampaignLocationStatesForCampaignQuery = `
  INSERT INTO dnd5e_campaign_location_state (
    campaign_id,
    location_id,
    is_discovered,
    is_available,
    notes
  )
  SELECT
    campaign.id,
    location.id,
    TRUE,
    TRUE,
    'Auto-seeded campaign location overlay.'
  FROM dnd5e_campaign campaign
  JOIN dnd5e_location location ON location.world_id = campaign.world_id
  WHERE campaign.id = $1
  ON CONFLICT (campaign_id, location_id) DO NOTHING;
`;

export const insertCampaignSceneStatesForCampaignQuery = `
  INSERT INTO dnd5e_campaign_scene_state (
    campaign_id,
    scene_id,
    is_discovered,
    is_available,
    notes
  )
  SELECT
    campaign.id,
    scene.id,
    TRUE,
    TRUE,
    'Auto-seeded campaign scene overlay.'
  FROM dnd5e_campaign campaign
  JOIN dnd5e_scene scene ON scene.world_id = campaign.world_id
  WHERE campaign.id = $1
  ON CONFLICT (campaign_id, scene_id) DO NOTHING;
`;

export const selectCampaignCharactersQuery = `
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
    membership.created_at,
    character.name AS character_name,
    character.is_active AS character_is_active,
    character.level AS character_level,
    character.account_id,
    account.display_name AS account_display_name,
    account.is_active AS account_is_active
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN account ON account.id = character.account_id
  LEFT JOIN account joined_by ON joined_by.id = membership.joined_by_account_id
  WHERE membership.campaign_id = $1
  ORDER BY membership.created_at ASC, membership.id ASC;
`;

export const selectCampaignCharacterMembershipQuery = `
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
    membership.created_at,
    character.name AS character_name,
    character.is_active AS character_is_active,
    character.level AS character_level,
    character.account_id,
    account.display_name AS account_display_name,
    account.is_active AS account_is_active
  FROM dnd5e_campaign_character membership
  JOIN dnd5e_character character ON character.id = membership.character_id
  JOIN account ON account.id = character.account_id
  LEFT JOIN account joined_by ON joined_by.id = membership.joined_by_account_id
  WHERE membership.campaign_id = $1
    AND membership.character_id = $2;
`;

export const insertCampaignCharacterQuery = `
  INSERT INTO dnd5e_campaign_character (
    campaign_id,
    character_id,
    joined_by_account_id,
    is_active,
    membership_status,
    is_active_context,
    is_default_solo_campaign,
    joined_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  RETURNING id;
`;

export const selectActiveContextMembershipForCharacterQuery = `
  SELECT id
  FROM dnd5e_campaign_character
  WHERE character_id = $1
    AND is_active_context = TRUE
  LIMIT 1
  FOR UPDATE;
`;

export const clearActiveContextMembershipsForCharacterQuery = `
  UPDATE dnd5e_campaign_character
  SET
    is_active_context = FALSE,
    updated_at = NOW()
  WHERE character_id = $1
    AND is_active_context = TRUE;
`;

export const selectEventTemplatesQuery = `
  SELECT
    template.id,
    template.key,
    template.name,
    template.event_type,
    template.description,
    template.prompt_text,
    template.is_active,
    template.created_at
  FROM dnd5e_event_template template
  WHERE template.is_active = TRUE
  ORDER BY template.name ASC, template.id ASC;
`;

export const selectEventTemplateByIdQuery = `
  SELECT
    template.id,
    template.key,
    template.name,
    template.event_type,
    template.description,
    template.prompt_text,
    template.is_active,
    template.created_at
  FROM dnd5e_event_template template
  WHERE template.id = $1;
`;

export const selectEventTemplateByKeyQuery = `
  SELECT
    template.id,
    template.key,
    template.name,
    template.event_type,
    template.description,
    template.prompt_text,
    template.is_active,
    template.created_at
  FROM dnd5e_event_template template
  WHERE template.key = $1;
`;

export const selectEventTemplateOptionsQuery = `
  SELECT
    option.id,
    option.template_id,
    option.option_key,
    option.label,
    option.description,
    option.sort_order,
    option.resolution_kind,
    option.resolution_payload_json,
    option.is_active,
    option.created_at
  FROM dnd5e_event_template_option option
  WHERE option.template_id = $1
    AND option.is_active = TRUE
  ORDER BY option.sort_order ASC, option.id ASC;
`;

export const insertEventInstanceQuery = `
  INSERT INTO dnd5e_event_instance (
    campaign_id,
    character_id,
    template_id,
    status,
    prompt_text,
    created_by_account_id
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id;
`;

export const insertEventOptionQuery = `
  INSERT INTO dnd5e_event_option (
    event_instance_id,
    template_option_id,
    option_key,
    label,
    description,
    sort_order,
    resolution_kind,
    resolution_payload_json,
    is_available
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
  RETURNING id;
`;

export const selectEventInstanceByIdQuery = `
  SELECT
    event_instance.id,
    event_instance.campaign_id,
    campaign.name AS campaign_name,
    campaign.description AS campaign_description,
    campaign.is_active AS campaign_is_active,
    event_instance.character_id,
    character.name AS character_name,
    character.account_id,
    owner.display_name AS account_display_name,
    character.is_active AS character_is_active,
    event_instance.template_id,
    template.key AS template_key,
    template.name AS template_name,
    template.event_type,
    event_instance.status,
    event_instance.prompt_text,
    event_instance.created_by_account_id,
    creator.display_name AS created_by_display_name,
    event_instance.selected_option_id,
    event_instance.selected_option_key,
    selected_option.label AS selected_option_label,
    event_instance.outcome_summary,
    event_instance.result_json,
    event_instance.created_at,
    event_instance.updated_at,
    event_instance.resolved_at,
    event_instance.expires_at
  FROM dnd5e_event_instance event_instance
  JOIN dnd5e_campaign campaign ON campaign.id = event_instance.campaign_id
  JOIN dnd5e_character character ON character.id = event_instance.character_id
  JOIN account owner ON owner.id = character.account_id
  JOIN dnd5e_event_template template ON template.id = event_instance.template_id
  LEFT JOIN account creator ON creator.id = event_instance.created_by_account_id
  LEFT JOIN dnd5e_event_option selected_option ON selected_option.id = event_instance.selected_option_id
  WHERE event_instance.id = $1;
`;

export const selectEventInstanceByIdForUpdateQuery = `
  SELECT
    event_instance.id,
    event_instance.campaign_id,
    campaign.name AS campaign_name,
    campaign.description AS campaign_description,
    campaign.is_active AS campaign_is_active,
    event_instance.character_id,
    character.name AS character_name,
    character.account_id,
    owner.display_name AS account_display_name,
    owner.is_active AS account_is_active,
    character.is_active AS character_is_active,
    event_instance.template_id,
    template.key AS template_key,
    template.name AS template_name,
    template.event_type,
    event_instance.status,
    event_instance.prompt_text,
    event_instance.created_by_account_id,
    creator.display_name AS created_by_display_name,
    event_instance.selected_option_id,
    event_instance.selected_option_key,
    selected_option.label AS selected_option_label,
    event_instance.outcome_summary,
    event_instance.result_json,
    event_instance.created_at,
    event_instance.updated_at,
    event_instance.resolved_at,
    event_instance.expires_at
  FROM dnd5e_event_instance event_instance
  JOIN dnd5e_campaign campaign ON campaign.id = event_instance.campaign_id
  JOIN dnd5e_character character ON character.id = event_instance.character_id
  JOIN account owner ON owner.id = character.account_id
  JOIN dnd5e_event_template template ON template.id = event_instance.template_id
  LEFT JOIN account creator ON creator.id = event_instance.created_by_account_id
  LEFT JOIN dnd5e_event_option selected_option ON selected_option.id = event_instance.selected_option_id
  WHERE event_instance.id = $1
  FOR UPDATE OF event_instance;
`;

export const selectCharacterEventsQuery = `
  SELECT
    event_instance.id,
    event_instance.campaign_id,
    campaign.name AS campaign_name,
    event_instance.character_id,
    event_instance.template_id,
    template.key AS template_key,
    template.name AS template_name,
    template.event_type,
    event_instance.status,
    event_instance.prompt_text,
    event_instance.selected_option_id,
    event_instance.selected_option_key,
    selected_option.label AS selected_option_label,
    event_instance.outcome_summary,
    event_instance.created_at,
    event_instance.updated_at,
    event_instance.resolved_at
  FROM dnd5e_event_instance event_instance
  JOIN dnd5e_campaign campaign ON campaign.id = event_instance.campaign_id
  JOIN dnd5e_event_template template ON template.id = event_instance.template_id
  LEFT JOIN dnd5e_event_option selected_option ON selected_option.id = event_instance.selected_option_id
  WHERE event_instance.character_id = $1
  ORDER BY event_instance.created_at DESC, event_instance.id DESC;
`;

export const selectEventOptionsByEventQuery = `
  SELECT
    option.id,
    option.event_instance_id,
    option.template_option_id,
    option.option_key,
    option.label,
    option.description,
    option.sort_order,
    option.resolution_kind,
    option.resolution_payload_json,
    option.is_available,
    option.created_at
  FROM dnd5e_event_option option
  WHERE option.event_instance_id = $1
  ORDER BY option.sort_order ASC, option.id ASC;
`;

export const selectEventLogRowsByEventQuery = `
  SELECT
    log.id,
    log.event_instance_id,
    log.actor_account_id,
    actor.display_name AS actor_display_name,
    log.log_type,
    log.message,
    log.data_json,
    log.created_at
  FROM dnd5e_event_log log
  LEFT JOIN account actor ON actor.id = log.actor_account_id
  WHERE log.event_instance_id = $1
  ORDER BY log.created_at ASC, log.id ASC;
`;

export const insertEventLogQuery = `
  INSERT INTO dnd5e_event_log (
    event_instance_id,
    actor_account_id,
    log_type,
    message,
    data_json
  )
  VALUES ($1, $2, $3, $4, $5::jsonb)
  RETURNING
    id,
    event_instance_id,
    actor_account_id,
    log_type,
    message,
    data_json,
    created_at;
`;

export const updateEventInstanceResolutionQuery = `
  UPDATE dnd5e_event_instance
  SET
    status = 'resolved',
    selected_option_id = $2,
    selected_option_key = $3,
    outcome_summary = $4,
    result_json = $5::jsonb,
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE id = $1;
`;
