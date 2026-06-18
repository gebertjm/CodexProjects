import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  MUTATION_APPLICATION_STATUSES,
  NEXT_BEAT_DECISION_KINDS,
  READ_MODEL_REFRESH_TIMING,
  RESOLUTION_TRACE_INSPECTION_STATUSES,
  TRANSITION_DECISION_KINDS,
  assertMutationPlanOrdering,
  assertNoPlayerHiddenData,
  assertPreviewResponseNonMutating,
  assertResultReadModelAligned,
  compareResolutionPlayerGmDevProjections,
  createCommittedBeatMutationPlan,
  createCommittedResolutionResponse,
  createCommitResolutionRequest,
  createOutcomeQualityResultBundle,
  createPreviewResolutionResponse,
  createReadModelRefreshHook,
  createResolutionOrchestrationMap,
  createResolutionProvenanceInspector,
  createResolutionTraceEnvelope,
  createTransitionOrchestrationDecision,
  projectResolutionResponseForPlayer,
  selectNextBeatDecision,
} from '../src/services/interactionCore/index.js';

const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const stage6cFixturePath = path.resolve(
  repoRoot,
  'content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json'
);

const verticalSliceFixturePath = path.resolve(
  repoRoot,
  'content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json'
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function text(value) {
  return JSON.stringify(value);
}

test('6C.8 Stage command wires shared runtime regression to Greyvale acceptance', () => {
  const rootPackage = readJson(path.resolve(repoRoot, 'package.json'));
  const backendPackage = readJson(path.resolve(repoRoot, 'backend/package.json'));
  const stageFixture = readJson(stage6cFixturePath);

  assert.equal(rootPackage.scripts['test:stage:6c'], 'npm --prefix backend run test:stage:6c');
  assert.match(backendPackage.scripts['test:stage:6c'], /test:interaction-core/);
  assert.match(backendPackage.scripts['test:stage:6c'], /test:greyvale-vertical-slice/);
  assert.match(backendPackage.scripts['test:interaction-core'], /stage6c-beat-resolution-regression\.test\.js/);
  assert.equal(stageFixture.suite_command, 'npm run test:stage:6c');
  assert.equal(stageFixture.backend_suite_command, 'npm --prefix backend run test:stage:6c');
});

test('6C.8 regression fixture names every Stage 6C coverage layer and seed requirement', () => {
  const fixture = readJson(stage6cFixturePath);
  const coverageIds = new Set(fixture.coverage_groups.map((group) => group.id));
  const layerIds = new Set(fixture.layers.map((layer) => layer.id));

  for (const expected of [
    'shared_contracts',
    'preview_to_resolution',
    'outcome_quality_result_bundle',
    'mutation_safety',
    'transition_next_beat',
    'result_read_model_alignment',
    'gm_dev_trace_provenance',
    'player_visibility_security',
  ]) {
    assert.ok(coverageIds.has(expected), `Stage 6C fixture should include ${expected}`);
  }

  assert.ok(layerIds.has('shared_runtime_regression'));
  assert.ok(layerIds.has('greyvale_acceptance_extension'));
  assert.ok(layerIds.has('frontend_rendered_output_limitation'));
  assert.equal(fixture.seed_strategy.requires_test_database, true);
  assert.ok(fixture.seed_strategy.required_environment.includes('DB_HOST=localhost'));
  assert.match(fixture.seed_strategy.content_validation_command, /validate-content/);
  assert.ok(fixture.non_goals_preserved.includes('no_database_schema_migration'));
});

test('6C.8 path fixture aligns with canonical Greyvale route and Stage 6C semantic markers', () => {
  const stageFixture = readJson(stage6cFixturePath);
  const verticalFixture = readJson(verticalSliceFixturePath);
  const canonical = verticalFixture.paths.find((entry) => entry.name === 'canonical_happy_path');
  assert.ok(canonical, 'canonical_happy_path exists');

  assert.deepEqual(
    stageFixture.greyvale_route_requirements.canonical_steps,
    canonical.steps.map((step) => step.id)
  );

  const brokenCaravan = canonical.steps.find((step) => step.id === 'inspect_broken_caravan');
  const tomas = canonical.steps.find((step) => step.id === 'tomas_pattern');
  const rusk = canonical.steps.find((step) => step.id === 'rusk_confrontation');
  const endpoint = canonical.steps.find((step) => step.id === 'endpoint_review');

  assert.ok(brokenCaravan.expected_result_bundle_sections.includes('discoveries'));
  assert.ok(brokenCaravan.expected_mutation_write_groups.includes('knowledge_writes'));
  assert.equal(brokenCaravan.duplicate_submit_expected, 'safe_no_duplicate_outputs');
  assert.equal(brokenCaravan.stale_submit_expected, 'safe_no_mutation_recovery');
  assert.ok(brokenCaravan.expected_trace_sections.includes('projection_comparison'));

  assert.ok(tomas.expected_result_bundle_sections.includes('consequences'));
  assert.ok(tomas.expected_mutation_write_groups.includes('completed_record_transcript_archive_search_writes'));
  assert.equal(tomas.duplicate_submit_expected, 'safe_no_duplicate_completed_record');

  assert.ok(rusk.expected_result_bundle_sections.includes('complications'));
  assert.ok(rusk.expected_mutation_write_groups.includes('transition_endpoint_writes'));
  assert.equal(rusk.expected_transition_decision, 'future_supported');
  assert.equal(rusk.expected_next_beat_decision, 'future_supported_review_only');
  assert.ok(rusk.expected_trace_sections.includes('transition_endpoint_writes'));
  assert.equal(endpoint.expected_read_model_state, 'endpoint_review');

  for (const marker of stageFixture.greyvale_route_requirements.required_stage_6c_step_markers) {
    assert.ok(
      canonical.steps.some((step) => Object.hasOwn(step, marker)),
      `canonical route should include marker ${marker}`
    );
  }
});

test('6C.8 orchestration map exposes the full shared runtime regression surface', () => {
  const map = createResolutionOrchestrationMap();

  assert.ok(map.preview_lifecycle.some((step) => step.step === 'return_player_safe_preview'));
  assert.ok(map.commit_lifecycle.some((step) => step.step === 'apply_mutations_in_controlled_order'));
  assert.ok(map.recovery_lifecycle.some((step) => step.step === 'classify_recovery_kind'));
  assert.ok(map.transition_orchestration_rules.includes('future_supported_and_endpoint_handoffs_are_review_only_for_players'));
  assert.ok(map.read_model_refresh_rules.includes('read_model_refresh_occurs_after_committed_writes_and_next_beat_selection'));
  assert.ok(map.gm_dev_trace_rules.includes('player_projection_never_includes_gm_dev_trace_or_trace_diagnostics'));
});

test('6C.8 synthetic committed beat exercises mutation transition read-model trace and visibility regressions together', () => {
  const request = createCommitResolutionRequest({
    interactionDomain: 'exploration',
    requestId: 'stage6c-regression-request',
    userId: 'account-1',
    characterId: 'character-1',
    campaignId: 'campaign-1',
    actionWindowId: 'window-1',
    sourceSceneId: 'broken-caravan-site',
    selectedOptionId: 'inspect-broken-caravan',
    selectedOptionKind: 'committed_action',
    idempotencyKey: 'stage6c-regression-commit',
  });
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
        summary: 'You found the first sign that the attacks are stranger than they look.',
      },
    ],
    historyOutputs: [{ eventId: 'history:caravan', text: 'You inspected the broken caravan.' }],
    latestDevelopmentOutput: {
      latestDevelopmentId: 'latest:caravan',
      text: 'The caravan scene points toward local knowledge at the inn.',
    },
    transitionOutputs: [
      {
        status: 'live',
        targetType: 'scene',
        targetId: 'grey-road-inn',
        playerLabel: 'Continue toward the Grey Road Inn',
      },
    ],
  };
  const preview = createPreviewResolutionResponse({
    interactionDomain: 'exploration',
    preview: {
      text: 'Inspecting the wreck may reveal what changed here.',
    },
    playerResultBundle: {
      result: { text: 'Preview only.' },
      status: { state: 'preview_ready', label: 'Preview' },
    },
  });
  const playerResultBundle = createOutcomeQualityResultBundle({
    attemptedAction: { label: 'Inspect the broken caravan' },
    result: { text: 'The wreck tells a careful story.' },
    outputBundle,
    next: { label: 'Continue toward the Grey Road Inn' },
  });
  const mutationPlan = createCommittedBeatMutationPlan({
    request,
    outputBundle,
    selectedOutcome: { outcomeId: 'inspect_caravan_success' },
    actionWindowLifecycle: { closeSourceWindow: true, openNextWindow: true },
    readModelRefreshTarget: { timing: 'after_next_beat', targets: ['scene', 'knowledge', 'objectives'] },
  });
  const transitionDecision = createTransitionOrchestrationDecision({
    interactionDomain: 'exploration',
    sourceSceneId: 'broken-caravan-site',
    outputBundle,
  });
  const nextBeatDecision = selectNextBeatDecision({ transitionDecision });
  const readModelRefreshHook = createReadModelRefreshHook({
    timing: READ_MODEL_REFRESH_TIMING.AFTER_NEXT_BEAT_SELECTION,
    targets: ['scene', 'knowledge', 'objectives', 'latest_development'],
  });
  const readModel = {
    scene: { key: 'grey-road-inn', title: 'Grey Road Inn' },
    currentObjective: { key: 'witness-the-aftermath', title: 'Witness the Aftermath', status: 'completed' },
    knownFacts: [{ knowledge_key: 'clue_caravan_irregularity', title: 'Caravan Irregularity' }],
    latestDevelopment: { text: 'The caravan scene points toward local knowledge at the inn.' },
    visibleAffordances: [{ label: 'Speak with Tomas' }],
  };
  const trace = createResolutionTraceEnvelope({
    traceId: 'trace-stage6c-regression',
    request,
    authorizationResult: { status: 'authorized', capability: 'can_advance_beats' },
    validationResult: { status: 'valid' },
    selectedOutcome: { outcomeId: 'inspect_caravan_success', branch_id: 'gm-only-success' },
    outputBundle,
    playerResultBundle,
    mutationPlan,
    mutationResult: {
      status: MUTATION_APPLICATION_STATUSES.APPLIED,
      applied_write_groups: mutationPlan.write_groups.map((group) => group.group_key),
    },
    transitionDecision,
    nextBeatDecision,
    readModelRefreshHook,
    readModel,
    playerProjectionSummary: { safe_sections: ['result', 'discoveries', 'progress', 'next'] },
  });
  const response = createCommittedResolutionResponse({
    interactionDomain: 'exploration',
    request,
    outputBundle,
    playerResultBundle,
    mutationPlan,
    transitionDecision,
    nextBeatDecision,
    readModelRefreshHook,
    gmDevTrace: trace,
  });
  const inspector = createResolutionProvenanceInspector({ trace, canAdvanceBeats: true });
  const projectionComparison = compareResolutionPlayerGmDevProjections(response);
  const playerProjection = projectResolutionResponseForPlayer(response);

  assert.doesNotThrow(() => assertPreviewResponseNonMutating(preview));
  assert.doesNotThrow(() => assertMutationPlanOrdering(mutationPlan));
  assert.equal(transitionDecision.kind, TRANSITION_DECISION_KINDS.SCENE_TRANSITION);
  assert.equal(nextBeatDecision.kind, NEXT_BEAT_DECISION_KINDS.OPEN_EXPLORATION_ACTION_WINDOW);
  assert.doesNotThrow(() =>
    assertResultReadModelAligned({
      outputBundle,
      playerResultBundle,
      transitionDecision,
      nextBeatDecision,
      readModel,
      readModelRefreshHook,
    })
  );
  assert.equal(inspector.lifecycle.lifecycle_status, RESOLUTION_TRACE_INSPECTION_STATUSES.TRACEABLE);
  assert.equal(inspector.access_decision.authorized, true);
  assert.ok(inspector.provenance_summary.mutation_write_groups.includes('knowledge_writes'));
  assert.equal(inspector.provenance_summary.transition_decision_kind, TRANSITION_DECISION_KINDS.SCENE_TRANSITION);
  assert.equal(projectionComparison.player_projection_safe, true);
  assert.equal(projectionComparison.gm_dev_trace_present, true);
  assert.equal(text(response).includes('gm-only-success'), true);
  assert.equal(text(playerProjection).includes('gm-only-success'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(playerProjection));
});
