import { query } from '../config/db.js';

const GREYVALE_WORLD_SLUG = 'greyvale';
const GREYVALE_CAMPAIGN_SLUG = 'shadows-grey-road';
const RUSK_ENDPOINT_SCENE_KEY = 'shrine-ruins';

const RUSK_ENDPOINT_FLAGS = [
  'combat_pending',
  'shrine_confrontation_ready',
  'rusk_confronted_directly',
  'shrine_depth_unlocked',
  'understanding_high',
  'surface_threat_resolved'
];

function normalizeFlagValue(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function flagIsTruthy(flags, key) {
  return normalizeFlagValue(flags?.[key]) === true;
}

function normalizeFlags(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.flag_key] = normalizeFlagValue(row.flag_value_json);
    return acc;
  }, {});
}

function isGreyvaleContext({ worldSlug, campaignSlug }) {
  return worldSlug === GREYVALE_WORLD_SLUG || campaignSlug === GREYVALE_CAMPAIGN_SLUG;
}

function buildGreyvaleSliceEndpointState({
  worldSlug,
  campaignSlug,
  sceneKey,
  objectiveKey = null,
  flags = {},
  campaignId = null,
  characterId = null
} = {}) {
  if (!isGreyvaleContext({ worldSlug, campaignSlug })) {
    return null;
  }

  if (sceneKey !== RUSK_ENDPOINT_SCENE_KEY) {
    return null;
  }

  if (!flagIsTruthy(flags, 'combat_pending') || !flagIsTruthy(flags, 'shrine_confrontation_ready')) {
    return null;
  }

  const player = {
    is_endpoint_reached: true,
    state: 'endpoint_reached',
    label: 'Greyvale slice endpoint reached',
    headline: 'The shrine confrontation is ready.',
    message:
      'You have reached the end of the current Greyvale playable slice. Rusk has forced the shrine threat into a confrontation, and resolving that fight will require future combat support.',
    latest_development:
      'Rusk has forced the shrine threat into a confrontation. This is the end of the current Greyvale playable slice.',
    current_status: 'The current Greyvale slice is ready to continue when combat support is enabled.',
    next_step:
      'Review your journal, campaign history, and completed conversations, then return when the next Greyvale systems are enabled.',
    recovery_action: 'review_progress',
    current_scene_key: sceneKey,
    current_objective_key: objectiveKey
  };

  const debug = {
    internal_status: 'awaiting_future_support',
    handoff_kind: 'combat_pending',
    future_supported_status: 'future_supported_until_combat_system',
    target_encounter_id: 'shrine-rusk-confrontation',
    target_future_stage: '6I',
    source_scene_id: sceneKey,
    source_dialogue_scene_id: 'greyvale_rusk_at_the_shrine_dialogue',
    source_exit_id: 'exit_rusk_combat_pending',
    campaign_id: campaignId,
    character_id: characterId,
    objective_key: objectiveKey,
    flags,
    player_projection: {
      state: player.state,
      label: player.label
    },
    diagnostic:
      'Greyvale endpoint is derived from the Rusk combat handoff flags. Player projection hides internal combat/future-supported routing.'
  };

  return { player, debug };
}

async function loadGreyvaleEndpointFlags({ campaignId, characterId }) {
  if (!campaignId || !characterId) {
    return {};
  }

  const result = await query(
    `
      SELECT flag_key, flag_value_json
      FROM dnd5e_character_flag
      WHERE campaign_id = $1
        AND character_id = $2
        AND flag_key = ANY($3::text[])
    `,
    [campaignId, characterId, RUSK_ENDPOINT_FLAGS]
  );

  return normalizeFlags(result.rows);
}

async function getGreyvaleSliceEndpointState({
  campaignId,
  characterId,
  worldSlug,
  campaignSlug,
  sceneKey,
  objectiveKey = null
} = {}) {
  const flags = await loadGreyvaleEndpointFlags({ campaignId, characterId });
  return buildGreyvaleSliceEndpointState({
    worldSlug,
    campaignSlug,
    sceneKey,
    objectiveKey,
    flags,
    campaignId,
    characterId
  });
}

function buildGreyvaleSliceEndpointActionStatus(baseActionStatus = {}, endpointState) {
  if (!endpointState?.is_endpoint_reached) {
    return baseActionStatus;
  }

  return {
    ...baseActionStatus,
    state: 'slice_endpoint_reached',
    label: 'Slice endpoint reached',
    description:
      'You have reached the end of the current Greyvale playable slice. Review your progress or return when the next systems are enabled.',
    can_submit: false,
    can_edit: false,
    submitted_action: null
  };
}

export {
  GREYVALE_CAMPAIGN_SLUG,
  GREYVALE_WORLD_SLUG,
  RUSK_ENDPOINT_FLAGS,
  RUSK_ENDPOINT_SCENE_KEY,
  buildGreyvaleSliceEndpointActionStatus,
  buildGreyvaleSliceEndpointState,
  getGreyvaleSliceEndpointState,
  loadGreyvaleEndpointFlags
};
