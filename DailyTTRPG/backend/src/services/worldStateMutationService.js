import { withTransaction } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { grantKnowledge } from './characterKnowledgeService.js';
import { ensureLivingWorldSchema } from './livingWorldSchema.js';
import { ensureNpcPresenceSchema } from './npcPresenceSchema.js';
import {
  setAffordanceState,
  setEntityState,
  setLocationState,
  setSceneState,
} from './worldStateService.js';

function json(value) {
  return JSON.stringify(value ?? {});
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function resolveSceneId(sceneIdOrKey, executor) {
  if (Number.isInteger(Number(sceneIdOrKey))) {
    return Number(sceneIdOrKey);
  }

  const result = await executor.query('SELECT id FROM dnd5e_scene WHERE key = $1 LIMIT 1', [
    sceneIdOrKey,
  ]);
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

async function resolveLocationId(locationIdOrKey, executor) {
  if (!locationIdOrKey) {
    return null;
  }

  if (Number.isInteger(Number(locationIdOrKey))) {
    return Number(locationIdOrKey);
  }

  const result = await executor.query('SELECT id FROM dnd5e_location WHERE key = $1 LIMIT 1', [
    locationIdOrKey,
  ]);
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

async function createWorldEvent(
  {
    worldInstanceId,
    campaignId = null,
    characterId = null,
    eventType = 'interaction_resolved',
    sceneId = null,
    locationId = null,
    interactionId = null,
    payload = {},
    stateChanges = [],
    createdByKind = 'system',
    createdByAccountId = null,
    metadata = {},
  },
  executor
) {
  const result = await executor.query(
    `
      INSERT INTO dnd5e_world_event (
        world_instance_id,
        campaign_id,
        actor_character_id,
        event_type,
        scene_id,
        location_id,
        interaction_id,
        event_payload_json,
        state_changes_json,
        knowledge_granted_json,
        created_by_kind,
        created_by_account_id,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, '[]'::jsonb, $10, $11, $12::jsonb)
      RETURNING *
    `,
    [
      worldInstanceId,
      campaignId,
      characterId,
      eventType,
      sceneId,
      locationId,
      interactionId,
      json(payload),
      json(stateChanges),
      createdByKind,
      createdByAccountId,
      json(metadata),
    ]
  );

  return result.rows[0];
}

async function applyStateChange(change, context, executor) {
  const field = change.field ?? 'state';
  const value = change.value ?? change.patch ?? true;
  const targetType = change.target_type;

  if (targetType === 'affordance') {
    const targetSceneId = await resolveSceneId(change.scene_id ?? context.sceneId, executor);
    if (!targetSceneId) {
      throw createHttpError(`Unable to resolve scene for affordance state change "${change.target_id}"`, 400);
    }

    const row = await setAffordanceState(
      {
        worldInstanceId: context.worldInstanceId,
        campaignId: change.campaign_scoped ? context.campaignId : null,
        sceneId: targetSceneId,
        affordanceKey: change.target_id,
        actionKey: change.action_key ?? null,
        state: field === 'state' ? value : (change.state ?? 'available'),
        characterId: context.characterId,
        sourceEventId: context.eventId,
        patch: field === 'state' ? (change.metadata ?? {}) : { [field]: value },
        incrementTimesUsed: Boolean(change.increment_times_used),
      },
      executor
    );

    return {
      target_type: 'affordance',
      target_id: change.target_id,
      scene_id: String(targetSceneId),
      to: row.state,
    };
  }

  if (targetType === 'scene') {
    const targetSceneId = await resolveSceneId(change.target_id ?? context.sceneId, executor);
    if (!targetSceneId) {
      throw createHttpError(`Unable to resolve scene state change "${change.target_id}"`, 400);
    }

    const row = await setSceneState(
      {
        worldInstanceId: context.worldInstanceId,
        campaignId: change.campaign_scoped ? context.campaignId : null,
        sceneId: targetSceneId,
        patch: { [field]: value },
      },
      executor
    );

    return {
      target_type: 'scene',
      target_id: String(targetSceneId),
      state_json: row.state_json,
    };
  }

  if (targetType === 'location') {
    const targetLocationId = await resolveLocationId(change.target_id ?? context.locationId, executor);
    if (!targetLocationId) {
      throw createHttpError(`Unable to resolve location state change "${change.target_id}"`, 400);
    }

    const row = await setLocationState(
      {
        worldInstanceId: context.worldInstanceId,
        locationId: targetLocationId,
        patch: { [field]: value },
      },
      executor
    );

    return {
      target_type: 'location',
      target_id: String(targetLocationId),
      state_json: row.state_json,
    };
  }

  if (targetType === 'entity') {
    const row = await setEntityState(
      {
        worldInstanceId: context.worldInstanceId,
        entityKey: change.target_id,
        entityType: change.entity_type ?? 'npc',
        locationId: await resolveLocationId(change.location_id, executor),
        status: field === 'status' ? value : (change.status ?? 'active'),
        patch: field === 'status' ? (change.metadata ?? {}) : { [field]: value },
      },
      executor
    );

    return {
      target_type: 'entity',
      target_id: change.target_id,
      status: row.status,
      state_json: row.state_json,
    };
  }

  throw createHttpError(`Unsupported state change target_type "${targetType}"`, 400);
}

export async function applyInteractionResultMutation({
  worldInstanceId,
  campaignId = null,
  characterId,
  sceneId,
  locationId = null,
  interactionId = null,
  interactionKey = null,
  resultBand,
  checkTotal = null,
  createdByKind = 'system',
  createdByAccountId = null,
  metadata = {},
}) {
  await ensureLivingWorldSchema();

  const stateChanges = normalizeArray(resultBand?.state_changes);
  const knowledgeGrants = normalizeArray(resultBand?.knowledge_grants);

  return withTransaction(async (client) => {
    const event = await createWorldEvent(
      {
        worldInstanceId,
        campaignId,
        characterId,
        eventType: 'interaction_resolved',
        sceneId,
        locationId,
        interactionId,
        payload: {
          interaction_key: interactionKey,
          result_band: resultBand?.band,
          result_text: resultBand?.text,
          check_total: checkTotal,
        },
        stateChanges,
        createdByKind,
        createdByAccountId,
        metadata,
      },
      client
    );

    const context = {
      worldInstanceId,
      campaignId,
      characterId,
      sceneId,
      locationId,
      interactionId,
      eventId: event.id,
    };

    const appliedStateChanges = [];
    for (const change of stateChanges) {
      appliedStateChanges.push(await applyStateChange(change, context, client));
    }

    const grantedKnowledge = [];
    for (const knowledgeId of knowledgeGrants) {
      const granted = await grantKnowledge(
        {
          characterId,
          worldInstanceId,
          campaignId,
          knowledgeId,
          sourceEventId: event.id,
          confidence: resultBand?.confidence ?? 'observed',
          metadata: {
            source_interaction_id: interactionId,
            source_interaction_key: interactionKey,
            result_band: resultBand?.band,
          },
        },
        client
      );
      grantedKnowledge.push(granted);
    }

    await client.query(
      `
        UPDATE dnd5e_world_event
        SET
          state_changes_json = $2::jsonb,
          knowledge_granted_json = $3::jsonb
        WHERE id = $1
      `,
      [
        event.id,
        json(appliedStateChanges),
        json(grantedKnowledge.map((entry) => entry.knowledge_id)),
      ]
    );

    return {
      events_created: [String(event.id)],
      knowledge_granted: grantedKnowledge.map((entry) => entry.knowledge_id),
      affordance_updates: appliedStateChanges.filter((change) => change.target_type === 'affordance'),
      scene_state_updates: appliedStateChanges.filter((change) => change.target_type === 'scene'),
      location_state_updates: appliedStateChanges.filter((change) => change.target_type === 'location'),
      entity_state_updates: appliedStateChanges.filter((change) => change.target_type === 'entity'),
      event_id: String(event.id),
    };
  });
}

export async function applyNpcStateMutation({
  worldInstanceId,
  campaignId = null,
  characterId = null,
  entityKey,
  entityType = 'npc',
  worldEntityId = null,
  locationId = null,
  sceneId = null,
  status = 'active',
  patch = {},
  reason = null,
  createdByKind = 'system',
  createdByAccountId = null,
  metadata = {},
}) {
  await ensureNpcPresenceSchema();

  if (!worldInstanceId || !entityKey) {
    throw createHttpError('worldInstanceId and entityKey are required for NPC state mutation', 400);
  }

  return withTransaction(async (client) => {
    const stateRow = await setEntityState(
      {
        worldInstanceId,
        entityKey,
        entityType,
        worldEntityId,
        locationId,
        status,
        patch,
      },
      client
    );
    const stateChange = {
      target_type: 'entity',
      target_id: entityKey,
      status: stateRow.status,
      location_id: stateRow.location_id ? String(stateRow.location_id) : null,
      state_json: stateRow.state_json ?? {},
    };
    const event = await createWorldEvent(
      {
        worldInstanceId,
        campaignId,
        characterId,
        eventType: 'npc_state_changed',
        sceneId,
        locationId,
        payload: {
          entity_key: entityKey,
          reason,
          patch,
          status,
        },
        stateChanges: [stateChange],
        createdByKind,
        createdByAccountId,
        metadata: {
          ...metadata,
          npc_presence_stage: '5j3',
        },
      },
      client
    );

    return {
      event_id: String(event.id),
      events_created: [String(event.id)],
      entity_state_update: stateChange,
      state: stateRow,
    };
  });
}
