import { query, withTransaction } from '../config/db.js';
import {
  buildQuestDefinitionTree,
  buildRecentResultSummary,
  buildSceneUnlockDefinitionMap,
  buildQuestStateLookup,
  determineObjectiveState,
  determineQuestState,
  evaluateSceneUnlockAvailability,
  mergeKnowledgeByType,
  normalizeRewardValue,
  selectCurrentObjective,
} from '../engine/adventure/progressionEngine.js';
import {
  insertAdventureRewardApplicationQuery,
  insertAdventureRewardQuery,
  selectAdventureQuestDefinitionsQuery,
  selectCharacterKnowledgeByCampaignQuery,
  selectRewardApplicationsByCampaignQuery,
  selectRewardApplicationsByCharacterQuery,
  selectSceneUnlockDefinitionsBySceneIdsQuery,
  upsertCampaignFlagWithMetadataQuery,
  upsertCharacterFlagWithMetadataQuery,
  upsertCharacterKnowledgeQuery,
} from '../db/queries/adventureProgression.js';
import {
  insertCampaignLogQuery,
  insertCharacterObjectiveQuery,
  insertCharacterQuestQuery,
  deleteCharacterQuestByIdQuery,
  selectCampaignCharacterNarrativeContextForUpdateQuery,
  selectCampaignCharacterNarrativeContextQuery,
  selectCampaignFlagsByCampaignQuery,
  selectCampaignLogsQuery,
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
  upsertCampaignNpcStateQuery,
} from '../db/queries/narrative.js';
import { selectItemByIdQuery } from '../db/queries/items.js';
import {
  addCharacterItemWithExecutor,
  adjustCharacterCurrencyWithExecutor,
  getItemBySlug,
} from './inventoryService.js';
import { listCharacterGameplayHistory } from './gameplayHistoryService.js';
import { grantCharacterExperience } from './progressionService.js';
import { grantMilestoneLevel } from './advancementService.js';
import { createHttpError } from '../utils/httpError.js';
import { evaluateNarrativeConditions } from '../engine/narrative/narrativeEngine.js';

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePositiveInteger(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeNonNegativeInteger(value, label, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(`${label} must be a non-negative integer`, 400);
  }

  return parsed;
}

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

function mapKnowledgeRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    knowledge_type: row.knowledge_type,
    knowledge_key: row.knowledge_key,
    title: row.title,
    summary: row.summary,
    metadata_json: row.metadata_json ?? {},
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRewardApplicationRow(row) {
  return {
    id: Number(row.id),
    reward_id: Number(row.reward_id),
    character_id: row.character_id !== null ? Number(row.character_id) : null,
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    applied_at: row.applied_at,
    reward: {
      id: Number(row.reward_id),
      reward_type: row.reward_type,
      value_json: row.value_json ?? {},
      metadata_json: row.metadata_json ?? {},
      source_type: row.reward_source_type,
      source_entity_id:
        row.reward_source_entity_id !== null ? Number(row.reward_source_entity_id) : null,
      created_at: row.reward_created_at,
    },
  };
}

function mapCampaignLogRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: row.character_id !== null ? Number(row.character_id) : null,
    actor:
      row.actor_account_id !== null
        ? {
            account_id: Number(row.actor_account_id),
            display_name: row.actor_display_name,
          }
        : null,
    character_name: row.character_name,
    log_type: row.log_type,
    message: row.message,
    data_json: row.data_json ?? {},
    created_at: row.created_at,
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

function buildFlagMap(flags) {
  return new Map(flags.map((flag) => [flag.flag_key, flag.flag_value]));
}

function buildConditionContext(context, stateContext, extras = {}) {
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

function assertMembership(context) {
  if (!context) {
    throw createHttpError('Character is not a member of this campaign', 404);
  }
}

function assertAdventureWriteAllowed(context) {
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
    throw createHttpError('Inactive characters cannot advance adventure state', 409);
  }
}

async function resolveScopedWorldRecordId(executor, tableName, worldId, key, label) {
  if (!key) {
    return null;
  }

  const result = await executor.query(
    `SELECT id FROM ${tableName} WHERE world_id = $1 AND key = $2 LIMIT 1`,
    [worldId, key]
  );
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError(`Unknown ${label}: ${key}`, 400);
  }

  return Number(row.id);
}

async function resolveWorldEntityId(executor, worldId, entityKey) {
  if (!entityKey) {
    return null;
  }

  const result = await executor.query(
    `
      SELECT id
      FROM dnd5e_world_entity
      WHERE world_id = $1
        AND entity_key = $2
      LIMIT 1
    `,
    [worldId, entityKey]
  );
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError(`Unknown world entity: ${entityKey}`, 400);
  }

  return Number(row.id);
}

async function resolveWorldChangeTruthDelta(executor, worldId, truthDelta) {
  const normalized = normalizeObject(truthDelta);
  const entityUpdates = normalizeArray(normalized.entity_updates ?? normalized.world_entities);

  if (entityUpdates.length === 0) {
    return normalized;
  }

  const resolvedEntityUpdates = [];

  for (const rawUpdate of entityUpdates) {
    const update = normalizeObject(rawUpdate);
    const resolvedUpdate = { ...update };

    if (
      resolvedUpdate.world_entity_id === undefined &&
      resolvedUpdate.entity_id === undefined &&
      normalizeOptionalText(resolvedUpdate.entity_slug)
    ) {
      resolvedUpdate.world_entity_id = await resolveWorldEntityId(
        executor,
        worldId,
        normalizeOptionalText(resolvedUpdate.entity_slug)
      );
    }

    if (
      resolvedUpdate.current_region_id === undefined &&
      normalizeOptionalText(resolvedUpdate.current_region_slug)
    ) {
      resolvedUpdate.current_region_id = await resolveScopedWorldRecordId(
        executor,
        'dnd5e_region',
        worldId,
        normalizeOptionalText(resolvedUpdate.current_region_slug),
        'region'
      );
    }

    if (
      resolvedUpdate.current_location_id === undefined &&
      normalizeOptionalText(resolvedUpdate.current_location_slug)
    ) {
      resolvedUpdate.current_location_id = await resolveScopedWorldRecordId(
        executor,
        'dnd5e_location',
        worldId,
        normalizeOptionalText(resolvedUpdate.current_location_slug),
        'location'
      );
    }

    if (
      resolvedUpdate.current_scene_id === undefined &&
      normalizeOptionalText(resolvedUpdate.current_scene_slug)
    ) {
      resolvedUpdate.current_scene_id = await resolveScopedWorldRecordId(
        executor,
        'dnd5e_scene',
        worldId,
        normalizeOptionalText(resolvedUpdate.current_scene_slug),
        'scene'
      );
    }

    delete resolvedUpdate.entity_slug;
    delete resolvedUpdate.current_region_slug;
    delete resolvedUpdate.current_location_slug;
    delete resolvedUpdate.current_scene_slug;

    resolvedEntityUpdates.push(resolvedUpdate);
  }

  return {
    ...normalized,
    entity_updates: resolvedEntityUpdates,
  };
}

async function applyWorldChangeEffects({
  campaignId,
  characterId,
  worldId,
  worldChanges,
  actorAccountId,
  sourceType,
  sourceEntityId,
  executor,
}) {
  if (!Array.isArray(worldChanges) || worldChanges.length === 0) {
    return [];
  }

  const { recordWorldChange } = await import('./worldSimulationService.js');
  const appliedChanges = [];

  for (const changeDefinition of worldChanges) {
    const regionId = await resolveScopedWorldRecordId(
      executor,
      'dnd5e_region',
      worldId,
      normalizeOptionalText(changeDefinition.region_slug),
      'region'
    );
    const locationId = await resolveScopedWorldRecordId(
      executor,
      'dnd5e_location',
      worldId,
      normalizeOptionalText(changeDefinition.location_slug),
      'location'
    );
    const sceneId = await resolveScopedWorldRecordId(
      executor,
      'dnd5e_scene',
      worldId,
      normalizeOptionalText(changeDefinition.scene_slug),
      'scene'
    );
    const worldEntityId = await resolveWorldEntityId(
      executor,
      worldId,
      normalizeOptionalText(changeDefinition.entity_slug)
    );
    const truthDelta = await resolveWorldChangeTruthDelta(
      executor,
      worldId,
      changeDefinition.truth_delta ?? {}
    );
    const worldChange = await recordWorldChange(
      {
        world_id: worldId,
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: actorAccountId,
        change_key: normalizeOptionalText(changeDefinition.change_key),
        change_type: normalizeOptionalText(changeDefinition.change_type),
        propagation_scope: normalizeOptionalText(changeDefinition.propagation_scope) ?? 'campaign_local',
        region_id: regionId,
        location_id: locationId,
        scene_id: sceneId,
        world_entity_id: worldEntityId,
        source_type: sourceType,
        source_entity_id: sourceEntityId,
        title: normalizeOptionalText(changeDefinition.title),
        summary:
          normalizeOptionalText(changeDefinition.summary) ??
          normalizeOptionalText(changeDefinition.title),
        narrative_text: normalizeOptionalText(changeDefinition.narrative_text),
        payload: changeDefinition.payload ?? {},
        truth_delta: truthDelta,
        knowledge_policy: changeDefinition.knowledge_policy ?? {},
      },
      executor
    );
    appliedChanges.push(worldChange);
  }

  return appliedChanges;
}

async function recordCampaignLogInternal(entry, executor) {
  const result = await executor.query(insertCampaignLogQuery, [
    entry.campaign_id,
    entry.character_id ?? null,
    entry.actor_account_id ?? null,
    entry.log_type,
    entry.message,
    JSON.stringify(entry.data_json ?? {}),
  ]);

  return mapCampaignLogRow({
    ...result.rows[0],
    actor_display_name: null,
    character_name: null,
  });
}

async function getNarrativeContextInternal(campaignId, characterId, executor, { forUpdate = false } = {}) {
  const statement = forUpdate
    ? selectCampaignCharacterNarrativeContextForUpdateQuery
    : selectCampaignCharacterNarrativeContextQuery;
  const result = await executor.query(statement, [campaignId, characterId]);
  return mapNarrativeContextRow(result.rows[0] || null);
}

async function getSceneByIdInternal(sceneId, executor) {
  const result = await executor.query(selectSceneByIdQuery, [sceneId]);
  return mapSceneRow(result.rows[0] || null);
}

async function getSceneByKeyInternal(sceneKey, executor) {
  const result = await executor.query(selectSceneByKeyQuery, [sceneKey]);
  return mapSceneRow(result.rows[0] || null);
}

async function listNarrativeFlagsState(campaignId, characterId, executor) {
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

async function listNarrativeQuestsState(campaignId, characterId, executor) {
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

  const { quest_map, objective_map } = buildQuestStateLookup(quests);

  return {
    quests,
    quest_map,
    objective_map,
  };
}

async function loadAdventureStateContext(campaignId, characterId, executor) {
  const flags = await listNarrativeFlagsState(campaignId, characterId, executor);
  const quests = await listNarrativeQuestsState(campaignId, characterId, executor);

  return {
    ...flags,
    ...quests,
  };
}

async function loadQuestDefinitions(executor) {
  const result = await executor.query(selectAdventureQuestDefinitionsQuery);
  return buildQuestDefinitionTree(result.rows);
}

async function loadCharacterKnowledge(campaignId, characterId, executor) {
  const result = await executor.query(selectCharacterKnowledgeByCampaignQuery, [campaignId, characterId]);
  return result.rows.map(mapKnowledgeRow);
}

async function loadSceneUnlockDefinitions(sceneIds, executor) {
  const uniqueSceneIds = [
    ...new Set(
      (sceneIds ?? [])
        .filter((value) => Number.isInteger(Number(value)) && Number(value) > 0)
        .map(Number)
    ),
  ];

  if (uniqueSceneIds.length === 0) {
    return new Map();
  }

  const result = await executor.query(selectSceneUnlockDefinitionsBySceneIdsQuery, [uniqueSceneIds]);
  return buildSceneUnlockDefinitionMap(result.rows);
}

async function upsertCampaignFlag({
  campaignId,
  flagKey,
  flagValue,
  flagCategory = null,
  metadata = {},
  notes = null,
  sourceType = null,
  sourceEntityId = null,
  executor,
}) {
  const result = await executor.query(upsertCampaignFlagWithMetadataQuery, [
    campaignId,
    flagKey,
    JSON.stringify(flagValue),
    flagCategory,
    JSON.stringify(normalizeObject(metadata)),
    notes,
    sourceType,
    sourceEntityId,
  ]);

  return mapFlagRow(result.rows[0]);
}

async function upsertCharacterFlag({
  campaignId,
  characterId,
  flagKey,
  flagValue,
  flagCategory = null,
  metadata = {},
  notes = null,
  sourceType = null,
  sourceEntityId = null,
  executor,
}) {
  const result = await executor.query(upsertCharacterFlagWithMetadataQuery, [
    campaignId,
    characterId,
    flagKey,
    JSON.stringify(flagValue),
    flagCategory,
    JSON.stringify(normalizeObject(metadata)),
    notes,
    sourceType,
    sourceEntityId,
  ]);

  return mapFlagRow(result.rows[0]);
}

async function upsertCharacterKnowledge({
  campaignId,
  characterId,
  knowledgeType,
  knowledgeKey,
  title,
  summary = null,
  metadata = {},
  sourceType = null,
  sourceEntityId = null,
  executor,
}) {
  const result = await executor.query(upsertCharacterKnowledgeQuery, [
    campaignId,
    characterId,
    knowledgeType,
    knowledgeKey,
    title,
    summary,
    JSON.stringify(normalizeObject(metadata)),
    sourceType,
    sourceEntityId,
  ]);

  return mapKnowledgeRow(result.rows[0]);
}

async function insertRewardDefinition({
  rewardType,
  value,
  metadata = {},
  sourceType = null,
  sourceEntityId = null,
  executor,
}) {
  const result = await executor.query(insertAdventureRewardQuery, [
    rewardType,
    JSON.stringify(normalizeRewardValue(value)),
    JSON.stringify(normalizeObject(metadata)),
    sourceType,
    sourceEntityId,
  ]);

  return result.rows[0];
}

async function insertRewardApplication({
  rewardRow,
  campaignId = null,
  characterId = null,
  sourceType = null,
  sourceEntityId = null,
  executor,
}) {
  const result = await executor.query(insertAdventureRewardApplicationQuery, [
    characterId,
    campaignId,
    rewardRow.id,
    sourceType,
    sourceEntityId,
  ]);

  return mapRewardApplicationRow({
    ...result.rows[0],
    reward_type: rewardRow.reward_type,
    value_json: rewardRow.value_json ?? {},
    metadata_json: rewardRow.metadata_json ?? {},
    reward_source_type: rewardRow.source_type,
    reward_source_entity_id: rewardRow.source_entity_id,
    reward_created_at: rewardRow.created_at,
  });
}

async function findItemTemplate(value, executor) {
  const itemId = value.item_id !== undefined && value.item_id !== null ? Number(value.item_id) : null;
  const itemSlug = normalizeOptionalText(value.item_slug);

  if (itemId !== null) {
    const result = await executor.query(selectItemByIdQuery, [itemId]);
    const row = result.rows[0] || null;

    if (!row) {
      throw createHttpError('Reward item_id references an unknown item', 400);
    }

    return {
      id: Number(row.id),
      slug: row.slug,
      name: row.name,
    };
  }

  if (itemSlug) {
    const item = await getItemBySlug(itemSlug, executor);

    if (!item) {
      throw createHttpError('Reward item_slug references an unknown item', 400);
    }

    return {
      id: Number(item.id),
      slug: item.slug,
      name: item.name,
    };
  }

  throw createHttpError('Item rewards require item_id or item_slug', 400);
}

function buildKnowledgeSummaryForQuest(quest, status) {
  switch (status) {
    case 'completed':
      return `Quest completed: ${quest.name}.`;
    case 'failed':
      return `Quest failed: ${quest.name}.`;
    case 'active':
      return quest.discovery_summary ?? quest.summary ?? `Quest active: ${quest.name}.`;
    default:
      return quest.discovery_summary ?? quest.summary ?? `Quest available: ${quest.name}.`;
  }
}

function buildKnowledgeSummaryForObjective(quest, objective, status) {
  switch (status) {
    case 'completed':
      return `Objective completed: ${objective.title}.`;
    case 'failed':
      return `Objective failed: ${objective.title}.`;
    case 'active':
      return objective.description ?? `Objective active: ${objective.title}.`;
    default:
      return objective.description ?? `Objective updated: ${objective.title}.`;
  }
}

function buildAutoSourceKnowledgeEntry(effects, sourceType, sourceEntityId, sourceKey) {
  const normalizedSourceType = normalizeOptionalText(sourceType);
  const normalizedSourceKey = normalizeOptionalText(sourceKey) ?? normalizedSourceType ?? 'adventure';
  let knowledgeType = normalizedSourceType;

  if (normalizedSourceType === 'narrative') {
    if (normalizedSourceKey.startsWith('interaction:')) {
      knowledgeType = 'interaction';
    } else if (normalizedSourceKey.startsWith('dialogue')) {
      knowledgeType = 'dialogue';
    }
  }

  if (!['event', 'dialogue', 'interaction', 'combat'].includes(knowledgeType)) {
    return null;
  }

  const normalizedKey = normalizedSourceKey;
  const knowledgeKey =
    sourceEntityId !== null && sourceEntityId !== undefined
      ? `${normalizedKey}:${Number(sourceEntityId)}`
      : normalizedKey;
  const providedTitle = normalizeOptionalText(effects.source_knowledge_title);
  const providedSummary = normalizeOptionalText(effects.source_knowledge_summary);
  const fallbackTitleMap = {
    event: `Event remembered: ${normalizedKey}`,
    dialogue: `Conversation remembered: ${normalizedKey}`,
    interaction: `Interaction remembered: ${normalizedKey}`,
    combat: `Combat remembered: ${normalizedKey}`,
  };
  const fallbackSummaryMap = {
    event: 'A recent event changed the adventure state.',
    dialogue: 'A recent conversation revealed or changed something important.',
    interaction: 'A recent interaction changed the situation.',
    combat: 'A recent combat changed the campaign state.',
  };

  return {
    knowledge_type: knowledgeType,
    knowledge_key: knowledgeKey,
    title: providedTitle ?? fallbackTitleMap[knowledgeType],
    summary: providedSummary ?? fallbackSummaryMap[knowledgeType],
    metadata_json: {
      source_key: normalizedKey,
      source_entity_id: sourceEntityId,
    },
  };
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

  if (
    existing.status === status &&
    String(existing.started_at ?? '') === String(startedAt ?? '') &&
    String(existing.completed_at ?? '') === String(completedAt ?? '') &&
    String(existing.failed_at ?? '') === String(failedAt ?? '')
  ) {
    return {
      row: existing,
      quest,
      action: 'unchanged',
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
  const completedAt =
    status === 'completed'
      ? existing?.completed_at ?? new Date().toISOString()
      : null;

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

  if (
    existing.status === status &&
    Number(existing.progress_count) === progressCount &&
    String(existing.completed_at ?? '') === String(completedAt ?? '')
  ) {
    return {
      row: existing,
      objective,
      quest,
      action: 'unchanged',
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

async function applyNpcStateEffects(
  campaignId,
  characterId,
  npcStates,
  actorAccountId,
  sourceType,
  sourceEntityId,
  executor
) {
  const applied = [];

  for (const npcStateEffect of npcStates) {
    const npcKey = String(npcStateEffect.npc_key ?? '').trim();
    const disposition = normalizeOptionalText(npcStateEffect.disposition);

    if (!npcKey || !disposition) {
      throw createHttpError('npc_states entries require npc_key and disposition', 400);
    }

    const npcResult = await executor.query(selectNpcByKeyQuery, [npcKey]);
    const npc = npcResult.rows[0];

    if (!npc) {
      throw createHttpError(`Unknown npc_key: ${npcKey}`, 400);
    }

    const npcStateResult = await executor.query(upsertCampaignNpcStateQuery, [
      campaignId,
      npc.id,
      disposition,
      normalizeOptionalText(npcStateEffect.notes),
    ]);

    const mapped = {
      id: Number(npcStateResult.rows[0].id),
      npc_id: Number(npc.id),
      npc_key: npc.key,
      npc_name: npc.name,
      disposition: npcStateResult.rows[0].disposition,
      notes: npcStateResult.rows[0].notes,
      updated_at: npcStateResult.rows[0].updated_at,
    };
    applied.push(mapped);

    await recordCampaignLogInternal(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: actorAccountId,
        log_type: 'npc_state_changed',
        message: `${npc.name} is now ${mapped.disposition}.`,
        data_json: {
          npc_state: mapped,
          source_type: sourceType,
          source_entity_id: sourceEntityId,
        },
      },
      executor
    );
  }

  return applied;
}

function normalizeRewardDefinitions(effectPayload) {
  const payload = effectPayload ?? {};
  const definitions = normalizeArray(payload.rewards).map((entry) => ({
    reward_type: entry.reward_type,
    value: entry.value ?? {},
    metadata_json: entry.metadata_json ?? {},
  }));
  const xp = Number(payload.xp ?? 0);

  if (Number.isInteger(xp) && xp > 0) {
    definitions.push({
      reward_type: 'xp',
      value: { amount: xp },
      metadata_json: {
        reason: normalizeOptionalText(payload.reward_reason),
      },
    });
  }

  return definitions;
}

async function applyRewardDefinition({
  rewardDefinition,
  campaignId,
  characterId,
  actorAccountId,
  sourceType,
  sourceEntityId,
  executor,
}) {
  const rewardType = String(rewardDefinition.reward_type ?? '').trim();

  if (!rewardType) {
    throw createHttpError('Reward definitions require reward_type', 400);
  }

  const rewardRow = await insertRewardDefinition({
    rewardType,
    value: rewardDefinition.value ?? {},
    metadata: rewardDefinition.metadata_json ?? {},
    sourceType,
    sourceEntityId,
    executor,
  });
  const application = await insertRewardApplication({
    rewardRow,
    campaignId,
    characterId,
    sourceType,
    sourceEntityId,
    executor,
  });
  const value = normalizeRewardValue(rewardDefinition.value);
  const metadata = normalizeObject(rewardDefinition.metadata_json);
  let appliedValue = null;
  let summary = null;

    switch (rewardType) {
      case 'xp': {
        const amount = normalizePositiveInteger(value.amount, 'reward.value.amount');
        appliedValue = await grantCharacterExperience(
        characterId,
        {
          amount,
          actor_account_id: actorAccountId ?? null,
          reason: normalizeOptionalText(metadata.reason) ?? 'Adventure reward',
          source_type: 'adventure',
          source_entity_id: sourceEntityId,
          action_key: 'adventure_reward_xp',
          summary: `${amount} XP awarded from adventure progression.`,
          record_history: false,
        },
        executor
      );
        summary = `Granted ${amount} XP.`;
        break;
      }
      case 'level_grant': {
        const targetLevel =
          value.target_level !== undefined && value.target_level !== null
            ? normalizePositiveInteger(value.target_level, 'reward.value.target_level')
            : null;
        const levelCount =
          value.level_count !== undefined && value.level_count !== null
            ? normalizePositiveInteger(value.level_count, 'reward.value.level_count')
            : null;

        appliedValue = await grantMilestoneLevel(
          characterId,
          {
            target_level: targetLevel,
            level_count: levelCount,
            actor_account_id: actorAccountId ?? null,
            reason: normalizeOptionalText(metadata.reason) ?? 'Adventure milestone reward',
            source_type: 'adventure',
            source_entity_id: sourceEntityId,
            action_key: 'adventure_reward_level_grant',
            summary: 'Pending level-up awarded from adventure progression.',
            record_history: false,
            campaign_id: campaignId,
          },
          executor
        );
        summary = `Granted ${appliedValue.granted_level_count} pending level-up(s).`;
        break;
      }
    case 'currency': {
      const delta = {
        cp: normalizeNonNegativeInteger(value.cp, 'reward.value.cp', 0),
        sp: normalizeNonNegativeInteger(value.sp, 'reward.value.sp', 0),
        ep: normalizeNonNegativeInteger(value.ep, 'reward.value.ep', 0),
        gp: normalizeNonNegativeInteger(value.gp, 'reward.value.gp', 0),
        pp: normalizeNonNegativeInteger(value.pp, 'reward.value.pp', 0),
      };
      appliedValue = await adjustCharacterCurrencyWithExecutor(characterId, delta, executor);
      summary = 'Granted currency reward.';
      break;
    }
    case 'item': {
      const itemTemplate = await findItemTemplate(value, executor);
      const quantity = normalizePositiveInteger(value.quantity ?? 1, 'reward.value.quantity');
      const addResult = await addCharacterItemWithExecutor(
        characterId,
        {
          item_id: itemTemplate.id,
          parent_character_item_id: null,
          quantity,
          is_equipped: false,
          is_attuned: false,
          current_uses: null,
          max_uses: null,
          notes: normalizeOptionalText(metadata.notes),
        },
        executor
      );
      appliedValue = {
        item: itemTemplate,
        quantity,
        character_item_id: addResult.created_item?.id ?? null,
      };
      summary = `Granted ${quantity} ${itemTemplate.name}${quantity === 1 ? '' : 's'}.`;
      break;
    }
    case 'campaign_flag': {
      const flagKey = normalizeOptionalText(value.flag_key);

      if (!flagKey) {
        throw createHttpError('campaign_flag rewards require reward.value.flag_key', 400);
      }

      appliedValue = await upsertCampaignFlag({
        campaignId,
        flagKey,
        flagValue: value.flag_value ?? true,
        flagCategory:
          normalizeOptionalText(value.flag_category) ?? normalizeOptionalText(metadata.flag_category),
        metadata: metadata.flag_metadata ?? metadata,
        notes: normalizeOptionalText(metadata.notes),
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      await upsertCharacterKnowledge({
        campaignId,
        characterId,
        knowledgeType: 'campaign_flag',
        knowledgeKey: flagKey,
        title: normalizeOptionalText(metadata.title) ?? `World state: ${flagKey}`,
        summary: normalizeOptionalText(metadata.summary) ?? `The world state "${flagKey}" changed.`,
        metadata: {
          observed_value: value.flag_value ?? true,
          flag_category:
            normalizeOptionalText(value.flag_category) ?? normalizeOptionalText(metadata.flag_category),
        },
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      summary = `Updated campaign flag "${flagKey}".`;
      break;
    }
    case 'character_flag': {
      const flagKey = normalizeOptionalText(value.flag_key);

      if (!flagKey) {
        throw createHttpError('character_flag rewards require reward.value.flag_key', 400);
      }

      appliedValue = await upsertCharacterFlag({
        campaignId,
        characterId,
        flagKey,
        flagValue: value.flag_value ?? true,
        flagCategory:
          normalizeOptionalText(value.flag_category) ?? normalizeOptionalText(metadata.flag_category),
        metadata: metadata.flag_metadata ?? metadata,
        notes: normalizeOptionalText(metadata.notes),
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      summary = `Updated character flag "${flagKey}".`;
      break;
    }
    case 'scene_unlock': {
      const sceneKey = normalizeOptionalText(value.scene_key);
      const sceneId =
        value.scene_id !== undefined && value.scene_id !== null ? Number(value.scene_id) : null;
      const targetScene =
        sceneId !== null
          ? await getSceneByIdInternal(sceneId, executor)
          : sceneKey
            ? await getSceneByKeyInternal(sceneKey, executor)
            : null;

      if (!targetScene) {
        throw createHttpError(
          'scene_unlock rewards require reward.value.scene_id or reward.value.scene_key',
          400
        );
      }

      const unlockFlagKey =
        normalizeOptionalText(value.flag_key) ?? `scene_unlock:${targetScene.key}`;
      await upsertCharacterFlag({
        campaignId,
        characterId,
        flagKey: unlockFlagKey,
        flagValue: true,
        flagCategory: 'scene_unlock',
        metadata: {
          scene_id: targetScene.id,
          scene_key: targetScene.key,
        },
        notes: normalizeOptionalText(metadata.notes) ?? `Scene unlock for ${targetScene.name}.`,
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      appliedValue = await upsertCharacterKnowledge({
        campaignId,
        characterId,
        knowledgeType: 'scene',
        knowledgeKey: targetScene.key,
        title: normalizeOptionalText(metadata.title) ?? targetScene.name,
        summary:
          normalizeOptionalText(metadata.summary) ??
          `${targetScene.name} is now available to this character.`,
        metadata: {
          scene_id: targetScene.id,
          scene_key: targetScene.key,
        },
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      summary = `Unlocked scene "${targetScene.name}".`;
      break;
    }
    case 'npc_disposition': {
      const npcResults = await applyNpcStateEffects(
        campaignId,
        characterId,
        [
          {
            npc_key: normalizeOptionalText(value.npc_key),
            disposition: normalizeOptionalText(value.disposition),
            notes: normalizeOptionalText(metadata.notes),
          },
        ],
        actorAccountId,
        'adventure',
        sourceEntityId,
        executor
      );
      appliedValue = npcResults[0];
      summary = `Updated ${npcResults[0].npc_name}'s disposition.`;
      break;
    }
    case 'knowledge': {
      const knowledgeType = normalizeOptionalText(value.knowledge_type);
      const knowledgeKey = normalizeOptionalText(value.knowledge_key);
      const title = normalizeOptionalText(value.title);

      if (!knowledgeType || !knowledgeKey || !title) {
        throw createHttpError(
          'knowledge rewards require knowledge_type, knowledge_key, and title',
          400
        );
      }

      appliedValue = await upsertCharacterKnowledge({
        campaignId,
        characterId,
        knowledgeType,
        knowledgeKey,
        title,
        summary: normalizeOptionalText(value.summary),
        metadata: value.metadata_json ?? metadata,
        sourceType: 'adventure',
        sourceEntityId,
        executor,
      });
      summary = `Recorded knowledge "${title}".`;
      break;
    }
    default:
      throw createHttpError(`Unsupported reward_type: ${rewardType}`, 400);
  }

  await recordCampaignLogInternal(
    {
      campaign_id: campaignId,
      character_id: characterId,
      actor_account_id: actorAccountId ?? null,
      log_type: rewardType === 'scene_unlock' ? 'scene_unlocked' : 'reward_applied',
      message: summary,
      data_json: {
        reward_application_id: application.id,
        reward_type: rewardType,
        applied_value: appliedValue,
      },
    },
    executor
  );

  return {
    ...application,
    applied_value: appliedValue,
    summary,
  };
}

async function syncAdventureProgressionStateInternal(
  campaignId,
  characterId,
  {
    actorAccountId = null,
    sourceType = 'adventure',
    sourceEntityId = null,
  } = {},
  executor = { query }
) {
  const context = await getNarrativeContextInternal(campaignId, characterId, executor, {
    forUpdate: true,
  });
  assertAdventureWriteAllowed(context);

  const questDefinitions = await loadQuestDefinitions(executor);
  const applied = {
    quests: [],
    objectives: [],
    knowledge: [],
    scene_unlocks: [],
  };

  for (let pass = 0; pass < 3; pass += 1) {
    let stateChanged = false;
    const stateContext = await loadAdventureStateContext(campaignId, characterId, executor);
    const conditionContext = buildConditionContext(context, stateContext);

    for (const questDefinition of questDefinitions) {
      const availability = evaluateNarrativeConditions(
        questDefinition.availability_conditions_json,
        conditionContext
      );
      const existingQuestState = stateContext.quest_map.get(questDefinition.key) ?? null;
      const provisionalQuestStatus =
        existingQuestState?.status ?? (availability.is_available ? 'available' : null);
      const objectiveEvaluations = questDefinition.objectives.map((definition) => ({
        definition,
        state: stateContext.objective_map.get(`${questDefinition.key}:${definition.key}`) ?? null,
        evaluation: determineObjectiveState({
          questStatus: provisionalQuestStatus ?? 'available',
          objectiveDefinition: definition,
          objectiveState:
            stateContext.objective_map.get(`${questDefinition.key}:${definition.key}`) ?? null,
          conditionContext,
        }),
      }));
      const questDecision = determineQuestState({
        questDefinition,
        questState: existingQuestState,
        objectiveEvaluations,
        availability,
      });

      if (!questDecision.should_exist) {
        if (
          existingQuestState &&
          !['completed', 'failed'].includes(existingQuestState.status)
        ) {
          await executor.query(deleteCharacterQuestByIdQuery, [existingQuestState.id]);
          stateChanged = true;
          applied.quests.push({
            id: Number(existingQuestState.id),
            quest_id: Number(existingQuestState.quest_id),
            quest_key: existingQuestState.key,
            quest_name: existingQuestState.name,
            status: 'removed',
            started_at: existingQuestState.started_at,
            completed_at: existingQuestState.completed_at,
            failed_at: existingQuestState.failed_at,
            updated_at: new Date().toISOString(),
            action: 'removed',
            progression_mode: 'implicit_or_scope_cleanup',
          });
          await recordCampaignLogInternal(
            {
              campaign_id: campaignId,
              character_id: characterId,
              actor_account_id: actorAccountId,
              log_type: 'quest_updated',
              message: `Quest "${existingQuestState.name}" is no longer available in this campaign context.`,
              data_json: {
                quest_key: existingQuestState.key,
                source_type: sourceType,
                source_entity_id: sourceEntityId,
                implicit: true,
                removed: true,
              },
            },
            executor
          );
        }
        continue;
      }

      const questUpdate = await upsertQuestState(
        campaignId,
        characterId,
        questDefinition.key,
        questDecision.desired_status,
        executor
      );

      if (questUpdate.action !== 'unchanged') {
        stateChanged = true;
        const mappedQuest = {
          id: Number(questUpdate.row.id),
          quest_id: Number(questUpdate.quest.id),
          quest_key: questUpdate.quest.key,
          quest_name: questUpdate.quest.name,
          status: questUpdate.row.status,
          started_at: questUpdate.row.started_at,
          completed_at: questUpdate.row.completed_at,
          failed_at: questUpdate.row.failed_at,
          updated_at: questUpdate.row.updated_at,
          action: questUpdate.action,
          progression_mode:
            questUpdate.action === 'created' && !existingQuestState ? 'implicit' : 'explicit_or_sync',
        };
        applied.quests.push(mappedQuest);
        await recordCampaignLogInternal(
          {
            campaign_id: campaignId,
            character_id: characterId,
            actor_account_id: actorAccountId,
            log_type: 'quest_updated',
            message: `Quest "${questUpdate.quest.name}" is now ${mappedQuest.status}.`,
            data_json: {
              quest: mappedQuest,
              source_type: sourceType,
              source_entity_id: sourceEntityId,
              implicit: true,
            },
          },
          executor
        );
        const questKnowledge = await upsertCharacterKnowledge({
          campaignId,
          characterId,
          knowledgeType: 'quest',
          knowledgeKey: questDefinition.key,
          title: questDefinition.name,
          summary: buildKnowledgeSummaryForQuest(questDefinition, mappedQuest.status),
          metadata: {
            quest_status: mappedQuest.status,
          },
          sourceType,
          sourceEntityId,
          executor,
        });
        applied.knowledge.push(questKnowledge);
      }

      const refreshedStateContext = await loadAdventureStateContext(campaignId, characterId, executor);
      const refreshedQuestState = refreshedStateContext.quest_map.get(questDefinition.key);
      const refreshedConditionContext = buildConditionContext(context, refreshedStateContext);

      for (const objectiveDefinition of questDefinition.objectives) {
        const currentObjectiveState =
          refreshedStateContext.objective_map.get(`${questDefinition.key}:${objectiveDefinition.key}`) ??
          null;
        const objectiveDecision = determineObjectiveState({
          questStatus: refreshedQuestState?.status ?? questDecision.desired_status,
          objectiveDefinition,
          objectiveState: currentObjectiveState,
          conditionContext: refreshedConditionContext,
        });
        const objectiveUpdate = await upsertObjectiveState(
          campaignId,
          characterId,
          {
            quest_key: questDefinition.key,
            objective_key: objectiveDefinition.key,
            status: objectiveDecision.desired_status,
            progress_count: objectiveDecision.desired_progress_count,
          },
          executor
        );

        if (objectiveUpdate.action !== 'unchanged') {
          stateChanged = true;
          const mappedObjective = {
            id: Number(objectiveUpdate.row.id),
            quest_key: objectiveUpdate.quest.key,
            quest_name: objectiveUpdate.quest.name,
            objective_key: objectiveUpdate.objective.key,
            objective_title: objectiveUpdate.objective.title,
            status: objectiveUpdate.row.status,
            progress_count: Number(objectiveUpdate.row.progress_count),
            completed_at: objectiveUpdate.row.completed_at,
            updated_at: objectiveUpdate.row.updated_at,
            action: objectiveUpdate.action,
            progression_mode: 'implicit',
          };
          applied.objectives.push(mappedObjective);
          await recordCampaignLogInternal(
            {
              campaign_id: campaignId,
              character_id: characterId,
              actor_account_id: actorAccountId,
              log_type: 'objective_updated',
              message: `Objective "${objectiveUpdate.objective.title}" is now ${mappedObjective.status}.`,
              data_json: {
                objective: mappedObjective,
                source_type: sourceType,
                source_entity_id: sourceEntityId,
                implicit: true,
              },
            },
            executor
          );
          const objectiveKnowledge = await upsertCharacterKnowledge({
            campaignId,
            characterId,
            knowledgeType: 'objective',
            knowledgeKey: `${questDefinition.key}:${objectiveDefinition.key}`,
            title: objectiveDefinition.title,
            summary: buildKnowledgeSummaryForObjective(
              questDefinition,
              objectiveDefinition,
              mappedObjective.status
            ),
            metadata: {
              quest_key: questDefinition.key,
              objective_status: mappedObjective.status,
              progress_count: mappedObjective.progress_count,
            },
            sourceType,
            sourceEntityId,
            executor,
          });
          applied.knowledge.push(objectiveKnowledge);
        }
      }
    }

    if (!stateChanged) {
      break;
    }
  }

  const finalStateContext = await loadAdventureStateContext(campaignId, characterId, executor);
  const currentSceneIds = [];

  if (context.current_scene_id !== null) {
    currentSceneIds.push(context.current_scene_id);
  }

  const unlockMap = await buildSceneUnlockAvailabilityMapForSceneIds(
    campaignId,
    characterId,
    currentSceneIds,
    executor,
    finalStateContext
  );
  applied.scene_unlocks = [...unlockMap.values()].filter((entry) => entry.is_unlocked);

  if (
    applied.quests.length > 0 ||
    applied.objectives.length > 0 ||
    applied.scene_unlocks.length > 0
  ) {
    await recordCampaignLogInternal(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: actorAccountId,
        log_type: 'adventure_state_updated',
        message: 'Adventure progression state was refreshed.',
        data_json: {
          quest_updates: applied.quests,
          objective_updates: applied.objectives,
          unlocked_scenes: applied.scene_unlocks.map((entry) => ({
            scene_id: entry.scene_id,
            scene_key: entry.scene_key,
            scene_name: entry.scene_name,
          })),
          source_type: sourceType,
          source_entity_id: sourceEntityId,
        },
      },
      executor
    );
  }

  return applied;
}

async function buildSceneUnlockAvailabilityMapForSceneIds(
  campaignId,
  characterId,
  sceneIds,
  executor,
  preloadedStateContext = null
) {
  const context = await getNarrativeContextInternal(campaignId, characterId, executor);
  assertMembership(context);
  const stateContext =
    preloadedStateContext ?? (await loadAdventureStateContext(campaignId, characterId, executor));
  const conditionContext = buildConditionContext(context, stateContext);
  const definitionMap = await loadSceneUnlockDefinitions(sceneIds, executor);

  return new Map(
    [
      ...new Set(
        (sceneIds ?? [])
          .filter((value) => Number.isInteger(Number(value)) && Number(value) > 0)
          .map(Number)
      ),
    ].map((sceneId) => {
      const definitions = definitionMap.get(sceneId) ?? [];
      return [
        sceneId,
        {
          scene_id: sceneId,
          scene_key: definitions[0]?.scene_key ?? null,
          scene_name: definitions[0]?.scene_name ?? null,
          ...evaluateSceneUnlockAvailability(definitions, conditionContext),
        },
      ];
    })
  );
}

export async function getSceneUnlockAvailabilityForScenes(
  campaignId,
  characterId,
  sceneIds,
  executor = { query },
  preloadedStateContext = null
) {
  return buildSceneUnlockAvailabilityMapForSceneIds(
    campaignId,
    characterId,
    sceneIds,
    executor,
    preloadedStateContext
  );
}

export async function syncAdventureProgressionState(
  campaignId,
  characterId,
  options = {},
  executor = null
) {
  if (executor) {
    return syncAdventureProgressionStateInternal(campaignId, characterId, options, executor);
  }

  return withTransaction((client) =>
    syncAdventureProgressionStateInternal(campaignId, characterId, options, client)
  );
}

export async function applyAdventureOutcome(
  {
    campaignId,
    characterId,
    effectPayload,
    actorAccountId = null,
    sourceType = 'adventure',
    sourceEntityId = null,
    sourceKey = 'adventure',
  },
  executor = null
) {
  const runner = async (client) => {
    const context = await getNarrativeContextInternal(campaignId, characterId, client, {
      forUpdate: true,
    });
    assertAdventureWriteAllowed(context);

    const effects = effectPayload ?? {};
    const applied = {
      campaign_flags: [],
      character_flags: [],
      npc_states: [],
      quests: [],
      objectives: [],
      rewards: [],
      knowledge: [],
      world_changes: [],
      progression: null,
      scene_unlocks: [],
      sync: null,
    };

    for (const [flagKey, flagValue] of Object.entries(effects.campaign_flags ?? {})) {
      const mapped = await upsertCampaignFlag({
        campaignId,
        flagKey,
        flagValue,
        flagCategory: normalizeOptionalText(effects.campaign_flag_categories?.[flagKey]) ?? null,
        metadata: normalizeObject(effects.campaign_flag_metadata?.[flagKey]),
        notes: `Applied by ${sourceKey}`,
        sourceType,
        sourceEntityId,
        executor: client,
      });
      applied.campaign_flags.push(mapped);

      await recordCampaignLogInternal(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: actorAccountId,
          log_type: 'flag_changed',
          message: `Campaign flag "${flagKey}" was updated.`,
          data_json: {
            flag_scope: 'campaign',
            flag: mapped,
            source_type: sourceType,
            source_entity_id: sourceEntityId,
          },
        },
        client
      );

      const campaignFlagKnowledge = await upsertCharacterKnowledge({
        campaignId,
        characterId,
        knowledgeType: 'campaign_flag',
        knowledgeKey: flagKey,
        title:
          normalizeOptionalText(effects.campaign_flag_titles?.[flagKey]) ??
          `World state: ${flagKey}`,
        summary:
          normalizeOptionalText(effects.campaign_flag_summaries?.[flagKey]) ??
          `The world state "${flagKey}" changed.`,
        metadata: {
          observed_value: flagValue,
          flag_category: mapped.flag_category,
        },
        sourceType,
        sourceEntityId,
        executor: client,
      });
      applied.knowledge.push(campaignFlagKnowledge);
    }

    for (const [flagKey, flagValue] of Object.entries(effects.character_flags ?? {})) {
      const mapped = await upsertCharacterFlag({
        campaignId,
        characterId,
        flagKey,
        flagValue,
        flagCategory: normalizeOptionalText(effects.character_flag_categories?.[flagKey]) ?? null,
        metadata: normalizeObject(effects.character_flag_metadata?.[flagKey]),
        notes: `Applied by ${sourceKey}`,
        sourceType,
        sourceEntityId,
        executor: client,
      });
      applied.character_flags.push(mapped);
      await recordCampaignLogInternal(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: actorAccountId,
          log_type: 'flag_changed',
          message: `Character flag "${flagKey}" was updated.`,
          data_json: {
            flag_scope: 'character',
            flag: mapped,
            source_type: sourceType,
            source_entity_id: sourceEntityId,
          },
        },
        client
      );
    }

    applied.npc_states = await applyNpcStateEffects(
      campaignId,
      characterId,
      normalizeArray(effects.npc_states),
      actorAccountId,
      sourceType,
      sourceEntityId,
      client
    );

    for (const questEffect of normalizeArray(effects.quests)) {
      const questKey = String(questEffect.quest_key ?? '').trim();
      const status = String(questEffect.status ?? '').trim();

      if (!questKey || !status) {
        throw createHttpError('quest effects require quest_key and status', 400);
      }

      const appliedQuest = await upsertQuestState(campaignId, characterId, questKey, status, client);

      if (appliedQuest.action === 'unchanged') {
        continue;
      }

      const mapped = {
        id: Number(appliedQuest.row.id),
        quest_id: Number(appliedQuest.quest.id),
        quest_key: appliedQuest.quest.key,
        quest_name: appliedQuest.quest.name,
        status: appliedQuest.row.status,
        started_at: appliedQuest.row.started_at,
        completed_at: appliedQuest.row.completed_at,
        failed_at: appliedQuest.row.failed_at,
        updated_at: appliedQuest.row.updated_at,
        action: appliedQuest.action,
      };
      applied.quests.push(mapped);
      await recordCampaignLogInternal(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: actorAccountId,
          log_type: 'quest_updated',
          message: `Quest "${appliedQuest.quest.name}" is now ${mapped.status}.`,
          data_json: {
            quest: mapped,
            source_type: sourceType,
            source_entity_id: sourceEntityId,
          },
        },
        client
      );
    }

    for (const objectiveEffect of normalizeArray(effects.objectives)) {
      const appliedObjective = await upsertObjectiveState(
        campaignId,
        characterId,
        objectiveEffect,
        client
      );

      if (appliedObjective.action === 'unchanged') {
        continue;
      }

      const mapped = {
        id: Number(appliedObjective.row.id),
        quest_key: appliedObjective.quest.key,
        quest_name: appliedObjective.quest.name,
        objective_key: appliedObjective.objective.key,
        objective_title: appliedObjective.objective.title,
        status: appliedObjective.row.status,
        progress_count: Number(appliedObjective.row.progress_count),
        completed_at: appliedObjective.row.completed_at,
        updated_at: appliedObjective.row.updated_at,
        action: appliedObjective.action,
      };
      applied.objectives.push(mapped);
      await recordCampaignLogInternal(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: actorAccountId,
          log_type: 'objective_updated',
          message: `Objective "${appliedObjective.objective.title}" is now ${mapped.status}.`,
          data_json: {
            objective: mapped,
            source_type: sourceType,
            source_entity_id: sourceEntityId,
          },
        },
        client
      );
    }

    for (const rewardDefinition of normalizeRewardDefinitions(effects)) {
      const appliedReward = await applyRewardDefinition({
        rewardDefinition,
        campaignId,
        characterId,
        actorAccountId,
        sourceType,
        sourceEntityId,
        executor: client,
      });
      applied.rewards.push(appliedReward);

      if (['xp', 'level_grant'].includes(appliedReward.reward.reward_type)) {
        applied.progression = appliedReward.applied_value;
      }
    }

    const explicitKnowledgeEntries = normalizeArray(effects.knowledge_entries);
    const autoKnowledgeEntry = buildAutoSourceKnowledgeEntry(
      effects,
      sourceType,
      sourceEntityId,
      sourceKey
    );
    const knowledgeEntries = [...explicitKnowledgeEntries];

    if (
      autoKnowledgeEntry &&
      !knowledgeEntries.some(
        (entry) =>
          normalizeOptionalText(entry?.knowledge_type) === autoKnowledgeEntry.knowledge_type &&
          normalizeOptionalText(entry?.knowledge_key) === autoKnowledgeEntry.knowledge_key
      )
    ) {
      knowledgeEntries.push(autoKnowledgeEntry);
    }

    for (const knowledgeEntry of knowledgeEntries) {
      const knowledgeType = normalizeOptionalText(knowledgeEntry.knowledge_type);
      const knowledgeKey = normalizeOptionalText(knowledgeEntry.knowledge_key);
      const title = normalizeOptionalText(knowledgeEntry.title);

      if (!knowledgeType || !knowledgeKey || !title) {
        throw createHttpError(
          'knowledge_entries require knowledge_type, knowledge_key, and title',
          400
        );
      }

      const knowledge = await upsertCharacterKnowledge({
        campaignId,
        characterId,
        knowledgeType,
        knowledgeKey,
        title,
        summary: normalizeOptionalText(knowledgeEntry.summary),
        metadata: knowledgeEntry.metadata_json ?? {},
        sourceType,
        sourceEntityId,
        executor: client,
      });
      applied.knowledge.push(knowledge);
      await recordCampaignLogInternal(
        {
          campaign_id: campaignId,
          character_id: characterId,
          actor_account_id: actorAccountId,
          log_type: 'knowledge_discovered',
          message: `Discovered: ${knowledge.title}.`,
          data_json: {
            knowledge,
            source_type: sourceType,
            source_entity_id: sourceEntityId,
          },
        },
        client
      );
    }

    applied.world_changes = await applyWorldChangeEffects({
      campaignId,
      characterId,
      worldId: context.campaign.world_id,
      worldChanges: normalizeArray(effects.world_changes),
      actorAccountId,
      sourceType,
      sourceEntityId,
      executor: client,
    });

    applied.sync = await syncAdventureProgressionStateInternal(
      campaignId,
      characterId,
      {
        actorAccountId,
        sourceType,
        sourceEntityId,
      },
      client
    );
    applied.scene_unlocks = applied.sync.scene_unlocks;

    return applied;
  };

  if (executor) {
    return runner(executor);
  }

  return withTransaction((client) => runner(client));
}

async function loadAdventureReadModelBase(campaignId, characterId, executor) {
  const context = await getNarrativeContextInternal(campaignId, characterId, executor);
  assertMembership(context);
  const stateContext = await loadAdventureStateContext(campaignId, characterId, executor);
  const knowledge = await loadCharacterKnowledge(campaignId, characterId, executor);
  const currentScene =
    context.current_scene_id !== null
      ? await getSceneByIdInternal(context.current_scene_id, executor)
      : null;
  const sceneUnlocks = await buildSceneUnlockAvailabilityMapForSceneIds(
    campaignId,
    characterId,
    currentScene ? [currentScene.id] : [],
    executor,
    stateContext
  );
  const currentObjective = selectCurrentObjective(stateContext.quests);
  const recentHistory = await listCharacterGameplayHistory(characterId, 50, 0);

  return {
    context,
    stateContext,
    knowledge,
    currentScene,
    sceneUnlocks,
    currentObjective,
    recentHistory,
  };
}

function buildPlayerKnowledgeFlags(stateContext, knowledge) {
  const grouped = mergeKnowledgeByType(knowledge);
  const knownCampaignFlags = (grouped.get('campaign_flag') ?? []).map((entry) => ({
    flag_key: entry.knowledge_key,
    observed_value: entry.metadata_json?.observed_value ?? null,
    title: entry.title,
    summary: entry.summary,
    discovered_at: entry.created_at,
  }));

  return {
    known_campaign_flags: knownCampaignFlags,
    character_flags: stateContext.character_flags,
  };
}

function buildMinimalAdventureState(base) {
  return {
    identity: {
      campaign_id: base.context.campaign_id,
      character_id: base.context.character_id,
      character_name: base.context.character.name,
    },
    current_scene: base.currentScene
      ? {
          id: base.currentScene.id,
          key: base.currentScene.key,
          name: base.currentScene.name,
          summary: base.currentScene.summary,
        }
      : null,
    current_objective: base.currentObjective,
    recent_result: buildRecentResultSummary(base.recentHistory, base.currentScene?.id),
  };
}

function buildPlayerAdventureState(base) {
  const groupedKnowledge = mergeKnowledgeByType(base.knowledge);

  return {
    identity: {
      campaign_id: base.context.campaign_id,
      character_id: base.context.character_id,
      character_name: base.context.character.name,
      alignment: base.context.character.alignment,
    },
    current_scene: base.currentScene
      ? {
          id: base.currentScene.id,
          key: base.currentScene.key,
          name: base.currentScene.name,
          summary: base.currentScene.summary,
        }
      : null,
    current_objective: base.currentObjective,
    quests: base.stateContext.quests,
    knowledge: {
      flags: buildPlayerKnowledgeFlags(base.stateContext, base.knowledge),
      known_events: [
        ...(groupedKnowledge.get('event') ?? []),
        ...(groupedKnowledge.get('dialogue') ?? []),
        ...(groupedKnowledge.get('interaction') ?? []),
        ...(groupedKnowledge.get('combat') ?? []),
      ],
      discovered_lore: groupedKnowledge.get('lore') ?? [],
      scenes: groupedKnowledge.get('scene') ?? [],
    },
    recent_result: buildRecentResultSummary(base.recentHistory, base.currentScene?.id),
  };
}

async function buildGmAdventureState(base, executor) {
  const [rewardApplications, campaignLogs] = await Promise.all([
    executor.query(selectRewardApplicationsByCampaignQuery, [base.context.campaign_id]),
    executor.query(selectCampaignLogsQuery, [base.context.campaign_id, 50, 0]),
  ]);

  return {
    identity: {
      campaign_id: base.context.campaign_id,
      campaign_name: base.context.campaign.name,
      character_id: base.context.character_id,
      character_name: base.context.character.name,
    },
    current_scene: base.currentScene,
    current_objective: base.currentObjective,
    world_state: {
      campaign_flags: base.stateContext.campaign_flags,
      character_flags: base.stateContext.character_flags,
      quests: base.stateContext.quests,
      knowledge: base.knowledge,
      reward_applications: rewardApplications.rows.map(mapRewardApplicationRow),
      scene_unlocks: [...base.sceneUnlocks.values()],
      logs: campaignLogs.rows.map(mapCampaignLogRow),
    },
    recent_result: buildRecentResultSummary(base.recentHistory, base.currentScene?.id),
  };
}

export async function getAdventureState(campaignId, characterId, mode = 'player') {
  const normalizedMode = String(mode ?? 'player').trim() || 'player';

  return withTransaction(async (client) => {
    await syncAdventureProgressionStateInternal(campaignId, characterId, {}, client);
    const base = await loadAdventureReadModelBase(campaignId, characterId, client);

    switch (normalizedMode) {
      case 'minimal':
        return buildMinimalAdventureState(base);
      case 'player':
        return buildPlayerAdventureState(base);
      case 'gm':
        return buildGmAdventureState(base, client);
      default:
        throw createHttpError('mode must be minimal, player, or gm', 400);
    }
  });
}

export async function listAdventureObjectives(campaignId, characterId, mode = 'player') {
  const state = await getAdventureState(campaignId, characterId, mode);

  if (mode === 'minimal') {
    return {
      campaign_id: campaignId,
      character_id: characterId,
      current_objective: state.current_objective,
    };
  }

  const quests = mode === 'gm' ? state.world_state.quests : state.quests;
  const objectives = quests.flatMap((quest) =>
    quest.objectives.map((objective) => ({
      quest: {
        id: quest.quest_id ?? quest.id,
        key: quest.key,
        name: quest.name,
        status: quest.status,
      },
      objective,
    }))
  );

  return {
    campaign_id: campaignId,
    character_id: characterId,
    mode,
    objectives,
  };
}

export async function listAdventureQuests(campaignId, characterId, mode = 'player') {
  const state = await getAdventureState(campaignId, characterId, mode);

  return {
    campaign_id: campaignId,
    character_id: characterId,
    mode,
    quests: mode === 'gm' ? state.world_state.quests : mode === 'minimal' ? [] : state.quests,
    current_objective: state.current_objective,
  };
}

export async function listAdventureCampaignLog(
  campaignId,
  characterId = null,
  mode = 'player',
  limit = 25,
  offset = 0
) {
  const normalizedLimit = normalizePositiveInteger(limit, 'limit');
  const normalizedOffset = Number(offset ?? 0);

  if (!Number.isInteger(normalizedOffset) || normalizedOffset < 0) {
    throw createHttpError('offset must be a non-negative integer', 400);
  }

  return withTransaction(async (client) => {
    if (characterId !== null && characterId !== undefined) {
      await syncAdventureProgressionStateInternal(campaignId, characterId, {}, client);
    }

    const result = await client.query(selectCampaignLogsQuery, [campaignId, normalizedLimit, normalizedOffset]);
    const items = result.rows.map(mapCampaignLogRow);

    if (mode === 'gm' || characterId === null || characterId === undefined) {
      return {
        campaign_id: campaignId,
        character_id: characterId,
        mode,
        limit: normalizedLimit,
        offset: normalizedOffset,
        items,
      };
    }

    const knowledge = await loadCharacterKnowledge(campaignId, characterId, client);
    const allowedSourcePairs = new Set(
      knowledge.map((entry) => `${entry.source_type ?? 'unknown'}:${entry.source_entity_id ?? 'unknown'}`)
    );
    const filteredItems = items.filter((entry) => {
      if (entry.character_id !== null && entry.character_id === characterId) {
        return true;
      }

      const data = normalizeObject(entry.data_json);
      const sourceType = normalizeOptionalText(data.source_type);
      const sourceEntityId =
        data.source_entity_id !== undefined && data.source_entity_id !== null
          ? Number(data.source_entity_id)
          : null;

      if (sourceType === null || sourceEntityId === null) {
        return false;
      }

      return allowedSourcePairs.has(`${sourceType}:${sourceEntityId}`);
    });

    return {
      campaign_id: campaignId,
      character_id: characterId,
      mode,
      limit: normalizedLimit,
      offset: normalizedOffset,
      items: filteredItems,
    };
  });
}

export async function listCharacterRewardApplications(campaignId, characterId) {
  const result = await query(selectRewardApplicationsByCharacterQuery, [characterId, campaignId]);
  return result.rows.map(mapRewardApplicationRow);
}
