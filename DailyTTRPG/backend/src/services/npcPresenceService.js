import { query } from '../config/db.js';
import { createHttpError } from '../utils/httpError.js';
import { listKnowledgeForCharacter } from './characterKnowledgeService.js';
import { getEffectiveEnvironment } from './environmentStateService.js';
import { resolveNpcDisplayIdentity, npcAliasList } from './npcIdentityService.js';
import { ensureNpcPresenceSchema } from './npcPresenceSchema.js';

const TERMINAL_STATUSES = new Set(['dead', 'removed', 'archived', 'defeated']);
const HIDDEN_STATUSES = new Set(['hidden', 'hiding']);
const LIMITED_STATUSES = new Set(['captured', 'fleeing', 'unconscious', 'unavailable']);

function asNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function compactUnique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function sameId(a, b) {
  return a !== null && b !== null && String(a) === String(b);
}

async function getWorldId(worldInstanceId, executor) {
  const result = await executor.query('SELECT world_id FROM dnd5e_world_instance WHERE id = $1', [
    worldInstanceId,
  ]);
  const worldId = result.rows[0]?.world_id ? Number(result.rows[0].world_id) : null;
  if (!worldId) {
    throw createHttpError('World instance not found for NPC presence', 404);
  }
  return worldId;
}

async function loadSceneAndLocationMaps(worldId, executor) {
  const [locations, scenes] = await Promise.all([
    executor.query('SELECT id, key, name FROM dnd5e_location WHERE world_id = $1', [worldId]),
    executor.query('SELECT id, key, name, location_id FROM dnd5e_scene WHERE world_id = $1', [worldId]),
  ]);

  const locationByKey = new Map();
  const locationById = new Map();
  const sceneByKey = new Map();
  const sceneById = new Map();

  for (const location of locations.rows) {
    const mapped = {
      id: Number(location.id),
      key: location.key,
      name: location.name,
    };
    locationByKey.set(location.key, mapped);
    locationById.set(String(location.id), mapped);
  }

  for (const scene of scenes.rows) {
    const mapped = {
      id: Number(scene.id),
      key: scene.key,
      name: scene.name,
      location_id: scene.location_id ? Number(scene.location_id) : null,
    };
    sceneByKey.set(scene.key, mapped);
    sceneById.set(String(scene.id), mapped);
  }

  return {
    locationByKey,
    locationById,
    sceneByKey,
    sceneById,
  };
}

function resolveLocationRef(ref, maps) {
  if (!ref) {
    return null;
  }

  const numeric = asNumber(ref);
  if (numeric && maps.locationById.has(String(numeric))) {
    return maps.locationById.get(String(numeric));
  }

  return maps.locationByKey.get(String(ref)) ?? null;
}

function resolveSceneRef(ref, maps) {
  if (!ref) {
    return null;
  }

  const numeric = asNumber(ref);
  if (numeric && maps.sceneById.has(String(numeric))) {
    return maps.sceneById.get(String(numeric));
  }

  return maps.sceneByKey.get(String(ref)) ?? null;
}

function selectScheduleEntry(schedule, environment = {}) {
  const customLabel = environment.custom_schedule_label ?? environment.schedule_label ?? null;
  const timeOfDay = environment.time_of_day ?? 'afternoon';
  const scheduleWithIndex = arrayOf(schedule).map((entry, index) => ({ ...entry, index }));
  const matches = scheduleWithIndex.filter((entry) => {
    if (customLabel && entry.custom_time_label === customLabel) {
      return true;
    }

    return entry.time_block === timeOfDay;
  });

  const candidates = matches.length > 0
    ? matches
    : scheduleWithIndex.filter((entry) => entry.fallback === true);

  return candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.index - b.index)[0] ?? null;
}

function schedulePlacement(npc, entity, scheduleEntry, maps) {
  const scheduleLocation = resolveLocationRef(scheduleEntry?.location_id, maps);
  const scheduleScene = resolveSceneRef(scheduleEntry?.scene_id, maps);
  const defaultLocation =
    resolveLocationRef(npc.default_location_key, maps) ??
    resolveLocationRef(entity.current_location_id, maps);
  const defaultScene =
    resolveSceneRef(npc.default_scene_key, maps) ??
    resolveSceneRef(entity.current_scene_id, maps);

  const scene = scheduleScene ?? defaultScene;
  const location =
    scheduleLocation ??
    (scene?.location_id ? resolveLocationRef(scene.location_id, maps) : null) ??
    defaultLocation;

  return {
    location,
    scene,
    activity: scheduleEntry?.activity ?? 'present',
    activity_text: scheduleEntry?.activity_text ?? null,
    availability: scheduleEntry?.availability ?? npc.default_availability ?? 'available',
    visibility: scheduleEntry?.visibility ?? npc.default_visibility ?? 'visible',
    source: scheduleEntry ? 'schedule' : 'default_location',
  };
}

function applyStateOverrides(base, entity, stateRow, maps) {
  const state = {
    ...normalizeState(entity.state_json),
    ...normalizeState(stateRow?.state_json),
  };
  const status = state.status ?? state.condition ?? stateRow?.status ?? entity.status ?? 'active';
  const alive = state.alive !== false;

  if (!alive || TERMINAL_STATUSES.has(status)) {
    return {
      ...base,
      presence: 'dead',
      visibility: 'not_visible',
      availability: 'unavailable',
      state_source: 'entity_state',
      state,
      status,
    };
  }

  const sceneLock = state.scene_lock_id ? resolveSceneRef(state.scene_lock_id, maps) : null;
  const overrideScene =
    sceneLock ??
    resolveSceneRef(state.current_scene_id, maps) ??
    resolveSceneRef(state.scene_id, maps);
  const overrideLocation =
    resolveLocationRef(state.current_location_id, maps) ??
    resolveLocationRef(state.location_id, maps) ??
    resolveLocationRef(stateRow?.location_id, maps) ??
    (overrideScene?.location_id ? resolveLocationRef(overrideScene.location_id, maps) : null);
  const explicitPresence = state.explicit_presence ?? state.presence_override ?? null;
  const hasOverride =
    Boolean(stateRow) ||
    Boolean(overrideScene) ||
    Boolean(overrideLocation) ||
    Boolean(explicitPresence) ||
    Boolean(state.visibility_override) ||
    Boolean(state.availability_override) ||
    Boolean(state.activity_override);

  let presence = explicitPresence ?? base.presence ?? 'present';
  let visibility = state.visibility_override ?? base.visibility;
  let availability = state.availability_override ?? base.availability;

  if (HIDDEN_STATUSES.has(status)) {
    presence = 'hidden';
    visibility = 'hidden';
  }

  if (LIMITED_STATUSES.has(status)) {
    presence = explicitPresence ?? 'present';
    availability = status === 'unconscious' ? 'unavailable' : (availability === 'available' ? 'limited' : availability);
  }

  if (status === 'scene_locked') {
    presence = 'present';
  }

  if (explicitPresence === 'absent') {
    visibility = 'not_visible';
  } else if (explicitPresence === 'hidden') {
    visibility = 'hidden';
  } else if (explicitPresence === 'unavailable') {
    availability = 'unavailable';
  }

  return {
    ...base,
    location: overrideLocation ?? base.location,
    scene: overrideScene ?? base.scene,
    activity: state.activity_override ?? base.activity,
    activity_text: state.activity_text_override ?? state.activity_override ?? base.activity_text,
    presence,
    visibility,
    availability,
    state_source: sceneLock
      ? 'scene_lock'
      : hasOverride
        ? (state.override_source ?? state.source ?? 'entity_state')
        : base.source,
    state,
    status,
  };
}

function isVisibleInScene(resolved, sceneId, locationId) {
  if (resolved.presence !== 'present') {
    return false;
  }

  if (resolved.visibility !== 'visible') {
    return false;
  }

  if (resolved.scene?.id) {
    return sameId(resolved.scene.id, sceneId);
  }

  return resolved.location?.id ? sameId(resolved.location.id, locationId) : false;
}

function actionsForPresence(npc, resolved) {
  const baseActions = arrayOf(npc.default_actions_json).length > 0
    ? npc.default_actions_json
    : ['observe', 'talk'];

  if (resolved.availability === 'unavailable') {
    return baseActions.includes('observe') ? ['observe'] : [];
  }

  if (resolved.availability === 'limited') {
    return baseActions.includes('observe') ? ['observe'] : baseActions.slice(0, 1);
  }

  return baseActions;
}

function mapPresence(entity, resolved, identity, includeDebug) {
  const actions = actionsForPresence(entity, resolved);
  const publicResult = {
    npc_id: entity.entity_key,
    display_name: identity.display_name,
    true_name_known: identity.true_name_known,
    presence: resolved.presence,
    location_id: resolved.location?.key ?? null,
    location_label: resolved.location?.name ?? null,
    scene_id: resolved.scene?.key ?? null,
    scene_label: resolved.scene?.name ?? null,
    activity: resolved.activity,
    activity_text: resolved.activity_text,
    availability: resolved.availability,
    visibility: resolved.visibility,
    available_actions: actions,
    actions,
    state_source: resolved.state_source ?? resolved.source,
  };

  if (!includeDebug) {
    return publicResult;
  }

  return {
    ...publicResult,
    debug: {
      true_name: entity.true_name ?? entity.name,
      label_source: identity.label_source,
      status: resolved.status,
      state: resolved.state ?? {},
      schedule_source: resolved.source,
    },
  };
}

function knownRelevantEntry(entity, resolved, identity) {
  if (!identity.true_name_known) {
    return null;
  }

  const state = resolved.state ?? {};
  if (
    (resolved.presence === 'dead' || ['dead', 'captured', 'removed'].includes(resolved.status)) &&
    !state.status_known_to_characters
  ) {
    return null;
  }

  const metadata = entity.metadata_json ?? {};
  const relevance =
    state.relevance ??
    metadata.relevance ??
    metadata.relevance_reason ??
    null;

  if (!relevance && !state.relevant_to_current_scene && !metadata.relevant_to_current_objective) {
    return null;
  }

  const lastKnownLocation =
    state.last_known_location_label ??
    resolved.location?.name ??
    null;

  return {
    npc_id: entity.entity_key,
    display_name: identity.display_name,
    presence: resolved.presence === 'present' ? 'absent' : resolved.presence,
    last_known_location_label: lastKnownLocation,
    relevance: relevance ?? 'relevant to your current investigation',
  };
}

export function npcPresenceToAffordance(presence) {
  if (presence.presence !== 'present' || presence.visibility !== 'visible') {
    return null;
  }

  const actions = presence.available_actions ?? presence.actions ?? [];
  if (actions.length === 0) {
    return null;
  }

  return {
    affordance_id: `npc:${presence.npc_id}`,
    label: presence.display_name,
    aliases: compactUnique([presence.display_name]),
    tags: ['npc'],
    actions,
    available_actions: actions.map((verb) => ({
      verb,
      action_key: `npc:${presence.npc_id}:${verb}`,
      repeat_policy: 'repeatable',
      interaction_id: null,
      transition_id: null,
    })),
    state: presence.availability === 'unavailable' ? 'locked' : 'available',
    source: 'npc_presence',
    npc_id: presence.npc_id,
  };
}

export async function listNpcPresenceForScene(
  {
    worldInstanceId,
    campaignId = null,
    characterId = null,
    sceneId,
    locationId,
    environment = null,
    knownFacts = [],
    includeDebug = false,
  },
  executor = { query }
) {
  await ensureNpcPresenceSchema();

  if (!worldInstanceId || !sceneId || !locationId) {
    return {
      visible_npcs: [],
      known_relevant_npcs: [],
      npc_affordances: [],
      all_presence: [],
      debug: includeDebug ? { reason: 'missing_scene_context' } : null,
    };
  }

  const worldId = await getWorldId(worldInstanceId, executor);
  const maps = await loadSceneAndLocationMaps(worldId, executor);
  const effectiveEnvironment = environment ?? (
    await getEffectiveEnvironment({ worldInstanceId, locationId, sceneId }, executor)
  ).context;
  const characterKnowledge = knownFacts.length > 0 || !characterId
    ? knownFacts
    : await listKnowledgeForCharacter({ characterId, worldInstanceId }, executor);

  const result = await executor.query(
    `
      SELECT
        entity.id AS world_entity_id,
        entity.entity_key,
        entity.current_location_id,
        entity.current_scene_id,
        entity.status AS entity_status,
        entity.state_json AS entity_state_json,
        entity.disposition AS entity_disposition,
        entity.faction,
        npc.id AS npc_template_id,
        npc.key,
        npc.name,
        npc.npc_type,
        npc.disposition,
        npc.role,
        npc.description,
        npc.true_name,
        npc.public_role_label,
        npc.unknown_label,
        npc.aliases_json,
        npc.default_location_key,
        npc.default_scene_key,
        npc.default_visibility,
        npc.default_availability,
        npc.default_actions_json,
        npc.identity_json,
        npc.schedule_json,
        npc.metadata_json,
        state.id AS state_id,
        state.location_id AS state_location_id,
        state.status AS runtime_status,
        state.state_json AS runtime_state_json
      FROM dnd5e_world_entity entity
      JOIN dnd5e_npc npc ON npc.id = entity.npc_template_id
      LEFT JOIN dnd5e_world_entity_state state
        ON state.world_instance_id = $2
       AND state.entity_key = entity.entity_key
      WHERE entity.world_id = $1
        AND entity.entity_type = 'npc'
        AND npc.is_active = TRUE
      ORDER BY npc.name ASC, entity.entity_key ASC
    `,
    [worldId, worldInstanceId]
  );

  const visibleNpcs = [];
  const knownRelevantNpcs = [];
  const allPresence = [];
  const identityIndex = [];

  for (const row of result.rows) {
    const entity = {
      ...row,
      status: row.entity_status,
      state_json: row.entity_state_json ?? {},
    };
    const stateRow = row.state_id
      ? {
          id: row.state_id,
          location_id: row.state_location_id,
          status: row.runtime_status,
          state_json: row.runtime_state_json ?? {},
        }
      : null;

    const scheduleEntry = selectScheduleEntry(entity.schedule_json, effectiveEnvironment);
    const base = {
      ...schedulePlacement(entity, entity, scheduleEntry, maps),
      presence: 'present',
    };
    const resolved = applyStateOverrides(base, entity, stateRow, maps);
    const identity = resolveNpcDisplayIdentity({ npc: entity, knownFacts: characterKnowledge });
    const mapped = mapPresence(entity, resolved, identity, includeDebug);

    allPresence.push(mapped);

    if (isVisibleInScene(resolved, sceneId, locationId)) {
      const aliases = npcAliasList(entity, identity.display_name);
      visibleNpcs.push({
        ...mapped,
        aliases: includeDebug ? aliases : undefined,
      });
      identityIndex.push({
        npc_id: entity.entity_key,
        display_name: identity.display_name,
        true_name_known: identity.true_name_known,
        match_terms: aliases,
        label_source: identity.label_source,
      });
      continue;
    }

    const knownRelevant = knownRelevantEntry(entity, resolved, identity);
    if (knownRelevant) {
      knownRelevantNpcs.push(knownRelevant);
    }
  }

  const npcAffordances = visibleNpcs
    .map(npcPresenceToAffordance)
    .filter(Boolean);

  return {
    visible_npcs: visibleNpcs.map(({ aliases, ...npc }) => npc),
    known_relevant_npcs: knownRelevantNpcs.slice(0, 5),
    npc_affordances: npcAffordances,
    npc_identity_index: identityIndex,
    all_presence: allPresence,
    debug: includeDebug
      ? {
          environment: effectiveEnvironment,
          npc_count: allPresence.length,
          visible_count: visibleNpcs.length,
          known_relevant_count: knownRelevantNpcs.length,
        }
      : null,
  };
}
