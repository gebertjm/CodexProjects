import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  AUTOMATIC_NEXT_DECISION_KINDS,
  TACTICAL_OPERATION_CATEGORIES,
} from '../src/engine/combat/automaticTurnRuntime.js';
import {
  COMBAT_OPERATION_STATUSES,
} from '../src/engine/combat/combatPersistenceRuntime.js';
import {
  COMBAT_FOCUS_ANSWER_STATUSES,
} from '../src/engine/combat/combatFocus.js';
import {
  REACTION_PREFERENCE_VALUES,
} from '../src/engine/combat/reactionInterruptRuntime.js';
import {
  RUSK_ACTION_IDS,
  RUSK_ENCOUNTER_IDS,
  RUSK_OUTCOME_IDS,
  RUSK_PARTICIPANT_IDS,
  RUSK_ZONE_IDS,
  answerCanonicalRuskCombatFocus,
  assertNoCanonicalRuskPlayerHiddenData,
  buildCanonicalRuskCombatState,
  buildCanonicalRuskEncounterDefinition,
  createOrResumeCanonicalRuskCombat,
  evaluateCanonicalRuskCompletion,
  evaluateRuskSurrenderEligibility,
  executeCanonicalRuskAutomaticStep,
  openCanonicalRuskPlayerTurn,
  projectCanonicalRuskForPlayer,
  submitCanonicalRuskPlayerRetreat,
  submitCanonicalRuskPlayerStrike,
  validateCanonicalRuskLaunch,
} from '../src/engine/combat/canonicalRuskEncounter.js';
import {
  DND5E_2014_RULESET,
} from '../src/engine/combat/rulesResolution.js';
import {
  PROXIMITY_STATES,
} from '../src/engine/combat/spatialMovement.js';
import {
  COMBAT_RESOLUTION_STATUSES,
} from '../src/services/interactionCore/combatAdapterContract.js';

const repoRoot = join(import.meta.dirname, '..', '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function ruskEncounterContent() {
  return readJson('content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json')
    .find((entry) => entry.encounter_id === RUSK_ENCOUNTER_IDS.ENCOUNTER);
}

function ruskDialogueContent() {
  return readJson('content/dialogue/greyvale/rusk-at-the-shrine.json');
}

function ruskHookContent() {
  return readJson('content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json');
}

function launch(overrides = {}) {
  return createOrResumeCanonicalRuskCombat({
    encounter: ruskEncounterContent(),
    dialogue: ruskDialogueContent(),
    hook: ruskHookContent(),
    campaign_id: 'campaign-greyvale',
    active_character_id: 'character-greyvale',
    character_name: 'Avery',
    ...overrides,
  }).state;
}

function rusk(state) {
  return state.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK);
}

function player(state) {
  return state.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.PLAYER);
}

function setHp(state, participantId, hp) {
  state.participants = state.participants.map((entry) =>
    entry.participant_id === participantId
      ? { ...entry, current_hit_points: hp, defeated: hp <= 0 }
      : entry
  );
  return state;
}

test('6D.13 canonical Rusk definition uses active Greyvale content and keeps aftermath inactive', () => {
  const definition = buildCanonicalRuskEncounterDefinition({
    encounter: ruskEncounterContent(),
    dialogue: ruskDialogueContent(),
    hook: ruskHookContent(),
  });

  assert.equal(definition.encounter_id, RUSK_ENCOUNTER_IDS.ENCOUNTER);
  assert.equal(definition.scene_slug, RUSK_ENCOUNTER_IDS.SCENE);
  assert.equal(definition.dialogue_slug, RUSK_ENCOUNTER_IDS.DIALOGUE);
  assert.equal(definition.hook_slug, RUSK_ENCOUNTER_IDS.HOOK);
  assert.equal(definition.selected_variant_id, 'solo');
  assert.deepEqual(definition.selected_variant.enemies.map((entry) => entry.entity_slug), [RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK]);
  assert.equal(definition.ruleset.ruleset_id, DND5E_2014_RULESET.ruleset_id);
  assert.equal(definition.aftermath_mutation_stage, '6D.14');
  assert.equal(definition.gm_dev_evidence.rusk_dialogue_terminal_node, true);

  const validation = validateCanonicalRuskLaunch({ definition });
  assert.equal(validation.valid, true);
});

test('6D.13 Rusk launch creates one idempotent solo combat without applying aftermath', () => {
  const first = createOrResumeCanonicalRuskCombat({
    encounter: ruskEncounterContent(),
    dialogue: ruskDialogueContent(),
    hook: ruskHookContent(),
    campaign_id: 'campaign-greyvale',
    active_character_id: 'character-greyvale',
    idempotency_key: 'same-launch',
  });
  assert.equal(first.status, COMBAT_OPERATION_STATUSES.RESOLVED);
  assert.equal(first.state.combat.encounter_id, RUSK_ENCOUNTER_IDS.ENCOUNTER);
  assert.equal(first.state.participants.length, 2);
  assert.equal(rusk(first.state).stat_block_id, RUSK_ENCOUNTER_IDS.RUSK_STAT_BLOCK);
  assert.equal(first.state.canonical_rusk.aftermath_applied, false);
  assert.equal(first.state.canonical_rusk.rewards_applied, false);

  const resumed = createOrResumeCanonicalRuskCombat({
    state: first.state,
    idempotency_key: 'same-launch',
  });
  assert.equal(resumed.status, 'resumed');
  assert.equal(resumed.state.participants.length, 2);
  assert.equal(resumed.state.combat.combat_id, first.state.combat.combat_id);
  assertNoCanonicalRuskPlayerHiddenData(resumed.player_projection);
});

test('6D.13 canonical start state is conservative, visible, solo-safe, and player-safe', () => {
  const state = buildCanonicalRuskCombatState({
    encounter: ruskEncounterContent(),
    initial_proximity: PROXIMITY_STATES.NEARBY,
  });

  assert.equal(state.combat.ruleset.system, 'dnd5e');
  assert.equal(state.combat.ruleset.rules_version, '2014');
  assert.equal(state.participants.length, 2);
  assert.equal(rusk(state).armor_class, 14);
  assert.equal(rusk(state).max_hit_points, 18);
  assert.equal(rusk(state).hidden, false);
  assert.ok(state.spatial.transitions.some((transition) => transition.retreat_route_id === 'grey-road-retreat'));
  assert.ok(state.actions.some((action) => action.action_id === RUSK_ACTION_IDS.RUSK_BLADE));

  const projection = projectCanonicalRuskForPlayer({ state });
  assert.equal(projection.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK).hit_points, null);
  assert.equal(projection.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.RUSK).health_band, 'steady');
  assertNoCanonicalRuskPlayerHiddenData(projection);
});

test('6D.13 player turn opens through 6D.7 and lethal Rusk defeat creates a 6D.14 handoff only', () => {
  let state = launch({ player_initiative: 18, rusk_initiative: 10 });
  const opened = openCanonicalRuskPlayerTurn({ state });
  assert.equal(opened.status, 'opened');
  state = opened.state;
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 4);

  const strike = submitCanonicalRuskPlayerStrike({
    state,
    idempotency_key: 'lethal-strike',
    roll_overrides: { attack: 18, damage: [6] },
  });

  assert.equal(strike.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(rusk(strike.state).defeated, true);
  assert.equal(strike.completion.status, 'completion_handoff_ready');
  assert.equal(strike.completion.outcome_id, RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
  assert.equal(strike.completion.handoff.shared_aftermath_state_id, RUSK_ENCOUNTER_IDS.AFTERMATH_STATE);
  assert.equal(strike.completion.handoff.aftermath_applied, false);
  assert.equal(strike.completion.handoff.rewards_applied, false);
  assertNoCanonicalRuskPlayerHiddenData(strike.player_projection);
});

test('6D.13 nonlethal Rusk defeat uses the shared handoff with nonlethal outcome', () => {
  const state = launch({ player_initiative: 18, rusk_initiative: 10 });
  openCanonicalRuskPlayerTurn({ state });
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 3);

  const strike = submitCanonicalRuskPlayerStrike({
    state,
    nonlethal: true,
    idempotency_key: 'nonlethal-strike',
    roll_overrides: { attack: 18, damage: [4] },
  });

  assert.equal(strike.completion.status, 'completion_handoff_ready');
  assert.equal(strike.completion.outcome_id, RUSK_OUTCOME_IDS.PLAYER_VICTORY_NONLETHAL);
  assert.match(strike.completion.handoff.player_safe_summary, /alive/);
});

test('6D.13 Rusk tactical profile moves into engagement then attacks automatically', () => {
  let state = launch({ player_initiative: 8, rusk_initiative: 16 });
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;

  const movement = executeCanonicalRuskAutomaticStep({ state });
  assert.equal(movement.selection.operation.operation_category, TACTICAL_OPERATION_CATEGORIES.MOVEMENT);
  assert.equal(movement.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);

  const nextState = movement.state;
  nextState.parent_turn.action_spent = false;
  nextState.parent_turn.current_state_version = nextState.parent_turn.current_state_version ?? 'turn-v1';
  const attack = executeCanonicalRuskAutomaticStep({
    state: nextState,
    roll_overrides: { attack: 18, damage: [4] },
  });
  assert.equal(attack.selection.operation.operation_category, TACTICAL_OPERATION_CATEGORIES.ACTION);
  assert.equal(attack.selection.operation.action_id, RUSK_ACTION_IDS.RUSK_BLADE);
  assert.equal(player(attack.state).current_hit_points < 20, true);
  assertNoCanonicalRuskPlayerHiddenData(attack.player_projection);
});

test('6D.13 Rusk surrender requires both narrative permission and qualifying combat state', () => {
  let state = launch({ rusk_surrender_permitted: false });
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 5);
  let eligibility = evaluateRuskSurrenderEligibility({ state });
  assert.equal(eligibility.status, 'surrender_not_permitted');

  state = launch({ rusk_surrender_permitted: true });
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 16);
  eligibility = evaluateRuskSurrenderEligibility({ state });
  assert.equal(eligibility.status, 'surrender_not_selected');

  state = launch({ rusk_surrender_permitted: true });
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 5);
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  const surrender = executeCanonicalRuskAutomaticStep({ state });
  assert.equal(surrender.selection.operation.operation_category, TACTICAL_OPERATION_CATEGORIES.SURRENDER_INTENT);
  assert.equal(surrender.completion.status, 'completion_handoff_ready');
  assert.equal(surrender.completion.outcome_id, RUSK_OUTCOME_IDS.RUSK_SURRENDER);

  const defeatedState = launch({ rusk_surrender_permitted: true });
  setHp(defeatedState, RUSK_PARTICIPANT_IDS.RUSK, 0);
  const completion = evaluateCanonicalRuskCompletion({ state: defeatedState });
  assert.equal(completion.outcome_id, RUSK_OUTCOME_IDS.PLAYER_VICTORY_LETHAL);
});

test('6D.13 player retreat uses the retreat route, preserves opportunity-attack handoff, and completes as retreat', () => {
  const state = launch({ player_initiative: 18, rusk_initiative: 10 });
  openCanonicalRuskPlayerTurn({ state });
  const retreat = submitCanonicalRuskPlayerRetreat({
    state,
    idempotency_key: 'player-retreat',
    reaction_roll_overrides: { attack: 3, damage: [1] },
  });

  assert.equal(retreat.status, COMBAT_RESOLUTION_STATUSES.RESOLVED);
  assert.equal(retreat.reaction_result?.status, 'deterministic_reactions_resolved');
  assert.equal(retreat.completion.status, 'completion_handoff_ready');
  assert.equal(retreat.completion.outcome_id, RUSK_OUTCOME_IDS.PLAYER_RETREAT);
  assert.equal(retreat.state.spatial.participants.find((entry) => entry.participant_id === RUSK_PARTICIPANT_IDS.PLAYER).current_zone_id, RUSK_ZONE_IDS.RETREAT_ROAD);
});

test('6D.13 player zero hit points resolves to fail-forward and does not open death-save aftermath', () => {
  let state = launch({ player_initiative: 8, rusk_initiative: 16 });
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  setHp(state, RUSK_PARTICIPANT_IDS.PLAYER, 5);

  const attack = executeCanonicalRuskAutomaticStep({
    state,
    operation: {
      operation_category: TACTICAL_OPERATION_CATEGORIES.ACTION,
      action_id: RUSK_ACTION_IDS.RUSK_BLADE,
      target_id: RUSK_PARTICIPANT_IDS.PLAYER,
    },
    roll_overrides: { attack: 18, damage: [6] },
  });

  assert.equal(player(attack.state).defeated, true);
  assert.equal(attack.completion.status, 'completion_handoff_ready');
  assert.equal(attack.completion.outcome_id, RUSK_OUTCOME_IDS.PLAYER_DEFEAT_FAIL_FORWARD);
  assert.equal(attack.completion.handoff.aftermath_applied, false);
});

test('6D.13 completion handoff is idempotent and keeps player projection safe on reload', () => {
  const state = launch();
  setHp(state, RUSK_PARTICIPANT_IDS.RUSK, 0);

  const first = evaluateCanonicalRuskCompletion({
    state,
    idempotency_key: 'handoff-once',
  });
  const reloaded = JSON.parse(JSON.stringify(state));
  const duplicate = evaluateCanonicalRuskCompletion({
    state: reloaded,
    idempotency_key: 'handoff-once',
  });

  assert.equal(first.status, 'completion_handoff_ready');
  assert.equal(duplicate.status, 'already_completed');
  assert.equal(duplicate.outcome_id, first.outcome_id);
  assertNoCanonicalRuskPlayerHiddenData(projectCanonicalRuskForPlayer({ state: reloaded }));
});

test('6D.13 Combat Focus is available during the canonical Rusk fight without exposing internals', () => {
  const state = launch({ player_initiative: 18, rusk_initiative: 10 });
  openCanonicalRuskPlayerTurn({ state });
  const answer = answerCanonicalRuskCombatFocus({
    state,
    template_id: 'enemy.can_reach_me',
    parameters: { enemy_participant_id: RUSK_PARTICIPANT_IDS.RUSK },
  });

  assert.equal(answer.status, COMBAT_FOCUS_ANSWER_STATUSES.ANSWERED);
  assertNoCanonicalRuskPlayerHiddenData(answer.player_answer);
  assert.equal(JSON.stringify(answer.player_answer).includes('armor_class'), false);
  assert.equal(JSON.stringify(answer.player_answer).includes('gm_dev'), false);
});

test('6D.13 player opportunity attack can interrupt Rusk movement where supported', () => {
  let state = launch({ player_initiative: 8, rusk_initiative: 16 });
  state.reaction_preferences = {
    [RUSK_PARTICIPANT_IDS.PLAYER]: { opportunity_attack: REACTION_PREFERENCE_VALUES.ASK },
  };
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state = openCanonicalRuskPlayerTurn({ state }).state;
  state.combat.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
  state.current_participant_id = RUSK_PARTICIPANT_IDS.RUSK;
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
    potential_reactors: [player(state)],
  });

  assert.equal(movement.next_decision.next_decision_kind, AUTOMATIC_NEXT_DECISION_KINDS.PLAYER_REACTION_REQUIRED);
  assert.equal(Boolean(movement.state.active_reaction_window_id), true);
});
