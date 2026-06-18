import { query } from '../config/db.js';
import {
  insertCampaignLogQuery,
  insertCharacterObjectiveQuery,
  insertCharacterQuestQuery,
  selectCampaignCharacterNarrativeContextForUpdateQuery,
  selectCampaignCharacterNarrativeContextQuery,
  selectCampaignFlagsByCampaignQuery,
  selectCharacterFlagsByCampaignQuery,
  selectCharacterObjectiveByObjectiveIdQuery,
  selectCharacterObjectiveRowsByCampaignQuery,
  selectCharacterQuestByQuestIdQuery,
  selectCharacterQuestsByCampaignQuery,
  selectNpcByKeyQuery,
  selectQuestByKeyQuery,
  selectQuestObjectiveByQuestAndKeyQuery,
  selectSceneByIdQuery,
  selectSceneByKeyQuery,
  updateCharacterObjectiveStatusQuery,
  updateCharacterQuestStatusQuery,
  upsertCampaignFlagQuery,
  upsertCampaignNpcStateQuery,
  upsertCharacterFlagQuery,
} from '../db/queries/narrative.js';
import { createHttpError } from '../utils/httpError.js';
import { applyAdventureOutcome } from './adventureProgressionService.js';

function mapNarrativeContextRow(row) {
  if (!row) {
    return null;
  }

  return {
    membership_id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    joined_by_account_id: row.joined_by_account_id !== null ? Number(row.joined_by_account_id) : null,
    membership_is_active: row.membership_is_active,
    current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
    current_scene_entered_at: row.current_scene_entered_at,
    membership_created_at: row.membership_created_at,
    membership_updated_at: row.membership_updated_at,
    campaign: {
      id: Number(row.campaign_id),
      world_id: row.campaign_world_id !== undefined ? Number(row.campaign_world_id) : null,
      name: row.campaign_name,
      description: row.campaign_description,
      campaign_type: row.campaign_type ?? null,
      status: row.campaign_status ?? null,
      is_active: row.campaign_is_active,
    },
    character: {
      id: Number(row.character_id),
      name: row.character_name,
      account_id: Number(row.account_id),
      account_display_name: row.account_display_name,
      account_is_active: row.account_is_active,
      is_active: row.character_is_active,
      alignment:
        row.alignment_id !== null
          ? {
              id: Number(row.alignment_id),
              name: row.alignment_name,
              abbreviation: row.alignment_abbreviation,
            }
          : null,
    },
  };
}

function mapSceneRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    location_id: Number(row.location_id),
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    entry_text: row.entry_text,
    is_starting_scene: row.is_starting_scene,
    entry_conditions_json: row.entry_conditions_json ?? {},
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    location: {
      id: Number(row.location_id),
      key: row.location_key,
      name: row.location_name,
      region_name: row.region_name,
    },
  };
}

function mapFlagRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id:
      row.character_id !== undefined && row.character_id !== null ? Number(row.character_id) : null,
    flag_key: row.flag_key,
    flag_value: row.flag_value_json,
    flag_category: row.flag_category ?? null,
    metadata_json: row.metadata_json ?? {},
    notes: row.notes,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapQuestRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    quest_id: Number(row.quest_id),
    key: row.quest_key,
    name: row.quest_name,
    summary: row.quest_summary,
    description: row.quest_description,
    availability_conditions_json: row.availability_conditions_json ?? {},
    discovery_summary: row.discovery_summary ?? null,
    is_active: row.quest_is_active,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    failed_at: row.failed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    objectives: [],
  };
}

function mapObjectiveRow(row) {
  return {
    id: Number(row.id),
    character_quest_id: Number(row.character_quest_id),
    objective_id: Number(row.objective_id),
    quest_key: row.quest_key,
    key: row.objective_key,
    title: row.objective_title,
    description: row.objective_description,
    sort_order: Number(row.sort_order),
    activation_conditions_json: row.activation_conditions_json ?? {},
    completion_conditions_json: row.completion_conditions_json ?? {},
    failure_conditions_json: row.failure_conditions_json ?? {},
    progress_target: row.progress_target !== null ? Number(row.progress_target) : null,
    hard_gate: row.hard_gate ?? false,
    status: row.status,
    progress_count: Number(row.progress_count),
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCampaignLogInsertRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: row.character_id !== null ? Number(row.character_id) : null,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    log_type: row.log_type,
    message: row.message,
    data_json: row.data_json ?? {},
    created_at: row.created_at,
  };
}

function buildFlagMap(flags) {
  return new Map(flags.map((flag) => [flag.flag_key, flag.flag_value]));
}

function buildQuestMap(quests) {
  return new Map(quests.map((quest) => [quest.key, quest]));
}

function buildObjectiveMap(quests) {
  const objectiveMap = new Map();

  for (const quest of quests) {
    for (const objective of quest.objectives) {
      objectiveMap.set(`${quest.key}:${objective.key}`, objective);
    }
  }

  return objectiveMap;
}

export function assertMembership(context) {
  if (!context) {
    throw createHttpError('Character is not a member of this campaign', 404);
  }
}

export function assertNarrativeWriteAllowed(context) {
  assertMembership(context);

  if (!context.campaign.is_active) {
    throw createHttpError('This campaign is inactive', 409);
  }

  if (!context.membership_is_active) {
    throw createHttpError('This campaign membership is inactive', 409);
  }

  if (!context.character.account_is_active) {
    throw createHttpError('Character account is inactive', 400);
  }

  if (!context.character.is_active) {
    throw createHttpError('Inactive characters cannot advance narrative state', 409);
  }
}

export function normalizeNarrativeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export async function getNarrativeContext(
  campaignId,
  characterId,
  executor = { query },
  { forUpdate = false } = {}
) {
  const statement = forUpdate
    ? selectCampaignCharacterNarrativeContextForUpdateQuery
    : selectCampaignCharacterNarrativeContextQuery;
  const result = await executor.query(statement, [campaignId, characterId]);
  return mapNarrativeContextRow(result.rows[0] || null);
}

export async function getSceneById(sceneId, executor = { query }) {
  const result = await executor.query(selectSceneByIdQuery, [sceneId]);
  return mapSceneRow(result.rows[0] || null);
}

export async function getSceneByKey(sceneKey, executor = { query }) {
  const result = await executor.query(selectSceneByKeyQuery, [sceneKey]);
  return mapSceneRow(result.rows[0] || null);
}

export async function listNarrativeFlagsInternal(campaignId, characterId, executor = { query }) {
  const campaignResult = await executor.query(selectCampaignFlagsByCampaignQuery, [campaignId]);
  const characterResult = await executor.query(selectCharacterFlagsByCampaignQuery, [
    campaignId,
    characterId,
  ]);

  const campaignFlags = campaignResult.rows.map(mapFlagRow);
  const characterFlags = characterResult.rows.map(mapFlagRow);

  return {
    campaign_flags: campaignFlags,
    character_flags: characterFlags,
    campaign_flag_map: buildFlagMap(campaignFlags),
    character_flag_map: buildFlagMap(characterFlags),
  };
}

export async function listNarrativeQuestsInternal(campaignId, characterId, executor = { query }) {
  const questResult = await executor.query(selectCharacterQuestsByCampaignQuery, [
    campaignId,
    characterId,
  ]);
  const objectiveResult = await executor.query(selectCharacterObjectiveRowsByCampaignQuery, [
    campaignId,
    characterId,
  ]);

  const quests = questResult.rows.map(mapQuestRow);
  const questByCharacterQuestId = new Map(quests.map((quest) => [quest.id, quest]));

  for (const objective of objectiveResult.rows.map(mapObjectiveRow)) {
    const quest = questByCharacterQuestId.get(objective.character_quest_id);

    if (quest) {
      quest.objectives.push(objective);
    }
  }

  for (const quest of quests) {
    quest.objectives.sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
  }

  return {
    quests,
    quest_map: buildQuestMap(quests),
    objective_map: buildObjectiveMap(quests),
  };
}

export async function buildNarrativeStateContext(campaignId, characterId, executor = { query }) {
  const flags = await listNarrativeFlagsInternal(campaignId, characterId, executor);
  const quests = await listNarrativeQuestsInternal(campaignId, characterId, executor);

  return {
    ...flags,
    ...quests,
  };
}

export function buildConditionContext(context, stateContext, extras = {}) {
  return {
    alignment_abbreviation: context.character.alignment?.abbreviation ?? null,
    campaign_type: context.campaign.campaign_type ?? null,
    campaign_world_id: context.campaign.world_id ?? null,
    campaign_flags: stateContext.campaign_flag_map,
    character_flags: stateContext.character_flag_map,
    quest_map: stateContext.quest_map,
    objective_map: stateContext.objective_map,
    ...extras,
  };
}

export async function recordCampaignLog(entry, executor = { query }) {
  const result = await executor.query(insertCampaignLogQuery, [
    entry.campaign_id,
    entry.character_id ?? null,
    entry.actor_account_id ?? null,
    entry.log_type,
    entry.message,
    JSON.stringify(entry.data_json ?? {}),
  ]);

  return mapCampaignLogInsertRow(result.rows[0]);
}

async function upsertQuestState(campaignId, characterId, questKey, status, executor) {
  const questResult = await executor.query(selectQuestByKeyQuery, [questKey]);
  const quest = questResult.rows[0];

  if (!quest) {
    throw createHttpError(`Unknown quest_key: ${questKey}`, 400);
  }

  const existingResult = await executor.query(selectCharacterQuestByQuestIdQuery, [
    campaignId,
    characterId,
    quest.id,
  ]);
  const existing = existingResult.rows[0] || null;
  const startedAt =
    status === 'active' || status === 'completed' || status === 'failed'
      ? existing?.started_at ?? new Date().toISOString()
      : existing?.started_at ?? null;
  const completedAt =
    status === 'completed' ? existing?.completed_at ?? new Date().toISOString() : null;
  const failedAt = status === 'failed' ? existing?.failed_at ?? new Date().toISOString() : null;

  if (!existing) {
    const inserted = await executor.query(insertCharacterQuestQuery, [
      campaignId,
      characterId,
      quest.id,
      status,
      startedAt,
      completedAt,
      failedAt,
    ]);

    return {
      row: inserted.rows[0],
      quest,
      action: 'created',
    };
  }

  const updated = await executor.query(updateCharacterQuestStatusQuery, [
    existing.id,
    status,
    startedAt,
    completedAt,
    failedAt,
  ]);

  return {
    row: updated.rows[0],
    quest,
    action: 'updated',
  };
}

async function upsertObjectiveState(campaignId, characterId, objectiveEffect, executor) {
  const questKey = String(objectiveEffect.quest_key ?? '').trim();
  const objectiveKey = String(objectiveEffect.objective_key ?? '').trim();
  const status = String(objectiveEffect.status ?? '').trim();

  if (!questKey || !objectiveKey || !status) {
    throw createHttpError('Objective effects require quest_key, objective_key, and status', 400);
  }

  const questResult = await executor.query(selectQuestByKeyQuery, [questKey]);
  const quest = questResult.rows[0];

  if (!quest) {
    throw createHttpError(`Unknown quest_key: ${questKey}`, 400);
  }

  const existingQuestResult = await executor.query(selectCharacterQuestByQuestIdQuery, [
    campaignId,
    characterId,
    quest.id,
  ]);
  let characterQuestRow = existingQuestResult.rows[0] || null;

  if (!characterQuestRow) {
    const insertedQuest = await executor.query(insertCharacterQuestQuery, [
      campaignId,
      characterId,
      quest.id,
      'active',
      new Date().toISOString(),
      null,
      null,
    ]);
    characterQuestRow = insertedQuest.rows[0];
  }

  const objectiveResult = await executor.query(selectQuestObjectiveByQuestAndKeyQuery, [
    quest.id,
    objectiveKey,
  ]);
  const objective = objectiveResult.rows[0];

  if (!objective) {
    throw createHttpError(`Unknown objective_key "${objectiveKey}" for quest "${questKey}"`, 400);
  }

  const existingResult = await executor.query(selectCharacterObjectiveByObjectiveIdQuery, [
    characterQuestRow.id,
    objective.id,
  ]);
  const existing = existingResult.rows[0] || null;
  const progressCount = Number(objectiveEffect.progress_count ?? existing?.progress_count ?? 0);
  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  if (!existing) {
    const inserted = await executor.query(insertCharacterObjectiveQuery, [
      characterQuestRow.id,
      objective.id,
      status,
      progressCount,
      completedAt,
    ]);

    return {
      row: inserted.rows[0],
      objective,
      quest,
      action: 'created',
    };
  }

  const updated = await executor.query(updateCharacterObjectiveStatusQuery, [
    existing.id,
    status,
    progressCount,
    completedAt,
  ]);

  return {
    row: updated.rows[0],
    objective,
    quest,
    action: 'updated',
  };
}

export async function applyNarrativeEffects({
  campaignId,
  characterId,
  effectPayload,
  actorAccountId = null,
  sourceType = 'narrative',
  sourceEntityId = null,
  sourceKey = 'narrative',
  sourceLabel = 'Narrative resolution',
  executor = { query },
}) {
  return applyAdventureOutcome(
    {
      campaignId,
      characterId,
      effectPayload,
      actorAccountId,
      sourceType,
      sourceEntityId,
      sourceKey,
      sourceLabel,
    },
    executor
  );
}
