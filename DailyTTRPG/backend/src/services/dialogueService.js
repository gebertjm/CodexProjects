import { query, withTransaction } from '../config/db.js';
import {
  insertDialogueSessionChoiceQuery,
  insertDialogueSessionQuery,
  insertDialogueSessionStateQuery,
  insertDialogueSessionVisitQuery,
  selectActiveDialogueSessionByCampaignAndCharacterQuery,
  selectDialogueByIdQuery,
  selectDialogueByKeyQuery,
  selectDialogueEntryNodesQuery,
  selectDialogueNodeByIdQuery,
  selectDialogueOptionByIdQuery,
  selectDialogueOptionByNodeAndKeyQuery,
  selectDialogueOptionsByNodeQuery,
  selectDialogueOutcomesByOptionQuery,
  selectDialogueSessionByIdForUpdateQuery,
  selectDialogueSessionByIdQuery,
  selectDialogueSessionChoicesQuery,
  selectDialogueSessionVisitsQuery,
  selectDialogueSessionsByCampaignAndCharacterQuery,
  selectNpcTalkDialoguesBySceneAndNpcQuery,
  selectSceneEnterDialoguesBySceneQuery,
  updateDialogueSessionStateQuery,
  updateDialogueSessionStatusQuery,
} from '../db/queries/dialogue.js';
import { selectNpcByKeyQuery, selectSceneNpcsBySceneQuery } from '../db/queries/narrative.js';
import {
  appendUniqueString,
  evaluateDialogueConditions,
  resolveDialogueOptionSkillCheck,
} from '../engine/dialogue/dialogueEngine.js';
import { evaluateNarrativeConditions } from '../engine/narrative/narrativeEngine.js';
import {
  applyNarrativeEffects,
  assertMembership,
  assertNarrativeWriteAllowed,
  buildConditionContext,
  buildNarrativeStateContext,
  getNarrativeContext,
  normalizeNarrativeOptionalText,
  recordCampaignLog,
} from './narrativeStateService.js';
import { getCharacterRules } from './characterRulesService.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { createHttpError } from '../utils/httpError.js';

function normalizeLimit(limit, fallback = 25) {
  const parsed = Number(limit ?? fallback);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw createHttpError('limit must be an integer from 1 to 100', 400);
  }

  return parsed;
}

function normalizeOffset(offset, fallback = 0) {
  const parsed = Number(offset ?? fallback);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError('offset must be a non-negative integer', 400);
  }

  return parsed;
}

function normalizeOptionalRoll(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw createHttpError('roll must be an integer from 1 to 20', 400);
  }

  return parsed;
}

function mapDialogueRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    npc_id: row.npc_id !== null ? Number(row.npc_id) : null,
    dialogue_key: row.dialogue_key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    trigger_type: row.trigger_type,
    trigger_event: row.trigger_event,
    sort_order: Number(row.sort_order),
    availability_conditions_json: row.availability_conditions_json ?? {},
    is_repeatable: row.is_repeatable,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    scene:
      row.scene_id !== null
        ? {
            id: Number(row.scene_id),
            key: row.scene_key,
            name: row.scene_name,
          }
        : null,
    npc:
      row.npc_id !== null
        ? {
            id: Number(row.npc_id),
            key: row.npc_key,
            name: row.npc_name,
            npc_type: row.npc_type,
            disposition: row.npc_base_disposition,
            role: row.npc_role,
          }
        : null,
  };
}

function mapDialogueNodeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    dialogue_id: Number(row.dialogue_id),
    speaker_npc_id: row.speaker_npc_id !== null ? Number(row.speaker_npc_id) : null,
    node_key: row.node_key,
    title: row.title,
    speaker_type: row.speaker_type,
    text_content: row.text_content,
    sort_order: Number(row.sort_order),
    is_entry_node: row.is_entry_node,
    is_terminal: row.is_terminal,
    availability_conditions_json: row.availability_conditions_json ?? {},
    entry_effects_json: row.entry_effects_json ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    speaker:
      row.speaker_npc_id !== null
        ? {
            id: Number(row.speaker_npc_id),
            key: row.speaker_npc_key,
            name: row.speaker_npc_name,
            role: row.speaker_npc_role,
          }
        : null,
  };
}

function mapDialogueOptionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    node_id: Number(row.node_id),
    option_key: row.option_key,
    label: row.label,
    description: row.description,
    sort_order: Number(row.sort_order),
    availability_conditions_json: row.availability_conditions_json ?? {},
    check_mode: row.check_mode,
    difficulty_class: row.difficulty_class !== null ? Number(row.difficulty_class) : null,
    check_visibility: row.check_visibility,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    skill:
      row.skill_id !== null
        ? {
            id: Number(row.skill_id),
            name: row.skill_name,
            slug: row.skill_slug,
          }
        : null,
  };
}

function mapDialogueOutcomeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    option_id: Number(row.option_id),
    next_node_id: row.next_node_id !== null ? Number(row.next_node_id) : null,
    outcome_key: row.outcome_key,
    label: row.label,
    sort_order: Number(row.sort_order),
    conditions_json: row.conditions_json ?? {},
    effects_json: row.effects_json ?? {},
    result_text: row.result_text,
    is_terminal: row.is_terminal,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    next_node:
      row.next_node_id !== null
        ? {
            id: Number(row.next_node_id),
            node_key: row.next_node_key,
            title: row.next_node_title,
            speaker_type: row.next_node_speaker_type,
          }
        : null,
  };
}

function mapDialogueSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    dialogue_id: Number(row.dialogue_id),
    npc_id: row.npc_id !== null ? Number(row.npc_id) : null,
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    started_by_account_id:
      row.started_by_account_id !== null ? Number(row.started_by_account_id) : null,
    ended_by_account_id: row.ended_by_account_id !== null ? Number(row.ended_by_account_id) : null,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    current_node_id: Number(row.current_node_id),
    pending_option_id: row.pending_option_id !== null ? Number(row.pending_option_id) : null,
    session_memory_json: row.session_memory_json ?? {},
    visited_node_keys_json: Array.isArray(row.visited_node_keys_json)
      ? row.visited_node_keys_json
      : [],
    choice_history_json: Array.isArray(row.choice_history_json) ? row.choice_history_json : [],
    state_updated_at: row.state_updated_at,
    dialogue: {
      id: Number(row.dialogue_id),
      dialogue_key: row.dialogue_key,
      name: row.dialogue_name,
      summary: row.dialogue_summary,
      description: row.dialogue_description,
      trigger_type: row.trigger_type,
      trigger_event: row.trigger_event,
      sort_order: Number(row.dialogue_sort_order),
      availability_conditions_json: row.dialogue_availability_conditions_json ?? {},
    },
    scene:
      row.scene_id !== null
        ? {
            id: Number(row.scene_id),
            key: row.scene_key,
            name: row.scene_name,
          }
        : null,
    npc:
      row.npc_id !== null
        ? {
            id: Number(row.npc_id),
            key: row.npc_key,
            name: row.npc_name,
            npc_type: row.npc_type,
            role: row.npc_role,
          }
        : null,
    started_by:
      row.started_by_account_id !== null
        ? {
            account_id: Number(row.started_by_account_id),
            display_name: row.started_by_display_name,
          }
        : null,
    ended_by:
      row.ended_by_account_id !== null
        ? {
            account_id: Number(row.ended_by_account_id),
            display_name: row.ended_by_display_name,
          }
        : null,
  };
}

function mapDialogueSessionVisitRow(row) {
  return {
    id: Number(row.id),
    dialogue_session_id: Number(row.dialogue_session_id),
    node: {
      id: Number(row.node_id),
      node_key: row.node_key,
      title: row.title,
      speaker_type: row.speaker_type,
    },
    entered_at: row.entered_at,
  };
}

function mapDialogueSessionChoiceRow(row) {
  return {
    id: Number(row.id),
    dialogue_session_id: Number(row.dialogue_session_id),
    node: {
      id: Number(row.node_id),
      node_key: row.node_key,
      title: row.node_title,
    },
    option: {
      id: Number(row.option_id),
      option_key: row.option_key,
      label: row.option_label,
    },
    outcome:
      row.outcome_id !== null
        ? {
            id: Number(row.outcome_id),
            outcome_key: row.outcome_key,
            label: row.outcome_label,
          }
        : null,
    actor:
      row.actor_account_id !== null
        ? {
            account_id: Number(row.actor_account_id),
            display_name: row.actor_display_name,
          }
        : null,
    check_mode: row.check_mode,
    check_visibility: row.check_visibility,
    check:
      row.skill_id !== null
        ? {
            skill: {
              id: Number(row.skill_id),
              name: row.skill_name,
              slug: row.skill_slug,
            },
            difficulty_class: row.difficulty_class !== null ? Number(row.difficulty_class) : null,
            roll_value: row.roll_value !== null ? Number(row.roll_value) : null,
            skill_modifier: row.skill_modifier !== null ? Number(row.skill_modifier) : null,
            total_value: row.total_value !== null ? Number(row.total_value) : null,
            margin_value: row.margin_value !== null ? Number(row.margin_value) : null,
            was_success: row.was_success,
          }
        : null,
    result_summary: row.result_summary,
    applied_effects_json: row.applied_effects_json ?? {},
    created_at: row.created_at,
  };
}

function buildSessionMemoryMap(session) {
  return new Map(Object.entries(session.session_memory_json ?? {}));
}

function buildVisitedNodeKeySet(session) {
  return new Set(
    (session.visited_node_keys_json ?? [])
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean)
  );
}

function buildChoiceKeySet(session) {
  return new Set(
    (session.choice_history_json ?? [])
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean)
  );
}

function buildDialogueConditionContext(narrativeContext, stateContext, session) {
  return buildConditionContext(narrativeContext, stateContext, {
    session_flags: buildSessionMemoryMap(session),
    visited_node_keys: buildVisitedNodeKeySet(session),
    chosen_option_keys: buildChoiceKeySet(session),
  });
}

function buildOptionPresentation(option, availability, { pendingOptionId = null } = {}) {
  return {
    ...option,
    availability,
    is_pending_skill_check: pendingOptionId !== null && pendingOptionId === option.id,
    skill_check:
      option.skill
        ? {
            mode: option.check_mode,
            visibility: option.check_visibility,
            skill:
              option.check_visibility === 'hidden'
                ? null
                : {
                    id: option.skill.id,
                    name: option.skill.name,
                    slug: option.skill.slug,
                  },
            difficulty_class:
              option.check_visibility === 'hidden' ? null : option.difficulty_class,
          }
        : null,
  };
}

async function getDialogueById(dialogueId, executor = { query }) {
  const result = await executor.query(selectDialogueByIdQuery, [dialogueId]);
  return mapDialogueRow(result.rows[0] || null);
}

async function getDialogueByKey(dialogueKey, executor = { query }) {
  const result = await executor.query(selectDialogueByKeyQuery, [dialogueKey]);
  return mapDialogueRow(result.rows[0] || null);
}

async function getDialogueNodeById(nodeId, executor = { query }) {
  const result = await executor.query(selectDialogueNodeByIdQuery, [nodeId]);
  return mapDialogueNodeRow(result.rows[0] || null);
}

async function getDialogueOptionsByNode(nodeId, executor = { query }) {
  const result = await executor.query(selectDialogueOptionsByNodeQuery, [nodeId]);
  return result.rows.map(mapDialogueOptionRow);
}

async function getDialogueOutcomesByOption(optionId, executor = { query }) {
  const result = await executor.query(selectDialogueOutcomesByOptionQuery, [optionId]);
  return result.rows.map(mapDialogueOutcomeRow);
}

async function getDialogueSessionById(sessionId, executor = { query }, { forUpdate = false } = {}) {
  const statement = forUpdate ? selectDialogueSessionByIdForUpdateQuery : selectDialogueSessionByIdQuery;
  const result = await executor.query(statement, [sessionId]);
  return mapDialogueSessionRow(result.rows[0] || null);
}

async function getActiveDialogueSession(campaignId, characterId, executor = { query }) {
  const result = await executor.query(selectActiveDialogueSessionByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
  ]);
  return mapDialogueSessionRow(result.rows[0] || null);
}

async function listDialogueSessionVisits(sessionId, executor = { query }) {
  const result = await executor.query(selectDialogueSessionVisitsQuery, [sessionId]);
  return result.rows.map(mapDialogueSessionVisitRow);
}

async function listDialogueSessionChoices(sessionId, executor = { query }) {
  const result = await executor.query(selectDialogueSessionChoicesQuery, [sessionId]);
  return result.rows.map(mapDialogueSessionChoiceRow);
}

async function resolveDialogueForStart(context, input, executor) {
  if (input.dialogue_id !== undefined && input.dialogue_id !== null) {
    return getDialogueById(Number(input.dialogue_id), executor);
  }

  if (input.dialogue_key) {
    return getDialogueByKey(input.dialogue_key, executor);
  }

  let npcId = input.npc_id ?? null;

  if (npcId === null && input.npc_key) {
    const npcResult = await executor.query(selectNpcByKeyQuery, [input.npc_key]);
    const npc = npcResult.rows[0] || null;

    if (!npc) {
      throw createHttpError('NPC not found', 404);
    }

    npcId = Number(npc.id);
  }

  if (npcId === null) {
    throw createHttpError('Provide dialogue_id, dialogue_key, npc_id, or npc_key', 400);
  }

  const result = await executor.query(selectNpcTalkDialoguesBySceneAndNpcQuery, [
    context.current_scene_id,
    npcId,
  ]);
  const candidates = result.rows.map(mapDialogueRow);

  return candidates[0] || null;
}

async function assertDialogueCanStart(dialogue, context, stateContext, executor) {
  if (!dialogue) {
    throw createHttpError('Dialogue not found for the current scene and NPC', 404);
  }

  if (!dialogue.is_active) {
    throw createHttpError('That dialogue is inactive', 409);
  }

  if (context.current_scene_id === null) {
    throw createHttpError('Character must be in a scene before starting dialogue', 409);
  }

  if (dialogue.scene_id !== null && dialogue.scene_id !== context.current_scene_id) {
    throw createHttpError('That dialogue is not available in the current scene', 409);
  }

  const availability = evaluateNarrativeConditions(
    dialogue.availability_conditions_json,
    buildConditionContext(context, stateContext)
  );

  if (!availability.is_available) {
    throw createHttpError('That dialogue is currently unavailable', 409);
  }

  if (dialogue.npc_id !== null) {
    const npcResult = await executor.query(selectSceneNpcsBySceneQuery, [
      context.current_scene_id,
      context.campaign_id,
    ]);
    const npcRow = npcResult.rows.find((row) => Number(row.npc_id) === dialogue.npc_id);

    if (!npcRow || !npcRow.is_active) {
      throw createHttpError('That NPC is not currently present in the scene', 409);
    }

    const npcAvailability = evaluateNarrativeConditions(
      npcRow.availability_conditions_json ?? {},
      buildConditionContext(context, stateContext)
    );

    if (!npcAvailability.is_available) {
      throw createHttpError('That NPC is currently unavailable for dialogue', 409);
    }
  }
}

async function resolveEntryNode(dialogueId, conditionContext, executor) {
  const result = await executor.query(selectDialogueEntryNodesQuery, [dialogueId]);
  const candidates = result.rows.map(mapDialogueNodeRow);

  for (const node of candidates) {
    const availability = evaluateDialogueConditions(
      node.availability_conditions_json,
      conditionContext
    );

    if (availability.is_available) {
      return node;
    }
  }

  throw createHttpError('No dialogue entry node is currently available', 409);
}

async function decorateCurrentNodeOptions(node, conditionContext, pendingOptionId, executor) {
  const options = await getDialogueOptionsByNode(node.id, executor);

  return options.map((option) => {
    const availability = evaluateDialogueConditions(option.availability_conditions_json, conditionContext);
    return buildOptionPresentation(option, availability, { pendingOptionId });
  });
}

function splitSessionEffects(effectPayload) {
  const effects = effectPayload ?? {};
  const sessionFlags = effects.session_flags ?? {};
  const narrativePayload = {
    ...effects,
  };

  delete narrativePayload.session_flags;

  return {
    sessionFlags,
    narrativePayload,
  };
}

async function applyDialogueEffects({
  campaignId,
  characterId,
  session,
  effectPayload,
  actorAccountId,
  sourceEntityId,
  sourceKey,
  sourceLabel,
  executor,
}) {
  const { sessionFlags, narrativePayload } = splitSessionEffects(effectPayload);
  const nextSessionMemory = {
    ...(session.session_memory_json ?? {}),
  };
  const appliedSessionFlags = [];

  for (const [flagKey, flagValue] of Object.entries(sessionFlags)) {
    nextSessionMemory[flagKey] = flagValue;
    appliedSessionFlags.push({
      flag_key: flagKey,
      flag_value: flagValue,
    });
  }

  const appliedNarrativeEffects = await applyNarrativeEffects({
    campaignId,
    characterId,
    effectPayload: narrativePayload,
    actorAccountId,
    sourceType: 'narrative',
    sourceEntityId,
    sourceKey,
    sourceLabel,
    executor,
  });

  return {
    nextSessionMemory,
    applied_effects: {
      ...appliedNarrativeEffects,
      session_flags: appliedSessionFlags,
    },
  };
}

async function updateSessionState(session, nextState, executor) {
  const updated = await executor.query(updateDialogueSessionStateQuery, [
    session.id,
    nextState.current_node_id,
    nextState.pending_option_id ?? null,
    JSON.stringify(nextState.session_memory_json ?? {}),
    JSON.stringify(nextState.visited_node_keys_json ?? []),
    JSON.stringify(nextState.choice_history_json ?? []),
  ]);

  return {
    ...session,
    current_node_id: Number(updated.rows[0].current_node_id),
    pending_option_id:
      updated.rows[0].pending_option_id !== null ? Number(updated.rows[0].pending_option_id) : null,
    session_memory_json: updated.rows[0].session_memory_json ?? {},
    visited_node_keys_json: Array.isArray(updated.rows[0].visited_node_keys_json)
      ? updated.rows[0].visited_node_keys_json
      : [],
    choice_history_json: Array.isArray(updated.rows[0].choice_history_json)
      ? updated.rows[0].choice_history_json
      : [],
    state_updated_at: updated.rows[0].updated_at,
  };
}

async function setSessionStatus(sessionId, status, actorAccountId, executor) {
  const result = await executor.query(updateDialogueSessionStatusQuery, [
    sessionId,
    status,
    actorAccountId ?? null,
  ]);
  return result.rows[0];
}

function buildDialogueHistorySummary(session, node, outcome, appliedEffects, checkResult = null) {
  return {
    dialogue_session_id: session.id,
    dialogue_key: session.dialogue.dialogue_key,
    node_key: node.node_key,
    outcome_key: outcome?.outcome_key ?? null,
    result_text: outcome?.result_text ?? null,
    check: checkResult,
    applied_effects: appliedEffects,
  };
}

async function recordDialogueSessionChoice({
  session,
  node,
  option,
  outcome,
  actorAccountId,
  checkResult,
  appliedEffects,
  executor,
}) {
  const result = await executor.query(insertDialogueSessionChoiceQuery, [
    session.id,
    node.id,
    option.id,
    outcome?.id ?? null,
    actorAccountId ?? null,
    option.check_mode,
    option.skill?.id ?? null,
    option.difficulty_class,
    option.skill ? option.check_visibility : null,
    checkResult?.roll_value ?? null,
    checkResult?.skill_modifier ?? null,
    checkResult?.total_value ?? null,
    checkResult?.margin_value ?? null,
    checkResult?.was_success ?? null,
    outcome?.result_text ?? `${option.label} resolved.`,
    JSON.stringify(appliedEffects ?? {}),
  ]);

  return mapDialogueSessionChoiceRow({
    ...result.rows[0],
    node_key: node.node_key,
    node_title: node.title,
    option_key: option.option_key,
    option_label: option.label,
    outcome_key: outcome?.outcome_key ?? null,
    outcome_label: outcome?.label ?? null,
    actor_display_name: null,
    skill_name: option.skill?.name ?? null,
    skill_slug: option.skill?.slug ?? null,
  });
}

async function loadDialogueSessionView(sessionId, executor = { query }) {
  const session = await getDialogueSessionById(sessionId, executor);

  if (!session) {
    return null;
  }

  const narrativeContext = await getNarrativeContext(
    session.campaign_id,
    session.character_id,
    executor
  );
  const stateContext = await buildNarrativeStateContext(
    session.campaign_id,
    session.character_id,
    executor
  );
  const currentNode = await getDialogueNodeById(session.current_node_id, executor);
  const visits = await listDialogueSessionVisits(session.id, executor);
  const choices = await listDialogueSessionChoices(session.id, executor);

  const conditionContext = buildDialogueConditionContext(narrativeContext, stateContext, session);
  const options =
    session.status === 'active' && currentNode
      ? await decorateCurrentNodeOptions(
          currentNode,
          conditionContext,
          session.pending_option_id,
          executor
        )
      : [];

  return {
    ...session,
    current_node: currentNode,
    options,
    session_state: {
      current_node_id: session.current_node_id,
      pending_option_id: session.pending_option_id,
      memory_json: session.session_memory_json,
      visited_node_keys: session.visited_node_keys_json,
      choice_history: session.choice_history_json,
    },
    visits,
    choices,
  };
}

async function startDialogueSessionInternal(campaignId, characterId, input, executor) {
  const context = await getNarrativeContext(campaignId, characterId, executor, { forUpdate: true });
  assertNarrativeWriteAllowed(context);

  if (context.current_scene_id === null) {
    throw createHttpError('Character must be in a scene before starting dialogue', 409);
  }

  const activeSession = await getActiveDialogueSession(campaignId, characterId, executor);

  if (activeSession) {
    if (
      (input.dialogue_id !== undefined && activeSession.dialogue_id === Number(input.dialogue_id)) ||
      (input.dialogue_key && activeSession.dialogue.dialogue_key === input.dialogue_key) ||
      (input.npc_id !== undefined && activeSession.npc_id === Number(input.npc_id)) ||
      (input.npc_key && activeSession.npc?.key === input.npc_key)
    ) {
      return loadDialogueSessionView(activeSession.id, executor);
    }

    throw createHttpError(
      'Character already has an active dialogue session in this campaign',
      409
    );
  }

  const stateContext = await buildNarrativeStateContext(campaignId, characterId, executor);
  const dialogue = await resolveDialogueForStart(context, input, executor);
  await assertDialogueCanStart(dialogue, context, stateContext, executor);
  const entryNode = await resolveEntryNode(
    dialogue.id,
    buildConditionContext(context, stateContext, {
      session_flags: new Map(),
      visited_node_keys: new Set(),
      chosen_option_keys: new Set(),
    }),
    executor
  );

  const insertedSession = await executor.query(insertDialogueSessionQuery, [
    campaignId,
    characterId,
    dialogue.id,
    dialogue.npc_id,
    context.current_scene_id,
    input.actor_account_id ?? null,
  ]);
  let session = mapDialogueSessionRow({
    ...insertedSession.rows[0],
    current_node_id: entryNode.id,
    pending_option_id: null,
    session_memory_json: {},
    visited_node_keys_json: [entryNode.node_key],
    choice_history_json: [],
    state_updated_at: insertedSession.rows[0].updated_at,
    dialogue_key: dialogue.dialogue_key,
    dialogue_name: dialogue.name,
    dialogue_summary: dialogue.summary,
    dialogue_description: dialogue.description,
    trigger_type: dialogue.trigger_type,
    trigger_event: dialogue.trigger_event,
    dialogue_sort_order: dialogue.sort_order,
    dialogue_availability_conditions_json: dialogue.availability_conditions_json,
    scene_key: dialogue.scene?.key ?? null,
    scene_name: dialogue.scene?.name ?? null,
    npc_key: dialogue.npc?.key ?? null,
    npc_name: dialogue.npc?.name ?? null,
    npc_type: dialogue.npc?.npc_type ?? null,
    npc_role: dialogue.npc?.role ?? null,
    started_by_display_name: null,
    ended_by_display_name: null,
  });

  await executor.query(insertDialogueSessionStateQuery, [
    session.id,
    entryNode.id,
    null,
    JSON.stringify({}),
    JSON.stringify([entryNode.node_key]),
    JSON.stringify([]),
  ]);
  await executor.query(insertDialogueSessionVisitQuery, [session.id, entryNode.id]);

  const entryEffectResolution = await applyDialogueEffects({
    campaignId,
    characterId,
    session,
    effectPayload: entryNode.entry_effects_json,
    actorAccountId: input.actor_account_id ?? null,
    sourceEntityId: entryNode.id,
    sourceKey: 'dialogue_node_entry',
    sourceLabel: `Dialogue node ${entryNode.node_key}`,
    executor,
  });

  session = await updateSessionState(
    session,
    {
      current_node_id: entryNode.id,
      pending_option_id: null,
      session_memory_json: entryEffectResolution.nextSessionMemory,
      visited_node_keys_json: [entryNode.node_key],
      choice_history_json: [],
    },
    executor
  );

  await recordCampaignLog(
    {
      campaign_id: campaignId,
      character_id: characterId,
      actor_account_id: input.actor_account_id ?? null,
      log_type: 'dialogue_started',
      message: `Dialogue started: ${dialogue.name}.`,
      data_json: {
        dialogue_id: dialogue.id,
        dialogue_key: dialogue.dialogue_key,
        npc_id: dialogue.npc_id,
        trigger_type: dialogue.trigger_type,
        trigger_event: dialogue.trigger_event,
      },
    },
    executor
  );

  await recordGameplayHistory(
    {
      character_id: characterId,
      actor_account_id: input.actor_account_id ?? null,
      source_type: 'narrative',
      source_entity_id: dialogue.id,
      action_key: 'dialogue_started',
      summary: `Dialogue started: ${dialogue.name}.`,
      input_json: {
        campaign_id: campaignId,
        dialogue_id: dialogue.id,
        dialogue_key: dialogue.dialogue_key,
        npc_id: dialogue.npc_id,
      },
      result_json: {
        dialogue_session_id: session.id,
        current_node_key: entryNode.node_key,
        applied_effects: entryEffectResolution.applied_effects,
      },
      xp_delta: Number(entryEffectResolution.applied_effects.progression?.amount_granted ?? 0),
    },
    executor
  );

  return loadDialogueSessionView(session.id, executor);
}

async function resolveDialogueOptionForCurrentNode(session, input, executor) {
  if (input.option_id !== undefined && input.option_id !== null) {
    const option = await executor.query(selectDialogueOptionByIdQuery, [input.option_id]);
    const mapped = mapDialogueOptionRow(option.rows[0] || null);

    if (!mapped || mapped.node_id !== session.current_node_id) {
      return null;
    }

    return mapped;
  }

  if (input.option_key) {
    const option = await executor.query(selectDialogueOptionByNodeAndKeyQuery, [
      session.current_node_id,
      input.option_key,
    ]);
    return mapDialogueOptionRow(option.rows[0] || null);
  }

  throw createHttpError('Provide option_id or option_key', 400);
}

function prepareStateForChoice(session, optionKey) {
  return {
    current_node_id: session.current_node_id,
    pending_option_id: null,
    session_memory_json: {
      ...(session.session_memory_json ?? {}),
    },
    visited_node_keys_json: [...(session.visited_node_keys_json ?? [])],
    choice_history_json: appendUniqueString([...(session.choice_history_json ?? [])], optionKey),
  };
}

async function resolveDialogueChoiceInternal(
  sessionId,
  input,
  executor,
  { requireExplicitRoll = false } = {}
) {
  let session = await getDialogueSessionById(sessionId, executor, { forUpdate: true });

  if (!session) {
    throw createHttpError('Dialogue session not found', 404);
  }

  if (session.status !== 'active') {
    throw createHttpError('This dialogue session is no longer active', 409);
  }

  const context = await getNarrativeContext(session.campaign_id, session.character_id, executor, {
    forUpdate: true,
  });
  assertNarrativeWriteAllowed(context);

  if (session.scene_id !== null && context.current_scene_id !== session.scene_id) {
    throw createHttpError('Character is no longer in the correct scene for this dialogue', 409);
  }

  const stateContext = await buildNarrativeStateContext(
    session.campaign_id,
    session.character_id,
    executor
  );
  const currentNode = await getDialogueNodeById(session.current_node_id, executor);
  const conditionContext = buildDialogueConditionContext(context, stateContext, session);
  let option = null;

  if (requireExplicitRoll && session.pending_option_id !== null) {
    const optionResult = await executor.query(selectDialogueOptionByIdQuery, [session.pending_option_id]);
    option = mapDialogueOptionRow(optionResult.rows[0] || null);
  } else {
    option = await resolveDialogueOptionForCurrentNode(session, input, executor);
  }

  if (!option) {
    throw createHttpError('Dialogue option not found for the current node', 404);
  }

  const optionAvailability = evaluateDialogueConditions(option.availability_conditions_json, conditionContext);

  if (!optionAvailability.is_available) {
    throw createHttpError('That dialogue option is currently unavailable', 409);
  }

  if (option.check_mode === 'explicit' && !requireExplicitRoll) {
    session = await updateSessionState(
      session,
      {
        current_node_id: session.current_node_id,
        pending_option_id: option.id,
        session_memory_json: session.session_memory_json ?? {},
        visited_node_keys_json: session.visited_node_keys_json ?? [],
        choice_history_json: session.choice_history_json ?? [],
      },
      executor
    );

    return {
      requires_skill_check: true,
      pending_option: buildOptionPresentation(option, optionAvailability, {
        pendingOptionId: option.id,
      }),
      session: await loadDialogueSessionView(session.id, executor),
    };
  }

  if (requireExplicitRoll && option.check_mode !== 'explicit') {
    throw createHttpError('This option does not require an explicit skill check', 409);
  }

  let checkResult = null;

  if (option.check_mode !== 'none') {
    const characterRules = await getCharacterRules(session.character_id);

    if (!characterRules) {
      throw createHttpError('Character not found', 404);
    }

    checkResult = resolveDialogueOptionSkillCheck(option, characterRules, {
      roll: normalizeOptionalRoll(input.roll),
    });
  }

  const outcomes = await getDialogueOutcomesByOption(option.id, executor);
  const matchingOutcome = outcomes.find((outcome) =>
    evaluateDialogueConditions(outcome.conditions_json, conditionContext, checkResult).is_available
  );

  if (!matchingOutcome) {
    throw createHttpError('No dialogue outcome matched the current state', 409);
  }

  let nextState = prepareStateForChoice(session, option.option_key);
  const appliedResolution = await applyDialogueEffects({
    campaignId: session.campaign_id,
    characterId: session.character_id,
    session: {
      ...session,
      session_memory_json: nextState.session_memory_json,
    },
    effectPayload: matchingOutcome.effects_json,
    actorAccountId: input.actor_account_id ?? null,
    sourceEntityId: matchingOutcome.id,
    sourceKey: 'dialogue_outcome',
    sourceLabel: `Dialogue outcome ${matchingOutcome.outcome_key}`,
    executor,
  });
  nextState.session_memory_json = appliedResolution.nextSessionMemory;

  let nextNode = null;

  if (matchingOutcome.next_node_id !== null) {
    nextNode = await getDialogueNodeById(matchingOutcome.next_node_id, executor);

    if (!nextNode) {
      throw createHttpError('Dialogue outcome points to a missing node', 409);
    }

    const refreshedStateContext = await buildNarrativeStateContext(
      session.campaign_id,
      session.character_id,
      executor
    );
    const nextConditionContext = buildConditionContext(context, refreshedStateContext, {
      session_flags: new Map(Object.entries(nextState.session_memory_json ?? {})),
      visited_node_keys: new Set(nextState.visited_node_keys_json),
      chosen_option_keys: new Set(nextState.choice_history_json),
    });
    const nextAvailability = evaluateDialogueConditions(
      nextNode.availability_conditions_json,
      nextConditionContext,
      checkResult
    );

    if (!nextAvailability.is_available) {
      throw createHttpError('The selected outcome leads to a blocked dialogue node', 409);
    }

    nextState.visited_node_keys_json = appendUniqueString(
      nextState.visited_node_keys_json,
      nextNode.node_key
    );
    nextState.current_node_id = nextNode.id;
    await executor.query(insertDialogueSessionVisitQuery, [session.id, nextNode.id]);

    const entryResolution = await applyDialogueEffects({
      campaignId: session.campaign_id,
      characterId: session.character_id,
      session: {
        ...session,
        session_memory_json: nextState.session_memory_json,
      },
      effectPayload: nextNode.entry_effects_json,
      actorAccountId: input.actor_account_id ?? null,
      sourceEntityId: nextNode.id,
      sourceKey: 'dialogue_node_entry',
      sourceLabel: `Dialogue node ${nextNode.node_key}`,
      executor,
    });
    nextState.session_memory_json = entryResolution.nextSessionMemory;
    appliedResolution.applied_effects = {
      ...appliedResolution.applied_effects,
      node_entry_effects: entryResolution.applied_effects,
    };
  }

  session = await updateSessionState(session, nextState, executor);
  const choiceRecord = await recordDialogueSessionChoice({
    session,
    node: currentNode,
    option,
    outcome: matchingOutcome,
    actorAccountId: input.actor_account_id ?? null,
    checkResult,
    appliedEffects: appliedResolution.applied_effects,
    executor,
  });

  const shouldComplete = matchingOutcome.is_terminal || nextNode?.is_terminal === true;

  if (shouldComplete) {
    await setSessionStatus(session.id, 'completed', input.actor_account_id ?? null, executor);
    session = await getDialogueSessionById(session.id, executor);
  }

  await recordCampaignLog(
    {
      campaign_id: session.campaign_id,
      character_id: session.character_id,
      actor_account_id: input.actor_account_id ?? null,
      log_type: 'dialogue_choice',
      message: `${option.label}: ${matchingOutcome.result_text ?? 'resolved'}`,
      data_json: {
        dialogue_session_id: session.id,
        dialogue_key: session.dialogue.dialogue_key,
        node_key: currentNode.node_key,
        option_key: option.option_key,
        outcome_key: matchingOutcome.outcome_key,
        check: checkResult,
        applied_effects: appliedResolution.applied_effects,
      },
    },
    executor
  );

  if (shouldComplete) {
    await recordCampaignLog(
      {
        campaign_id: session.campaign_id,
        character_id: session.character_id,
        actor_account_id: input.actor_account_id ?? null,
        log_type: 'dialogue_ended',
        message: `Dialogue ended: ${session.dialogue.name}.`,
        data_json: {
          dialogue_session_id: session.id,
          dialogue_key: session.dialogue.dialogue_key,
          outcome_key: matchingOutcome.outcome_key,
        },
      },
      executor
    );
  }

  await recordGameplayHistory(
    {
      character_id: session.character_id,
      actor_account_id: input.actor_account_id ?? null,
      source_type: 'narrative',
      source_entity_id: session.dialogue_id,
      action_key: shouldComplete ? 'dialogue_ended' : 'dialogue_choice',
      summary: matchingOutcome.result_text ?? `${option.label} resolved.`,
      input_json: {
        campaign_id: session.campaign_id,
        dialogue_session_id: session.id,
        dialogue_key: session.dialogue.dialogue_key,
        node_key: currentNode.node_key,
        option_key: option.option_key,
        roll: checkResult?.roll_value ?? null,
      },
      result_json: buildDialogueHistorySummary(
        session,
        currentNode,
        matchingOutcome,
        appliedResolution.applied_effects,
        checkResult
      ),
      xp_delta: Number(
        appliedResolution.applied_effects.progression?.amount_granted ??
          appliedResolution.applied_effects.node_entry_effects?.progression?.amount_granted ??
          0
      ),
    },
    executor
  );

  return {
    requires_skill_check: false,
    resolution: {
      option: {
        id: option.id,
        option_key: option.option_key,
        label: option.label,
      },
      check: checkResult,
      outcome: {
        id: matchingOutcome.id,
        outcome_key: matchingOutcome.outcome_key,
        label: matchingOutcome.label,
        result_text: matchingOutcome.result_text,
        is_terminal: matchingOutcome.is_terminal,
        next_node: matchingOutcome.next_node,
      },
      applied_effects: appliedResolution.applied_effects,
      choice: choiceRecord,
    },
    session: await loadDialogueSessionView(session.id, executor),
  };
}

export async function startDialogueSession(campaignId, characterId, input) {
  return withTransaction((client) =>
    startDialogueSessionInternal(campaignId, characterId, input, client)
  );
}

export async function listDialogueSessions(campaignId, characterId, limit = 25, offset = 0) {
  const context = await getNarrativeContext(campaignId, characterId);
  assertMembership(context);

  const normalizedLimit = normalizeLimit(limit);
  const normalizedOffset = normalizeOffset(offset);
  const result = await query(selectDialogueSessionsByCampaignAndCharacterQuery, [
    campaignId,
    characterId,
    normalizedLimit,
    normalizedOffset,
  ]);

  const sessions = await Promise.all(
    result.rows.map((row) => loadDialogueSessionView(Number(row.id)))
  );

  return {
    campaign_id: campaignId,
    character_id: characterId,
    limit: normalizedLimit,
    offset: normalizedOffset,
    items: sessions,
  };
}

export async function getDialogueSession(sessionId) {
  return loadDialogueSessionView(sessionId);
}

export async function getActiveDialogueSessionForCharacter(campaignId, characterId) {
  const session = await getActiveDialogueSession(campaignId, characterId);

  if (!session) {
    return null;
  }

  return loadDialogueSessionView(session.id);
}

export async function cancelDialogueSession(sessionId, input = {}) {
  return withTransaction(async (client) => {
    const session = await getDialogueSessionById(sessionId, client, { forUpdate: true });

    if (!session) {
      throw createHttpError('Dialogue session not found', 404);
    }

    if (session.status !== 'active') {
      return loadDialogueSessionView(session.id, client);
    }

    await setSessionStatus(session.id, 'canceled', input.actor_account_id ?? null, client);

    await recordCampaignLog(
      {
        campaign_id: session.campaign_id,
        character_id: session.character_id,
        actor_account_id: input.actor_account_id ?? null,
        log_type: 'dialogue_ended',
        message: `Dialogue interrupted: ${session.dialogue.name}.`,
        data_json: {
          dialogue_session_id: session.id,
          dialogue_key: session.dialogue.dialogue_key,
          reason: input.reason ?? 'canceled',
        },
      },
      client
    );

    await recordGameplayHistory(
      {
        character_id: session.character_id,
        actor_account_id: input.actor_account_id ?? null,
        source_type: 'narrative',
        source_entity_id: session.dialogue_id,
        action_key: 'dialogue_canceled',
        summary: `Dialogue interrupted: ${session.dialogue.name}.`,
        input_json: {
          campaign_id: session.campaign_id,
          dialogue_session_id: session.id,
          reason: input.reason ?? 'canceled',
        },
        result_json: {
          status: 'canceled',
          dialogue_session_id: session.id,
          dialogue_key: session.dialogue.dialogue_key,
        },
        xp_delta: 0,
      },
      client
    );

    return loadDialogueSessionView(session.id, client);
  });
}

export async function chooseDialogueOption(sessionId, input) {
  return withTransaction((client) =>
    resolveDialogueChoiceInternal(sessionId, input, client, { requireExplicitRoll: false })
  );
}

export async function attemptDialogueSkillCheck(sessionId, input) {
  return withTransaction((client) =>
    resolveDialogueChoiceInternal(sessionId, input, client, { requireExplicitRoll: true })
  );
}

export async function triggerSceneEntryDialogues(campaignId, characterId, input = {}, executor = null) {
  const runner = async (client) => {
    const context = await getNarrativeContext(campaignId, characterId, client, { forUpdate: true });
    assertNarrativeWriteAllowed(context);

    if (context.current_scene_id === null) {
      return [];
    }

    const activeSession = await getActiveDialogueSession(campaignId, characterId, client);

    if (activeSession) {
      return [];
    }

    const stateContext = await buildNarrativeStateContext(campaignId, characterId, client);
    const result = await client.query(selectSceneEnterDialoguesBySceneQuery, [context.current_scene_id]);
    const dialogues = result.rows.map(mapDialogueRow);
    const triggered = [];

    for (const dialogue of dialogues) {
      const availability = evaluateNarrativeConditions(
        dialogue.availability_conditions_json,
        buildConditionContext(context, stateContext)
      );

      if (!availability.is_available) {
        continue;
      }

      const session = await startDialogueSessionInternal(
        campaignId,
        characterId,
        {
          dialogue_id: dialogue.id,
          actor_account_id: input.actor_account_id ?? null,
        },
        client
      );
      triggered.push(session);
      break;
    }

    return triggered;
  };

  if (executor) {
    return runner(executor);
  }

  return withTransaction((client) => runner(client));
}
