export const insertGameplayHistoryQuery = `
  INSERT INTO dnd5e_gameplay_history (
    character_id,
    actor_account_id,
    source_type,
    source_entity_id,
    action_key,
    summary,
    input_json,
    result_json,
    xp_delta
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
  RETURNING
    id,
    character_id,
    actor_account_id,
    source_type,
    source_entity_id,
    action_key,
    summary,
    input_json,
    result_json,
    xp_delta,
    created_at;
`;

export const selectGameplayHistoryByCharacterQuery = `
  SELECT
    history.id,
    history.character_id,
    history.actor_account_id,
    actor.display_name AS actor_display_name,
    history.source_type,
    history.source_entity_id,
    history.action_key,
    history.summary,
    history.input_json,
    history.result_json,
    history.xp_delta,
    history.created_at
  FROM dnd5e_gameplay_history history
  LEFT JOIN account actor ON actor.id = history.actor_account_id
  WHERE history.character_id = $1
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT $2
  OFFSET $3;
`;
