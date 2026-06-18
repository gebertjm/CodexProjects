import { query } from '../config/db.js';
import {
  insertCommandLogQuery,
  selectCommandLogsByCharacterQuery,
} from '../db/queries/commandLogs.js';

function mapCommandLogRow(row) {
  return {
    id: Number(row.id),
    character_id: Number(row.character_id),
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    actor: row.actor_account_id
      ? {
          account_id: Number(row.actor_account_id),
          display_name: row.actor_display_name,
        }
      : null,
    command_type: row.command_type,
    payload_json: row.payload_json ?? {},
    success: row.success,
    result_json: row.result_json ?? null,
    error_message: row.error_message,
    created_at: row.created_at,
  };
}

export async function listCharacterCommandLogs(characterId, limit = 25) {
  const result = await query(selectCommandLogsByCharacterQuery, [characterId, limit]);
  return result.rows.map(mapCommandLogRow);
}

export async function recordCommandLog(entry) {
  try {
    const result = await query(insertCommandLogQuery, [
      entry.character_id,
      entry.actor_account_id ?? null,
      entry.command_type,
      JSON.stringify(entry.payload_json ?? {}),
      entry.success,
      entry.result_json ? JSON.stringify(entry.result_json) : null,
      entry.error_message ?? null,
    ]);

    return mapCommandLogRow(result.rows[0]);
  } catch (error) {
    console.error('Failed to record command log.');
    console.error(error.message);
    return null;
  }
}
