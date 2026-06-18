import { query, withTransaction } from '../config/db.js';
import {
  insertCampaignLogQuery,
  insertCharacterObjectiveQuery,
  insertCharacterQuestQuery,
  insertCharacterSceneHistoryQuery,
  insertInteractionResultQuery,
  selectCampaignCharacterNarrativeContextForUpdateQuery,
  selectCampaignCharacterNarrativeContextQuery,
  selectCampaignFlagsByCampaignQuery,
  selectCampaignLogsQuery,
  selectCampaignScenesQuery,
  selectCharacterFlagsByCampaignQuery,
  selectCharacterObjectiveByObjectiveIdQuery,
  selectCharacterObjectiveRowsByCampaignQuery,
  selectCharacterQuestByQuestIdQuery,
  selectCharacterQuestsByCampaignQuery,
  selectCharacterSceneHistoryQuery,
  selectInteractionResultByInteractionAndCharacterQuery,
  selectInteractionResultsBySceneAndCharacterQuery,
  selectNpcByKeyQuery,
  selectQuestByKeyQuery,
  selectQuestObjectiveByQuestAndKeyQuery,
  selectSceneByIdQuery,
  selectSceneByKeyQuery,
  selectSceneInteractionByIdQuery,
  selectSceneInteractionBySceneAndKeyQuery,
  selectSceneInteractionsBySceneQuery,
  selectSceneNpcsBySceneQuery,
  selectSceneTransitionByFromSceneAndKeyQuery,
  selectSceneTransitionByIdQuery,
  selectSceneTransitionsByFromSceneQuery,
  selectStartingScenesQuery,
  updateCampaignCharacterCurrentSceneQuery,
  updateCharacterObjectiveStatusQuery,
  updateCharacterQuestStatusQuery,
  upsertCampaignFlagQuery,
  upsertCampaignNpcStateQuery,
  upsertCharacterFlagQuery,
} from '../db/queries/narrative.js';
import {
  evaluateNarrativeConditions,
  evaluateNarrativeRecommendation,
  resolveSceneInteractionSkillCheck,
} from '../engine/narrative/narrativeEngine.js';
import { getCharacterRules } from './characterRulesService.js';
import { createHttpError } from '../utils/httpError.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { triggerSceneEntryDialogues } from './dialogueService.js';
import { applyAdventureOutcome, getSceneUnlockAvailabilityForScenes } from './adventureProgressionService.js';

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

function mapTransitionRow(row) {
  return {
    id: Number(row.id),
    from_scene_id: Number(row.from_scene_id),
    to_scene_id: Number(row.to_scene_id),
    transition_key: row.transition_key,
    label: row.label,
    description: row.description,
    sort_order: Number(row.sort_order),
    is_default_path: row.is_default_path,
    recommendation_json: row.recommendation_json ?? {},
    conditions_json: row.conditions_json ?? {},
    is_active: row.is_active,
    created_at: row.created_at,
    to_scene: {
      id: Number(row.to_scene_id),
      key: row.to_scene_key,
      name: row.to_scene_name,
      summary: row.to_scene_summary,
      entry_text: row.to_scene_entry_text,
      is_starting_scene: row.to_scene_is_starting_scene,
      entry_conditions_json: row.to_scene_entry_conditions_json ?? {},
      location: {
        id: Number(row.to_location_id),
        key: row.to_location_key,
        name: row.to_location_name,
        region_name: row.to_region_name,
      },
    },
  };
}

function mapNpcRow(row) {
  return {
    id: Number(row.npc_id),
    scene_npc_id: Number(row.id),
    world_entity_id: row.world_entity_id !== null ? Number(row.world_entity_id) : null,
    key: row.npc_key,
    name: row.npc_name,
    npc_type: row.npc_type,
    base_disposition: row.base_disposition,
    effective_disposition: row.campaign_disposition ?? row.base_disposition,
    role: row.role,
    description: row.npc_description,
    presence_text: row.presence_text,
    availability_conditions_json: row.availability_conditions_json ?? {},
    campaign_state:
      row.campaign_npc_state_id !== null
        ? {
            id: Number(row.campaign_npc_state_id),
            disposition: row.campaign_disposition,
            notes: row.campaign_disposition_notes,
          }
        : null,
    world_entity:
      row.world_entity_id !== null
        ? {
            id: Number(row.world_entity_id),
            entity_key: row.world_entity_key,
            status: row.world_entity_status,
            disposition: row.world_entity_disposition,
            current_scene_id:
              row.world_entity_current_scene_id !== null
                ? Number(row.world_entity_current_scene_id)
                : null,
            state_json: row.world_entity_state_json ?? {},
          }
        : null,
    stat_block:
      row.armor_class !== null
        ? {
            id: Number(row.stat_block_id),
            name: row.stat_block_name,
            armor_class: Number(row.armor_class),
            max_hit_points: Number(row.hit_point_max),
            current_hit_points: Number(row.current_hit_points),
            speed: Number(row.speed_walk),
            speed_types: {
              walk: Number(row.speed_walk),
              fly: Number(row.speed_fly),
              swim: Number(row.speed_swim),
              climb: Number(row.speed_climb),
            },
            strength: Number(row.strength),
            dexterity: Number(row.dexterity),
            constitution: Number(row.constitution),
            intelligence: Number(row.intelligence),
            wisdom: Number(row.wisdom),
            charisma: Number(row.charisma),
            proficiency_bonus: Number(row.proficiency_bonus),
          }
        : null,
  };
}

function mapInteractionRow(row) {
  return {
    id: Number(row.id),
    scene_id: Number(row.scene_id),
    npc_id: row.npc_id !== null ? Number(row.npc_id) : null,
    interaction_key: row.interaction_key,
    label: row.label,
    description: row.description,
    interaction_type: row.interaction_type,
    skill:
      row.skill_id !== null
        ? {
            id: Number(row.skill_id),
            name: row.skill_name,
            slug: row.skill_slug,
          }
        : null,
    difficulty_class: Number(row.difficulty_class),
    sort_order: Number(row.sort_order),
    is_repeatable: row.is_repeatable,
    availability_conditions_json: row.availability_conditions_json ?? {},
    success_effects_json: row.success_effects_json ?? {},
    failure_effects_json: row.failure_effects_json ?? {},
    success_text: row.success_text,
    failure_text: row.failure_text,
    is_active: row.is_active,
    npc:
      row.npc_id !== null
        ? {
            id: Number(row.npc_id),
            key: row.npc_key,
            name: row.npc_name,
            role: row.npc_role,
          }
        : null,
  };
}

function mapInteractionResultRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    interaction_id: Number(row.interaction_id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    npc_id: row.npc_id !== null ? Number(row.npc_id) : null,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    skill_id: row.skill_id !== null ? Number(row.skill_id) : null,
    difficulty_class: Number(row.difficulty_class),
    roll_value: Number(row.roll_value),
    skill_modifier: Number(row.skill_modifier),
    total_value: Number(row.total_value),
    was_success: row.was_success,
    result_summary: row.result_summary,
    applied_effects_json: row.applied_effects_json ?? {},
    created_at: row.created_at,
  };
}

function mapFlagRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: row.character_id !== undefined && row.character_id !== null ? Number(row.character_id) : null,
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

function mapSceneHistoryRow(row) {
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    from_scene:
      row.from_scene_id !== null
        ? {
            id: Number(row.from_scene_id),
            key: row.from_scene_key,
            name: row.from_scene_name,
          }
        : null,
    to_scene: {
      id: Number(row.to_scene_id),
      key: row.to_scene_key,
      name: row.to_scene_name,
    },
    transition_id: row.transition_id !== null ? Number(row.transition_id) : null,
    transition_key: row.transition_key,
    reason: row.reason,
    actor:
      row.actor_account_id !== null
        ? {
            account_id: Number(row.actor_account_id),
            display_name: row.actor_display_name,
          }
        : null,
    created_at: row.created_at,
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

function assertMembership(context) {
  if (!context) {
    throw createHttpError('Character is not a member of this campaign', 404);
  }
}

function assertNarrativeWriteAllowed(context) {
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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

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

function combineAvailability(...entries) {
  const reasons = entries.flatMap((entry) => entry?.unmet_requirements ?? []);

  return {
    is_available: reasons.length === 0,
    unmet_requirements: reasons,
  };
}

async function getNarrativeContext(campaignId, characterId, executor = { query }, { forUpdate = false } = {}) {
  const statement = forUpdate
    ? selectCampaignCharacterNarrativeContextForUpdateQuery
    : selectCampaignCharacterNarrativeContextQuery;
  const result = await executor.query(statement, [campaignId, characterId]);
  return mapNarrativeContextRow(result.rows[0] || null);
}

async function getSceneById(sceneId, executor = { query }) {
  const result = await executor.query(selectSceneByIdQuery, [sceneId]);
  return mapSceneRow(result.rows[0] || null);
}

async function getSceneByKey(sceneKey, executor = { query }) {
  const result = await executor.query(selectSceneByKeyQuery, [sceneKey]);
  return mapSceneRow(result.rows[0] || null);
}

async function getSceneTarget(input, executor = { query }) {
  if (input.scene_id !== undefined && input.scene_id !== null) {
    return getSceneById(Number(input.scene_id), executor);
  }

  if (input.scene_key) {
    return getSceneByKey(input.scene_key, executor);
  }

  return null;
}

async function listNarrativeFlagsInternal(campaignId, characterId, executor = { query }) {
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

async function listNarrativeQuestsInternal(campaignId, characterId, executor = { query }) {
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

async function buildNarrativeStateContext(campaignId, characterId, executor = { query }) {
  const flags = await listNarrativeFlagsInternal(campaignId, characterId, executor);
  const quests = await listNarrativeQuestsInternal(campaignId, characterId, executor);

  return {
    ...flags,
    ...quests,
  };
}

function buildConditionContext(context, stateContext) {
  return {
    alignment_abbreviation: context.character.alignment?.abbreviation ?? null,
    campaign_type: context.campaign.campaign_type ?? null,
    campaign_world_id: context.campaign.world_id ?? null,
    campaign_flags: stateContext.campaign_flag_map,
    character_flags: stateContext.character_flag_map,
    quest_map: stateContext.quest_map,
    objective_map: stateContext.objective_map,
  };
}

function mapSceneUnlockAvailabilityToAvailability(sceneUnlockAvailability) {
  if (!sceneUnlockAvailability || sceneUnlockAvailability.is_unlocked) {
    return {
      is_available: true,
      unmet_requirements: [],
    };
  }

  return {
    is_available: false,
    unmet_requirements: sceneUnlockAvailability.blocked_unlocks.flatMap(
      (entry) => entry.availability.unmet_requirements
    ),
  };
}

function decorateScene(scene, conditionContext, currentSceneId, sceneUnlockAvailability = null) {
  const availability = combineAvailability(
    evaluateNarrativeConditions(scene.entry_conditions_json, conditionContext),
    mapSceneUnlockAvailabilityToAvailability(sceneUnlockAvailability)
  );

  return {
    ...scene,
    is_current_scene: scene.id === currentSceneId,
    scene_unlocks:
      sceneUnlockAvailability ?? {
        is_unlocked: true,
        available_unlocks: [],
        blocked_unlocks: [],
      },
    availability,
  };
}

function groupLatestInteractionResults(rows) {
  const latestResults = new Map();

  for (const row of rows.map(mapInteractionResultRow)) {
    if (!latestResults.has(row.interaction_id)) {
      latestResults.set(row.interaction_id, row);
    }
  }

  return latestResults;
}

async function buildSceneView(scene, context, stateContext, executor = { query }) {
  if (!scene) {
    return null;
  }

  const conditionContext = buildConditionContext(context, stateContext);
  const transitionResult = await executor.query(selectSceneTransitionsByFromSceneQuery, [scene.id]);
  const npcResult = await executor.query(selectSceneNpcsBySceneQuery, [
    scene.id,
    context.campaign_id,
  ]);
  const interactionResult = await executor.query(selectSceneInteractionsBySceneQuery, [scene.id]);
  const interactionHistoryResult = await executor.query(
    selectInteractionResultsBySceneAndCharacterQuery,
    [context.campaign_id, context.character_id, scene.id]
  );
  const historyResult = await executor.query(selectCharacterSceneHistoryQuery, [
    context.campaign_id,
    context.character_id,
    10,
  ]);
  const sceneUnlockAvailabilityMap = await getSceneUnlockAvailabilityForScenes(
    context.campaign_id,
    context.character_id,
    [scene.id, ...transitionResult.rows.map((row) => Number(row.to_scene_id))],
    executor,
    stateContext
  );

  const latestResults = groupLatestInteractionResults(interactionHistoryResult.rows);
  const sceneAvailability = combineAvailability(
    evaluateNarrativeConditions(scene.entry_conditions_json, conditionContext),
    mapSceneUnlockAvailabilityToAvailability(sceneUnlockAvailabilityMap.get(scene.id) ?? null)
  );

  const transitions = transitionResult.rows.map(mapTransitionRow).map((transition) => {
    const transitionAvailability = evaluateNarrativeConditions(
      transition.conditions_json,
      conditionContext
    );
    const targetSceneAvailability = evaluateNarrativeConditions(
      transition.to_scene.entry_conditions_json,
      conditionContext
    );
    const targetSceneUnlockAvailability =
      sceneUnlockAvailabilityMap.get(transition.to_scene.id) ?? null;

    return {
      ...transition,
      recommendation: evaluateNarrativeRecommendation(
        transition.recommendation_json,
        context.character.alignment?.abbreviation ?? null
      ),
      scene_unlocks:
        targetSceneUnlockAvailability ?? {
          is_unlocked: true,
          available_unlocks: [],
          blocked_unlocks: [],
        },
      availability: combineAvailability(
        transitionAvailability,
        targetSceneAvailability,
        mapSceneUnlockAvailabilityToAvailability(targetSceneUnlockAvailability)
      ),
    };
  });

  const npcs = npcResult.rows.map(mapNpcRow).map((npc) => ({
    ...npc,
    availability: evaluateNarrativeConditions(
      npc.availability_conditions_json,
      conditionContext
    ),
  }));

  const interactions = interactionResult.rows.map(mapInteractionRow).map((interaction) => {
    const availability = evaluateNarrativeConditions(
      interaction.availability_conditions_json,
      conditionContext
    );
    const latestResult = latestResults.get(interaction.id) || null;
    const finalAvailability =
      !interaction.is_repeatable && latestResult
        ? {
            is_available: false,
            unmet_requirements: ['This interaction has already been resolved for this character'],
          }
        : availability;

    return {
      ...interaction,
      availability: finalAvailability,
      latest_result: latestResult,
    };
  });

  return {
    ...decorateScene(
      scene,
      conditionContext,
      context.current_scene_id,
      sceneUnlockAvailabilityMap.get(scene.id) ?? null
    ),
    availability: sceneAvailability,
    npcs,
    interactions,
    transitions,
    recent_history: historyResult.rows.map(mapSceneHistoryRow),
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

async function recordCampaignLog(entry, executor) {
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

async function resolveSceneTransition(currentSceneId, input, executor) {
  if (input.transition_id !== undefined && input.transition_id !== null) {
    const result = await executor.query(selectSceneTransitionByIdQuery, [input.transition_id]);
    return mapTransitionRow(result.rows[0] || null);
  }

  if (input.transition_key) {
    const result = await executor.query(selectSceneTransitionByFromSceneAndKeyQuery, [
      currentSceneId,
      input.transition_key,
    ]);
    return mapTransitionRow(result.rows[0] || null);
  }

  throw createHttpError('Provide transition_id or transition_key', 400);
}

async function resolveInteraction(currentSceneId, input, executor) {
  if (input.interaction_id !== undefined && input.interaction_id !== null) {
    const result = await executor.query(selectSceneInteractionByIdQuery, [input.interaction_id]);
    return mapInteractionRow(result.rows[0] || null);
  }

  if (input.interaction_key) {
    const result = await executor.query(selectSceneInteractionBySceneAndKeyQuery, [
      currentSceneId,
      input.interaction_key,
    ]);
    return mapInteractionRow(result.rows[0] || null);
  }

  throw createHttpError('Provide interaction_id or interaction_key', 400);
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

async function applyInteractionEffects({
  campaignId,
  characterId,
  interaction,
  effectPayload,
  actorAccountId,
  executor,
}) {
  return applyAdventureOutcome(
    {
      campaignId,
      characterId,
      effectPayload,
      actorAccountId: actorAccountId ?? null,
      sourceType: 'narrative',
      sourceEntityId: interaction.id,
      sourceKey: `interaction:${interaction.interaction_key}`,
    },
    executor
  );
}

async function recordSceneChange({
  campaignId,
  characterId,
  actorAccountId,
  fromScene,
  toScene,
  transition,
  reason,
  executor,
}) {
  await executor.query(insertCharacterSceneHistoryQuery, [
    campaignId,
    characterId,
    fromScene?.id ?? null,
    toScene.id,
    transition?.id ?? null,
    transition?.transition_key ?? null,
    reason,
    actorAccountId ?? null,
  ]);

  await recordCampaignLog(
    {
      campaign_id: campaignId,
      character_id: characterId,
      actor_account_id: actorAccountId ?? null,
      log_type: transition ? 'scene_moved' : 'scene_entered',
      message: transition
        ? `Moved from ${fromScene?.name ?? 'nowhere'} to ${toScene.name}.`
        : `Entered ${toScene.name}.`,
      data_json: {
        from_scene: fromScene ? { id: fromScene.id, key: fromScene.key, name: fromScene.name } : null,
        to_scene: { id: toScene.id, key: toScene.key, name: toScene.name },
        transition: transition
          ? {
              id: transition.id,
              transition_key: transition.transition_key,
              label: transition.label,
            }
          : null,
        reason,
      },
    },
    executor
  );

  await recordGameplayHistory(
    {
      character_id: characterId,
      actor_account_id: actorAccountId ?? null,
      source_type: 'narrative',
      source_entity_id: transition?.id ?? toScene.id,
      action_key: transition ? 'scene_move' : 'scene_enter',
      summary: transition
        ? `Moved to ${toScene.name} via ${transition.label}.`
        : `Entered ${toScene.name}.`,
      input_json: {
        campaign_id: campaignId,
        from_scene_id: fromScene?.id ?? null,
        to_scene_id: toScene.id,
        transition_id: transition?.id ?? null,
      },
      result_json: {
        from_scene: fromScene ? { id: fromScene.id, key: fromScene.key, name: fromScene.name } : null,
        to_scene: { id: toScene.id, key: toScene.key, name: toScene.name },
        current_scene_entered_at: new Date().toISOString(),
      },
      xp_delta: 0,
    },
    executor
  );
}

async function getSceneInternal(campaignId, characterId, executor = { query }) {
  const context = await getNarrativeContext(campaignId, characterId, executor);
  assertMembership(context);
  const stateContext = await buildNarrativeStateContext(campaignId, characterId, executor);
  const conditionContext = buildConditionContext(context, stateContext);

  if (context.current_scene_id === null) {
    const startingResult = await executor.query(selectStartingScenesQuery, [
      context.campaign.world_id ?? null,
    ]);
    const startingSceneRows = startingResult.rows.map(mapSceneRow);
    const startingSceneUnlocks = await getSceneUnlockAvailabilityForScenes(
      campaignId,
      characterId,
      startingSceneRows.map((scene) => scene.id),
      executor,
      stateContext
    );
    const startingScenes = startingResult.rows
      .map(mapSceneRow)
      .map((scene) =>
        decorateScene(scene, conditionContext, null, startingSceneUnlocks.get(scene.id) ?? null)
      );

    return {
      campaign_id: campaignId,
      character_id: characterId,
      current_scene: null,
      available_starting_scenes: startingScenes.filter(
        (scene) => scene.availability.is_available
      ),
      flags: {
        campaign: stateContext.campaign_flags,
        character: stateContext.character_flags,
      },
      quests: stateContext.quests,
    };
  }

  const currentScene = await getSceneById(context.current_scene_id, executor);
  const sceneView = await buildSceneView(currentScene, context, stateContext, executor);

  return {
    campaign_id: campaignId,
    character_id: characterId,
    current_scene: sceneView,
    flags: {
      campaign: stateContext.campaign_flags,
      character: stateContext.character_flags,
    },
    quests: stateContext.quests,
  };
}

export async function listCampaignScenes(campaignId, characterId) {
  const context = await getNarrativeContext(campaignId, characterId);
  assertMembership(context);
  const stateContext = await buildNarrativeStateContext(campaignId, characterId);
  const conditionContext = buildConditionContext(context, stateContext);
  const result = await query(selectCampaignScenesQuery, [context.campaign.world_id ?? null]);
  const scenes = result.rows.map(mapSceneRow);
  const sceneUnlocks = await getSceneUnlockAvailabilityForScenes(
    campaignId,
    characterId,
    scenes.map((scene) => scene.id),
    { query },
    stateContext
  );

  return {
    campaign_id: campaignId,
    character_id: characterId,
    current_scene_id: context.current_scene_id,
    scenes: scenes.map((scene) =>
      decorateScene(
        scene,
        conditionContext,
        context.current_scene_id,
        sceneUnlocks.get(scene.id) ?? null
      )
    ),
  };
}

export async function getCharacterScene(campaignId, characterId) {
  return getSceneInternal(campaignId, characterId);
}

export async function enterCharacterScene(campaignId, characterId, input) {
  return withTransaction(async (client) => {
    const context = await getNarrativeContext(campaignId, characterId, client, { forUpdate: true });
    assertNarrativeWriteAllowed(context);

    if (context.current_scene_id !== null) {
      throw createHttpError('Character already has a current scene in this campaign', 409);
    }

    const stateContext = await buildNarrativeStateContext(campaignId, characterId, client);
    const conditionContext = buildConditionContext(context, stateContext);
    let targetScene = await getSceneTarget(input, client);

    if (!targetScene) {
      const startingResult = await client.query(selectStartingScenesQuery, [
        context.campaign.world_id ?? null,
      ]);
      const startingSceneRows = startingResult.rows.map(mapSceneRow);
      const startingSceneUnlocks = await getSceneUnlockAvailabilityForScenes(
        campaignId,
        characterId,
        startingSceneRows.map((scene) => scene.id),
        client,
        stateContext
      );
      targetScene = startingResult.rows
        .map(mapSceneRow)
        .find(
          (scene) =>
            decorateScene(
              scene,
              conditionContext,
              null,
              startingSceneUnlocks.get(scene.id) ?? null
            ).availability.is_available
        );
    }

    if (!targetScene) {
      throw createHttpError('No starting scene is currently available for this character', 409);
    }

    const sceneAvailability = evaluateNarrativeConditions(
      targetScene.entry_conditions_json,
      conditionContext
    );
    const sceneUnlocks = await getSceneUnlockAvailabilityForScenes(
      campaignId,
      characterId,
      [targetScene.id],
      client,
      stateContext
    );
    const combinedSceneAvailability = combineAvailability(
      sceneAvailability,
      mapSceneUnlockAvailabilityToAvailability(sceneUnlocks.get(targetScene.id) ?? null)
    );

    if (!combinedSceneAvailability.is_available) {
      throw createHttpError('That scene is not currently available to enter', 409);
    }

    await client.query(updateCampaignCharacterCurrentSceneQuery, [
      campaignId,
      characterId,
      targetScene.id,
    ]);

    await recordSceneChange({
      campaignId,
      characterId,
      actorAccountId: input.actor_account_id ?? null,
      fromScene: null,
      toScene: targetScene,
      transition: null,
      reason: 'entered_starting_scene',
      executor: client,
    });

    const triggeredDialogueSessions = await triggerSceneEntryDialogues(
      campaignId,
      characterId,
      {
        actor_account_id: input.actor_account_id ?? null,
      },
      client
    );
    const sceneState = await getSceneInternal(campaignId, characterId, client);

    return {
      ...sceneState,
      triggered_dialogue_sessions: triggeredDialogueSessions,
    };
  });
}

export async function moveCharacterScene(campaignId, characterId, input) {
  return withTransaction(async (client) => {
    const context = await getNarrativeContext(campaignId, characterId, client, { forUpdate: true });
    assertNarrativeWriteAllowed(context);

    if (context.current_scene_id === null) {
      throw createHttpError('Character must enter a starting scene before moving', 409);
    }

    const currentScene = await getSceneById(context.current_scene_id, client);
    const transition = await resolveSceneTransition(context.current_scene_id, input, client);

    if (!transition || transition.from_scene_id !== context.current_scene_id) {
      throw createHttpError('That transition is not available from the current scene', 404);
    }

    const stateContext = await buildNarrativeStateContext(campaignId, characterId, client);
    const conditionContext = buildConditionContext(context, stateContext);
    const transitionAvailability = evaluateNarrativeConditions(
      transition.conditions_json,
      conditionContext
    );
    const targetScene = await getSceneById(transition.to_scene_id, client);
    const targetSceneAvailability = evaluateNarrativeConditions(
      targetScene.entry_conditions_json,
      conditionContext
    );
    const sceneUnlocks = await getSceneUnlockAvailabilityForScenes(
      campaignId,
      characterId,
      [targetScene.id],
      client,
      stateContext
    );
    const combinedAvailability = combineAvailability(
      transitionAvailability,
      targetSceneAvailability,
      mapSceneUnlockAvailabilityToAvailability(sceneUnlocks.get(targetScene.id) ?? null)
    );

    if (!combinedAvailability.is_available) {
      throw createHttpError('That transition is currently blocked by narrative state', 409);
    }

    await client.query(updateCampaignCharacterCurrentSceneQuery, [
      campaignId,
      characterId,
      targetScene.id,
    ]);

    await recordSceneChange({
      campaignId,
      characterId,
      actorAccountId: input.actor_account_id ?? null,
      fromScene: currentScene,
      toScene: targetScene,
      transition,
      reason: transition.transition_key,
      executor: client,
    });

    const triggeredDialogueSessions = await triggerSceneEntryDialogues(
      campaignId,
      characterId,
      {
        actor_account_id: input.actor_account_id ?? null,
      },
      client
    );
    const sceneState = await getSceneInternal(campaignId, characterId, client);

    return {
      ...sceneState,
      triggered_dialogue_sessions: triggeredDialogueSessions,
    };
  });
}

export async function listCurrentSceneNpcs(campaignId, characterId) {
  const sceneState = await getSceneInternal(campaignId, characterId);

  return {
    campaign_id: campaignId,
    character_id: characterId,
    current_scene: sceneState.current_scene
      ? {
          id: sceneState.current_scene.id,
          key: sceneState.current_scene.key,
          name: sceneState.current_scene.name,
        }
      : null,
    npcs: sceneState.current_scene?.npcs ?? [],
  };
}

export async function attemptSceneInteraction(campaignId, characterId, input) {
  return withTransaction(async (client) => {
    const context = await getNarrativeContext(campaignId, characterId, client, { forUpdate: true });
    assertNarrativeWriteAllowed(context);

    if (context.current_scene_id === null) {
      throw createHttpError('Character must be in a scene before interacting', 409);
    }

    const stateContext = await buildNarrativeStateContext(campaignId, characterId, client);
    const conditionContext = buildConditionContext(context, stateContext);
    const interaction = await resolveInteraction(context.current_scene_id, input, client);

    if (!interaction || interaction.scene_id !== context.current_scene_id) {
      throw createHttpError('That interaction is not available in the current scene', 404);
    }

    const availability = evaluateNarrativeConditions(
      interaction.availability_conditions_json,
      conditionContext
    );

    if (!availability.is_available) {
      throw createHttpError('That interaction is currently unavailable', 409);
    }

    if (!interaction.is_repeatable) {
      const priorResult = await client.query(selectInteractionResultByInteractionAndCharacterQuery, [
        interaction.id,
        campaignId,
        characterId,
      ]);

      if (priorResult.rows[0]) {
        throw createHttpError('This interaction has already been resolved for this character', 409);
      }
    }

    const characterRules = await getCharacterRules(characterId);

    if (!characterRules) {
      throw createHttpError('Character not found', 404);
    }

    const check = resolveSceneInteractionSkillCheck(interaction, characterRules, {
      roll: normalizeOptionalRoll(input.roll),
    });
    const effectPayload = check.was_success
      ? interaction.success_effects_json
      : interaction.failure_effects_json;
    const appliedEffects = await applyInteractionEffects({
      campaignId,
      characterId,
      interaction,
      effectPayload,
      actorAccountId: input.actor_account_id ?? null,
      executor: client,
    });
    const summary =
      (check.was_success ? interaction.success_text : interaction.failure_text) ??
      `${interaction.label} ${check.was_success ? 'succeeds' : 'fails'}.`;

    const interactionResult = await client.query(insertInteractionResultQuery, [
      interaction.id,
      campaignId,
      characterId,
      interaction.npc_id,
      input.actor_account_id ?? null,
      interaction.skill?.id ?? null,
      interaction.difficulty_class,
      check.roll_value,
      check.skill_modifier,
      check.total_value,
      check.was_success,
      summary,
      JSON.stringify(appliedEffects),
    ]);
    const mappedResult = mapInteractionResultRow(interactionResult.rows[0]);

    await recordCampaignLog(
      {
        campaign_id: campaignId,
        character_id: characterId,
        actor_account_id: input.actor_account_id ?? null,
        log_type: 'interaction_attempted',
        message: `${interaction.label}: ${check.was_success ? 'success' : 'failure'}.`,
        data_json: {
          interaction_id: interaction.id,
          interaction_key: interaction.interaction_key,
          roll_value: check.roll_value,
          skill_modifier: check.skill_modifier,
          total_value: check.total_value,
          difficulty_class: check.difficulty_class,
          was_success: check.was_success,
          applied_effects: appliedEffects,
        },
      },
      client
    );

    await recordGameplayHistory(
      {
        character_id: characterId,
        actor_account_id: input.actor_account_id ?? null,
        source_type: 'narrative',
        source_entity_id: interaction.id,
        action_key: 'scene_interaction',
        summary,
        input_json: {
          campaign_id: campaignId,
          scene_id: context.current_scene_id,
          interaction_id: interaction.id,
          interaction_key: interaction.interaction_key,
          roll: check.roll_value,
        },
        result_json: {
          interaction: {
            id: interaction.id,
            interaction_key: interaction.interaction_key,
            label: interaction.label,
          },
          check,
          applied_effects: appliedEffects,
        },
        xp_delta: Number(appliedEffects.progression?.amount_granted ?? 0),
      },
      client
    );

    return {
      campaign_id: campaignId,
      character_id: characterId,
      scene_id: context.current_scene_id,
      interaction: {
        id: interaction.id,
        interaction_key: interaction.interaction_key,
        label: interaction.label,
        npc: interaction.npc,
      },
      check,
      result: mappedResult,
      applied_effects: appliedEffects,
    };
  });
}

export async function listCharacterNarrativeQuests(campaignId, characterId) {
  const context = await getNarrativeContext(campaignId, characterId);
  assertMembership(context);
  const quests = await listNarrativeQuestsInternal(campaignId, characterId);

  return {
    campaign_id: campaignId,
    character_id: characterId,
    quests: quests.quests,
  };
}

export async function listCharacterNarrativeFlags(campaignId, characterId) {
  const context = await getNarrativeContext(campaignId, characterId);
  assertMembership(context);
  const flags = await listNarrativeFlagsInternal(campaignId, characterId);

  return {
    campaign_id: campaignId,
    character_id: characterId,
    campaign_flags: flags.campaign_flags,
    character_flags: flags.character_flags,
  };
}

export async function listCampaignLogs(campaignId, limit = 25, offset = 0) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedOffset = normalizeOffset(offset);
  const result = await query(selectCampaignLogsQuery, [
    campaignId,
    normalizedLimit,
    normalizedOffset,
  ]);

  return {
    campaign_id: campaignId,
    limit: normalizedLimit,
    offset: normalizedOffset,
    items: result.rows.map(mapCampaignLogRow),
  };
}
