import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEXT_BEAT_DECISION_KINDS,
  PLAYER_READ_MODEL_STATES,
  READ_MODEL_REFRESH_TIMING,
  RESULT_READ_MODEL_ALIGNMENT_STATUSES,
  TRANSITION_DECISION_KINDS,
  assertNoPlayerHiddenData,
  assertResultReadModelAligned,
  createActiveStateSummary,
  createCommittedResolutionResponse,
  createOutcomeQualityResultBundle,
  createPlayerResolutionView,
  createReadModelRefreshDiagnostics,
  createResolutionTraceEnvelope,
  createResultReadModelAlignmentDiagnostics,
  createTransitionOrchestrationDecision,
  normalizePlayerReadModel,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
  selectNextBeatDecision,
} from '../src/services/interactionCore/index.js';

function text(value) {
  return JSON.stringify(value);
}

test('6C.6 active state summary and player read model projection stay player-safe', () => {
  const readModel = normalizePlayerReadModel({
    interactionDomain: 'exploration',
    scene: {
      key: 'broken-caravan-site',
      title: 'Broken Caravan',
      surfaceText: 'The wreck leans beside the Grey Road.',
      gmNotes: 'Do not show this.',
    },
    currentObjective: {
      key: 'witness-the-aftermath',
      title: 'Witness the Aftermath',
      status: 'active',
    },
    latestDevelopment: {
      text: 'The road trouble is close enough to touch.',
    },
    visibleAffordances: [
      {
        label: 'Inspect the broken caravan',
        availableActions: [{ label: 'Inspect the broken caravan', branch_id: 'hidden-success' }],
      },
    ],
    debugEnvelope: { rawRoll: 19 },
  });
  const summary = createActiveStateSummary({
    readModel,
    playerResultBundle: {
      result: { text: 'You find the wreck was staged strangely.' },
      next: { label: 'Follow the road toward the inn' },
    },
  });

  assert.equal(readModel.state, PLAYER_READ_MODEL_STATES.EXPLORATION_ACTIVE);
  assert.equal(readModel.scene.key, 'broken-caravan-site');
  assert.equal(readModel.current_objective.key, 'witness-the-aftermath');
  assert.equal(summary.where, 'Broken Caravan');
  assert.equal(summary.available_next_step, 'Follow the road toward the inn');
  assert.equal(text(readModel).includes('gmNotes'), false);
  assert.equal(text(readModel).includes('branch_id'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData({ readModel, summary }));
});

test('6C.6 discoveries and objective progress align with refreshed player read model', () => {
  const outputBundle = {
    knowledgeOutputs: [
      {
        knowledgeId: 'clue_caravan_irregularity',
        title: 'Caravan Irregularity',
        summary: 'The wreck does not look like a simple robbery.',
      },
    ],
    objectiveOutputs: [
      {
        objectiveId: 'witness-the-aftermath',
        title: 'Witness the Aftermath',
        status: 'completed',
        summary: 'You found the first sign that the road attacks are stranger than they look.',
      },
    ],
  };
  const playerResultBundle = createOutcomeQualityResultBundle({
    result: { text: 'The wreck tells a careful story.' },
    outputBundle,
    next: { label: 'Continue toward the inn' },
  });
  const diagnostics = createResultReadModelAlignmentDiagnostics({
    outputBundle,
    playerResultBundle,
    readModel: {
      scene: { key: 'broken-caravan-site', title: 'Broken Caravan' },
      currentObjective: { key: 'witness-the-aftermath', title: 'Witness the Aftermath', status: 'completed' },
      knownFacts: [
        {
          knowledge_key: 'clue_caravan_irregularity',
          title: 'Caravan Irregularity',
          summary: 'The wreck does not look like a simple robbery.',
        },
      ],
    },
    readModelRefreshHook: {
      timing: READ_MODEL_REFRESH_TIMING.AFTER_MUTATION_COMMIT,
      targets: ['knowledge', 'objectives'],
    },
  });

  assert.equal(diagnostics.alignment_status, RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED);
  assert.deepEqual(
    diagnostics.checks.map((check) => check.kind),
    ['knowledge', 'objective', 'refresh_timing']
  );
  assert.doesNotThrow(() =>
    assertResultReadModelAligned({
      outputBundle,
      playerResultBundle,
      readModel: {
        currentObjective: { key: 'witness-the-aftermath', title: 'Witness the Aftermath' },
        knownFacts: [{ knowledge_key: 'clue_caravan_irregularity', title: 'Caravan Irregularity' }],
      },
    })
  );
});

test('6C.6 scene and dialogue next-beat decisions align with refreshed read models', () => {
  const sceneTransition = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    sourceSceneId: 'broken-caravan-site',
    outputBundle: {
      transitionOutputs: [
        {
          status: 'live',
          targetType: 'scene',
          targetId: 'grey-road-inn',
          playerLabel: 'Road toward the inn',
        },
      ],
    },
  });
  const sceneNext = selectNextBeatDecision({ transitionDecision: sceneTransition });
  const dialogueTransition = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    adapterTransitionProposal: {
      kind: 'enter_dialogue',
      targetType: 'dialogue',
      targetId: 'greyvale_tomas_roadside_worries_dialogue',
      playerLabel: 'Speak with Tomas',
    },
  });
  const dialogueNext = selectNextBeatDecision({ transitionDecision: dialogueTransition });

  assert.doesNotThrow(() =>
    assertResultReadModelAligned({
      transitionDecision: sceneTransition,
      nextBeatDecision: sceneNext,
      readModel: { scene: { key: 'grey-road-inn', title: 'Grey Road Inn' } },
    })
  );
  assert.doesNotThrow(() =>
    assertResultReadModelAligned({
      transitionDecision: dialogueTransition,
      nextBeatDecision: dialogueNext,
      readModel: {
        activeDialogue: {
          dialogue_scene_id: 'greyvale_tomas_roadside_worries_dialogue',
          title: 'Tomas Rell',
          status: 'active',
        },
      },
    })
  );
});

test('6C.6 endpoint read model is review-only and hides future/combat internals from player projections', () => {
  const transition = createTransitionOrchestrationDecision({
    interactionDomain: 'dialogue',
    outputBundle: {
      transitionOutputs: [
        {
          status: 'future_supported',
          targetType: 'combat_pending',
          targetId: 'shrine-rusk-confrontation',
          playerLabel: 'Hold at the shrine',
          playerSummary: 'You have reached the current edge of the playable slice.',
          gmDevRouting: { combatRouting: 'shrine-rusk-confrontation' },
        },
      ],
    },
  });
  const nextBeat = selectNextBeatDecision({ transitionDecision: transition });
  const playerResultBundle = createOutcomeQualityResultBundle({
    result: { text: 'Rusk falters as the shrine pressure crests.' },
    complications: [
      {
        label: 'Current slice endpoint',
        text: 'You can review what you learned while the next supported system waits.',
      },
    ],
    status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
  });
  const diagnostics = createResultReadModelAlignmentDiagnostics({
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    playerResultBundle,
    readModel: {
      endpoint: {
        state: 'future_supported',
        label: 'Current playable slice endpoint reached',
        summary: 'You can review the shrine confrontation.',
        review_only: true,
      },
      actionStatus: { state: 'slice_endpoint_reached', label: 'Endpoint reached' },
    },
  });
  const playerView = createPlayerResolutionView({
    playerResultBundle,
    readModel: {
      endpoint: {
        state: 'future_supported',
        label: 'Current playable slice endpoint reached',
        summary: 'You can review the shrine confrontation.',
        review_only: true,
      },
    },
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
  });

  assert.equal(diagnostics.alignment_status, RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(diagnostics.player_read_model_projection.state, PLAYER_READ_MODEL_STATES.AWAITING_SUPPORT);
  assert.equal(nextBeat.kind, NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY);
  assert.equal(text(playerView).includes('combat_pending'), false);
  assert.equal(text(playerView).includes('future_supported'), false);
  assert.equal(text(playerView).includes('shrine-rusk-confrontation'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(playerView));
});

test('6C.6 recovery read model rejects unsafe stale next actions', () => {
  const safeDiagnostics = createResultReadModelAlignmentDiagnostics({
    playerResultBundle: {
      recovery: {
        message: 'The scene changed. Refresh the current state and choose again.',
        recoveryAction: 'refresh_current_scene',
      },
      status: { state: 'recovery_needed', label: 'Recovery needed', isRecoveryNeeded: true },
    },
    nextBeatDecision: {
      kind: NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED,
      playerLabel: 'Refresh the current state',
    },
    readModel: {
      actionStatus: { state: 'recovery_needed', label: 'Refresh needed' },
    },
  });
  const unsafeDiagnostics = createResultReadModelAlignmentDiagnostics({
    playerResultBundle: {
      recovery: {
        message: 'The scene changed. Refresh the current state and choose again.',
      },
      status: { state: 'recovery_needed', label: 'Recovery needed', isRecoveryNeeded: true },
    },
    nextBeatDecision: { kind: NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED },
    readModel: {
      actionStatus: { state: 'recovery_needed', label: 'Refresh needed' },
      availableActions: [{ label: 'Old stale action' }],
    },
  });

  assert.equal(safeDiagnostics.alignment_status, RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(unsafeDiagnostics.alignment_status, RESULT_READ_MODEL_ALIGNMENT_STATUSES.NEEDS_REVIEW);
  assert.match(unsafeDiagnostics.mismatches[0].label, /unsafe next actions/i);
  assert.throws(
    () =>
      assertResultReadModelAligned({
        playerResultBundle: {
          recovery: { message: 'The scene changed.' },
          status: { state: 'recovery_needed', label: 'Recovery needed', isRecoveryNeeded: true },
        },
        nextBeatDecision: { kind: NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED },
        readModel: {
          actionStatus: { state: 'recovery_needed' },
          availableActions: [{ label: 'Old stale action' }],
        },
      }),
    /recovery/
  );
});

test('6C.6 trace and response projections keep read-model diagnostics GM/dev-only', () => {
  const transition = {
    kind: TRANSITION_DECISION_KINDS.STAY_IN_CURRENT_SCENE,
    sourceSceneId: 'broken-caravan-site',
    playerLabel: 'Choose your next action',
  };
  const nextBeat = {
    kind: NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW,
    sceneId: 'broken-caravan-site',
    playerLabel: 'Choose your next action',
  };
  const trace = createResolutionTraceEnvelope({
    interactionDomain: 'exploration',
    playerResultBundle: {
      result: { text: 'The wreck gives up one useful clue.' },
      next: { label: 'Choose your next action' },
    },
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    readModelRefreshHook: {
      timing: READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
      targets: ['scene', 'memory'],
    },
    readModel: {
      scene: { key: 'broken-caravan-site', title: 'Broken Caravan' },
      visibleAffordances: [{ label: 'Continue toward the inn' }],
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'exploration',
    playerResultBundle: trace.player_result_bundle,
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    readModelRefreshHook: { timing: READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION },
    gmDevTrace: trace,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const refresh = createReadModelRefreshDiagnostics({
    readModelRefreshHook: { timing: 'after_next_beat' },
    nextBeatDecision: nextBeat,
  });

  assert.equal(trace.result_read_model_alignment_diagnostics.alignment_status, RESULT_READ_MODEL_ALIGNMENT_STATUSES.ALIGNED);
  assert.equal(trace.read_model_refresh_diagnostics.refresh_after_next_beat_selection, true);
  assert.equal(refresh.read_model_refresh_hook.timing, READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION);
  assert.equal(gmDev.gm_dev_trace.result_read_model_alignment_diagnostics.alignment_status, 'aligned');
  assert.equal(text(player).includes('result_read_model_alignment_diagnostics'), false);
  assert.equal(text(player).includes('read_model_refresh_diagnostics'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});
