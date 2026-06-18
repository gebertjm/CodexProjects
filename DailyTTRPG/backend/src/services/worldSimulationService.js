import { query, withTransaction } from '../config/db.js';
import {
  insertDefaultActionApplicationQuery,
  insertProgressionWindowParticipantQuery,
  insertProgressionWindowQuery,
  insertProgressionWindowResponseQuery,
  insertPropagationReceiptQuery,
  insertWorldChangeQuery,
  insertWorldEntityEventQuery,
  insertWorldLogQuery,
  selectCampaignLocalPropagationTargetsQuery,
  selectCampaignMembersForWindowQuery,
  selectCampaignMembershipQuery,
  selectCatchupAckQuery,
  selectCatchupWorldChangesQuery,
  selectCharacterWorldKnowledgeQuery,
  selectDefaultActionApplicationsByCharacterQuery,
  selectDiscoverableReceiptsQuery,
  selectGlobalPropagationTargetsQuery,
  selectProgressionWindowByIdQuery,
  selectProgressionWindowForUpdateQuery,
  selectProgressionWindowParticipantsQuery,
  selectProgressionWindowResponsesQuery,
  selectProgressionWindowsQuery,
  selectRegionalPropagationTargetsQuery,
  selectWorldChangesQuery,
  selectWorldEntityEventsQuery,
  selectWorldEntityForUpdateQuery,
  selectWorldFlagsQuery,
  selectWorldPropagationReceiptsQuery,
  selectWorldSimulationCampaignQuery,
  selectWorldSimulationCharacterQuery,
  selectWorldSimulationWorldQuery,
  updateProgressionWindowParticipantDefaultedQuery,
  updateProgressionWindowParticipantRespondedQuery,
  updateProgressionWindowStatusQuery,
  updatePropagationReceiptDiscoveredQuery,
  updateWorldChangePropagationStatusQuery,
  updateWorldEntityProjectionQuery,
  upsertCatchupAckQuery,
  upsertWorldChangeKnowledgeQuery,
  upsertWorldFlagQuery,
} from '../db/queries/worldSimulation.js';
import { getRuntimeContent } from './runtimeContentService.js';
import { recordCampaignLog } from './narrativeStateService.js';
import { recordGameplayHistory } from './gameplayHistoryService.js';
import { createHttpError } from '../utils/httpError.js';

const propagationScopes = new Set(['campaign_local', 'regional', 'global']);
const propagationChannels = new Set(['direct', 'proximity', 'rumor', 'time_delay', 'system']);
const windowScopes = new Set(['solo', 'party', 'campaign', 'world']);

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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw createHttpError(`${label} is required`, 400);
  }

  return normalized;
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePropagationScope(value) {
  const normalized = String(value ?? 'campaign_local').trim();

  if (!propagationScopes.has(normalized)) {
    throw createHttpError('propagation_scope must be campaign_local, regional, or global', 400);
  }

  return normalized;
}

function normalizePropagationChannel(value, fallback = 'system') {
  const normalized = String(value ?? fallback).trim();

  if (!propagationChannels.has(normalized)) {
    throw createHttpError('propagation channel must be direct, proximity, rumor, time_delay, or system', 400);
  }

  return normalized;
}

function normalizeWindowScope(value) {
  const normalized = String(value ?? 'party').trim();

  if (!windowScopes.has(normalized)) {
    throw createHttpError('scope_type must be solo, party, campaign, or world', 400);
  }

  return normalized;
}

function normalizeDate(value, label, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(`${label} must be a valid date/time`, 400);
  }

  return date.toISOString();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function mapWorldChangeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    character_id: row.character_id !== null ? Number(row.character_id) : null,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    change_key: row.change_key,
    change_type: row.change_type,
    propagation_scope: row.propagation_scope,
    propagation_status: row.propagation_status,
    region_id: row.region_id !== null ? Number(row.region_id) : null,
    location_id: row.location_id !== null ? Number(row.location_id) : null,
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    world_entity_id: row.world_entity_id !== null ? Number(row.world_entity_id) : null,
    world_entity_key: row.world_entity_key ?? null,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    title: row.title,
    summary: row.summary,
    narrative_text: row.narrative_text,
    payload_json: row.payload_json ?? {},
    truth_delta_json: row.truth_delta_json ?? {},
    knowledge_policy_json: row.knowledge_policy_json ?? {},
    effective_at: row.effective_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    campaign_name: row.campaign_name ?? null,
    character_name: row.character_name ?? null,
  };
}

function mapWorldFlagRow(row) {
  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    flag_key: row.flag_key,
    flag_value: row.flag_value_json,
    flag_category: row.flag_category,
    metadata_json: row.metadata_json ?? {},
    notes: row.notes,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapWorldEntityRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    entity_key: row.entity_key,
    entity_type: row.entity_type,
    npc_template_id: row.npc_template_id !== null ? Number(row.npc_template_id) : null,
    monster_template_id: row.monster_template_id !== null ? Number(row.monster_template_id) : null,
    current_region_id: row.current_region_id !== null ? Number(row.current_region_id) : null,
    current_location_id: row.current_location_id !== null ? Number(row.current_location_id) : null,
    current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
    status: row.status,
    disposition: row.disposition,
    faction: row.faction,
    state_json: row.state_json ?? {},
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapWorldEntityEventRow(row) {
  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    world_entity_id: Number(row.world_entity_id),
    world_change_id: row.world_change_id !== null ? Number(row.world_change_id) : null,
    event_type: row.event_type,
    from_region_id: row.from_region_id !== null ? Number(row.from_region_id) : null,
    from_location_id: row.from_location_id !== null ? Number(row.from_location_id) : null,
    from_scene_id: row.from_scene_id !== null ? Number(row.from_scene_id) : null,
    to_region_id: row.to_region_id !== null ? Number(row.to_region_id) : null,
    to_location_id: row.to_location_id !== null ? Number(row.to_location_id) : null,
    to_scene_id: row.to_scene_id !== null ? Number(row.to_scene_id) : null,
    from_status: row.from_status,
    to_status: row.to_status,
    from_disposition: row.from_disposition,
    to_disposition: row.to_disposition,
    state_delta_json: row.state_delta_json ?? {},
    summary: row.summary,
    created_at: row.created_at,
  };
}

function mapReceiptRow(row) {
  return {
    id: Number(row.id),
    world_change_id: Number(row.world_change_id),
    world_id: row.world_id !== undefined ? Number(row.world_id) : undefined,
    campaign_id: Number(row.campaign_id),
    character_id: row.character_id !== null ? Number(row.character_id) : null,
    propagation_channel: row.propagation_channel,
    knowledge_status: row.knowledge_status,
    available_at: row.available_at,
    discovered_at: row.discovered_at,
    summary: row.summary,
    metadata_json: row.metadata_json ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    change_key: row.change_key,
    title: row.title,
    change_summary: row.change_summary,
    propagation_scope: row.propagation_scope,
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

function mapProgressionWindowRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    scene_id: row.scene_id !== null ? Number(row.scene_id) : null,
    window_key: row.window_key,
    scope_type: row.scope_type,
    status: row.status,
    prompt_text: row.prompt_text,
    opened_at: row.opened_at,
    threshold_at: row.threshold_at,
    resolves_at: row.resolves_at,
    resolved_at: row.resolved_at,
    threshold_policy_json: row.threshold_policy_json ?? {},
    default_policy_json: row.default_policy_json ?? {},
    resolution_summary: row.resolution_summary,
    source_type: row.source_type,
    source_entity_id: row.source_entity_id !== null ? Number(row.source_entity_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    threshold_reached: Date.now() >= new Date(row.threshold_at).getTime(),
  };
}

function mapWindowParticipantRow(row) {
  return {
    id: Number(row.id),
    progression_window_id: Number(row.progression_window_id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    character_name: row.character_name ?? null,
    account_id: row.account_id !== null ? Number(row.account_id) : null,
    participant_status: row.participant_status,
    default_action_type: row.default_action_type,
    default_action_payload_json: row.default_action_payload_json ?? {},
    responded_at: row.responded_at,
    defaulted_at: row.defaulted_at,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapWindowResponseRow(row) {
  return {
    id: Number(row.id),
    progression_window_id: Number(row.progression_window_id),
    character_id: Number(row.character_id),
    character_name: row.character_name ?? null,
    actor_account_id: row.actor_account_id !== null ? Number(row.actor_account_id) : null,
    response_key: row.response_key,
    response_payload_json: row.response_payload_json ?? {},
    response_summary: row.response_summary,
    created_at: row.created_at,
  };
}

function mapDefaultActionApplicationRow(row) {
  return {
    id: Number(row.id),
    progression_window_id: Number(row.progression_window_id),
    campaign_id: Number(row.campaign_id),
    character_id: Number(row.character_id),
    action_type: row.action_type,
    action_payload_json: row.action_payload_json ?? {},
    reason: row.reason,
    result_summary: row.result_summary,
    metadata_json: row.metadata_json ?? {},
    applied_at: row.applied_at,
    window_key: row.window_key,
    prompt_text: row.prompt_text,
  };
}

function mapCatchupAckRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    campaign_id: row.campaign_id !== null ? Number(row.campaign_id) : null,
    character_id: Number(row.character_id),
    last_seen_world_change_id:
      row.last_seen_world_change_id !== null ? Number(row.last_seen_world_change_id) : null,
    last_seen_campaign_log_id:
      row.last_seen_campaign_log_id !== null ? Number(row.last_seen_campaign_log_id) : null,
    last_seen_at: row.last_seen_at,
    summary_json: row.summary_json ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireWorld(worldId, executor) {
  const result = await executor.query(selectWorldSimulationWorldQuery, [worldId]);
  const world = result.rows[0] || null;

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  return {
    id: Number(world.id),
    name: world.name,
    slug: world.slug,
    status: world.status,
  };
}

async function getCampaign(campaignId, executor) {
  if (campaignId === null || campaignId === undefined) {
    return null;
  }

  const result = await executor.query(selectWorldSimulationCampaignQuery, [campaignId]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Campaign not found', 404);
  }

  return {
    id: Number(row.id),
    world_id: Number(row.world_id),
    name: row.name,
    slug: row.slug,
    campaign_type: row.campaign_type,
    status: row.status,
    is_active: row.is_active,
  };
}

async function getCharacter(characterId, executor) {
  if (characterId === null || characterId === undefined) {
    return null;
  }

  const result = await executor.query(selectWorldSimulationCharacterQuery, [characterId]);
  const row = result.rows[0] || null;

  if (!row) {
    throw createHttpError('Character not found', 404);
  }

  return {
    id: Number(row.id),
    account_id: Number(row.account_id),
    world_id: Number(row.world_id),
    name: row.name,
    is_active: row.is_active,
  };
}

async function resolveWorldBoundary(input, executor) {
  const campaign = await getCampaign(
    normalizePositiveInteger(input.campaign_id ?? input.campaignId, 'campaign_id', {
      optional: true,
    }),
    executor
  );
  const character = await getCharacter(
    normalizePositiveInteger(input.character_id ?? input.characterId, 'character_id', {
      optional: true,
    }),
    executor
  );
  const explicitWorldId = normalizePositiveInteger(input.world_id ?? input.worldId, 'world_id', {
    optional: true,
  });
  const worldId = explicitWorldId ?? campaign?.world_id ?? character?.world_id;

  if (!worldId) {
    throw createHttpError('world_id is required when no campaign or character is supplied', 400);
  }

  const world = await requireWorld(worldId, executor);

  if (campaign && campaign.world_id !== world.id) {
    throw createHttpError('Campaign does not belong to the supplied world', 400);
  }

  if (character && character.world_id !== world.id) {
    throw createHttpError('Character does not belong to the supplied world', 400);
  }

  if (campaign && character) {
    const membership = await executor.query(selectCampaignMembershipQuery, [campaign.id, character.id]);

    if (!membership.rows[0]) {
      throw createHttpError('Character is not a member of this campaign', 404);
    }
  }

  return {
    world,
    campaign,
    character,
  };
}

function buildChangeKey(input, worldId) {
  const explicit = normalizeOptionalText(input.change_key ?? input.changeKey);

  if (explicit) {
    return explicit;
  }

  const type = normalizeRequiredText(input.change_type ?? input.changeType, 'change_type');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}:${worldId}:${suffix}`;
}

function hasSharedWorldTruthDelta(truthDelta) {
  const normalized = normalizeObject(truthDelta);
  return (
    Object.keys(normalizeObject(normalized.world_flags ?? normalized.flags)).length > 0 ||
    normalizeArray(normalized.entity_updates ?? normalized.world_entities).length > 0
  );
}

async function applyWorldFlagDeltas(change, truthDelta, executor) {
  const appliedFlags = [];
  const flags = normalizeObject(truthDelta.world_flags ?? truthDelta.flags);
  const categories = normalizeObject(truthDelta.world_flag_categories);
  const metadataByKey = normalizeObject(truthDelta.world_flag_metadata);

  for (const [flagKey, value] of Object.entries(flags)) {
    const result = await executor.query(upsertWorldFlagQuery, [
      change.world_id,
      flagKey,
      JSON.stringify(value),
      normalizeOptionalText(categories[flagKey]) ?? 'world_truth',
      JSON.stringify(normalizeObject(metadataByKey[flagKey])),
      `Projected from world change ${change.change_key}`,
      'world_simulation',
      change.id,
    ]);
    appliedFlags.push(mapWorldFlagRow(result.rows[0]));
  }

  return appliedFlags;
}

function inferEntityEventType(update, existing, projected) {
  const explicit = normalizeOptionalText(update.event_type);

  if (explicit) {
    return explicit;
  }

  if (
    projected.current_scene_id !== existing.current_scene_id ||
    projected.current_location_id !== existing.current_location_id ||
    projected.current_region_id !== existing.current_region_id
  ) {
    return 'movement';
  }

  if (projected.status !== existing.status) {
    return 'status_change';
  }

  if (projected.disposition !== existing.disposition) {
    return 'disposition_change';
  }

  return 'state_change';
}

async function applyWorldEntityDeltas(change, truthDelta, executor) {
  const appliedEntityEvents = [];

  for (const update of normalizeArray(truthDelta.entity_updates ?? truthDelta.world_entities)) {
    const worldEntityId = normalizePositiveInteger(
      update.world_entity_id ?? update.entity_id,
      'entity_updates[].world_entity_id'
    );
    const existingResult = await executor.query(selectWorldEntityForUpdateQuery, [worldEntityId]);
    const existing = mapWorldEntityRow(existingResult.rows[0] || null);

    if (!existing) {
      throw createHttpError(`Unknown world_entity_id: ${worldEntityId}`, 400);
    }

    if (existing.world_id !== change.world_id) {
      throw createHttpError('Entity update references an entity in another world', 400);
    }

    const stateDelta = normalizeObject(update.state ?? update.state_delta_json);
    const projectedResult = await executor.query(updateWorldEntityProjectionQuery, [
      worldEntityId,
      normalizePositiveInteger(update.current_region_id, 'current_region_id', { optional: true }),
      normalizePositiveInteger(update.current_location_id, 'current_location_id', { optional: true }),
      normalizePositiveInteger(update.current_scene_id, 'current_scene_id', { optional: true }),
      normalizeOptionalText(update.status),
      normalizeOptionalText(update.disposition),
      normalizeOptionalText(update.faction),
      JSON.stringify(stateDelta),
      normalizeOptionalText(update.notes),
    ]);
    const projected = mapWorldEntityRow(projectedResult.rows[0]);
    const eventType = inferEntityEventType(update, existing, projected);
    const summary =
      normalizeOptionalText(update.summary) ??
      `World entity ${existing.entity_key} changed because of ${change.change_key}.`;
    const eventResult = await executor.query(insertWorldEntityEventQuery, [
      change.world_id,
      worldEntityId,
      change.id,
      eventType,
      existing.current_region_id,
      existing.current_location_id,
      existing.current_scene_id,
      projected.current_region_id,
      projected.current_location_id,
      projected.current_scene_id,
      existing.status,
      projected.status,
      existing.disposition,
      projected.disposition,
      JSON.stringify(stateDelta),
      summary,
    ]);

    appliedEntityEvents.push({
      entity: projected,
      event: mapWorldEntityEventRow(eventResult.rows[0]),
    });
  }

  return appliedEntityEvents;
}

function dedupeTargets(rows) {
  const targets = new Map();

  for (const row of rows) {
    const key = `${row.campaign_id}:${row.character_id}`;

    if (!targets.has(key)) {
      targets.set(key, {
        campaign_id: Number(row.campaign_id),
        character_id: Number(row.character_id),
        account_id: row.account_id !== null ? Number(row.account_id) : null,
        current_scene_id: row.current_scene_id !== null ? Number(row.current_scene_id) : null,
        world_id: Number(row.world_id),
      });
    }
  }

  return [...targets.values()];
}

async function loadPropagationTargets(change, executor) {
  if (change.propagation_scope === 'campaign_local') {
    if (change.campaign_id === null) {
      return [];
    }

    const result = await executor.query(selectCampaignLocalPropagationTargetsQuery, [
      change.campaign_id,
    ]);
    return dedupeTargets(result.rows);
  }

  if (change.propagation_scope === 'regional') {
    const result = await executor.query(selectRegionalPropagationTargetsQuery, [
      change.world_id,
      change.region_id,
      change.location_id,
      change.scene_id,
    ]);
    return dedupeTargets(result.rows);
  }

  const result = await executor.query(selectGlobalPropagationTargetsQuery, [change.world_id]);
  return dedupeTargets(result.rows);
}

function classifyTargetKnowledge(change, target, knowledgePolicy) {
  const isOrigin =
    change.character_id !== null &&
    target.character_id === change.character_id &&
    (change.campaign_id === null || target.campaign_id === change.campaign_id);

  const isDirectObserver =
    change.scene_id !== null &&
    target.current_scene_id !== null &&
    target.current_scene_id === change.scene_id;

  if ((isOrigin || isDirectObserver) && knowledgePolicy.direct_observers_discover !== false) {
    const status = knowledgePolicy.direct_initial_status ?? 'discovered';
    return {
      channel: 'direct',
      status,
      discoveredAt: status === 'discovered' ? new Date().toISOString() : null,
    };
  }

  if (change.propagation_scope === 'regional') {
    return {
      channel: normalizePropagationChannel(knowledgePolicy.regional_channel, 'proximity'),
      status: knowledgePolicy.regional_initial_status ?? 'available',
      discoveredAt: null,
    };
  }

  if (change.propagation_scope === 'global') {
    return {
      channel: normalizePropagationChannel(knowledgePolicy.global_channel, 'time_delay'),
      status: knowledgePolicy.global_initial_status ?? 'available',
      discoveredAt: null,
    };
  }

  return {
    channel: normalizePropagationChannel(knowledgePolicy.local_channel, 'system'),
    status: knowledgePolicy.local_initial_status ?? 'available',
    discoveredAt: null,
  };
}

function calculateReceiptAvailability(change, classification, knowledgePolicy) {
  if (classification.status === 'discovered') {
    return classification.discoveredAt ?? new Date().toISOString();
  }

  const channel = classification.channel;
  const channelDelay = normalizeNonNegativeInteger(
    knowledgePolicy[`${channel}_delay_minutes`],
    `${channel}_delay_minutes`,
    normalizeNonNegativeInteger(knowledgePolicy.delay_minutes, 'delay_minutes', 0)
  );
  const effectiveAt = normalizeDate(change.effective_at, 'effective_at', null);
  const baseDate = effectiveAt ? new Date(effectiveAt) : new Date();

  return channelDelay > 0 ? addMinutes(baseDate, channelDelay) : baseDate.toISOString();
}

async function upsertWorldKnowledgeForReceipt(receipt, change, executor) {
  const channel = receipt.propagation_channel;
  const knowledgeType =
    channel === 'rumor'
      ? 'rumor'
      : change.change_type === 'time_beat' ||
          change.change_type?.startsWith?.('world_event') ||
          change.source_type === 'event'
        ? 'world_event'
        : 'world_change';
  const result = await executor.query(upsertWorldChangeKnowledgeQuery, [
    receipt.campaign_id,
    receipt.character_id,
    knowledgeType,
    change.change_key,
    change.title,
    receipt.summary ?? change.summary,
    JSON.stringify({
      world_change_id: change.id,
      propagation_scope: change.propagation_scope,
      propagation_channel: channel,
      narrative_text: change.narrative_text,
    }),
    change.id,
  ]);

  return mapKnowledgeRow(result.rows[0]);
}

async function createPropagationReceipts(change, executor) {
  const targets = await loadPropagationTargets(change, executor);
  const knowledgePolicy = normalizeObject(change.knowledge_policy_json);
  const receipts = [];
  const discoveredKnowledge = [];

  for (const target of targets) {
    const classification = classifyTargetKnowledge(change, target, knowledgePolicy);
    const availableAt = calculateReceiptAvailability(change, classification, knowledgePolicy);
    const result = await executor.query(insertPropagationReceiptQuery, [
      change.id,
      target.campaign_id,
      target.character_id,
      classification.channel,
      classification.status,
      availableAt,
      classification.discoveredAt,
      change.summary,
      JSON.stringify({
        propagation_scope: change.propagation_scope,
        world_id: change.world_id,
        origin_campaign_id: change.campaign_id,
        origin_character_id: change.character_id,
      }),
    ]);
    const receipt = mapReceiptRow(result.rows[0]);
    receipts.push(receipt);

    if (classification.status === 'discovered') {
      const knowledge = await upsertWorldKnowledgeForReceipt(receipt, change, executor);
      discoveredKnowledge.push(knowledge);
    }
  }

  return {
    receipts,
    discovered_knowledge: discoveredKnowledge,
  };
}

async function writeCampaignLogIfPossible(change, logType, message, data, executor) {
  if (change.campaign_id === null || change.campaign_id === undefined) {
    return null;
  }

  return recordCampaignLog(
    {
      campaign_id: change.campaign_id,
      character_id: change.character_id ?? null,
      actor_account_id: change.actor_account_id ?? null,
      log_type: logType,
      message,
      data_json: data,
    },
    executor
  );
}

async function writeWorldLog(change, logType, message, data, executor) {
  const result = await executor.query(insertWorldLogQuery, [
    change.world_id,
    change.campaign_id ?? null,
    change.character_id ?? null,
    change.actor_account_id ?? null,
    logType,
    message,
    JSON.stringify(data ?? {}),
  ]);

  return result.rows[0];
}

async function recordWorldChangeInternal(input, client) {
  const { world, campaign, character } = await resolveWorldBoundary(input, client);
  const propagationScope = normalizePropagationScope(
    input.propagation_scope ?? input.propagationScope
  );
  const truthDelta = normalizeObject(input.truth_delta_json ?? input.truth_delta);

  if (propagationScope === 'campaign_local' && hasSharedWorldTruthDelta(truthDelta)) {
    throw createHttpError(
      'campaign_local changes cannot directly mutate shared world truth; use payload-only local changes or campaign state instead',
      400
    );
  }

  const knowledgePolicy = {
    direct_observers_discover: true,
    ...normalizeObject(input.knowledge_policy_json ?? input.knowledge_policy),
  };
  const changeResult = await client.query(insertWorldChangeQuery, [
    world.id,
    campaign?.id ?? null,
    character?.id ?? null,
    normalizePositiveInteger(input.actor_account_id ?? input.actorAccountId, 'actor_account_id', {
      optional: true,
    }),
    buildChangeKey(input, world.id),
    normalizeRequiredText(input.change_type ?? input.changeType, 'change_type'),
    propagationScope,
    normalizePositiveInteger(input.region_id, 'region_id', { optional: true }),
    normalizePositiveInteger(input.location_id, 'location_id', { optional: true }),
    normalizePositiveInteger(input.scene_id, 'scene_id', { optional: true }),
    normalizePositiveInteger(input.world_entity_id, 'world_entity_id', { optional: true }),
    normalizeOptionalText(input.source_type),
    normalizePositiveInteger(input.source_entity_id, 'source_entity_id', { optional: true }),
    normalizeRequiredText(input.title, 'title'),
    normalizeRequiredText(input.summary, 'summary'),
    normalizeOptionalText(input.narrative_text),
    JSON.stringify(normalizeObject(input.payload_json ?? input.payload)),
    JSON.stringify(truthDelta),
    JSON.stringify(knowledgePolicy),
    normalizeDate(input.effective_at, 'effective_at', null),
  ]);
  let change = mapWorldChangeRow(changeResult.rows[0]);
  const appliedFlags = await applyWorldFlagDeltas(change, truthDelta, client);
  const appliedEntityEvents = await applyWorldEntityDeltas(change, truthDelta, client);
  const propagation = await createPropagationReceipts(change, client);
  const statusResult = await client.query(updateWorldChangePropagationStatusQuery, [
    change.id,
    'propagated',
  ]);
  change = mapWorldChangeRow(statusResult.rows[0]);
  await writeWorldLog(
    change,
    'world_change_recorded',
    change.summary,
    {
      world_change_id: change.id,
      propagation_scope: change.propagation_scope,
      applied_flags: appliedFlags,
      applied_entity_events: appliedEntityEvents.map((entry) => entry.event),
    },
    client
  );
  await writeCampaignLogIfPossible(
    change,
    'world_change_recorded',
    change.summary,
    {
      world_change_id: change.id,
      propagation_scope: change.propagation_scope,
    },
    client
  );

  if (change.character_id !== null) {
    await recordGameplayHistory(
      {
        character_id: change.character_id,
        actor_account_id: change.actor_account_id,
        source_type: 'world_simulation',
        source_entity_id: change.id,
        action_key: `world_change:${change.change_type}`,
        summary: change.summary,
        input_json: input,
        result_json: {
          world_change_id: change.id,
          propagation_scope: change.propagation_scope,
        },
        xp_delta: 0,
      },
      client
    );
  }

  return {
    world,
    campaign,
    character,
    change,
    applied_truth: {
      flags: appliedFlags,
      entity_events: appliedEntityEvents,
    },
    propagation,
  };
}

export async function recordWorldChange(input = {}, executor = null) {
  if (executor) {
    return recordWorldChangeInternal(input, executor);
  }

  return withTransaction(async (client) => recordWorldChangeInternal(input, client));
}

export async function listWorldHistory(worldId, options = {}) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const limit = normalizePositiveInteger(options.limit ?? 25, 'limit');
  const offset = normalizeNonNegativeInteger(options.offset, 'offset', 0);
  const [worldResult, changesResult] = await Promise.all([
    query(selectWorldSimulationWorldQuery, [normalizedWorldId]),
    query(selectWorldChangesQuery, [normalizedWorldId, limit, offset]),
  ]);
  const world = worldResult.rows[0] || null;

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  return {
    world: {
      id: Number(world.id),
      name: world.name,
      slug: world.slug,
      status: world.status,
    },
    limit,
    offset,
    items: changesResult.rows.map(mapWorldChangeRow),
  };
}

export async function getWorldTruth(worldId) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const [worldResult, flagsResult, changesResult, receiptsResult] = await Promise.all([
    query(selectWorldSimulationWorldQuery, [normalizedWorldId]),
    query(selectWorldFlagsQuery, [normalizedWorldId]),
    query(selectWorldChangesQuery, [normalizedWorldId, 10, 0]),
    query(selectWorldPropagationReceiptsQuery, [normalizedWorldId, null, null, 25, 0]),
  ]);
  const world = worldResult.rows[0] || null;

  if (!world) {
    throw createHttpError('World not found', 404);
  }

  return {
    world: {
      id: Number(world.id),
      name: world.name,
      slug: world.slug,
      status: world.status,
    },
    model: 'event_sourced_world_changes_with_current_projection',
    current_truth: {
      flags: flagsResult.rows.map(mapWorldFlagRow),
      recent_changes: changesResult.rows.map(mapWorldChangeRow),
    },
    propagation_receipts: receiptsResult.rows.map(mapReceiptRow),
  };
}

export async function listWorldEntityEvolution(worldId, options = {}) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const entityId = normalizePositiveInteger(options.worldEntityId ?? options.entity_id, 'entity_id', {
    optional: true,
  });
  const limit = normalizePositiveInteger(options.limit ?? 25, 'limit');
  const offset = normalizeNonNegativeInteger(options.offset, 'offset', 0);
  const result = await query(selectWorldEntityEventsQuery, [
    normalizedWorldId,
    entityId,
    limit,
    offset,
  ]);

  return {
    world_id: normalizedWorldId,
    world_entity_id: entityId,
    limit,
    offset,
    events: result.rows.map(mapWorldEntityEventRow),
  };
}

export async function listCharacterKnowledgeInWorld(worldId, characterId, options = {}) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const campaignId = normalizePositiveInteger(options.campaignId ?? options.campaign_id, 'campaignId', {
    optional: true,
  });
  const result = await query(selectCharacterWorldKnowledgeQuery, [
    normalizedWorldId,
    normalizedCharacterId,
    campaignId,
  ]);

  return {
    world_id: normalizedWorldId,
    campaign_id: campaignId,
    character_id: normalizedCharacterId,
    knowledge: result.rows.map(mapKnowledgeRow),
  };
}

export async function propagateWorldKnowledge(worldId, options = {}) {
  const normalizedWorldId = normalizePositiveInteger(worldId, 'worldId');
  const channel =
    options.channel === undefined || options.channel === null
      ? null
      : normalizePropagationChannel(options.channel);
  const limit = normalizePositiveInteger(options.limit ?? 50, 'limit');
  const includeHidden = options.include_hidden === true || options.includeHidden === true;

  return withTransaction(async (client) => {
    await requireWorld(normalizedWorldId, client);
    const receiptsResult = await client.query(selectDiscoverableReceiptsQuery, [
      normalizedWorldId,
      channel,
      limit,
    ]);
    const discovered = [];
    const skipped = [];

    for (const receiptRow of receiptsResult.rows) {
      const receipt = mapReceiptRow(receiptRow);

      if (receipt.knowledge_status === 'hidden' && !includeHidden) {
        skipped.push({
          receipt_id: receipt.id,
          reason: 'hidden_receipt_requires_include_hidden',
        });
        continue;
      }

      const updatedResult = await client.query(updatePropagationReceiptDiscoveredQuery, [
        receipt.id,
        receipt.knowledge_status,
        'discovered',
      ]);
      const updatedReceipt = mapReceiptRow({
        ...updatedResult.rows[0],
        change_key: receipt.change_key,
        title: receipt.title,
        change_summary: receipt.change_summary,
      });
      const change = mapWorldChangeRow({
        id: receipt.world_change_id,
        world_id: normalizedWorldId,
        campaign_id: updatedReceipt.campaign_id,
        character_id: updatedReceipt.character_id,
        actor_account_id: null,
        change_key: receipt.change_key,
        change_type: 'knowledge_propagation',
        propagation_scope: receipt.propagation_scope ?? 'global',
        propagation_status: 'propagated',
        region_id: null,
        location_id: null,
        scene_id: null,
        world_entity_id: null,
        source_type: 'world_simulation',
        source_entity_id: receipt.world_change_id,
        title: receipt.title,
        summary: receipt.change_summary,
        narrative_text: null,
        payload_json: {},
        truth_delta_json: {},
        knowledge_policy_json: receiptRow.knowledge_policy_json ?? {},
        effective_at: receipt.available_at,
        created_at: receipt.created_at,
        updated_at: receipt.updated_at,
      });
      const knowledge = await upsertWorldKnowledgeForReceipt(updatedReceipt, change, client);
      discovered.push({
        receipt: updatedReceipt,
        knowledge,
      });

      await writeCampaignLogIfPossible(
        {
          campaign_id: updatedReceipt.campaign_id,
          character_id: updatedReceipt.character_id,
          actor_account_id: null,
        },
        'world_change_propagated',
        `World knowledge discovered: ${receipt.title}.`,
        {
          world_change_id: receipt.world_change_id,
          channel: receipt.propagation_channel,
        },
        client
      );
    }

    return {
      world_id: normalizedWorldId,
      channel,
      discovered,
      skipped,
    };
  });
}

export async function triggerWorldBeat(worldId, input = {}) {
  const beatKey = normalizeOptionalText(input.beat_key ?? input.beatKey) ?? `beat-${Date.now()}`;
  const propagationScope = normalizePropagationScope(input.propagation_scope ?? 'global');
  const title = normalizeOptionalText(input.title) ?? `World beat: ${beatKey}`;
  const summary =
    normalizeOptionalText(input.summary) ??
    `A discrete world beat advanced: ${beatKey}.`;

  return recordWorldChange({
    ...input,
    world_id: worldId,
    change_key: normalizeOptionalText(input.change_key) ?? `world-beat:${beatKey}`,
    change_type: 'time_beat',
    propagation_scope: propagationScope,
    title,
    summary,
    narrative_text: normalizeOptionalText(input.narrative_text) ?? summary,
    payload: {
      beat_key: beatKey,
      reason: normalizeOptionalText(input.reason),
      ...normalizeObject(input.payload),
    },
    truth_delta: {
      world_flags: {
        [`world_beat:${beatKey}`]: {
          beat_key: beatKey,
          advanced_at: new Date().toISOString(),
        },
      },
      world_flag_categories: {
        [`world_beat:${beatKey}`]: 'time_beat',
      },
      ...normalizeObject(input.truth_delta),
    },
    knowledge_policy: {
      global_channel: 'time_delay',
      global_initial_status: 'available',
      ...normalizeObject(input.knowledge_policy),
    },
  });
}

async function loadWindowBundle(windowId, executor = { query }) {
  const windowResult = await executor.query(selectProgressionWindowByIdQuery, [windowId]);
  const participantsResult = await executor.query(selectProgressionWindowParticipantsQuery, [windowId]);
  const responsesResult = await executor.query(selectProgressionWindowResponsesQuery, [windowId]);
  const window = mapProgressionWindowRow(windowResult.rows[0] || null);

  if (!window) {
    throw createHttpError('Progression window not found', 404);
  }

  const participants = participantsResult.rows.map(mapWindowParticipantRow);
  const responses = responsesResult.rows.map(mapWindowResponseRow);

  return {
    window,
    participants,
    responses,
    unresolved_participants: participants.filter((entry) => entry.participant_status === 'expected'),
    responded_count: participants.filter((entry) => entry.participant_status === 'responded').length,
    defaulted_count: participants.filter((entry) => entry.participant_status === 'defaulted').length,
  };
}

export async function openProgressionWindow(input = {}) {
  return withTransaction(async (client) => {
    const { world, campaign } = await resolveWorldBoundary(input, client);

    if (!campaign) {
      throw createHttpError('campaign_id is required for progression windows in this stage', 400);
    }

    const scopeType = normalizeWindowScope(input.scope_type ?? input.scopeType ?? campaign.campaign_type);
    const participantIds = normalizeArray(input.participant_character_ids ?? input.participants)
      .map((value) => normalizePositiveInteger(value, 'participant_character_ids[]'));
    const participantFilter = participantIds.length > 0 ? participantIds : null;
    const membersResult = await client.query(selectCampaignMembersForWindowQuery, [
      campaign.id,
      participantFilter,
    ]);

    if (membersResult.rows.length === 0) {
      throw createHttpError('No active campaign participants were found for this window', 400);
    }

    const thresholdMinutes = normalizeNonNegativeInteger(
      input.threshold_minutes ?? input.thresholdMinutes,
      'threshold_minutes',
      240
    );
    const thresholdAt =
      normalizeDate(input.threshold_at, 'threshold_at', null) ??
      addMinutes(new Date(), thresholdMinutes);
    const windowResult = await client.query(insertProgressionWindowQuery, [
      world.id,
      campaign.id,
      normalizePositiveInteger(input.scene_id, 'scene_id', { optional: true }),
      normalizeRequiredText(input.window_key ?? input.windowKey, 'window_key'),
      scopeType,
      normalizeRequiredText(input.prompt_text ?? input.prompt, 'prompt_text'),
      thresholdAt,
      normalizeDate(input.resolves_at, 'resolves_at', null),
      JSON.stringify({
        threshold_minutes: thresholdMinutes,
        response_model: 'gather_until_threshold_then_default_unresolved',
        ...normalizeObject(input.threshold_policy_json ?? input.threshold_policy),
      }),
      JSON.stringify(normalizeObject(input.default_policy_json ?? input.default_policy)),
      normalizeOptionalText(input.source_type),
      normalizePositiveInteger(input.source_entity_id, 'source_entity_id', { optional: true }),
    ]);
    const window = mapProgressionWindowRow(windowResult.rows[0]);
    const participants = [];

    for (const member of membersResult.rows) {
      const defaultActionType =
        normalizeOptionalText(input.default_action_type) ??
        normalizeOptionalText(member.default_action_type) ??
        'wait';
      const defaultPayload = normalizeObject(input.default_action_payload ?? member.default_action_payload_json);
      const participantResult = await client.query(insertProgressionWindowParticipantQuery, [
        window.id,
        Number(member.campaign_id),
        Number(member.character_id),
        member.account_id !== null ? Number(member.account_id) : null,
        defaultActionType,
        JSON.stringify(defaultPayload),
      ]);
      participants.push(mapWindowParticipantRow(participantResult.rows[0]));
    }

    await recordCampaignLog(
      {
        campaign_id: campaign.id,
        character_id: null,
        actor_account_id: normalizePositiveInteger(input.actor_account_id, 'actor_account_id', {
          optional: true,
        }),
        log_type: 'progression_window_opened',
        message: `Progression window opened: ${window.prompt_text}`,
        data_json: {
          progression_window_id: window.id,
          window_key: window.window_key,
          threshold_at: window.threshold_at,
          participants: participants.map((participant) => participant.character_id),
        },
      },
      client
    );

    return {
      window,
      participants,
      async_model: {
        threshold_behavior: 'responses_are_collected_until_threshold_then_defaults_apply',
        defaults_apply_immediately: false,
      },
    };
  });
}

export async function getProgressionWindow(windowId) {
  return loadWindowBundle(normalizePositiveInteger(windowId, 'windowId'));
}

export async function listProgressionWindows(options = {}) {
  const worldId = normalizePositiveInteger(options.worldId ?? options.world_id, 'worldId', {
    optional: true,
  });
  const campaignId = normalizePositiveInteger(
    options.campaignId ?? options.campaign_id,
    'campaignId',
    { optional: true }
  );
  const status = normalizeOptionalText(options.status);
  const limit = normalizePositiveInteger(options.limit ?? 25, 'limit');
  const offset = normalizeNonNegativeInteger(options.offset, 'offset', 0);
  const result = await query(selectProgressionWindowsQuery, [
    worldId,
    campaignId,
    status,
    limit,
    offset,
  ]);

  return {
    world_id: worldId,
    campaign_id: campaignId,
    status,
    limit,
    offset,
    windows: result.rows.map(mapProgressionWindowRow),
  };
}

export async function submitProgressionWindowResponse(windowId, input = {}) {
  return withTransaction(async (client) => {
    const normalizedWindowId = normalizePositiveInteger(windowId, 'windowId');
    const characterId = normalizePositiveInteger(input.character_id ?? input.characterId, 'character_id');
    const windowResult = await client.query(selectProgressionWindowForUpdateQuery, [normalizedWindowId]);
    const window = mapProgressionWindowRow(windowResult.rows[0] || null);

    if (!window) {
      throw createHttpError('Progression window not found', 404);
    }

    if (!['open', 'threshold_reached'].includes(window.status)) {
      throw createHttpError('This progression window no longer accepts responses', 409);
    }

    const participantsResult = await client.query(selectProgressionWindowParticipantsQuery, [
      normalizedWindowId,
    ]);
    const participant = participantsResult.rows
      .map(mapWindowParticipantRow)
      .find((entry) => entry.character_id === characterId);

    if (!participant) {
      throw createHttpError('Character is not a participant in this progression window', 404);
    }

    if (participant.participant_status === 'defaulted') {
      throw createHttpError('A default action has already been applied for this participant', 409);
    }

    const responseResult = await client.query(insertProgressionWindowResponseQuery, [
      normalizedWindowId,
      characterId,
      normalizePositiveInteger(input.actor_account_id ?? input.actorAccountId, 'actor_account_id', {
        optional: true,
      }),
      normalizeRequiredText(input.response_key ?? input.responseKey, 'response_key'),
      JSON.stringify(normalizeObject(input.response_payload ?? input.payload)),
      normalizeRequiredText(input.response_summary ?? input.summary, 'response_summary'),
    ]);
    const updatedParticipantResult = await client.query(
      updateProgressionWindowParticipantRespondedQuery,
      [normalizedWindowId, characterId]
    );
    const response = mapWindowResponseRow(responseResult.rows[0]);
    const updatedParticipant = mapWindowParticipantRow(updatedParticipantResult.rows[0]);

    await recordCampaignLog(
      {
        campaign_id: window.campaign_id,
        character_id: characterId,
        actor_account_id: response.actor_account_id,
        log_type: 'progression_window_response',
        message: response.response_summary,
        data_json: {
          progression_window_id: window.id,
          response,
        },
      },
      client
    );

    return {
      window,
      participant: updatedParticipant,
      response,
      threshold_reached: window.threshold_reached,
      note: window.threshold_reached
        ? 'The threshold has been reached; resolving the window can now apply defaults for unresolved participants.'
        : 'The response was stored. Defaults will not apply until the threshold is reached.',
    };
  });
}

function buildDefaultApplicationSummary(participant, window) {
  switch (participant.default_action_type) {
    case 'defend':
      return `${participant.character_name ?? `Character ${participant.character_id}`} defaulted to a defensive posture.`;
    case 'observe':
      return `${participant.character_name ?? `Character ${participant.character_id}`} observed and stayed alert.`;
    case 'continue':
      return `${participant.character_name ?? `Character ${participant.character_id}`} continued with the group's apparent course.`;
    case 'first_available_action':
      return `${participant.character_name ?? `Character ${participant.character_id}`} followed the first safe available action.`;
    case 'end_turn':
      return `${participant.character_name ?? `Character ${participant.character_id}`} ended their turn by default.`;
    case 'wait':
    default:
      return `${participant.character_name ?? `Character ${participant.character_id}`} waited because no response arrived before ${window.threshold_at}.`;
  }
}

export async function resolveProgressionWindow(windowId, input = {}) {
  return withTransaction(async (client) => {
    const normalizedWindowId = normalizePositiveInteger(windowId, 'windowId');
    const windowResult = await client.query(selectProgressionWindowForUpdateQuery, [normalizedWindowId]);
    let window = mapProgressionWindowRow(windowResult.rows[0] || null);

    if (!window) {
      throw createHttpError('Progression window not found', 404);
    }

    if (window.status === 'resolved') {
      return {
        ...(await loadWindowBundle(normalizedWindowId, client)),
        already_resolved: true,
      };
    }

    if (!window.threshold_reached && input.force !== true) {
      throw createHttpError(
        'Progression threshold has not been reached; default actions were not applied',
        409
      );
    }

    if (window.status === 'open') {
      const statusResult = await client.query(updateProgressionWindowStatusQuery, [
        normalizedWindowId,
        'threshold_reached',
        null,
      ]);
      window = mapProgressionWindowRow(statusResult.rows[0]);
    }

    const participantsResult = await client.query(selectProgressionWindowParticipantsQuery, [
      normalizedWindowId,
    ]);
    const participants = participantsResult.rows.map(mapWindowParticipantRow);
    const defaulted = [];

    for (const participant of participants.filter((entry) => entry.participant_status === 'expected')) {
      const resultSummary = buildDefaultApplicationSummary(participant, window);
      const applicationResult = await client.query(insertDefaultActionApplicationQuery, [
        normalizedWindowId,
        participant.campaign_id,
        participant.character_id,
        participant.default_action_type,
        JSON.stringify(participant.default_action_payload_json ?? {}),
        'progression_threshold_reached',
        resultSummary,
        JSON.stringify({
          threshold_at: window.threshold_at,
          window_key: window.window_key,
          prompt_text: window.prompt_text,
        }),
      ]);
      await client.query(updateProgressionWindowParticipantDefaultedQuery, [participant.id]);
      const application = mapDefaultActionApplicationRow(applicationResult.rows[0]);
      defaulted.push(application);

      await recordCampaignLog(
        {
          campaign_id: participant.campaign_id,
          character_id: participant.character_id,
          actor_account_id: null,
          log_type: 'default_action_applied',
          message: resultSummary,
          data_json: {
            progression_window_id: normalizedWindowId,
            default_action: application,
          },
        },
        client
      );

      await recordGameplayHistory(
        {
          character_id: participant.character_id,
          actor_account_id: null,
          source_type: 'world_simulation',
          source_entity_id: normalizedWindowId,
          action_key: `default_action:${participant.default_action_type}`,
          summary: resultSummary,
          input_json: {
            progression_window_id: normalizedWindowId,
            default_action_type: participant.default_action_type,
          },
          result_json: application,
          xp_delta: 0,
        },
        client
      );
    }

    const bundleAfterDefaults = await loadWindowBundle(normalizedWindowId, client);
    const responseSummaries = bundleAfterDefaults.responses.map(
      (response) => `${response.character_name ?? `Character ${response.character_id}`}: ${response.response_summary}`
    );
    const defaultSummaries = defaulted.map((entry) => entry.result_summary);
    const combinedSummary = [...responseSummaries, ...defaultSummaries].join(' ');
    const resolutionSummary =
      normalizeOptionalText(input.resolution_summary ?? input.summary) ||
      normalizeOptionalText(combinedSummary) ||
      'Progression window resolved.';
    const resolvedResult = await client.query(updateProgressionWindowStatusQuery, [
      normalizedWindowId,
      'resolved',
      resolutionSummary,
    ]);

    window = mapProgressionWindowRow(resolvedResult.rows[0]);

    if (window.campaign_id !== null) {
      await recordCampaignLog(
        {
          campaign_id: window.campaign_id,
          character_id: null,
          actor_account_id: normalizePositiveInteger(input.actor_account_id, 'actor_account_id', {
            optional: true,
          }),
          log_type: 'progression_window_resolved',
          message: resolutionSummary,
          data_json: {
            progression_window_id: normalizedWindowId,
            defaulted,
            response_count: bundleAfterDefaults.responses.length,
          },
        },
        client
      );
    }

    return {
      ...(await loadWindowBundle(normalizedWindowId, client)),
      window,
      defaulted,
      resolution_summary: resolutionSummary,
      async_model: {
        defaults_applied_only_after_threshold: true,
      },
    };
  });
}

export async function getCatchupSummary(campaignId, characterId, options = {}) {
  const normalizedCampaignId = normalizePositiveInteger(campaignId, 'campaignId');
  const normalizedCharacterId = normalizePositiveInteger(characterId, 'characterId');
  const limit = normalizePositiveInteger(options.limit ?? 10, 'limit');
  const markSeen = options.mark_seen === true || options.markSeen === true;

  return withTransaction(async (client) => {
    const { world, campaign, character } = await resolveWorldBoundary(
      {
        campaign_id: normalizedCampaignId,
        character_id: normalizedCharacterId,
      },
      client
    );
    const ackResult = await client.query(selectCatchupAckQuery, [
      world.id,
      campaign.id,
      character.id,
    ]);
    const ack = mapCatchupAckRow(ackResult.rows[0] || null);
    const lastSeenWorldChangeId = ack?.last_seen_world_change_id ?? null;
    const changesResult = await client.query(selectCatchupWorldChangesQuery, [
      world.id,
      character.id,
      campaign.id,
      lastSeenWorldChangeId,
      limit,
    ]);
    const defaultActionsResult = await client.query(selectDefaultActionApplicationsByCharacterQuery, [
      character.id,
      campaign.id,
      limit,
    ]);
    const changes = changesResult.rows.map((row) => ({
      receipt_id: Number(row.id),
      world_change_id: Number(row.world_change_id),
      change_key: row.change_key,
      change_type: row.change_type,
      title: row.title,
      summary: row.change_summary,
      narrative_text: row.narrative_text,
      propagation_scope: row.propagation_scope,
      discovered_at: row.discovered_at,
      change_created_at: row.change_created_at,
    }));
    const defaultActions = defaultActionsResult.rows.map(mapDefaultActionApplicationRow);
    const currentRuntime = await getRuntimeContent(campaign.id, character.id, {
      mode: options.mode ?? 'minimal',
    });
    const summary = {
      identity: {
        world,
        campaign,
        character,
      },
      last_seen: ack,
      world_changes: changes,
      default_actions: defaultActions,
      current_runtime: currentRuntime,
      narrative_summary:
        changes.length === 0 && defaultActions.length === 0
          ? 'No newly discovered world or party changes need catch-up.'
          : [
              ...changes.map((entry) => entry.summary),
              ...defaultActions.map((entry) => entry.result_summary),
            ].join(' '),
    };

    let updatedAck = null;

    if (markSeen) {
      const maxWorldChangeId = changes.reduce(
        (max, entry) => Math.max(max, entry.world_change_id),
        lastSeenWorldChangeId ?? 0
      );
      const ackUpdateResult = await client.query(upsertCatchupAckQuery, [
        world.id,
        campaign.id,
        character.id,
        maxWorldChangeId > 0 ? maxWorldChangeId : lastSeenWorldChangeId,
        null,
        JSON.stringify(summary),
      ]);
      updatedAck = mapCatchupAckRow(ackUpdateResult.rows[0]);

      await recordCampaignLog(
        {
          campaign_id: campaign.id,
          character_id: character.id,
          actor_account_id: null,
          log_type: 'catchup_generated',
          message: 'Catch-up summary generated.',
          data_json: {
            world_change_count: changes.length,
            default_action_count: defaultActions.length,
          },
        },
        client
      );
    }

    return {
      ...summary,
      updated_ack: updatedAck,
    };
  });
}
