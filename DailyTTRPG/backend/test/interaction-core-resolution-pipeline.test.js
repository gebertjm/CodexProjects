import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERACTION_OPTION_KINDS,
  MUTATION_WRITE_GROUPS,
  NEXT_BEAT_DECISION_KINDS,
  ORDERED_MUTATION_WRITE_GROUPS,
  RECOVERY_NEEDED_KINDS,
  RESOLUTION_REQUEST_KINDS,
  RESOLUTION_RESPONSE_KINDS,
  RESOLUTION_RESPONSE_STATUSES,
  SHARED_INTERACTION_DOMAINS,
  TRANSITION_DECISION_KINDS,
  assertNoPlayerHiddenData,
  assertResolutionAdapterContract,
  assertResolutionResponsePlayerSafe,
  createCommitResolutionRequest,
  createCommittedResolutionResponse,
  createEndpointResolutionResponse,
  createMutationPlan,
  createNextBeatDecision,
  createPlayerResultBundle,
  createPreviewResolutionRequest,
  createPreviewResolutionResponse,
  createRecoveryNeededEnvelope,
  createRecoveryResolutionResponse,
  createResolutionAdapterContract,
  createResolutionOrchestrationMap,
  createResolutionRequest,
  createResolutionResponse,
  createResolutionTraceEnvelope,
  createUnavailableResolutionResponse,
  createTransitionDecision,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
} from '../src/services/interactionCore/index.js';

function fullMockAdapter(domain) {
  return createResolutionAdapterContract({
    interactionDomain: domain,
    loadActiveState: () => ({ active: true }),
    validateRequest: () => ({ valid: true }),
    buildPreview: () => ({ text: 'Preview.' }),
    selectOutcome: () => ({ outcome_id: 'success' }),
    buildDomainOutputs: () => ({ knowledgeOutputs: [] }),
    buildDomainResultSections: () => ({ result: { text: 'Resolved.' } }),
    buildMutationPlanParts: () => ({ write_groups: [] }),
    proposeTransition: () => ({ kind: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE }),
    proposeNextBeat: () => ({ kind: NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW }),
    buildDomainTraceParts: () => ({ trace: true }),
    buildRecoveryProjection: () => ({ player_safe_message: 'Refresh the current scene.' }),
  });
}

test('6C.1 resolution request contract represents exploration Free Focus and Beat Action', () => {
  const freeFocus = createPreviewResolutionRequest({
    interactionDomain: 'exploration',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    adventureId: 'greyvale',
    actionWindowId: 'window-1',
    sourceSceneId: 'broken-caravan',
    selectedOptionId: 'focus:split-axle',
    selectedOptionKind: INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY,
    domainOptionKind: 'free_focus',
    contextVersion: 'scene-v1',
  });
  const beatAction = createCommitResolutionRequest({
    context: {
      interactionDomain: 'surface_focus_commit',
      userId: 'user-1',
      characterId: 'pc-1',
      campaignId: 'campaign-1',
      adventureId: 'greyvale',
      currentSceneId: 'broken-caravan',
      actionWindowId: 'window-1',
    },
    optionId: 'beat:inspect-wreck',
    optionKind: INTERACTION_OPTION_KINDS.COMMITTED_ACTION,
    domainKind: 'beat_action',
    idempotencyKey: 'click-1',
  });

  assert.equal(freeFocus.request_kind, RESOLUTION_REQUEST_KINDS.PREVIEW);
  assert.equal(freeFocus.interaction_domain, SHARED_INTERACTION_DOMAINS.EXPLORATION);
  assert.equal(freeFocus.selected_option_kind, INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY);
  assert.equal(freeFocus.domain_option_kind, 'free_focus');
  assert.equal(beatAction.request_kind, RESOLUTION_REQUEST_KINDS.COMMIT);
  assert.equal(beatAction.interaction_domain, SHARED_INTERACTION_DOMAINS.EXPLORATION);
  assert.equal(beatAction.selected_option_id, 'beat:inspect-wreck');
  assert.equal(beatAction.source_scene_id, 'broken-caravan');
  assert.equal(beatAction.idempotency_key, 'click-1');
});

test('6C.1 resolution request contract represents dialogue CQ, CSM, and exit', () => {
  const clarifyingQuestion = createResolutionRequest({
    requestKind: 'preview',
    interactionDomain: 'dialogue_focus_commit',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    sourceDialogueId: 'greyvale_elin_hearth_memory_dialogue',
    selectedOptionId: 'cq:first-memory',
    selectedOptionKind: 'non_committing_inquiry',
    domainOptionKind: 'clarifying_question',
  });
  const committedMove = createCommitResolutionRequest({
    interactionDomain: 'dialogue',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    sourceDialogueId: 'greyvale_elin_hearth_memory_dialogue',
    moveId: 'move:press-gently',
    optionKind: 'committed_action',
    domainKind: 'committed_social_move',
    clientPreviewToken: 'preview-elin-1',
  });
  const exit = createCommitResolutionRequest({
    interactionDomain: 'dialogue',
    characterId: 'pc-1',
    sourceDialogueId: 'greyvale_elin_hearth_memory_dialogue',
    selectedOptionId: 'exit:return-to-inn',
    selectedOptionKind: 'exit_or_transition',
    domainOptionKind: 'dialogue_exit',
  });

  assert.equal(clarifyingQuestion.interaction_domain, SHARED_INTERACTION_DOMAINS.DIALOGUE);
  assert.equal(clarifyingQuestion.selected_option_kind, INTERACTION_OPTION_KINDS.NON_COMMITTING_INQUIRY);
  assert.equal(committedMove.selected_option_kind, INTERACTION_OPTION_KINDS.COMMITTED_ACTION);
  assert.equal(committedMove.client_preview_token, 'preview-elin-1');
  assert.equal(exit.selected_option_kind, INTERACTION_OPTION_KINDS.EXIT_OR_TRANSITION);
  assert.equal(exit.domain_option_kind, 'dialogue_exit');
});

test('6C.1 preview response is player-safe and carries no mutation plan or output bundle by default', () => {
  const response = createPreviewResolutionResponse({
    interactionDomain: 'exploration',
    request: createPreviewResolutionRequest({
      interactionDomain: 'exploration',
      characterId: 'pc-1',
      sourceSceneId: 'broken-caravan',
      selectedOptionId: 'focus:mud',
      selectedOptionKind: 'non_committing_inquiry',
    }),
    preview: {
      text: 'You can study the mud without spending the beat.',
      debug_envelope: { hiddenDc: 13 },
    },
    playerResultBundle: {
      result: { text: 'You can look closer before choosing your action.' },
      status: { state: 'preview_ready', label: 'Preview only' },
    },
  });
  const player = projectResolutionResponseForPlayer(response);

  assert.equal(response.response_kind, RESOLUTION_RESPONSE_KINDS.PREVIEW);
  assert.equal(response.output_bundle, null);
  assert.equal(response.mutation_plan, null);
  assert.equal(player.preview.text.includes('without spending'), true);
  assert.equal(JSON.stringify(player).includes('hiddenDc'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.1 committed response supports output bundle, mutation plan, transition, next beat, and GM/dev trace', () => {
  const request = createCommitResolutionRequest({
    interactionDomain: 'dialogue',
    userId: 'user-1',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    sourceDialogueId: 'greyvale_tomas_roadside_worries_dialogue',
    selectedOptionId: 'move:ask-about-road',
    selectedOptionKind: 'committed_action',
    idempotencyKey: 'commit-1',
  });
  const outputBundle = {
    playerResult: { text: 'Tomas lowers his voice.' },
    knowledgeOutputs: [
      {
        knowledgeId: 'greyvale.pattern_of_attacks',
        title: 'Pattern of Attacks',
        summary: 'The attacks follow a pattern.',
      },
    ],
    latestDevelopmentOutput: {
      latestDevelopmentId: 'latest:tomas-pattern',
      text: 'Tomas gave you a road-pattern lead.',
    },
    debugOutputs: [{ debugId: 'debug:tomas', diagnostics: { branch_id: 'success' } }],
  };
  const mutationPlan = createMutationPlan({
    planId: 'plan-1',
    requestId: 'request-1',
    interactionDomain: 'dialogue',
    writeGroups: [
      { group: MUTATION_WRITE_GROUPS.TRACE_PROVENANCE, operations: [{ kind: 'trace' }] },
      { group: MUTATION_WRITE_GROUPS.KNOWLEDGE, operations: [{ knowledge_id: 'greyvale.pattern_of_attacks' }] },
    ],
    expectedReadModelRefreshTargets: ['dialogue', 'knowledge', 'latest_development'],
  });
  const transition = createTransitionDecision({
    kind: TRANSITION_DECISION_KINDS.ENTER_DIALOGUE,
    status: 'live',
    targetType: 'dialogue',
    targetId: 'greyvale_elin_hearth_memory_dialogue',
    playerLabel: 'Speak with Elin',
    gmDevRouting: { branch_id: 'tomas-success' },
  });
  const nextBeat = createNextBeatDecision({
    kind: NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW,
    dialogueId: 'greyvale_elin_hearth_memory_dialogue',
    playerLabel: 'Continue the conversation',
  });
  const trace = createResolutionTraceEnvelope({
    traceId: 'trace-1',
    request,
    selectedOutcome: { branch_id: 'success' },
    checkMetadata: [{ dc: 13, dc_visibility: 'hidden' }],
    outputBundle,
    mutationPlan,
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    playerResultBundle: {
      result: { text: 'Tomas lowers his voice.' },
      discoveries: [{ knowledge_id: 'greyvale.pattern_of_attacks', title: 'Pattern of Attacks', summary: 'A road clue.' }],
      next: { label: 'Speak with Elin', text: 'Elin may know more.' },
      status: { state: 'resolved', label: 'Resolved' },
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    request,
    resolutionId: 'resolution-1',
    outputBundle,
    mutationPlan,
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    readModelRefreshHook: {
      targets: ['dialogue', 'knowledge', 'latest_development'],
      includeDialogue: true,
    },
    gmDevTrace: trace,
    playerResultBundle: trace.player_result_bundle,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const playerText = JSON.stringify(player);

  assert.equal(response.response_kind, RESOLUTION_RESPONSE_KINDS.COMMITTED);
  assert.equal(response.output_bundle.knowledge_outputs[0].knowledge_id, 'greyvale.pattern_of_attacks');
  assert.deepEqual(response.mutation_plan.write_groups.map((group) => group.group_key), [
    MUTATION_WRITE_GROUPS.KNOWLEDGE,
    MUTATION_WRITE_GROUPS.TRACE_PROVENANCE,
  ]);
  assert.equal(response.transition_decision.target_id, 'greyvale_elin_hearth_memory_dialogue');
  assert.equal(response.next_beat_decision.kind, NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW);
  assert.equal(gmDev.gm_dev_trace.selected_outcome.branch_id, 'success');
  assert.equal(gmDev.gm_dev_trace.check_metadata[0].dc, 13);
  assert.equal(player.output_bundle.knowledge_outputs[0].title, 'Pattern of Attacks');
  assert.equal(player.transition.player_label, 'Speak with Elin');
  assert.equal(playerText.includes('gm_dev_trace'), false);
  assert.equal(playerText.includes('branch_id'), false);
  assert.equal(playerText.includes('hidden'), false);
  assert.doesNotThrow(() => assertResolutionResponsePlayerSafe(response));
});

test('6C.1 recovery response exposes safe player envelope and GM/dev diagnostics separately', () => {
  const recovery = createRecoveryNeededEnvelope({
    recoveryKind: RECOVERY_NEEDED_KINDS.MUTATION_FAILED,
    message: 'Something interrupted that resolution. Refresh the current scene.',
    failedLifecycleStep: 'apply_mutations_in_controlled_order',
    partialWritesKnown: [{ stateWrites: ['rawRuntimeState'] }],
    recommendedGmDevRepairAction: 'inspect mutation batch',
    traceId: 'trace-failed',
    diagnostics: { stackTrace: 'Error: write failed' },
  });
  const response = createRecoveryResolutionResponse({
    interactionDomain: 'exploration',
    recoveryEnvelope: recovery,
    gmDevTrace: {
      traceId: 'trace-failed',
      interactionDomain: 'exploration',
      recoveryNeeded: recovery,
      errors: [{ code: 'INTERNAL_ERROR', internalCause: { database_constraint: 'simulated' } }],
    },
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const playerText = JSON.stringify(player);

  assert.equal(response.response_kind, RESOLUTION_RESPONSE_KINDS.RECOVERY);
  assert.equal(player.recovery.player_safe_message.includes('Refresh'), true);
  assert.equal(player.player_result_bundle.status.state, 'recovery_needed');
  assert.equal(playerText.includes('partialWritesKnown'), false);
  assert.equal(playerText.includes('rawRuntimeState'), false);
  assert.equal(playerText.includes('stackTrace'), false);
  assert.equal(gmDev.recovery_envelope.failed_lifecycle_step, 'apply_mutations_in_controlled_order');
  assert.equal(gmDev.recovery_envelope.partial_writes_known.length, 1);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.1 unavailable response keeps unavailable category while using safe recovery projection', () => {
  const response = createUnavailableResolutionResponse({
    interactionDomain: 'exploration',
    message: 'That option is not available from the current scene.',
  });
  const player = projectResolutionResponseForPlayer(response);

  assert.equal(response.response_kind, RESOLUTION_RESPONSE_KINDS.UNAVAILABLE);
  assert.equal(response.status, RESOLUTION_RESPONSE_STATUSES.UNAVAILABLE);
  assert.equal(player.recovery.recovery_action, 'choose_another_action');
  assert.equal(player.player_result_bundle.status.state, 'unavailable');
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6C.1 adapter boundary can be mocked for exploration and dialogue', () => {
  const explorationAdapter = fullMockAdapter('exploration');
  const dialogueAdapter = fullMockAdapter('dialogue');
  const incompleteAdapter = createResolutionAdapterContract({
    interactionDomain: 'exploration',
    loadActiveState: () => ({}),
  });

  assert.equal(explorationAdapter.interaction_domain, SHARED_INTERACTION_DOMAINS.EXPLORATION);
  assert.equal(dialogueAdapter.interaction_domain, SHARED_INTERACTION_DOMAINS.DIALOGUE);
  assert.doesNotThrow(() => assertResolutionAdapterContract(explorationAdapter));
  assert.doesNotThrow(() => assertResolutionAdapterContract(dialogueAdapter));
  assert.throws(() => assertResolutionAdapterContract(incompleteAdapter), /missing required methods/);
});

test('6C.1 transition and next-beat decisions cover same-scene, scene, dialogue, endpoint, recovery, and future placeholders', () => {
  const transitions = [
    createTransitionDecision({ kind: 'stay_in_current_scene', status: 'live', targetType: 'scene' }),
    createTransitionDecision({ kind: 'scene_transition', status: 'live', targetType: 'scene', targetId: 'scene:dunmere' }),
    createTransitionDecision({ kind: 'enter_dialogue', status: 'live', targetType: 'dialogue', targetId: 'dialogue:tomas' }),
    createTransitionDecision({ kind: 'exit_dialogue', status: 'live', targetType: 'scene', targetId: 'scene:inn' }),
    createTransitionDecision({ kind: 'endpoint', status: 'pending', targetType: 'future_supported', playerLabel: 'Review your findings' }),
    createTransitionDecision({ kind: 'recovery_needed', status: 'blocked', targetType: 'none' }),
    createTransitionDecision({ kind: 'future_supported', status: 'future_supported', targetType: 'combat_pending', gmDevRouting: { encounter_id: 'rusk' } }),
  ];
  const nextBeats = [
    createNextBeatDecision({ kind: 'open_exploration_action_window', actionWindowId: 'window-2' }),
    createNextBeatDecision({ kind: 'open_dialogue_action_window', dialogueId: 'dialogue:tomas' }),
    createNextBeatDecision({ kind: 'endpoint_review_only', reviewOnly: true, endpointStatus: 'future_supported' }),
    createNextBeatDecision({ kind: 'recovery_needed' }),
    createNextBeatDecision({ kind: 'future_supported_handoff', gmDevDetails: { combatRouting: 'rusk' } }),
  ];

  assert.equal(transitions[0].kind, TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE);
  assert.equal(transitions[1].target_id, 'scene:dunmere');
  assert.equal(transitions[2].target_type, 'dialogue');
  assert.equal(transitions[4].kind, TRANSITION_DECISION_KINDS.ENDPOINT);
  assert.equal(transitions[6].target_type, 'combat_pending');
  assert.equal(nextBeats[0].kind, NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW);
  assert.equal(nextBeats[1].kind, NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW);
  assert.equal(nextBeats[2].endpoint_status, 'awaiting_support');
  assert.equal(nextBeats[4].kind, NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_HANDOFF);
});

test('6C.1 player result bundle sections can be omitted safely and sanitize unsupported internal statuses', () => {
  const bundle = createPlayerResultBundle({
    result: { text: 'Rusk backs toward the shrine stones.' },
    discoveries: [{ knowledge_id: 'greyvale.bandit_instability', title: 'Bandit Instability', summary: 'Rusk is not fully in control.' }],
    status: { state: 'combat_pending', label: 'Awaiting support', isEndpoint: true },
  });
  const sparse = createPlayerResultBundle({});

  assert.equal(bundle.result.text, 'Rusk backs toward the shrine stones.');
  assert.equal(bundle.status.state, 'awaiting_support');
  assert.deepEqual(sparse.consequences, []);
  assert.deepEqual(sparse.discoveries, []);
  assert.equal(sparse.result, null);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(bundle));
});

test('6C.1 endpoint response hides internal Rusk future-supported handoff from player while preserving GM/dev trace', () => {
  const response = createEndpointResolutionResponse({
    interactionDomain: 'dialogue',
    resolutionId: 'resolution:rusk',
    outputBundle: {
      knowledgeOutputs: [{ knowledgeId: 'greyvale.bandit_instability', title: 'Bandit Instability', summary: 'Rusk is unstable.' }],
      transitionOutputs: [
        {
          status: 'future_supported',
          targetType: 'combat_pending',
          targetId: 'encounter:rusk',
          playerLabel: 'Hold at the shrine',
          gmDevRouting: { combatRouting: 'encounter:rusk', future_supported_internal: true },
        },
      ],
    },
    transitionDecision: {
      kind: 'future_supported',
      status: 'future_supported',
      targetType: 'combat_pending',
      targetId: 'encounter:rusk',
      playerLabel: 'Hold at the shrine',
      gmDevRouting: { combatRouting: 'encounter:rusk' },
    },
    gmDevTrace: {
      traceId: 'trace:rusk',
      interactionDomain: 'dialogue',
      transitionDecision: {
        kind: 'future_supported',
        targetType: 'combat_pending',
        targetId: 'encounter:rusk',
        gmDevRouting: { combatRouting: 'encounter:rusk' },
      },
      playerResultBundle: {
        result: { text: 'The confrontation reaches the edge of the playable slice.' },
        status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
      },
    },
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const playerText = JSON.stringify(player);

  assert.equal(response.status, RESOLUTION_RESPONSE_STATUSES.ENDPOINT);
  assert.equal(player.player_result_bundle.status.state, 'awaiting_support');
  assert.equal(playerText.includes('combat_pending'), false);
  assert.equal(playerText.includes('future_supported'), false);
  assert.equal(playerText.includes('encounter:rusk'), false);
  assert.equal(gmDev.gm_dev_trace.transition_decision.target_type, 'combat_pending');
  assert.doesNotThrow(() => assertResolutionResponsePlayerSafe(response));
});

test('6C.1 orchestration map exposes vocabulary, lifecycle maps, mutation order, and adapter methods', () => {
  const map = createResolutionOrchestrationMap();

  assert.equal(map.vocabulary.beat.includes('player-facing'), true);
  assert.equal(map.interaction_domains.EXPLORATION, 'exploration');
  assert.equal(map.interaction_domains.DIALOGUE, 'dialogue');
  assert.equal(map.preview_lifecycle.some((step) => step.step === 'build_preview'), true);
  assert.equal(map.commit_lifecycle.some((step) => step.step === 'apply_mutations_in_controlled_order'), true);
  assert.equal(map.recovery_lifecycle.some((step) => step.step === 'classify_recovery_kind'), true);
  assert.deepEqual(map.mutation_write_order, ORDERED_MUTATION_WRITE_GROUPS);
  assert.equal(map.adapter_methods.includes('selectOutcome'), true);
});
