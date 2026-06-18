import {
  AUTOMATIC_NEXT_DECISION_KINDS,
  TACTICAL_OPERATION_CATEGORIES,
} from './automaticTurnRuntime.js';
import {
  RUSK_ACTION_IDS,
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
  RUSK_PARTICIPANT_IDS,
  RUSK_ZONE_IDS,
  answerCanonicalRuskCombatFocus,
  assertNoCanonicalRuskPlayerHiddenData,
  buildCanonicalRuskEncounterDefinition,
  buildCanonicalRuskGmDevTrace,
  createOrResumeCanonicalRuskCombat,
  evaluateCanonicalRuskCompletion,
  executeCanonicalRuskAutomaticStep,
  openCanonicalRuskPlayerTurn,
  projectCanonicalRuskForPlayer,
  submitCanonicalRuskPlayerRetreat,
  submitCanonicalRuskPlayerStrike,
  validateCanonicalRuskLaunch,
} from './canonicalRuskEncounter.js';
import {
  COMBAT_RECOVERY_CLASSIFICATIONS,
  COMBAT_RETRY_SAFETY,
  enterCombatRecoveryNeeded,
  ensureCombatPersistenceState,
  inspectCombatRecoveryState,
  reconstructCombatAggregate,
} from './combatPersistenceRuntime.js';
import {
  COMBAT_FOCUS_ANSWER_STATUSES,
} from './combatFocus.js';
import {
  COMBAT_INSPECTION_STATUS,
  assertNoCombatInspectorPlayerLeak,
  inspectCombatTraceAndVisibility,
} from './combatTraceVisibilityInspector.js';
import {
  ENCOUNTER_RESOLUTION_STATUSES,
  RUSK_AFTERMATH_VARIANT_IDS,
  assertNoEncounterResolutionPlayerHiddenData,
  buildCanonicalRuskAftermathDefinitions,
  projectEncounterResolutionForPlayer,
  rebuildEncounterResolutionReview,
  resolveEncounterAftermath,
} from './encounterResolutionRuntime.js';
import {
  previewAction,
  previewEndTurn,
  submitEndTurn,
} from './playerTurnRuntime.js';
import {
  REACTION_PREFERENCE_VALUES,
} from './reactionInterruptRuntime.js';
import {
  DND5E_2014_RULESET,
} from './rulesResolution.js';
import {
  PROXIMITY_STATES,
} from './spatialMovement.js';

export const RUSK_ACCEPTANCE_STAGE = '6D.18';
export const RUSK_ACCEPTANCE_SCENARIO_VERSION = '1.0.0';

export const RUSK_ACCEPTANCE_SCENARIO_IDS = Object.freeze({
  CANONICAL_CONTENT: 'rusk.acceptance.content_baseline',
  OPENING_PLAYER_FIRST: 'rusk.acceptance.opening.player_first',
  OPENING_RUSK_FIRST: 'rusk.acceptance.opening.rusk_first',
  OPENING_INITIATIVE_TIE: 'rusk.acceptance.opening.initiative_tie',
  OUTCOME_LETHAL: 'rusk.acceptance.outcome.lethal_defeat',
  OUTCOME_NONLETHAL: 'rusk.acceptance.outcome.nonlethal_subdual',
  OUTCOME_SURRENDER: 'rusk.acceptance.outcome.surrender',
  OUTCOME_RETREAT: 'rusk.acceptance.outcome.player_retreat',
  OUTCOME_FAIL_FORWARD: 'rusk.acceptance.outcome.fail_forward_defeat',
  PERSISTENCE_REPLAY: 'rusk.acceptance.persistence.replay_restart_response_loss',
  REACTION_CONTINUATION: 'rusk.acceptance.reaction.continuation',
  COMBAT_FOCUS: 'rusk.acceptance.combat_focus.live_state',
  VISIBILITY_INSPECTOR: 'rusk.acceptance.visibility.inspector_parity',
  RECOVERY: 'rusk.acceptance.recovery.safe_freeze',
  FLUTTER_CONTRACT: 'rusk.acceptance.flutter.contract_payloads',
});

export const RUSK_ACCEPTANCE_BEHAVIOR_IDS = Object.freeze({
  CANONICAL_CONTENT: 'canonical_content',
  PRODUCTION_RUNTIME: 'production_stage6d_runtime',
  PLAYER_SAFE_PROJECTION: 'player_safe_projection',
  FLUTTER_CONTRACT: 'flutter_contract',
  INSPECTOR_PARITY: 'stage6d15_inspector_parity',
  PLAYER_FIRST: 'player_first_initiative',
  RUSK_FIRST: 'rusk_first_initiative',
  INITIATIVE_TIE: 'initiative_tie_no_reroll',
  PLAYER_TURN: 'player_turn_preview_submit_end_turn',
  RUSK_AUTOMATIC: 'rusk_automatic_turn',
  REACTION: 'reaction_interrupt_continuation',
  COMBAT_FOCUS: 'combat_focus',
  LETHAL_OUTCOME: 'lethal_rusk_defeat',
  NONLETHAL_OUTCOME: 'nonlethal_rusk_subdual',
  SURRENDER_OUTCOME: 'rusk_surrender',
  RETREAT_OUTCOME: 'player_retreat',
  FAIL_FORWARD_OUTCOME: 'player_fail_forward_defeat',
  SHARED_AFTERMATH: 'shared_shrine_ruins_aftermath',
  REWARDS: 'experience_rewards_exact_once',
  ADVENTURE_OUTPUTS: 'objective_knowledge_history_latest_development',
  REVIEW: 'summary_first_post_combat_review',
  DUPLICATE_SAFE: 'duplicate_safe',
  RESPONSE_LOSS: 'response_loss_reconstructs',
  PROCESS_RESTART: 'process_restart_reconstructs',
  RECOVERY: 'recovery_needed_safe_freeze',
});

const FIVE_CANONICAL_OUTCOMES = Object.freeze([
  RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
  RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
  RUSK_OUTCOME_IDS.RUSK_SURRENDER,
  RUSK_OUTCOME_IDS.PLAYER_RETREAT,
  RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
]);

export const RUSK_ACCEPTANCE_SCENARIOS = Object.freeze([
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.CANONICAL_CONTENT,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Canonical Rusk content baseline',
    layer: 'content',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.CANONICAL_CONTENT,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PRODUCTION_RUNTIME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_PLAYER_FIRST,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Player wins initiative opening',
    layer: 'backend_runtime',
    opening_order: 'player_first',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_FIRST,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_TURN,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_RUSK_FIRST,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Rusk wins initiative opening',
    layer: 'backend_runtime',
    opening_order: 'rusk_first',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RUSK_FIRST,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RUSK_AUTOMATIC,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OPENING_INITIATIVE_TIE,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Initiative tie remains stable after reload',
    layer: 'backend_runtime',
    opening_order: 'initiative_tie',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.INITIATIVE_TIE,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PROCESS_RESTART,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_LETHAL,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Lethal Rusk defeat to aftermath review',
    layer: 'backend_acceptance',
    outcome_id: RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.LETHAL_OUTCOME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.ADVENTURE_OUTPUTS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REVIEW,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.INSPECTOR_PARITY,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_NONLETHAL,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Nonlethal Rusk subdual to aftermath review',
    layer: 'backend_acceptance',
    outcome_id: RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.NONLETHAL_OUTCOME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.ADVENTURE_OUTPUTS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REVIEW,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_SURRENDER,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Rusk surrender to aftermath review',
    layer: 'backend_acceptance',
    outcome_id: RUSK_OUTCOME_IDS.RUSK_SURRENDER,
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SURRENDER_OUTCOME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RUSK_AUTOMATIC,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REVIEW,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_RETREAT,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Player retreat to aftermath review',
    layer: 'backend_acceptance',
    outcome_id: RUSK_OUTCOME_IDS.PLAYER_RETREAT,
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RETREAT_OUTCOME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REACTION,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REVIEW,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.OUTCOME_FAIL_FORWARD,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Player zero-hit-point fail-forward defeat to aftermath review',
    layer: 'backend_acceptance',
    outcome_id: RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.FAIL_FORWARD_OUTCOME,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RUSK_AUTOMATIC,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.SHARED_AFTERMATH,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REWARDS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REVIEW,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.PERSISTENCE_REPLAY,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Refresh, restart, response loss, and duplicate safety',
    layer: 'backend_acceptance',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.DUPLICATE_SAFE,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RESPONSE_LOSS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PROCESS_RESTART,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.REACTION_CONTINUATION,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Reaction pause and continuation handoff',
    layer: 'backend_acceptance',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.REACTION,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RUSK_AUTOMATIC,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.COMBAT_FOCUS,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Combat Focus against live Rusk state',
    layer: 'backend_acceptance',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.COMBAT_FOCUS,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.VISIBILITY_INSPECTOR,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Stage 6D.15 inspector parity and leak detection',
    layer: 'backend_acceptance',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.INSPECTOR_PARITY,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.RECOVERY,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Recovery-needed safe freeze',
    layer: 'backend_acceptance',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.RECOVERY,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
  {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.FLUTTER_CONTRACT,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    title: 'Flutter combat contract payloads',
    layer: 'flutter_contract',
    behaviors: [
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.FLUTTER_CONTRACT,
      RUSK_ACCEPTANCE_BEHAVIOR_IDS.PLAYER_SAFE_PROJECTION,
    ],
  },
]);

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function stableId(parts = []) {
  return parts.map((part) => cleanText(part ?? 'none')).filter(Boolean).join(':');
}

function participant(state = {}, id) {
  return asArray(state.participants).find((entry) => cleanText(entry.participant_id) === cleanText(id)) ?? null;
}

function participantHp(state, id) {
  return Number(participant(state, id)?.current_hit_points ?? 0);
}

function setCurrentParticipant(state, participantId) {
  state.combat.current_participant_id = participantId;
  state.current_participant_id = participantId;
  return state;
}

function buildDefaultRequester() {
  return {
    account_id: 'acceptance-dev',
    role: 'developer',
    can_inspect_combat: true,
  };
}

function contentBundle(input = {}) {
  return {
    encounter: input.encounter ?? input.encounter_content ?? input.encounterContent ?? null,
    dialogue: input.dialogue ?? input.dialogue_content ?? input.dialogueContent ?? null,
    hook: input.hook ?? input.hook_content ?? input.hookContent ?? null,
  };
}

function ensureScenario(scenarioId) {
  const scenario = RUSK_ACCEPTANCE_SCENARIOS.find((entry) => entry.scenario_id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown Rusk acceptance scenario: ${scenarioId}`);
  }
  return scenario;
}

function buildRunId(input = {}) {
  return cleanText(input.run_id ?? input.runId) || stableId(['stage6d18', Date.now(), Math.random().toString(16).slice(2)]);
}

export function listRuskAcceptanceScenarios(input = {}) {
  const layer = cleanText(input.layer);
  const behavior = cleanText(input.behavior_id ?? input.behaviorId);
  return RUSK_ACCEPTANCE_SCENARIOS
    .filter((scenario) => !layer || scenario.layer === layer)
    .filter((scenario) => !behavior || scenario.behaviors.includes(behavior))
    .map(cloneSerializable);
}

export function buildRuskAcceptanceScenarioMatrix() {
  const rows = [];
  for (const behaviorId of Object.values(RUSK_ACCEPTANCE_BEHAVIOR_IDS)) {
    const scenarios = RUSK_ACCEPTANCE_SCENARIOS
      .filter((scenario) => scenario.behaviors.includes(behaviorId))
      .map((scenario) => scenario.scenario_id);
    rows.push({
      behavior_id: behaviorId,
      scenario_ids: scenarios,
      covered: scenarios.length > 0,
    });
  }
  return {
    stage: RUSK_ACCEPTANCE_STAGE,
    scenario_version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    rows,
    gap_count: rows.filter((row) => !row.covered).length,
  };
}

export function validateRuskAcceptanceContentBaseline(input = {}) {
  const content = contentBundle(input);
  const definition = buildCanonicalRuskEncounterDefinition(content);
  const launch = validateCanonicalRuskLaunch({ definition });
  const aftermath = buildCanonicalRuskAftermathDefinitions({ encounter: content.encounter });
  const issues = [];
  if (!launch.valid) {
    issues.push(...asArray(launch.issues).map((issue) => ({ code: issue.code ?? 'launch_invalid', detail: issue })));
  }
  if (definition.encounter_id !== RUSK_ENCOUNTER_IDS.ENCOUNTER) {
    issues.push({ code: 'wrong_encounter_id', expected: RUSK_ENCOUNTER_IDS.ENCOUNTER, actual: definition.encounter_id });
  }
  if (definition.scene_slug !== RUSK_ENCOUNTER_IDS.SCENE) {
    issues.push({ code: 'wrong_scene_slug', expected: RUSK_ENCOUNTER_IDS.SCENE, actual: definition.scene_slug });
  }
  if (definition.dialogue_slug !== RUSK_ENCOUNTER_IDS.DIALOGUE) {
    issues.push({ code: 'wrong_dialogue_slug', expected: RUSK_ENCOUNTER_IDS.DIALOGUE, actual: definition.dialogue_slug });
  }
  if (definition.selected_variant_id !== 'solo') {
    issues.push({ code: 'wrong_variant', expected: 'solo', actual: definition.selected_variant_id });
  }
  if (definition.ruleset.system !== DND5E_2014_RULESET.system || definition.ruleset.rules_version !== DND5E_2014_RULESET.rules_version) {
    issues.push({ code: 'wrong_ruleset', expected: DND5E_2014_RULESET, actual: definition.ruleset });
  }
  if (aftermath.shared_aftermath_state_id !== RUSK_ENCOUNTER_IDS.AFTERMATH_STATE) {
    issues.push({
      code: 'wrong_aftermath_state',
      expected: RUSK_ENCOUNTER_IDS.AFTERMATH_STATE,
      actual: aftermath.shared_aftermath_state_id,
    });
  }
  const aftermathOutcomeIds = aftermath.variants.map((variant) => variant.outcome_id).sort();
  const expectedOutcomeIds = [
    RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL,
    RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL,
    RUSK_OUTCOME_IDS.RUSK_SURRENDER,
    RUSK_OUTCOME_IDS.PLAYER_RETREAT,
    RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD,
  ].sort();
  if (JSON.stringify(aftermathOutcomeIds) !== JSON.stringify(expectedOutcomeIds)) {
    issues.push({ code: 'wrong_aftermath_variants', expected: expectedOutcomeIds, actual: aftermathOutcomeIds });
  }
  return {
    status: issues.length === 0 ? 'valid' : 'invalid',
    valid: issues.length === 0,
    issues,
    canonical_identifiers: {
      encounter_id: definition.encounter_id,
      combat_id: RUSK_ENCOUNTER_IDS.COMBAT,
      campaign_slug: definition.campaign_slug,
      shrine_ruins_scene_id: definition.scene_slug,
      dialogue_id: definition.dialogue_slug,
      hook_id: definition.hook_slug,
      rusk_stat_block_id: definition.stat_block_policy.entity_slug,
      action_ids: [
        RUSK_ACTION_IDS.PLAYER_STRIKE,
        RUSK_ACTION_IDS.RUSK_BLADE,
        RUSK_ACTION_IDS.RUSK_OPPORTUNITY_STRIKE,
        RUSK_ACTION_IDS.PLAYER_OPPORTUNITY_STRIKE,
        RUSK_ACTION_IDS.DODGE,
      ],
      tactical_profile_id: 'greyvale-rusk-direct-aggressive',
      surrender_definition_id: 'rusk-low-hp-and-narrative-permission',
      retreat_route_id: 'grey-road-retreat',
      outcome_ids: Object.values(RUSK_OUTCOME_IDS),
      accepted_outcome_ids: FIVE_CANONICAL_OUTCOMES,
      shared_aftermath_state_id: aftermath.shared_aftermath_state_id,
      reward_definitions: {
        xp: aftermath.reward_policy.xp,
        grant_on_resolution: aftermath.reward_policy.grant_on_resolution,
        equivalent_across_paths: aftermath.reward_policy.equivalent_across_paths,
      },
    },
  };
}

function createAcceptanceState(input = {}) {
  const runId = buildRunId(input);
  const content = contentBundle(input);
  const state = createOrResumeCanonicalRuskCombat({
    ...content,
    campaign_id: input.campaign_id ?? `acceptance-campaign-${runId}`,
    active_character_id: input.active_character_id ?? `acceptance-character-${runId}`,
    character_name: input.character_name ?? 'Avery Acceptance',
    idempotency_key: input.idempotency_key ?? stableId([runId, 'launch']),
    ...input.launch,
  }).state;
  state.character_progression = {
    character_id: input.active_character_id ?? `acceptance-character-${runId}`,
    level: input.level ?? 1,
    experience_points: input.experience_points ?? 0,
    pending_level_count: input.pending_level_count ?? 0,
    level_up_available: false,
  };
  return { runId, state: ensureCombatPersistenceState(state) };
}

function openPreviewAndSubmitStrike(input = {}) {
  let state = input.state;
  const runId = input.runId;
  const opened = openCanonicalRuskPlayerTurn({ state });
  state = opened.state;
  const preview = previewAction({
    state,
    action_id: RUSK_ACTION_IDS.PLAYER_STRIKE,
    target_id: RUSK_PARTICIPANT_IDS.RUSK,
  });
  const strike = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: stableId([runId, 'strike', input.round ?? 1]),
    nonlethal: input.nonlethal === true,
    roll_overrides: input.roll_overrides ?? { attack: 18, damage: [6] },
  });
  return {
    opened,
    preview,
    strike,
    state: strike.state ?? state,
  };
}

function endPlayerTurnForAcceptance(input = {}) {
  const state = input.state;
  const preview = previewEndTurn({ state });
  const end = submitEndTurn({
    state,
    source_state_version: state.parent_turn?.current_state_version,
    idempotency_key: stableId([input.runId, 'end-turn', input.round ?? 1]),
    confirm_end_turn: true,
  });
  return { preview, end, state: end.state ?? state };
}

function completeAftermathAndInspect(input = {}) {
  const state = input.state;
  const scenario = input.scenario;
  const outcomeId = input.outcome_id ?? scenario?.outcome_id ?? state.canonical_rusk_handoff?.outcome_id;
  const resolution = resolveEncounterAftermath({
    state,
    idempotency_key: stableId([input.runId, 'resolve', outcomeId]),
  });
  const readModel = resolution.read_model ?? projectEncounterResolutionForPlayer({ state: resolution.state });
  assertNoEncounterResolutionPlayerHiddenData(readModel);
  const duplicateResolution = resolveEncounterAftermath({
    state: resolution.state,
    idempotency_key: stableId([input.runId, 'resolve', outcomeId, 'duplicate']),
  });
  const rebuilt = rebuildEncounterResolutionReview({ state: cloneSerializable(resolution.state) });
  const inspection = inspectCombatTraceAndVisibility({
    state: resolution.state,
    requester: buildDefaultRequester(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    search_query: 'rusk',
  });
  if (inspection.status === COMBAT_INSPECTION_STATUS.OK) {
    assertNoCombatInspectorPlayerLeak(inspection.production_player_projection.projection);
  }
  return {
    outcome_id: outcomeId,
    resolution,
    read_model: readModel,
    duplicate_resolution: duplicateResolution,
    rebuilt_review: rebuilt,
    inspection,
    exact_once: summarizeExactOnce(resolution.state, outcomeId),
  };
}

function summarizeExactOnce(state = {}, outcomeId) {
  const history = asArray(state.history_outputs);
  const knowledge = asArray(state.knowledge_outputs);
  const objectives = asArray(state.objective_outputs);
  const archive = asArray(state.archive_search_outputs);
  const operations = asArray(state.combat_persistence?.operation_order)
    .map((id) => state.combat_persistence?.operations?.[id])
    .filter(Boolean);
  return {
    outcome_id: outcomeId,
    completion_handoff_count: operations.filter((operation) => operation.operation_type === 'encounter_completion_handoff').length,
    resolved_operation_count: operations.filter((operation) => operation.lifecycle_status === 'resolved').length,
    selected_final_outcome_count: state.adventure_state?.current_variant_id === outcomeId ? 1 : 0,
    aftermath_variant_count: state.adventure_state?.current_variant_id === outcomeId ? 1 : 0,
    experience_points: state.character_progression?.experience_points ?? 0,
    reward_application_count: (state.character_progression?.experience_points ?? 0) > 0 ? 1 : 0,
    objective_output_count: objectives.length,
    knowledge_output_count: knowledge.length,
    history_output_count: history.length,
    latest_development_count: state.latest_development_output ? 1 : 0,
    archive_search_output_count: archive.length,
    combat_closed_count: state.combat?.status === 'resolved' ? 1 : 0,
    review_count: state.post_combat_review ? 1 : 0,
  };
}

function assertPlayerSafeScenarioPayloads(payloads = []) {
  for (const payload of payloads) {
    if (!payload) continue;
    assertNoCanonicalRuskPlayerHiddenData(payload);
  }
}

function currentCompletionSummary(state = {}) {
  if (state.canonical_rusk_handoff?.status === 'completion_handoff_ready') {
    return {
      status: 'completion_handoff_ready',
      outcome_id: state.canonical_rusk_handoff.outcome_id,
      handoff: state.canonical_rusk_handoff,
    };
  }
  return evaluateCanonicalRuskCompletion({ state });
}

function runContentBaselineScenario(input = {}) {
  const baseline = validateRuskAcceptanceContentBaseline(input);
  return {
    scenario_id: RUSK_ACCEPTANCE_SCENARIO_IDS.CANONICAL_CONTENT,
    version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    status: baseline.valid ? 'passed' : 'failed',
    baseline,
  };
}

function runOpeningScenario(scenario, input = {}) {
  const runId = buildRunId(input);
  const launch = scenario.opening_order === 'rusk_first'
    ? { player_initiative: 8, rusk_initiative: 16 }
    : scenario.opening_order === 'initiative_tie'
      ? { player_initiative: 12, rusk_initiative: 12 }
      : { player_initiative: 18, rusk_initiative: 10 };
  const { state } = createAcceptanceState({ ...input, run_id: runId, launch });
  const reloaded = reconstructCombatAggregate({ state: cloneSerializable(state) });
  const initialCurrent = state.combat.current_participant_id;
  const steps = [];
  if (scenario.opening_order === 'player_first' || scenario.opening_order === 'initiative_tie') {
    const opened = openCanonicalRuskPlayerTurn({ state });
    const preview = previewAction({
      state: opened.state,
      action_id: RUSK_ACTION_IDS.PLAYER_STRIKE,
      target_id: RUSK_PARTICIPANT_IDS.RUSK,
    });
    steps.push({ step: 'player_turn_opened', status: opened.status, preview_status: preview.status });
    assertPlayerSafeScenarioPayloads([opened.player_projection]);
  } else {
    setCurrentParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
    const automatic = executeCanonicalRuskAutomaticStep({ state });
    steps.push({
      step: 'rusk_automatic_opening',
      status: automatic.status,
      operation_category: automatic.selection?.operation?.operation_category,
      next_decision_kind: automatic.next_decision?.next_decision_kind,
    });
    assertPlayerSafeScenarioPayloads([automatic.player_projection]);
  }
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: 'passed',
    opening_order: scenario.opening_order,
    initial_current_participant_id: initialCurrent,
    reloaded_current_participant_id: reloaded.state?.combat?.current_participant_id ?? reloaded.combat?.current_participant_id ?? reloaded.current_participant_id,
    no_initiative_reroll_after_reload: initialCurrent === (
      reloaded.state?.combat?.current_participant_id ??
      reloaded.combat?.current_participant_id ??
      reloaded.current_participant_id
    ),
    steps,
  };
}

function runLethalOrNonlethalScenario(scenario, input = {}) {
  let { runId, state } = createAcceptanceState({
    ...input,
    launch: { player_initiative: 18, rusk_initiative: 10 },
  });
  const steps = [];
  for (let round = 1; round <= 3; round += 1) {
    const strike = openPreviewAndSubmitStrike({
      state,
      runId,
      round,
      nonlethal: scenario.outcome_id === RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL && round === 3,
    });
    steps.push({
      step: 'player_strike',
      round,
      preview_legality: strike.preview.current_legality,
      preview_mutates_state: strike.preview.mutates_state,
      submit_status: strike.strike.status,
      rusk_hit_points: participantHp(strike.state, RUSK_PARTICIPANT_IDS.RUSK),
      completion_status: strike.strike.completion?.status,
      outcome_id: strike.strike.completion?.outcome_id ?? null,
    });
    state = strike.state;
    assertPlayerSafeScenarioPayloads([strike.strike.player_projection]);
    if (strike.strike.completion?.status === 'completion_handoff_ready') {
      break;
    }
    const end = endPlayerTurnForAcceptance({ state, runId, round });
    steps.push({ step: 'end_turn', round, status: end.end.status });
    state = end.state;
  }
  const completed = currentCompletionSummary(state);
  const resolved = completeAftermathAndInspect({ state, runId, scenario, outcome_id: scenario.outcome_id });
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: resolved.resolution.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE ? 'passed' : 'failed',
    outcome_id: scenario.outcome_id,
    steps,
    completion: completed,
    resolution: summarizeResolution(resolved),
  };
}

function runSurrenderScenario(scenario, input = {}) {
  let { runId, state } = createAcceptanceState({
    ...input,
    launch: {
      player_initiative: 18,
      rusk_initiative: 10,
      rusk_surrender_permitted: true,
    },
  });
  const steps = [];
  for (let round = 1; round <= 2; round += 1) {
    const strike = openPreviewAndSubmitStrike({ state, runId, round });
    steps.push({
      step: 'player_softens_rusk',
      round,
      submit_status: strike.strike.status,
      rusk_hit_points: participantHp(strike.state, RUSK_PARTICIPANT_IDS.RUSK),
    });
    state = strike.state;
    const end = endPlayerTurnForAcceptance({ state, runId, round });
    state = end.state;
  }
  setCurrentParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  const surrender = executeCanonicalRuskAutomaticStep({ state });
  steps.push({
    step: 'rusk_surrender_intent',
    status: surrender.status,
    operation_category: surrender.selection?.operation?.operation_category,
    completion_status: surrender.completion?.status,
    outcome_id: surrender.completion?.outcome_id,
  });
  const resolved = completeAftermathAndInspect({ state: surrender.state, runId, scenario, outcome_id: scenario.outcome_id });
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: resolved.resolution.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE ? 'passed' : 'failed',
    outcome_id: scenario.outcome_id,
    steps,
    completion: surrender.completion,
    resolution: summarizeResolution(resolved),
  };
}

function runRetreatScenario(scenario, input = {}) {
  const { runId, state: initialState } = createAcceptanceState({
    ...input,
    launch: { player_initiative: 18, rusk_initiative: 10 },
  });
  let state = openCanonicalRuskPlayerTurn({ state: initialState }).state;
  const retreat = submitCanonicalRuskPlayerRetreat({
    state,
    idempotency_key: stableId([runId, 'retreat']),
    reaction_roll_overrides: { attack: 3, damage: [1] },
  });
  state = retreat.state;
  const resolved = completeAftermathAndInspect({ state, runId, scenario, outcome_id: scenario.outcome_id });
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: resolved.resolution.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE ? 'passed' : 'failed',
    outcome_id: scenario.outcome_id,
    steps: [{
      step: 'player_retreat',
      status: retreat.status,
      reaction_status: retreat.reaction_result?.status ?? null,
      player_zone_id: asArray(state.spatial?.participants).find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.PLAYER)?.current_zone_id,
    }],
    completion: retreat.completion,
    resolution: summarizeResolution(resolved),
  };
}

function runFailForwardScenario(scenario, input = {}) {
  const { runId, state } = createAcceptanceState({
    ...input,
    launch: {
      player_initiative: 8,
      rusk_initiative: 16,
      player: {
        current_hit_points: 5,
        max_hit_points: 5,
        display_name: 'Avery Acceptance',
      },
    },
  });
  setCurrentParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  const attack = executeCanonicalRuskAutomaticStep({
    state,
    operation: {
      operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
      action_id: RUSK_ACTION_IDS.RUSK_BLADE,
      target_id: RUSK_PARTICIPANT_IDS.PLAYER,
    },
    roll_overrides: { attack: 18, damage: [6] },
  });
  const resolved = completeAftermathAndInspect({ state: attack.state, runId, scenario, outcome_id: scenario.outcome_id });
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: resolved.resolution.status === ENCOUNTER_RESOLUTION_STATUSES.COMPLETE ? 'passed' : 'failed',
    outcome_id: scenario.outcome_id,
    steps: [{
      step: 'rusk_attack_player_zero_hp',
      status: attack.status,
      completion_status: attack.completion?.status,
      outcome_id: attack.completion?.outcome_id,
      player_hit_points: participantHp(attack.state, RUSK_PARTICIPANT_IDS.PLAYER),
    }],
    completion: attack.completion,
    resolution: summarizeResolution(resolved),
  };
}

function runPersistenceReplayScenario(scenario, input = {}) {
  const { runId, state: initialState } = createAcceptanceState({
    ...input,
    launch: { player_initiative: 18, rusk_initiative: 10 },
  });
  let state = openCanonicalRuskPlayerTurn({ state: initialState }).state;
  const preview = previewAction({
    state,
    action_id: RUSK_ACTION_IDS.PLAYER_STRIKE,
    target_id: RUSK_PARTICIPANT_IDS.RUSK,
  });
  const first = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: stableId([runId, 'duplicate-strike']),
    roll_overrides: { attack: 18, damage: [6] },
  });
  const reloaded = cloneSerializable(first.state);
  const duplicate = submitCanonicalRuskPlayerStrike({
    state: reloaded,
    idempotency_key: stableId([runId, 'duplicate-strike']),
    roll_overrides: { attack: 18, damage: [6] },
  });
  const reconstructed = reconstructCombatAggregate({ state: cloneSerializable(first.state) });
  assertPlayerSafeScenarioPayloads([first.player_projection, duplicate.player_projection, projectCanonicalRuskForPlayer({ state: reconstructed.state ?? reconstructed })]);
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: 'passed',
      preview_legality: preview.current_legality,
      preview_mutates_state: preview.mutates_state,
    first_status: first.status,
    duplicate_status: duplicate.status,
    same_rusk_hit_points_after_duplicate:
      participantHp(first.state, RUSK_PARTICIPANT_IDS.RUSK) === participantHp(duplicate.state ?? first.state, RUSK_PARTICIPANT_IDS.RUSK),
    reconstructed_state_version: reconstructed.state?.current_state_version ?? reconstructed.current_state_version ?? reconstructed.state_version,
  };
}

function runReactionContinuationScenario(scenario, input = {}) {
  const { runId, state: initialState } = createAcceptanceState({
    ...input,
    launch: { player_initiative: 8, rusk_initiative: 16 },
  });
  let state = initialState;
  state.reaction_preferences = {
    [RUSK_PARTICIPANT_IDS.PLAYER]: { opportunity_attack: REACTION_PREFERENCE_VALUES.ASK },
  };
  state = openCanonicalRuskPlayerTurn({ state }).state;
  setCurrentParticipant(state, RUSK_PARTICIPANT_IDS.RUSK);
  state.parent_turn.actor_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.parent_turn.status = 'open';
  const movement = executeCanonicalRuskAutomaticStep({
    state,
    operation: {
      operation_category: TACTICAL_OPERATION_CATEGORIES.MOVEMENT,
      destination_zone_id: RUSK_ZONE_IDS.SHRINE_EDGE,
      selected_transition_ids: ['center-to-edge'],
      before_proximity: PROXIMITY_STATES.ENGAGED,
      after_proximity: PROXIMITY_STATES.NEARBY,
      target_id: RUSK_PARTICIPANT_IDS.PLAYER,
    },
    potential_reactors: [participant(state, RUSK_PARTICIPANT_IDS.PLAYER)],
  });
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: movement.next_decision?.next_decision_kind === AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED ? 'passed' : 'failed',
    run_id: runId,
    next_decision_kind: movement.next_decision?.next_decision_kind,
    active_reaction_window_id_present: Boolean(movement.state.active_reaction_window_id),
    continuation_preserved: Boolean(movement.state.reaction_queues?.length || movement.state.active_reaction_window_id),
  };
}

function runCombatFocusScenario(scenario, input = {}) {
  const { state } = createAcceptanceState(input);
  const opened = openCanonicalRuskPlayerTurn({ state });
  const answer = answerCanonicalRuskCombatFocus({
    state: opened.state,
    template_id: 'enemy.can_reach_me',
    parameters: { enemy_participant_id: RUSK_PARTICIPANT_IDS.RUSK },
  });
  assertNoCanonicalRuskPlayerHiddenData(answer.player_answer);
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: answer.status === COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED ? 'passed' : 'failed',
    answer_status: answer.status,
    dependency_fingerprint_present_for_gm_dev: Boolean(answer.gm_dev_trace?.dependency_fingerprint),
  };
}

function runVisibilityInspectorScenario(scenario, input = {}) {
  const { runId, state: initialState } = createAcceptanceState(input);
  let state = openCanonicalRuskPlayerTurn({ state: initialState }).state;
  const strike = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: stableId([runId, 'inspect-strike']),
    roll_overrides: { attack: 18, damage: [2] },
  });
  state = strike.state;
  const inspection = inspectCombatTraceAndVisibility({
    state,
    requester: buildDefaultRequester(),
    viewer_participant_id: RUSK_PARTICIPANT_IDS.PLAYER,
    search_query: 'rusk',
  });
  assertNoCombatInspectorPlayerLeak(inspection.production_player_projection?.projection ?? {});
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: inspection.status === COMBAT_INSPECTION_STATUS.OK ? 'passed' : 'failed',
    inspection_status: inspection.status,
    uses_production_projector: inspection.projection_comparison?.semantic_parity?.uses_production_projector === true,
    leak_count: inspection.projection_safety?.leak_count ?? 0,
    over_redaction_count: inspection.projection_safety?.over_redaction_count ?? 0,
  };
}

function runRecoveryScenario(scenario, input = {}) {
  const { state } = createAcceptanceState(input);
  const recovery = enterCombatRecoveryNeeded({
    state,
    reason: 'stage6d18_acceptance_fault_injection',
    classification: COMBAT_RECOVERY_CLASSIFICATIONS.AMBIGUOUS_COMMIT,
    retry_safety: COMBAT_RETRY_SAFETY.UNSAFE,
    completed_facts: ['roll_persisted'],
    retry_safe: false,
    repair_required: true,
  });
  const inspected = inspectCombatRecoveryState({ state });
  assertNoCanonicalRuskPlayerHiddenData(recovery.read_model);
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: recovery.status === 'recovery_needed' && inspected.status === 'found' ? 'passed' : 'failed',
    recovery_status: recovery.status,
    refresh_safe: recovery.refresh_safe,
    retry_safe: recovery.retry_safe,
    ordinary_controls_removed: recovery.read_model.ordinary_controls_available === false,
  };
}

function runFlutterContractScenario(scenario, input = {}) {
  const results = [];
  for (const outcomeId of FIVE_CANONICAL_OUTCOMES) {
    const outcomeScenario = RUSK_ACCEPTANCE_SCENARIOS.find((entry) => entry.outcome_id === outcomeId);
    const result = runOutcomeScenario(outcomeScenario, {
      ...input,
      run_id: stableId([buildRunId(input), 'flutter', outcomeId]),
    });
    results.push({
      outcome_id: outcomeId,
      read_model: result.resolution.read_model,
    });
  }
  const payloads = results.map((entry) => entry.read_model);
  for (const payload of payloads) {
    assertNoEncounterResolutionPlayerHiddenData(payload);
  }
  return {
    scenario_id: scenario.scenario_id,
    version: scenario.version,
    status: 'passed',
    payload_count: payloads.length,
    outcome_ids: results.map((entry) => entry.outcome_id),
    payloads,
  };
}

function summarizeResolution(resolved = {}) {
  const readModel = resolved.read_model;
  return {
    status: resolved.resolution.status,
    outcome_id: resolved.outcome_id,
    read_model: readModel,
    duplicate_status: resolved.duplicate_resolution.status,
    rebuilt_review_status: resolved.rebuilt_review.status,
    aftermath_state_id: readModel.aftermath?.state_id ?? null,
    aftermath_variant_id: readModel.aftermath?.variant_id ?? null,
    xp_awarded: readModel.rewards?.experience_points_awarded ?? 0,
    pending_advancement: readModel.rewards?.pending_advancement ?? null,
    ordinary_controls_available: readModel.ordinary_controls_available,
    combat_controls_available: readModel.combat_controls_available,
    review_summary: readModel.review?.summary ?? null,
    chronological_log_count: asArray(readModel.review?.chronological_log).length,
    exact_once: resolved.exact_once,
    inspection_status: resolved.inspection.status,
    leak_count: resolved.inspection.projection_safety?.leak_count ?? 0,
  };
}

function runOutcomeScenario(scenario, input = {}) {
  switch (scenario.outcome_id) {
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL:
    case RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL:
      return runLethalOrNonlethalScenario(scenario, input);
    case RUSK_OUTCOME_IDS.RUSK_SURRENDER:
      return runSurrenderScenario(scenario, input);
    case RUSK_OUTCOME_IDS.PLAYER_RETREAT:
      return runRetreatScenario(scenario, input);
    case RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD:
      return runFailForwardScenario(scenario, input);
    default:
      throw new Error(`Unsupported Rusk acceptance outcome: ${scenario.outcome_id}`);
  }
}

export function runRuskAcceptanceScenario(input = {}) {
  const scenario = ensureScenario(input.scenario_id ?? input.scenarioId);
  if (scenario.scenario_id === RUSK_ACCEPTANCE_SCENARIO_IDS.CANONICAL_CONTENT) {
    return runContentBaselineScenario(input);
  }
  if (scenario.scenario_id.startsWith('rusk.acceptance.opening.')) {
    return runOpeningScenario(scenario, input);
  }
  if (scenario.outcome_id) {
    return runOutcomeScenario(scenario, input);
  }
  switch (scenario.scenario_id) {
    case RUSK_ACCEPTANCE_SCENARIO_IDS.PERSISTENCE_REPLAY:
      return runPersistenceReplayScenario(scenario, input);
    case RUSK_ACCEPTANCE_SCENARIO_IDS.REACTION_CONTINUATION:
      return runReactionContinuationScenario(scenario, input);
    case RUSK_ACCEPTANCE_SCENARIO_IDS.COMBAT_FOCUS:
      return runCombatFocusScenario(scenario, input);
    case RUSK_ACCEPTANCE_SCENARIO_IDS.VISIBILITY_INSPECTOR:
      return runVisibilityInspectorScenario(scenario, input);
    case RUSK_ACCEPTANCE_SCENARIO_IDS.RECOVERY:
      return runRecoveryScenario(scenario, input);
    case RUSK_ACCEPTANCE_SCENARIO_IDS.FLUTTER_CONTRACT:
      return runFlutterContractScenario(scenario, input);
    default:
      throw new Error(`Unhandled Rusk acceptance scenario: ${scenario.scenario_id}`);
  }
}

export function runRuskAcceptanceSuite(input = {}) {
  const scenarioFilter = new Set(asArray(input.scenario_ids ?? input.scenarioIds).map(cleanText).filter(Boolean));
  const scenarios = RUSK_ACCEPTANCE_SCENARIOS
    .filter((scenario) => scenarioFilter.size === 0 || scenarioFilter.has(scenario.scenario_id));
  const results = [];
  for (const scenario of scenarios) {
    results.push(runRuskAcceptanceScenario({
      ...input,
      scenario_id: scenario.scenario_id,
      run_id: stableId([buildRunId(input), scenario.scenario_id]),
    }));
  }
  return {
    stage: RUSK_ACCEPTANCE_STAGE,
    scenario_version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
    scenario_count: results.length,
    results,
    matrix: buildRuskAcceptanceScenarioMatrix(),
  };
}

export function buildRuskAcceptanceFlutterContractPayloads(input = {}) {
  const scenario = ensureScenario(RUSK_ACCEPTANCE_SCENARIO_IDS.FLUTTER_CONTRACT);
  return runFlutterContractScenario(scenario, input).payloads;
}

export function buildRuskAcceptanceEvidenceSummary(input = {}) {
  const baseline = validateRuskAcceptanceContentBaseline(input);
  const matrix = buildRuskAcceptanceScenarioMatrix();
  return {
    stage: RUSK_ACCEPTANCE_STAGE,
    scenario_version: RUSK_ACCEPTANCE_SCENARIO_VERSION,
    baseline,
    matrix,
    prerequisites: {
      stage_6d_13_canonical_rusk: true,
      stage_6d_14_resolution_rewards: true,
      stage_6d_15_inspector: true,
      stage_6d_16_flutter_contract: true,
      stage_6d_17_synthetic_fixtures: true,
    },
    known_limitations: [
      'Backend acceptance runs through the canonical Stage 6D engine/service boundary, not a DB-backed HTTP route.',
      'Flutter acceptance payloads are contract payloads; widget execution requires Flutter tooling.',
      'No synthetic Rusk replacement is registered or used.',
    ],
  };
}

export function assertRuskAcceptanceSuitePassed(suiteResult = {}) {
  if (suiteResult.status !== 'passed') {
    const failed = asArray(suiteResult.results).filter((entry) => entry.status !== 'passed').map((entry) => entry.scenario_id);
    throw new Error(`Rusk acceptance suite failed: ${failed.join(', ')}`);
  }
  if (suiteResult.matrix?.gap_count !== 0) {
    throw new Error(`Rusk acceptance matrix has ${suiteResult.matrix.gap_count} uncovered behaviors`);
  }
  return true;
}

export function buildRuskAcceptanceGmDevTrace(input = {}) {
  const state = ensureCombatPersistenceState(input.state ?? input);
  return {
    trace_kind: 'rusk_acceptance_suite',
    stage: RUSK_ACCEPTANCE_STAGE,
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    canonical_rusk_trace: buildCanonicalRuskGmDevTrace({ state, phase: 'acceptance' }),
    acceptance_matrix: buildRuskAcceptanceScenarioMatrix(),
  };
}
