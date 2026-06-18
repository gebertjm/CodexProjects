import {
  projectForGmDev,
  projectForPlayer,
  projectForTestHarness,
  scanForPlayerHiddenData,
} from './visibilityBoundary.js';

export const EXPLORATION_PLAYER_HIDDEN_KEYS = Object.freeze([
  'mechanical_details',
  'mechanics_debug',
  'exploration_mechanics_debug',
  'environment_modifiers',
  'environment_modifier_debug',
  'npc_schedule',
  'npc_schedule_debug',
  'npc_presence_debug',
  'surface_context_sources',
  'affordance_source_debug',
  'raw_state_reads',
  'raw_state_writes',
  'result_band_debug',
  'action_resolver_debug',
]);

function projectionOptions(options = {}) {
  return {
    ...options,
    extraHiddenKeys: [
      ...EXPLORATION_PLAYER_HIDDEN_KEYS,
      ...(options.extraHiddenKeys ?? options.extra_hidden_keys ?? []),
    ],
  };
}

export function projectExplorationForPlayer(payload = {}, options = {}) {
  return projectForPlayer(payload, projectionOptions(options));
}

export function projectExplorationForGmDev(payload = {}, options = {}) {
  return projectForGmDev(payload, options);
}

export function projectExplorationForTestHarness(payload = {}, options = {}) {
  return projectForTestHarness(payload, projectionOptions(options));
}

export function assertExplorationPlayerSafe(payload = {}, options = {}) {
  const violations = scanForPlayerHiddenData(payload, projectionOptions(options));
  if (violations.length > 0) {
    const error = new Error(
      `Exploration player payload leaked hidden/internal data: ${violations
        .slice(0, 5)
        .map((violation) => violation.message)
        .join('; ')}`
    );
    error.violations = violations;
    throw error;
  }
  return true;
}

export const explorationVisibilityAdapter = Object.freeze({
  projectForPlayer: projectExplorationForPlayer,
  projectForGmDev: projectExplorationForGmDev,
  projectForTestHarness: projectExplorationForTestHarness,
});
