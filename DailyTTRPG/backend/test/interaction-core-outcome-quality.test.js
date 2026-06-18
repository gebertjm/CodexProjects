import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OUTCOME_QUALITY_STATUSES,
  OUTCOME_QUALITY_WARNING_CODES,
  RECOVERY_NEEDED_KINDS,
  RESOLUTION_RESPONSE_KINDS,
  assertNoPlayerHiddenData,
  createCommittedResolutionResponse,
  createOutcomeQualityDiagnostics,
  createOutcomeQualityResultBundle,
  createRecoveryResolutionResponse,
  createResolutionTraceEnvelope,
  createUnavailableResolutionResponse,
  projectResolutionResponseForGmDev,
  projectResolutionResponseForPlayer,
} from '../src/services/interactionCore/index.js';

function playerText(value) {
  return JSON.stringify(value);
}

test('6C.3 outcome assembler preserves authored action and result text while deriving safe discovery progress consequence and next sections', () => {
  const bundle = createOutcomeQualityResultBundle({
    attemptedAction: {
      label: 'Inspect the broken caravan',
      text: 'You search the wreck for what does not fit.',
    },
    result: {
      title: 'The wreck tells a careful story',
      text: 'The axle split cleanly, but the untouched cargo makes the attack feel wrong.',
    },
    outputBundle: {
      knowledgeOutputs: [
        {
          knowledgeId: 'clue_caravan_irregularity',
          title: 'Caravan Irregularity',
          summary: 'The wreck does not look like a simple robbery.',
          gmDevDetails: { branch_id: 'success' },
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
      stateWrites: [
        {
          stateKey: 'road_pressure',
          operation: 'set',
          value: 'worse',
          playerSummary: 'The road feels less safe than it did before.',
        },
      ],
      transitionOutputs: [
        {
          status: 'live',
          targetType: 'scene',
          targetId: 'grey-road-inn',
          playerLabel: 'Continue to the Grey Road Inn',
          playerSummary: 'Someone at the inn may know whether this has happened before.',
          gmDevRouting: { transition_id: 'leave-broken-caravan-for-inn' },
        },
      ],
      debugOutputs: [{ debugId: 'debug-caravan', diagnostics: { rawRoll: 17 } }],
    },
  });
  const text = playerText(bundle);

  assert.equal(bundle.attempted_action.label, 'Inspect the broken caravan');
  assert.equal(bundle.result.title, 'The wreck tells a careful story');
  assert.equal(bundle.discoveries[0].knowledge_id, 'clue_caravan_irregularity');
  assert.equal(bundle.progress[0].id, 'witness-the-aftermath');
  assert.equal(bundle.consequences[0].text, 'The road feels less safe than it did before.');
  assert.equal(bundle.next.label, 'Continue to the Grey Road Inn');
  assert.equal(text.includes('branch_id'), false);
  assert.equal(text.includes('rawRoll'), false);
  assert.equal(text.includes('transition_id'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(bundle));
});

test('6C.3 dialogue outcome assembler frames social consequence without leaking raw relationship state', () => {
  const bundle = createOutcomeQualityResultBundle({
    attemptedAction: {
      label: 'Compare Tomas against the caravan pattern',
    },
    result: {
      text: 'Tomas lowers his voice and admits the attacks have a rhythm.',
    },
    outputBundle: {
      relationshipOrSocialWrites: [
        {
          participantId: 'tomas-rell',
          stateKey: 'trust',
          operation: 'increment',
          delta: 1,
          playerPerceptionSummary: 'Tomas seems more willing to risk a specific answer.',
          gmDevDetails: { rawRelationshipState: { trust: 4 } },
        },
      ],
      knowledgeOutputs: [
        {
          knowledgeId: 'innkeeper_tracks_road_patterns',
          title: 'Pattern of Attacks',
          summary: 'Tomas has seen enough attacks to recognize a pattern.',
        },
      ],
    },
    next: {
      label: 'Check on Elin',
      text: 'Elin may remember a detail from the road.',
    },
  });
  const text = playerText(bundle);

  assert.equal(bundle.consequences[0].label, 'Social consequence');
  assert.equal(bundle.consequences[0].text, 'Tomas seems more willing to risk a specific answer.');
  assert.equal(bundle.discoveries[0].title, 'Pattern of Attacks');
  assert.equal(bundle.next.label, 'Check on Elin');
  assert.equal(text.includes('rawRelationshipState'), false);
  assert.equal(text.includes('trust'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(bundle));
});

test('6C.3 failure and partial-success framing has a safe complication section and no hidden check details', () => {
  const bundle = createOutcomeQualityResultBundle({
    attemptedAction: { label: 'Press Rusk for the truth' },
    result: {
      text: 'Rusk hears you, but fear keeps him from naming what he serves.',
    },
    complications: [
      {
        label: 'The confrontation worsens',
        text: 'The shrine pressure rises, and this path is not fully resolved yet.',
        severity: 'danger',
        status: 'unresolved',
        hiddenDc: 15,
      },
    ],
    next: {
      label: 'Hold the line',
      text: 'Keep him talking or prepare to stop here until combat support exists.',
    },
    status: { state: 'resolved', label: 'Partial success' },
  });
  const text = playerText(bundle);

  assert.equal(bundle.complications[0].label, 'The confrontation worsens');
  assert.equal(bundle.complications[0].status, 'unresolved');
  assert.equal(text.includes('hiddenDc'), false);
  assert.equal(text.includes('15'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(bundle));
});

test('6C.3 unavailable and recovery result bundles remain useful and player-safe', () => {
  const unavailable = createUnavailableResolutionResponse({
    interactionDomain: 'exploration',
    message: 'That route is not clear yet. Follow another lead first.',
    playerResultBundle: createOutcomeQualityResultBundle({
      recovery: {
        message: 'That route is not clear yet. Follow another lead first.',
        recoveryAction: 'choose_another_action',
      },
      complications: [
        {
          label: 'Route still blocked',
          text: 'You need a clearer lead before this path makes sense.',
        },
      ],
      next: {
        label: 'Ask around Dunmere',
        text: 'Someone in the village may know another way forward.',
      },
      status: { state: 'unavailable', label: 'Not available yet' },
    }),
    gmDevTrace: {
      interactionDomain: 'exploration',
      selectedOutcome: { branch_id: 'missing_shrine_path_known' },
    },
  });
  const recovery = createRecoveryResolutionResponse({
    interactionDomain: 'dialogue',
    recoveryKind: RECOVERY_NEEDED_KINDS.STALE_REQUEST,
    message: 'The conversation changed. Review the current conversation and choose again.',
  });
  const unavailablePlayer = projectResolutionResponseForPlayer(unavailable);
  const recoveryPlayer = projectResolutionResponseForPlayer(recovery);

  assert.equal(unavailablePlayer.player_result_bundle.complications[0].label, 'Route still blocked');
  assert.equal(unavailablePlayer.player_result_bundle.next.label, 'Ask around Dunmere');
  assert.equal(playerText(unavailablePlayer).includes('missing_shrine_path_known'), false);
  assert.match(recoveryPlayer.recovery.player_safe_message, /conversation changed/i);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(unavailablePlayer));
  assert.doesNotThrow(() => assertNoPlayerHiddenData(recoveryPlayer));
});

test('6C.3 outcome quality diagnostics report present sections missing recommendations and output references for GM/dev only', () => {
  const bundle = createOutcomeQualityResultBundle({
    attemptedAction: { label: 'Inspect the broken caravan' },
    result: { text: 'You find the wreck was staged strangely.' },
    outputBundle: {
      knowledgeOutputs: [{ knowledgeId: 'clue_caravan_irregularity', title: 'Caravan Irregularity' }],
    },
  });
  const diagnostics = createOutcomeQualityDiagnostics({
    playerResultBundle: bundle,
    outputBundle: {
      knowledgeOutputs: [{ knowledgeId: 'clue_caravan_irregularity', title: 'Caravan Irregularity' }],
    },
    expectedSections: ['attempted_action', 'result', 'discoveries', 'progress', 'next'],
    selectedOutcome: { branch_id: 'success' },
    nextStepMarker: 'continue_to_inn',
  });

  assert.equal(diagnostics.quality_status, OUTCOME_QUALITY_STATUSES.NEEDS_REVIEW);
  assert.equal(diagnostics.present_sections.includes('attempted_action'), true);
  assert.equal(diagnostics.present_sections.includes('discoveries'), true);
  assert.deepEqual(diagnostics.missing_recommended_sections, ['progress', 'next']);
  assert.equal(diagnostics.warnings[0].code, OUTCOME_QUALITY_WARNING_CODES.MISSING_RECOMMENDED_SECTION);
  assert.equal(diagnostics.output_references_used.knowledge_outputs, 1);
  assert.equal(diagnostics.selected_outcome.branch_id, 'success');
});

test('6C.3 GM/dev trace includes outcome diagnostics while player projection omits diagnostics and branch data', () => {
  const playerResultBundle = createOutcomeQualityResultBundle({
    attemptedAction: { label: 'Push Rusk to name the source' },
    result: { text: 'The confrontation reaches the edge of the playable slice.' },
    complications: [
      {
        label: 'Unsupported combat boundary',
        text: 'You have reached the current endpoint and can review what you learned.',
      },
    ],
    status: { state: 'awaiting_support', label: 'Awaiting support', isEndpoint: true },
  });
  const trace = createResolutionTraceEnvelope({
    interactionDomain: 'dialogue',
    selectedOutcome: { branch_id: 'rusk_hard_success' },
    playerResultBundle,
    expectedSections: ['attempted_action', 'result', 'complications', 'status'],
    outputBundle: {
      transitionOutputs: [
        {
          status: 'future_supported',
          targetType: 'combat_pending',
          targetId: 'shrine-rusk-confrontation',
          playerLabel: 'Review the shrine confrontation',
          gmDevRouting: { combatRouting: 'encounter:rusk' },
        },
      ],
    },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'dialogue',
    gmDevTrace: trace,
    playerResultBundle,
  });
  const player = projectResolutionResponseForPlayer(response);
  const gmDev = projectResolutionResponseForGmDev(response);
  const text = playerText(player);

  assert.equal(gmDev.gm_dev_trace.outcome_quality_diagnostics.quality_status, OUTCOME_QUALITY_STATUSES.COMPLETE);
  assert.equal(gmDev.gm_dev_trace.selected_outcome.branch_id, 'rusk_hard_success');
  assert.equal(text.includes('outcome_quality_diagnostics'), false);
  assert.equal(text.includes('branch_id'), false);
  assert.equal(text.includes('combat_pending'), false);
  assert.equal(text.includes('shrine-rusk-confrontation'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

