import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEXT_BEAT_DECISION_KINDS,
  TRANSITION_DECISION_KINDS,
  assertNoPlayerHiddenData,
  assertResolutionResponsePlayerSafe,
  assertTransitionResultAlignment,
  createCommittedResolutionResponse,
  createCommitResolutionRequest,
  createResolutionTraceEnvelope,
  createTransitionOrchestrationDecision,
  createTransitionOrchestrationDiagnostics,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
  selectNextBeatDecision,
} from '../src/services/interactionCore/index.js';

test('6C.5 scene transitions select the next exploration action window', () => {
  const transition = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    sourceSceneId: 'broken-caravan-site',
    outputBundle: {
      transitionOutputs: [
        {
          status: 'live',
          targetType: 'scene',
          targetId: 'grey-road-inn',
          playerLabel: 'Road toward the inn',
          gmDevRouting: { route_id: 'leave-broken-caravan-for-inn' },
        },
      ],
    },
  });
  const nextBeat = selectNextBeatDecision({ transitionDecision: transition });

  assert.equal(transition.kind, TRANSITION_DECISION_KINDS.SCENE_TRANSITION);
  assert.equal(transition.target_id, 'grey-road-inn');
  assert.equal(nextBeat.kind, NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW);
  assert.equal(nextBeat.scene_id, 'grey-road-inn');
  assert.equal(nextBeat.opens_action_window, true);
  assert.doesNotThrow(() =>
    assertTransitionResultAlignment({
      transitionDecision: transition,
      nextBeatDecision: nextBeat,
      playerResultBundle: {
        result: { text: 'You follow the road toward the inn.' },
        next: { label: 'Choose your next action' },
      },
    })
  );
});

test('6C.5 dialogue entry and continuation select dialogue action windows', () => {
  const enterDialogue = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    adapterTransitionProposal: {
      kind: 'enter_dialogue',
      targetType: 'dialogue',
      targetId: 'greyvale_tomas_roadside_worries_dialogue',
      playerLabel: 'Speak with Tomas',
    },
  });
  const continueDialogue = createTransitionOrchestrationDecision({
    interactionDomain: 'dialogue',
    sourceDialogueId: 'greyvale_tomas_roadside_worries_dialogue',
  });
  const enterNext = selectNextBeatDecision({ transitionDecision: enterDialogue });
  const continueNext = selectNextBeatDecision({ transitionDecision: continueDialogue });

  assert.equal(enterDialogue.kind, TRANSITION_DECISION_KINDS.ENTER_DIALOGUE);
  assert.equal(enterNext.kind, NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW);
  assert.equal(enterNext.dialogue_id, 'greyvale_tomas_roadside_worries_dialogue');
  assert.equal(continueDialogue.kind, TRANSITION_DECISION_KINDS.CONTINUE_DIALOGUE);
  assert.equal(continueNext.kind, NEXT_BEAT_DECISION_KINDS.OPEN_DIALOGUE_ACTION_WINDOW);
  assert.equal(continueNext.dialogue_id, 'greyvale_tomas_roadside_worries_dialogue');
});

test('6C.5 dialogue exits return to an exploration action window without making exits look like combat or navigation', () => {
  const transition = createTransitionOrchestrationDecision({
    interactionDomain: 'dialogue',
    adapterTransitionProposal: {
      kind: 'dialogue_exit',
      targetType: 'scene',
      targetId: 'grey-road-inn',
      playerLabel: 'Return to the common room',
    },
  });
  const nextBeat = selectNextBeatDecision({ transitionDecision: transition });

  assert.equal(transition.kind, TRANSITION_DECISION_KINDS.RETURN_TO_EXPLORATION);
  assert.equal(nextBeat.kind, NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW);
  assert.equal(nextBeat.scene_id, 'grey-road-inn');
  assert.doesNotThrow(() =>
    assertTransitionResultAlignment({
      transitionDecision: transition,
      nextBeatDecision: nextBeat,
      playerResultBundle: { result: { text: 'You step away from the conversation.' } },
    })
  );
});

test('6C.5 Rusk future-supported handoff is GM/dev visible and player review-only', () => {
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
          gmDevRouting: {
            combatRouting: 'shrine-rusk-confrontation',
            future_supported_internal: true,
          },
        },
      ],
    },
  });
  const nextBeat = selectNextBeatDecision({ transitionDecision: transition });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    outputBundle: {
      transitionOutputs: [
        {
          status: 'future_supported',
          targetType: 'combat_pending',
          targetId: 'shrine-rusk-confrontation',
          playerLabel: 'Hold at the shrine',
          gmDevRouting: { combatRouting: 'shrine-rusk-confrontation' },
        },
      ],
    },
    playerResultBundle: {
      result: { text: 'Rusk staggers back as the shrine pressure breaks into open danger.' },
      status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
    },
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const playerText = JSON.stringify(player);

  assert.equal(transition.kind, TRANSITION_DECISION_KINDS.FUTURE_SUPPORTED);
  assert.equal(nextBeat.kind, NEXT_BEAT_DECISION_KINDS.FUTURE_SUPPORTED_REVIEW_ONLY);
  assert.equal(nextBeat.review_only, true);
  assert.equal(player.next_beat.endpoint_status, 'awaiting_support');
  assert.equal(playerText.includes('combat_pending'), false);
  assert.equal(playerText.includes('future_supported'), false);
  assert.equal(playerText.includes('shrine-rusk-confrontation'), false);
  assert.equal(gmDev.transition_decision.target_type, 'combat_pending');
  assert.doesNotThrow(() => assertResolutionResponsePlayerSafe(response));
});

test('6C.5 recovery and unavailable transitions do not open unsafe next action windows', () => {
  const recoveryTransition = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    recoveryNeeded: true,
  });
  const unavailableTransition = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    unavailableLocked: true,
  });
  const recoveryNext = selectNextBeatDecision({ transitionDecision: recoveryTransition });
  const unavailableNext = selectNextBeatDecision({ transitionDecision: unavailableTransition });

  assert.equal(recoveryTransition.kind, TRANSITION_DECISION_KINDS.RECOVERY_NEEDED);
  assert.equal(recoveryNext.kind, NEXT_BEAT_DECISION_KINDS.RECOVERY_NEEDED);
  assert.equal(recoveryNext.opens_action_window, false);
  assert.equal(unavailableTransition.kind, TRANSITION_DECISION_KINDS.UNAVAILABLE_LOCKED);
  assert.equal(unavailableNext.kind, NEXT_BEAT_DECISION_KINDS.UNAVAILABLE_LOCKED_NO_STATE_CHANGE);
  assert.equal(unavailableNext.opens_action_window, false);
});

test('6C.5 transition diagnostics compare player-safe and GM/dev projections', () => {
  const request = createCommitResolutionRequest({
    interactionDomain: 'exploration',
    characterId: 'pc-1',
    campaignId: 'campaign-1',
    actionWindowId: 'window-1',
    sourceSceneId: 'broken-caravan-site',
    selectedOptionId: 'inspect-broken-caravan',
    selectedOptionKind: 'committed_action',
  });
  const transition = createTransitionOrchestrationDecision({
    request,
    outputBundle: {
      transitionOutputs: [
        {
          status: 'live',
          targetType: 'scene',
          targetId: 'grey-road-inn',
          playerLabel: 'Road toward the inn',
          gmDevRouting: { branch_id: 'caravan-success' },
        },
      ],
    },
  });
  const nextBeat = selectNextBeatDecision({ transitionDecision: transition });
  const trace = createResolutionTraceEnvelope({
    request,
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    playerResultBundle: {
      result: { text: 'The road to the inn is clear enough to follow.' },
      next: { label: 'Continue toward the inn' },
    },
  });
  const diagnostics = createTransitionOrchestrationDiagnostics({
    transitionDecision: transition,
    nextBeatDecision: nextBeat,
    playerResultBundle: trace.player_result_bundle,
  });
  const playerProjection = {
    transition: diagnostics.player_transition_projection,
    next_beat: diagnostics.player_next_beat_projection,
  };

  assert.equal(trace.transition_orchestration_diagnostics.alignment_status, 'aligned');
  assert.equal(diagnostics.transition_decision.gm_dev_routing.branch_id, 'caravan-success');
  assert.equal(JSON.stringify(playerProjection).includes('branch_id'), false);
  assert.equal(JSON.stringify(playerProjection).includes('grey-road-inn'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(playerProjection));
});

test('6C.5 alignment helper rejects impossible transition and next-beat pairings', () => {
  assert.throws(
    () =>
      assertTransitionResultAlignment({
        transitionDecision: {
          kind: 'enter_dialogue',
          targetType: 'dialogue',
          targetId: 'greyvale_tomas_roadside_worries_dialogue',
        },
        nextBeatDecision: {
          kind: 'open_exploration_action_window',
          sceneId: 'grey-road-inn',
        },
      }),
    /must select a dialogue next beat/
  );
  assert.doesNotThrow(() =>
    assertTransitionResultAlignment({
      transitionDecision: { kind: 'scene_transition', targetType: 'scene', targetId: 'grey-road-inn' },
      nextBeatDecision: { kind: 'open_exploration_action_window', sceneId: 'grey-road-inn' },
    })
  );
});
