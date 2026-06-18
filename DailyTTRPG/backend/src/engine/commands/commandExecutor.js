import { getCharacterRules } from '../../services/characterRulesService.js';
import { recordCommandLog } from '../../services/commandLogService.js';
import { recordGameplayHistorySafely } from '../../services/gameplayHistoryService.js';
import { createHttpError } from '../../utils/httpError.js';
import {
  readRequiredCommandType,
  readRequiredPayloadObject,
  readRequiredPositiveInteger,
} from './helpers.js';
import { getCommandHandler } from './commandRegistry.js';

function normalizeActorAccountId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return readRequiredPositiveInteger(value, 'actorAccountId');
}

function normalizeCommandInput(input) {
  const type = readRequiredCommandType(input?.type);
  const characterId = readRequiredPositiveInteger(input?.characterId, 'characterId');
  const payload = readRequiredPayloadObject(input?.payload ?? {});
  const actorAccountId = normalizeActorAccountId(input?.actorAccountId);

  return {
    type,
    characterId,
    actorAccountId,
    payload,
  };
}

function buildLogResult(result) {
    return {
      success: result.success,
      command: result.command,
      effects: result.effects,
      state: {
        before_summary: result.state.before_summary,
        after_summary: result.state.after_summary,
      },
    };
}

export async function executeCommand(input) {
  const command = normalizeCommandInput(input);
  const handler = getCommandHandler(command.type);

  if (!handler) {
    throw createHttpError('Unsupported command type', 400);
  }

  const beforeRules = await getCharacterRules(command.characterId);

  if (!beforeRules) {
    throw createHttpError('Character not found', 404);
  }

  try {
    const execution = await handler.execute({
      command,
      beforeRules,
    });
    const afterRules = await getCharacterRules(command.characterId);

    const result = {
      success: true,
      command: {
        type: command.type,
        character_id: command.characterId,
        actor_account_id: command.actorAccountId,
        payload: command.payload,
      },
      effects: execution.effects ?? {},
      errors: [],
      state: {
        before_summary: beforeRules.summary ?? null,
        after_summary: afterRules?.summary ?? null,
        derived_rules: afterRules,
      },
    };

    const logEntry = await recordCommandLog({
      character_id: command.characterId,
      actor_account_id: command.actorAccountId,
      command_type: command.type,
      payload_json: command.payload,
      success: true,
      result_json: buildLogResult(result),
    });

    await recordGameplayHistorySafely({
      character_id: command.characterId,
      actor_account_id: command.actorAccountId,
      source_type: 'command',
      source_entity_id: logEntry?.id ?? null,
      action_key: command.type,
      summary: `Command ${command.type} succeeded.`,
      input_json: command.payload,
      result_json: buildLogResult(result),
      xp_delta: Number(execution.effects?.progression?.amount_granted ?? 0),
    });

    return {
      ...result,
      log: logEntry,
    };
  } catch (error) {
    const logEntry = await recordCommandLog({
      character_id: command.characterId,
      actor_account_id: command.actorAccountId,
      command_type: command.type,
      payload_json: command.payload,
      success: false,
      result_json: null,
      error_message: error.message,
    });

    await recordGameplayHistorySafely({
      character_id: command.characterId,
      actor_account_id: command.actorAccountId,
      source_type: 'command',
      source_entity_id: logEntry?.id ?? null,
      action_key: command.type,
      summary: `Command ${command.type} failed: ${error.message}`,
      input_json: command.payload,
      result_json: {
        success: false,
        error: {
          message: error.message,
          statusCode: error.statusCode ?? 500,
        },
      },
      xp_delta: 0,
    });

    throw error;
  }
}
