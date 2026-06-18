import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_ADAPTER_REQUIRED_OPERATIONS,
  COMBAT_DECISION_TYPES,
  COMBAT_NEXT_BEAT_DECISION_KINDS,
  COMBAT_PLAYER_PROHIBITED_FIELD_KEYS,
  COMBAT_SUBMIT_OUTCOMES,
  COMBAT_TIMING_CATEGORIES,
  COMBAT_TRANSITION_DECISION_KINDS,
  DEFAULT_COMBAT_RULESET,
  RUSK_COMBAT_ENTRY,
  RUSK_COMBAT_EXIT_OUTCOMES,
  SHARED_INTERACTION_DOMAINS,
  createCombatAdapterContract,
  createCombatInteractionContext,
  createCombatNextBeatDecision,
  createCombatParentTurn,
  createCombatPreviewContract,
  createCombatReactionInterrupt,
  createCombatRulesetIdentity,
  createCombatSubmitEnvelope,
  createCombatSubResolution,
  createCombatTransitionDecision,
  createRuskCombatEntryContract,
  createRuskCombatExitContract,
  getCombatPersistencePosture,
  assertCombatAdapterContract,
  assertCombatPreviewIsNonMutating,
  assertNoCombatPlayerHiddenData,
  buildCombatGmDevTrace,
  buildCombatPlayerResultBundle,
  projectCombatForGmDev,
  projectCombatForPlayer,
} from '../src/services/interactionCore/index.js';

test('6D.1 combat interaction domain exports the required adapter contract operations', () => {
  const adapter = createCombatAdapterContract();

  assert.equal(adapter.interaction_domain, SHARED_INTERACTION_DOMAINS.COMBAT);
  assert.equal(adapter.live_behavior_enabled, false);
  for (const operation of COMBAT_ADAPTER_REQUIRED_OPERATIONS) {
    assert.equal(typeof adapter[operation], 'function', `${operation} should be exported`);
  }
  assert.equal(assertCombatAdapterContract(adapter), true);
});

test('6D.1 ruleset identity is explicit and defaults to DnD 5e 2014', () => {
  const defaultRuleset = createCombatRulesetIdentity();
  assert.equal(defaultRuleset.ruleset_id, DEFAULT_COMBAT_RULESET.ruleset_id);
  assert.equal(defaultRuleset.system, 'dnd5e');
  assert.equal(defaultRuleset.rules_version, '2014');
  assert.equal(defaultRuleset.supported, true);

  const futureRuleset = createCombatRulesetIdentity({ system: 'dnd5e', rulesVersion: '2024' });
  assert.equal(futureRuleset.ruleset_id, 'dnd5e-2024');
  assert.equal(futureRuleset.supported, false);
  assert.equal(futureRuleset.validation_status, 'reserved_for_future_ruleset');
});

test('6D.1 combat interaction context carries ruleset parent turn action window and Rusk metadata', () => {
  const context = createCombatInteractionContext({
    campaignId: 7,
    characterId: 9,
    combatId: 11,
    encounterId: RUSK_COMBAT_ENTRY.encounter_template_id,
    actorParticipantId: 13,
    currentParentTurnId: 'combat:11:round:1:turn:pc',
    actionWindowId: 'window-22',
    currentStateVersion: 'combat-state-v1',
    currentPlayerDecisionType: COMBAT_DECISION_TYPES.ACTION,
    timingCategory: COMBAT_TIMING_CATEGORIES.ACTION,
    visibilityScope: 'gm_dev',
    ruskHandoffMetadata: { source_endpoint_id: 'rusk_combat_pending_endpoint' },
  });

  assert.equal(context.interaction_domain, 'combat');
  assert.equal(context.ruleset_id, 'dnd5e-2014');
  assert.equal(context.combat_id, '11');
  assert.equal(context.encounter_id, 'shrine-rusk-confrontation');
  assert.equal(context.current_parent_turn_id, 'combat:11:round:1:turn:pc');
  assert.equal(context.current_action_window_id, 'window-22');
  assert.equal(context.current_state_version, 'combat-state-v1');
  assert.equal(context.authorized_projection_mode, 'gm_dev');
  assert.equal(context.rusk_handoff_metadata.source_endpoint_id, 'rusk_combat_pending_endpoint');
});

test('6D.1 parent turns can own multiple ordered committed sub-resolutions', () => {
  const parentTurn = createCombatParentTurn({
    combatId: 'combat-1',
    parentTurnId: 'turn-1',
    roundNumber: 2,
    initiativePosition: 3,
    actorParticipantId: 'participant-pc',
    actionWindowId: 'window-parent',
    subResolutions: [
      {
        subResolutionId: 'move-1',
        decisionType: COMBAT_DECISION_TYPES.MOVEMENT,
        timingCategory: COMBAT_TIMING_CATEGORIES.MOVEMENT,
        resolutionStatus: 'committed',
      },
      {
        subResolutionId: 'action-1',
        decisionType: COMBAT_DECISION_TYPES.ACTION,
        timingCategory: COMBAT_TIMING_CATEGORIES.ACTION,
        resolutionStatus: 'resolved',
      },
    ],
  });

  assert.equal(parentTurn.sub_resolutions.length, 2);
  assert.equal(parentTurn.sub_resolutions[0].sub_resolution_order, 1);
  assert.equal(parentTurn.sub_resolutions[1].sub_resolution_order, 2);
  assert.equal(parentTurn.sub_resolutions[0].parent_turn_id, 'turn-1');
  assert.equal(parentTurn.sub_resolutions[1].rules_version, '2014');
});

test('6D.1 reaction interrupt references an interrupted resolution and continuation point', () => {
  const interrupt = createCombatReactionInterrupt({
    combatId: 'combat-1',
    parentTurnId: 'turn-1',
    subResolutionId: 'reaction-1',
    interruptParentId: 'action-1',
    continuationId: 'continue-action-1',
    actionWindowId: 'reaction-window',
    sourceStateVersion: 'state-before-reaction',
  });

  assert.equal(interrupt.timing_category, COMBAT_TIMING_CATEGORIES.REACTION);
  assert.equal(interrupt.decision_type, COMBAT_DECISION_TYPES.REACTION);
  assert.equal(interrupt.interrupt_parent_id, 'action-1');
  assert.equal(interrupt.continuation_id, 'continue-action-1');
  assert.equal(interrupt.gm_dev_metadata.consumes_reaction_resource, true);
  assert.equal(interrupt.gm_dev_metadata.replaces_parent_turn, false);
});

test('6D.1 preview contract is non-mutating and excludes final rolls or mutation data', () => {
  const preview = createCombatPreviewContract({
    previewId: 'preview-1',
    combatId: 'combat-1',
    parentTurnId: 'turn-1',
    actionWindowId: 'window-1',
    selectedActionId: 'basic-strike',
    selectedTargetId: 'rusk',
    rollType: 'attack_roll',
    knownDamageOrEffectTypes: ['slashing'],
    finalRolls: [20],
    mutationPlan: { should_not_appear: true },
  });

  const serialized = JSON.stringify(preview);
  assert.equal(preview.mutates_state, false);
  assert.equal(serialized.includes('finalRolls'), false);
  assert.equal(serialized.includes('mutationPlan'), false);
  assert.equal(assertCombatPreviewIsNonMutating(preview), true);
  assert.throws(
    () => assertCombatPreviewIsNonMutating({ ...preview, attack_roll: 20 }),
    /committed or hidden data/
  );
});

test('6D.1 submit envelope models safe committed outcomes without mutating state', () => {
  const submit = createCombatSubmitEnvelope({
    operationType: 'combat_action',
    combatId: 'combat-1',
    parentTurnId: 'turn-1',
    previewId: 'preview-1',
    selectedActionId: 'basic-strike',
    selectedTargetId: 'rusk',
    idempotencyKey: 'click-1',
    actorContext: { userId: 'user-1', characterId: 'pc-1', actorParticipantId: 'participant-pc' },
    expectedOutcome: COMBAT_SUBMIT_OUTCOMES.REACTION_REQUIRED,
  });

  assert.equal(submit.operation_type, 'combat_action');
  assert.equal(submit.expected_outcome, 'reaction_required');
  assert.equal(submit.idempotency_key, 'click-1');
  assert.equal(submit.actor_context.character_id, 'pc-1');
  assert.equal(submit.mutates_state, false);
});

test('6D.1 player projection strips combat-hidden fields while GM/dev projection preserves them', () => {
  const rawCombat = {
    status: 'active',
    encounterId: 'shrine-rusk-confrontation',
    encounterTitle: 'Rusk at the Shrine',
    activeCharacterId: '9',
    participants: [
      {
        id: 'pc-participant',
        entity_type: 'character',
        entity_id: '9',
        display_name: 'Avery',
        faction: 'player',
        current_hp: 8,
        max_hp: 12,
        temporary_hp: 2,
        armor_class: 16,
        control_mode: 'manual',
      },
      {
        id: 'rusk-participant',
        entity_type: 'npc',
        entity_id: 'rusk',
        display_name: 'Rusk',
        faction: 'enemy',
        current_hp: 4,
        max_hp: 18,
        armor_class: 14,
        control_mode: 'ai',
      },
    ],
    legalTargets: [{ target_id: 'rusk-participant', label: 'Rusk', armor_class: 14 }],
    mutation_plan: { raw: true },
    result_json: { raw_roll: 17 },
  };

  const player = projectCombatForPlayer(rawCombat);
  const playerText = JSON.stringify(player);
  assert.equal(player.player.current_hit_points, 8);
  assert.equal(player.enemies[0].health_band, 'badly_wounded');
  assert.equal(playerText.includes('armor_class'), false);
  assert.equal(playerText.includes('control_mode'), false);
  assert.equal(playerText.includes('result_json'), false);
  assert.equal(playerText.includes('mutation_plan'), false);
  assert.equal(assertNoCombatPlayerHiddenData(player), true);

  const gmDev = projectCombatForGmDev({
    exactCombatState: rawCombat,
    participants: rawCombat.participants,
    controlModes: { rusk: 'ai' },
  });
  const gmText = JSON.stringify(gmDev);
  assert.equal(gmText.includes('armor_class'), true);
  assert.equal(gmText.includes('control_mode'), true);
  assert.equal(gmText.includes('current_hp'), true);
});

test('6D.1 transition and next-beat contracts cover all combat decision values and map to Stage 6C', () => {
  for (const kind of Object.values(COMBAT_TRANSITION_DECISION_KINDS)) {
    const decision = createCombatTransitionDecision({ kind });
    assert.equal(decision.combat_transition_kind, kind);
    assert.ok(decision.stage6c_transition_decision.kind);
  }

  for (const kind of Object.values(COMBAT_NEXT_BEAT_DECISION_KINDS)) {
    const decision = createCombatNextBeatDecision({ kind });
    assert.equal(decision.combat_next_beat_kind, kind);
    assert.ok(decision.stage6c_next_beat_decision.kind);
  }

  const reaction = createCombatNextBeatDecision({
    kind: COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_REACTION_INTERRUPT,
    actionWindowId: 'reaction-window',
  });
  assert.equal(reaction.stage6c_next_beat_decision.action_window_id, 'reaction-window');
});

test('6D.1 Rusk entry and exit contracts accept every locked supported outcome while remaining inactive', () => {
  const entry = createRuskCombatEntryContract({
    campaignId: 'campaign-1',
    activeCharacterId: 'pc-1',
    priorDialogueId: 'rusk-at-the-shrine',
    selectedVariantId: 'solo',
    gmDevHandoffMetadata: { handoff_kind: 'combat_pending' },
  });

  assert.equal(entry.encounter_template_id, RUSK_COMBAT_ENTRY.encounter_template_id);
  assert.equal(entry.selected_variant_id, 'solo');
  assert.equal(entry.ruleset.rules_version, '2014');
  assert.equal(entry.active_in_stage_6d1, false);

  for (const outcome of Object.values(RUSK_COMBAT_EXIT_OUTCOMES)) {
    const exit = createRuskCombatExitContract({ outcomeId: outcome, combatId: 'combat-rusk' });
    assert.equal(exit.outcome_id, outcome);
    assert.equal(exit.return_scene_or_aftermath_state.scene_id, 'shrine-ruins');
    assert.equal(exit.post_combat_hook_identity, 'grey-road-shrine-combat-resolution');
    assert.equal(exit.mutates_state_in_stage_6d1, false);
  }
});

test('6D.1 unsupported adapter operations fail explicitly and do not mutate state', () => {
  const adapter = createCombatAdapterContract();
  const response = adapter.submitCombatAction({
    requestId: 'req-unsupported',
    combatId: 'combat-1',
  });

  assert.equal(response.status, 'unsupported_not_implemented');
  assert.equal(response.supported, false);
  assert.equal(response.mutates_state, false);
  assert.equal(response.error.code, 'VALIDATION_FAILED');
  assert.equal(response.player_result_bundle.recovery.message.includes('not available'), true);
  assert.equal(response.gm_dev_trace.interaction_domain, 'combat');
});

test('6D.1 contract construction does not alter live combat adventure or player state objects', () => {
  const liveState = {
    combat_id: 'combat-1',
    participants: [{ id: 'rusk', current_hp: 12, armor_class: 14 }],
    action_window: { id: 'window-1', status: 'open' },
  };
  const original = structuredClone(liveState);

  createCombatInteractionContext({ combatId: liveState.combat_id, visibleParticipants: liveState.participants });
  createCombatPreviewContract({ combatId: liveState.combat_id, selectedTargetId: 'rusk' });
  createCombatSubResolution({ combatId: liveState.combat_id, subResolutionId: 'sub-1' });

  assert.deepEqual(liveState, original);
});

test('6D.1 combat contracts remain compatible with Stage 6C result trace and visibility conventions', () => {
  const bundle = buildCombatPlayerResultBundle({
    attemptedAction: { label: 'Strike Rusk' },
    result: { text: 'You force Rusk back from the broken arch.' },
    consequences: [{ label: 'Pressure', text: 'The fight stays contained.' }],
    next: { label: 'Choose your next combat decision.' },
    status: { state: 'active', label: 'Combat continues' },
  });
  assert.equal(bundle.result.text.includes('Rusk'), true);

  const trace = buildCombatGmDevTrace({
    combatId: 'combat-1',
    encounterId: 'shrine-rusk-confrontation',
    actorParticipantId: 'pc-participant',
    parentTurnId: 'turn-1',
    actionWindowId: 'window-1',
    playerResultBundle: bundle,
    transitionDecision: createCombatTransitionDecision({
      kind: COMBAT_TRANSITION_DECISION_KINDS.REMAIN_IN_CURRENT_PLAYER_TURN,
    }).stage6c_transition_decision,
    nextBeatDecision: createCombatNextBeatDecision({
      kind: COMBAT_NEXT_BEAT_DECISION_KINDS.OPEN_ACTION_DECISION,
    }).stage6c_next_beat_decision,
  });

  assert.equal(trace.interaction_domain, 'combat');
  assert.equal(trace.active_state_summary.combat_id, 'combat-1');
  assert.equal(trace.player_result_bundle.result.text.includes('Rusk'), true);
  assert.equal(trace.visibility_filtering_notes.includes('combat_player_projection_strips_trace_and_mutation_details'), true);

  const posture = getCombatPersistencePosture();
  assert.ok(posture.some((entry) => entry.concept === 'idempotency_key'));
  assert.ok(posture.some((entry) => entry.support_status === 'potentially_deficient_but_unproven'));
});

test('6D.1 combat player hidden-data denylist covers additional combat-specific terms', () => {
  assert.ok(COMBAT_PLAYER_PROHIBITED_FIELD_KEYS.includes('armor_class'));
  assert.throws(
    () => assertNoCombatPlayerHiddenData({ enemy: { armor_class: 14 } }),
    /hidden\/internal data/
  );
});
