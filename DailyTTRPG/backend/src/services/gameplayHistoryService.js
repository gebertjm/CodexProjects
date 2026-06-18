import { query } from '../config/db.js';
import {
  insertGameplayHistoryQuery,
  selectGameplayHistoryByCharacterQuery,
} from '../db/queries/gameplayHistory.js';

function mapGameplayHistoryRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    actor:
      row.actor_account_id !== null
        ? {
            account_id: Number(row.actor_account_id),
            display_name: row.actor_display_name,
          }
        : null,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    action_key: row.action_key,
    summary: row.summary,
    input_json: row.input_json ?? {},
    result_json: row.result_json ?? null,
    xp_delta: Number(row.xp_delta ?? 0),
    created_at: row.created_at,
  };
}

function normalizeJsonValue(value, fallback = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value;
}

export async function recordGameplayHistory(entry, executor = { query }) {
  const result = await executor.query(insertGameplayHistoryQuery, [
    entry.character_id,
    entry.actor_account_id ?? null,
    entry.source_type,
    entry.source_entity_id ?? null,
    entry.action_key,
    entry.summary,
    JSON.stringify(normalizeJsonValue(entry.input_json)),
    entry.result_json === undefined ? null : JSON.stringify(normalizeJsonValue(entry.result_json, null)),
    entry.xp_delta ?? 0,
  ]);

  return mapGameplayHistoryRow(result.rows[0]);
}

export async function recordGameplayHistorySafely(entry) {
  try {
    return await recordGameplayHistory(entry, { query });
  } catch (error) {
    console.error('Failed to record gameplay history.');
    console.error(error.message);
    return null;
  }
}

export async function listCharacterGameplayHistory(characterId, limit = 25, offset = 0) {
  const result = await query(selectGameplayHistoryByCharacterQuery, [characterId, limit, offset]);
  return result.rows.map(mapGameplayHistoryRow);
}
