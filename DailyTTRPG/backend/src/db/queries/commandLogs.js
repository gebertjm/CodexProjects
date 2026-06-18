export const insertCommandLogQuery = `
  INSERT INTO dnd5e_command_log (
    character_id,
    actor_account_id,
    command_type,
    payload_json,
    success,
    result_json,
    error_message
  )
  VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
  RETURNING
    id,
    character_id,
    actor_account_id,
    command_type,
    payload_json,
    success,
    result_json,
    error_message,
    created_at;
`;

export const selectCommandLogsByCharacterQuery = `
  SELECT
    log.id,
    log.character_id,
    log.actor_account_id,
    actor.display_name AS actor_display_name,
    log.command_type,
    log.payload_json,
    log.success,
    log.result_json,
    log.error_message,
    log.created_at
  FROM dnd5e_command_log log
  LEFT JOIN account actor ON actor.id = log.actor_account_id
  WHERE log.character_id = $1
  ORDER BY log.created_at DESC, log.id DESC
  LIMIT $2;
`;
