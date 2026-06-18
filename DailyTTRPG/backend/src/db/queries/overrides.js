export const selectCharacterByIdQuery = `
  SELECT
    id,
    account_id,
    name,
    is_active
  FROM dnd5e_character
  WHERE id = $1;
`;

export const selectCharacterItemOwnerQuery = `
  SELECT
    id,
    character_id
  FROM dnd5e_character_item
  WHERE id = $1;
`;

export const selectOverrideByIdQuery = `
  SELECT
    override.id,
    override.character_id,
    override.target_scope,
    override.target_entity_id,
    override.override_category,
    override.subject_key,
    override.operation_type,
    override.value_json,
    override.reason,
    override.actor_account_id,
    override.actor_label,
    override.is_active,
    override.deactivated_at,
    override.created_at,
    override.updated_at,
    actor.display_name AS actor_display_name
  FROM dnd5e_override override
  LEFT JOIN account actor ON actor.id = override.actor_account_id
  WHERE override.id = $1;
`;

export const selectCharacterOverridesQuery = `
  SELECT
    override.id,
    override.character_id,
    override.target_scope,
    override.target_entity_id,
    override.override_category,
    override.subject_key,
    override.operation_type,
    override.value_json,
    override.reason,
    override.actor_account_id,
    override.actor_label,
    override.is_active,
    override.deactivated_at,
    override.created_at,
    override.updated_at,
    actor.display_name AS actor_display_name
  FROM dnd5e_override override
  LEFT JOIN account actor ON actor.id = override.actor_account_id
  WHERE override.character_id = $1
  ORDER BY override.created_at DESC, override.id DESC;
`;

export const selectMatchingActiveOverridesQuery = `
  SELECT
    override.id,
    override.character_id,
    override.target_scope,
    override.target_entity_id,
    override.override_category,
    override.subject_key,
    override.operation_type,
    override.value_json,
    override.reason,
    override.actor_account_id,
    override.actor_label,
    override.is_active,
    override.deactivated_at,
    override.created_at,
    override.updated_at,
    actor.display_name AS actor_display_name
  FROM dnd5e_override override
  LEFT JOIN account actor ON actor.id = override.actor_account_id
  WHERE override.character_id = $1
    AND override.override_category = $2
    AND override.target_scope = $3
    AND (
      ($4::bigint IS NULL AND override.target_entity_id IS NULL)
      OR override.target_entity_id = $4
    )
    AND (
      array_length($5::text[], 1) IS NULL
      OR override.subject_key IS NULL
      OR override.subject_key = ANY($5::text[])
    )
    AND override.is_active = TRUE
  ORDER BY override.created_at DESC, override.id DESC;
`;

export const selectActiveCharacterOverridesByCategoryQuery = `
  SELECT
    override.id,
    override.character_id,
    override.target_scope,
    override.target_entity_id,
    override.override_category,
    override.subject_key,
    override.operation_type,
    override.value_json,
    override.reason,
    override.actor_account_id,
    override.actor_label,
    override.is_active,
    override.deactivated_at,
    override.created_at,
    override.updated_at,
    actor.display_name AS actor_display_name
  FROM dnd5e_override override
  LEFT JOIN account actor ON actor.id = override.actor_account_id
  WHERE override.character_id = $1
    AND override.override_category = $2
    AND override.is_active = TRUE
  ORDER BY override.created_at DESC, override.id DESC;
`;

export const insertOverrideQuery = `
  INSERT INTO dnd5e_override (
    character_id,
    target_scope,
    target_entity_id,
    override_category,
    subject_key,
    operation_type,
    value_json,
    reason,
    actor_account_id,
    actor_label,
    is_active
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
  RETURNING id;
`;

export const updateOverrideQuery = `
  UPDATE dnd5e_override
  SET
    value_json = $2::jsonb,
    reason = $3,
    actor_account_id = $4,
    actor_label = $5,
    is_active = $6,
    deactivated_at = CASE
      WHEN $6 = FALSE AND deactivated_at IS NULL THEN NOW()
      WHEN $6 = TRUE THEN NULL
      ELSE deactivated_at
    END,
    updated_at = NOW()
  WHERE id = $1;
`;
