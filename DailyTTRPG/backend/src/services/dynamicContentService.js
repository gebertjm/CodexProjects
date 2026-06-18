import { query, withTransaction } from '../config/db.js';
import {
  selectCharacterKnowledgeKeysQuery,
  selectContentHooksForContextQuery,
  selectWorldEntitiesForContextQuery,
} from '../db/queries/dynamicContent.js';
import {
  evaluateDynamicConditions,
  isEmptyEffectPayload,
  shapeHookFeedback,
  STANDARD_HOOK_POINTS,
  summarizeReevaluation,
} from '../engine/dynamicContent/dynamicContentEngine.js';
import { createHttpError } from '../utils/httpError.js';
import { createEventInstance } from './eventService.js';
import { getCharacterScene } from './narrativeService.js';
import {
  assertMembership,
  assertNarrativeWriteAllowed,
  buildConditionContext,
  buildNarrativeStateContext,
  getNarrativeContext,
  recordCampaignLog,
} from './narrativeStateService.js';
import { applyAdventureOutcome } from './adventureProgressionService.js';

function normalizePositiveInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(`${label} must be a positive integer`, 400);
  }

  return parsed;
}

function normalizeOptionalHookPoint(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim();

  if (!STANDARD_HOOK_POINTS.includes(normalized)) {
    throw createHttpError(
      `hook_point must be one of: ${STANDARD_HOOK_POINTS.join(', ')}`,
      400
    );
  }

  return normalized;
}

function normalizeMode(value) {
  const normalized = String(value ?? 'player').trim().toLowerCase() || 'player';

  if (normalized === 'gm' || normalized === 'debug') {
    return 'full';
  }

  if (!['minimal', 'player', 'full'].includes(normalized)) {
    throw createHttpError('mode must be minimal, player, or full', 400);
  }

  return normalized;
}

function mapHookRow(row) {
  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    npc_id: row.npc_id !== null ? Number(row.npc_id) : null,
    hook_key: row.hook_key,
    hook_point: row.hook_point,
    scope_type: row.scope_type,
    scope_key: row.scope_key,
    label: row.label,
    description: row.description,
    conditions_json: row.conditions_json ?? {},
    effects_json: row.effects_json ?? {},
    event_triggers_json: row.event_triggers_json ?? [],
    feedback_json: row.feedback_json ?? {},
    priority: Number(row.priority ?? 0),
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
          }
        : null,
  };
}

function mapEntityRow(row) {
  return {
    id: Number(row.id),
    entity_key: row.entity_key,
    entity_type: row.entity_type,
    status: row.status,
    disposition: row.disposition,
    faction: row.faction,
    state_json: row.state_json ?? {},
    current_region_id: row.current_region_id !== null ? Number(row.current_region_id) : null,
    current_location_id: row.current_location_id !== null ? Number(row.current_location_id) : null,
    current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
    npc_key: row.npc_key,
    monster_key: row.monster_key,
  };
}

function buildKnowledgeSet(rows) {
  return new Set(
    rows
      .map((row) => `${row.knowledge_type}:${row.knowledge_key}`)
      .filter((entry) => entry !== ':')
  );
}

function buildEntityMap(entities) {
  const map = new Map();

  for (const entity of entities) {
    map.set(entity.entity_key, entity);

    if (entity.npc_key) {
      map.set(entity.npc_key, entity);
    }

    if (entity.monster_key) {
      map.set(entity.monster_key, entity);
    }
  }

  return map;
}

function buildSceneStateMap(sceneState) {
  const map = new Map();
  const scene = sceneState?.current_scene ?? null;

  if (scene) {
    map.set(scene.key, {
      id: scene.id,
      key: scene.key,
      name: scene.name,
      is_current: true,
      is_available: true,
      location: scene.location,
    });
  }

  for (const sceneEntry of sceneState?.available_starting_scenes ?? []) {
    map.set(sceneEntry.key, {
      id: sceneEntry.id,
      key: sceneEntry.key,
      name: sceneEntry.name,
      is_current: false,
      is_available: true,
    });
  }

  return map;
}

function buildLocationStateMap(sceneState) {
  const map = new Map();
  const location = sceneState?.current_scene?.location ?? null;

  if (location) {
    map.set(location.key, {
      ...location,
      is_current: true,
      is_available: true,
    });
  }

  return map;
}

function summarizeVisibleScene(sceneState) {
  const scene = sceneState?.current_scene ?? null;

  if (!scene) {
    return {
      current_scene: null,
      visible_interactions: [],
      visible_transitions: [],
      visible_npcs: [],
    };
  }

  return {
    current_scene: {
      id: scene.id,
      key: scene.key,
      name: scene.name,
      summary: scene.summary,
      location: scene.location,
    },
    visible_interactions: (scene.interactions ?? [])
      .filter((interaction) => interaction.availability?.is_available)
      .map((interaction) => ({
        id: interaction.id,
        key: interaction.interaction_key,
        label: interaction.label,
        description: interaction.description,
      })),
    visible_transitions: (scene.transitions ?? [])
      .filter((transition) => transition.availability?.is_available)
      .map((transition) => ({
        id: transition.id,
        key: transition.transition_key,
        label: transition.label,
        to_scene: transition.to_scene,
      })),
    visible_npcs: (scene.npcs ?? [])
      .filter((npc) => npc.availability?.is_available)
      .map((npc) => ({
        id: npc.id,
        key: npc.key,
        name: npc.name,
        disposition: npc.disposition,
      })),
  };
}

async function loadDynamicRuntimeContext(campaignId, characterId, executor = { query }) {
  const [context, sceneState] = await Promise.all([
    getNarrativeContext(campaignId, characterId, executor),
    getCharacterScene(campaignId, characterId, executor),
  ]);
  assertMembership(context);
  const stateContext = await buildNarrativeStateContext(campaignId, characterId, executor);
  const [knowledgeResult, entityResult] = await Promise.all([
    executor.query(selectCharacterKnowledgeKeysQuery, [campaignId, characterId]),
    executor.query(selectWorldEntitiesForContextQuery, [
      campaignId,
      context.current_scene_id ?? null,
    ]),
  ]);
  const entities = entityResult.rows.map(mapEntityRow);
  const conditionContext = buildConditionContext(context, stateContext, {
    campaign_type: context.campaign.campaign_type,
    campaign_status: context.campaign.status,
    current_scene: sceneState.current_scene ?? null,
    knowledge_set: buildKnowledgeSet(knowledgeResult.rows),
    entity_state_map: buildEntityMap(entities),
    scene_state_map: buildSceneStateMap(sceneState),
    location_state_map: buildLocationStateMap(sceneState),
  });

  return {
    context,
    stateContext,
    sceneState,
    entities,
    conditionContext,
  };
}

async function selectHooks(campaignId, sceneId, hookPoint, executor = { query }) {
  const result = await executor.query(selectContentHooksForContextQuery, [
    campaignId,
    sceneId ?? null,
    hookPoint ?? null,
  ]);
  return result.rows.map(mapHookRow);
}

function evaluateHook(hook, conditionContext, { mode = 'player' } = {}) {
  const availability = evaluateDynamicConditions(hook.conditions_json, conditionContext);

  return {
    ...hook,
    availability,
    feedback: shapeHookFeedback(hook, { visibility: mode }),
  };
}

function shouldRunTrigger(trigger, conditionContext) {
  return evaluateDynamicConditions(trigger.conditions ?? {}, conditionContext);
}

export async function listRuntimeHooks(campaignId, characterId, options = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const mode = normalizeMode(options.mode);
  const hookPoint = normalizeOptionalHookPoint(options.hookPoint ?? options.hook_point);
  const runtime = await loadDynamicRuntimeContext(normalizedCampaignId, normalizedCharacterId);
  const hooks = await selectHooks(
    normalizedCampaignId,
    runtime.context.current_scene_id ?? null,
    hookPoint
  );

  return {
    identity: {
      campaign_id: normalizedCampaignId,
      character_id: normalizedCharacterId,
      campaign_name: runtime.context.campaign.name,
      character_name: runtime.context.character.name,
      current_scene_id: runtime.context.current_scene_id,
    },
    hook_point: hookPoint,
    hooks: hooks.map((hook) => evaluateHook(hook, runtime.conditionContext, { mode })),
  };
}

export async function listDynamicOpportunities(campaignId, characterId, options = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const mode = normalizeMode(options.mode);
  const runtime = await loadDynamicRuntimeContext(normalizedCampaignId, normalizedCharacterId);
  const hooks = await selectHooks(
    normalizedCampaignId,
    runtime.context.current_scene_id ?? null,
    null
  );
  const evaluatedHooks = hooks.map((hook) => evaluateHook(hook, runtime.conditionContext, { mode }));

  return {
    identity: {
      campaign_id: normalizedCampaignId,
      character_id: normalizedCharacterId,
      campaign_name: runtime.context.campaign.name,
      character_name: runtime.context.character.name,
      current_scene_id: runtime.context.current_scene_id,
    },
    scene: summarizeVisibleScene(runtime.sceneState),
    hooks: {
      available: evaluatedHooks.filter((hook) => hook.availability.is_available),
      blocked: mode === 'full' ? evaluatedHooks.filter((hook) => !hook.availability.is_available) : undefined,
    },
    reevaluation: summarizeReevaluation({
      hooks: evaluatedHooks.map((hook) => ({
        was_executed: hook.availability.is_available,
      })),
      sceneState: runtime.sceneState,
    }),
  };
}

export async function executeContentHooks({
  campaignId,
  characterId,
  hookPoint,
  actorAccountId = null,
  source = {},
  mode = 'player',
} = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const normalizedHookPoint = normalizeOptionalHookPoint(hookPoint);
  const normalizedMode = normalizeMode(mode);

  if (!normalizedHookPoint) {
    throw createHttpError('hookPoint is required', 400);
  }

  const executionResult = await withTransaction(async (client) => {
    const runtime = await loadDynamicRuntimeContext(normalizedCampaignId, normalizedCharacterId, client);
    assertNarrativeWriteAllowed(runtime.context);
    const hooks = await selectHooks(
      normalizedCampaignId,
      runtime.context.current_scene_id ?? null,
      normalizedHookPoint,
      client
    );
    const evaluated = hooks.map((hook) =>
      evaluateHook(hook, runtime.conditionContext, { mode: normalizedMode })
    );
    const executions = [];

    for (const hook of evaluated) {
      if (!hook.availability.is_available) {
        executions.push({
          hook_key: hook.hook_key,
          hook_point: hook.hook_point,
          was_executed: false,
          reason: hook.availability.unmet_requirements,
          feedback: hook.feedback,
        });
        continue;
      }

      const appliedEffects = isEmptyEffectPayload(hook.effects_json)
        ? null
        : await applyAdventureOutcome(
            {
              campaignId: normalizedCampaignId,
              characterId: normalizedCharacterId,
              effectPayload: hook.effects_json,
              actorAccountId,
              sourceType: 'content_hook',
              sourceEntityId: hook.id,
              sourceKey: hook.hook_key,
              sourceLabel: hook.label,
            },
            client
          );
      const triggeredEvents = [];

      for (const trigger of hook.event_triggers_json ?? []) {
        const triggerAvailability = shouldRunTrigger(trigger, runtime.conditionContext);

        if (!triggerAvailability.is_available) {
          triggeredEvents.push({
            event_template_key: trigger.event_template_key,
            status: 'skipped',
            reason: triggerAvailability.unmet_requirements,
          });
          continue;
        }

        try {
          const event = await createEventInstance(
            {
              campaign_id: normalizedCampaignId,
              character_id: normalizedCharacterId,
              template_key: trigger.event_template_key,
              created_by_account_id: actorAccountId,
            },
            client
          );
          triggeredEvents.push({
            event_template_key: trigger.event_template_key,
            status: 'created',
            event_id: event.id,
            feedback: trigger.feedback ?? {},
          });
        } catch (error) {
          if (error.statusCode === 409) {
            triggeredEvents.push({
              event_template_key: trigger.event_template_key,
              status: 'skipped',
              reason: [error.message],
            });
            continue;
          }

          throw error;
        }
      }

      await recordCampaignLog(
        {
          campaign_id: normalizedCampaignId,
          character_id: normalizedCharacterId,
          actor_account_id: actorAccountId,
          log_type: 'content_hook_executed',
          message: `Dynamic content hook ${hook.hook_key} executed.`,
          data_json: {
            hook: {
              id: hook.id,
              key: hook.hook_key,
              hook_point: hook.hook_point,
              label: hook.label,
            },
            source,
            applied_effects: appliedEffects,
            triggered_events: triggeredEvents,
          },
        },
        client
      );

      executions.push({
        hook_key: hook.hook_key,
        hook_point: hook.hook_point,
        label: hook.label,
        was_executed: true,
        feedback: hook.feedback,
        applied_effects: appliedEffects,
        triggered_events: triggeredEvents,
      });
    }

    return {
      identity: {
        campaign_id: normalizedCampaignId,
        character_id: normalizedCharacterId,
        campaign_name: runtime.context.campaign.name,
        character_name: runtime.context.character.name,
      },
      hook_point: normalizedHookPoint,
      source,
      hooks: executions,
    };
  });

  const refreshedScene = await getCharacterScene(normalizedCampaignId, normalizedCharacterId);

  return {
    ...executionResult,
    reevaluation: summarizeReevaluation({
      hooks: executionResult.hooks,
      sceneState: refreshedScene,
    }),
    refreshed_scene: summarizeVisibleScene(refreshedScene),
  };
}

export async function triggerTimeBeat(campaignId, characterId, input = {}) {
  return executeContentHooks({
    campaignId,
    characterId,
    hookPoint: 'time_beat',
    actorAccountId: input.actor_account_id ?? null,
    source: {
      type: 'time_beat',
      beat_key: input.beat_key ?? null,
      reason: input.reason ?? null,
    },
    mode: input.mode ?? 'player',
  });
}
