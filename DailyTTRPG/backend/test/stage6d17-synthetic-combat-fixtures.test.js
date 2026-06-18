import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SYNTHETIC_COMBAT_FIXTURES,
  SYNTHETIC_COMBAT_FIXTURE_LAYERS,
  SYNTHETIC_COMBAT_FIXTURE_STAGE,
  SYNTHETIC_COMBAT_FIXTURE_SUITES,
  assertNoSyntheticFixturePlayerHiddenData,
  assertSyntheticCombatCoverageComplete,
  buildSyntheticCombatState,
  buildSyntheticFixtureFailureReport,
  cloneFixtureValue,
  createSyntheticFixtureRegistry,
  createSyntheticFixtureRunContext,
  destroySyntheticFixtureRunContext,
  generateSyntheticCombatCoverageReport,
  getSyntheticCombatFixture,
  listSyntheticCombatFixtures,
  projectSyntheticFixtureForFlutter,
  resetSyntheticFixtureRunContext,
  runAllSyntheticCombatFixtures,
  runSyntheticCombatFixture,
  runSyntheticCombatFixtureSuite,
  validateSyntheticCombatFixture,
  validateSyntheticCombatFixtureRegistry,
} from '../src/engine/combat/syntheticCombatFixtures.js';

test('6D.17 registry validates stable neutral synthetic fixtures and rejects story-bound fixtures', () => {
  const registry = validateSyntheticCombatFixtureRegistry();
  assert.equal(registry.valid, true);
  assert.equal(registry.fixture_count, DEFAULT_SYNTHETIC_COMBAT_FIXTURES.length);
  assert.ok(registry.fixture_count >= 12);

  const ids = registry.list().map((fixture) => fixture.fixture_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith('synthetic.')));
  assert.ok(registry.list().every((fixture) => fixture.ruleset.system === 'dnd5e'));
  assert.ok(registry.list().every((fixture) => fixture.ruleset.rules_version === '2014'));

  const bad = validateSyntheticCombatFixture({
    fixture_id: 'synthetic.bad.rusk',
    fixture_version: '1.0.0',
    suite_id: 'bad',
    title: 'Rusk at Greyvale',
    executor: 'player_turn_attack',
    layers: [SYNTHETIC_COMBAT_FIXTURE_LAYERS.BACKEND_RUNTIME],
    mechanics: ['ruleset.dnd5e_2014'],
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.issues.some((issue) => issue.code === 'prohibited_story_fixture_reference'));
});

test('6D.17 production gating requires explicit test/dev opt-in', () => {
  assert.throws(
    () => listSyntheticCombatFixtures({ environment: 'production' }),
    /not listable in production|disabled/
  );
  assert.throws(
    () => runSyntheticCombatFixture({ fixture_id: 'synthetic.foundation.attack_roll_hit' }),
    /disabled/
  );

  const listed = listSyntheticCombatFixtures({
    environment: 'production',
    allow_synthetic_fixtures: true,
  });
  assert.ok(listed.length > 0);
});

test('6D.17 coverage report maps all required mechanics, layers, and suites without gaps', () => {
  const report = generateSyntheticCombatCoverageReport();
  assert.equal(report.stage, SYNTHETIC_COMBAT_FIXTURE_STAGE);
  assert.equal(report.valid_registry, true);
  assert.equal(report.summary.gap_count, 0);
  assertSyntheticCombatCoverageComplete(report);

  const suiteIds = new Set(DEFAULT_SYNTHETIC_COMBAT_FIXTURES.map((fixture) => fixture.suite_id));
  for (const suiteId of Object.values(SYNTHETIC_COMBAT_FIXTURE_SUITES)) {
    assert.equal(suiteIds.has(suiteId), true, `${suiteId} should have at least one fixture`);
  }
  assert.ok(report.mechanics.find((entry) => entry.mechanic_id === 'flutter.state_contracts').fixtures.length > 0);
});

test('6D.17 fixture execution runs representative Stage 6D services and returns player-safe read models', () => {
  const attack = runSyntheticCombatFixture({
    fixture_id: 'synthetic.foundation.attack_roll_hit',
    allow_synthetic_fixtures: true,
  });
  assert.equal(attack.status, 'passed');
  assert.ok(attack.checkpoints.some((entry) => entry.checkpoint_id === 'preview_action'));
  assert.ok(attack.checkpoints.some((entry) => entry.checkpoint_id === 'submit_action'));
  assertNoSyntheticFixturePlayerHiddenData(attack.read_model);

  const turn = runSyntheticCombatFixture({
    fixture_id: 'synthetic.turn.preview_submit_end_turn',
    allow_synthetic_fixtures: true,
  });
  assert.equal(turn.status, 'passed');
  assert.ok(turn.checkpoints.some((entry) => entry.checkpoint_id === 'preview_end_turn'));
  assert.ok(turn.checkpoints.some((entry) => entry.checkpoint_id === 'end_turn_confirmed'));

  const movement = runSyntheticCombatFixture({
    fixture_id: 'synthetic.positioning.cover_reach_movement',
    allow_synthetic_fixtures: true,
  });
  assert.equal(movement.status, 'passed');
  assert.ok(movement.checkpoints.find((entry) => entry.checkpoint_id === 'movement_reaction_handoff').detail.has_reaction_trigger);
});

test('6D.17 reaction, automatic, focus, targeting, persistence, and recovery suites execute through shared harness', () => {
  const suite = runSyntheticCombatFixtureSuite({
    allow_synthetic_fixtures: true,
    max_parallelism: 8,
  });
  assert.equal(suite.status, 'passed');
  assert.equal(suite.bounded_parallelism, true);
  assert.equal(suite.max_parallelism, 2);
  assert.equal(suite.fixture_count, DEFAULT_SYNTHETIC_COMBAT_FIXTURES.length);

  const byId = new Map(suite.results.map((entry) => [entry.fixture.fixture_id, entry]));
  assert.equal(byId.get('synthetic.reactions.opportunity_interrupt').status, 'passed');
  assert.equal(byId.get('synthetic.automatic.deterministic_profile').status, 'passed');
  assert.equal(byId.get('synthetic.focus.question_reuse').status, 'passed');
  assert.equal(byId.get('synthetic.targeting.area_ally_visibility').status, 'passed');
  assert.equal(byId.get('synthetic.persistence.replay_recovery').status, 'passed');
});

test('6D.17 fixture contexts reset and destroy cleanly without sharing mutable state', () => {
  const fixture = getSyntheticCombatFixture('synthetic.foundation.attack_roll_hit');
  const context = createSyntheticFixtureRunContext({ fixture });
  context.state = buildSyntheticCombatState();
  context.checkpoints.push({ checkpoint_id: 'manual' });

  resetSyntheticFixtureRunContext(context);
  assert.equal(context.cleanup.reset_called, true);
  assert.equal(context.checkpoints.length, 0);
  assert.equal(context.state, null);

  destroySyntheticFixtureRunContext(context);
  assert.equal(context.cleanup.destroy_called, true);
  assert.equal(context.status, 'destroyed');

  const state = buildSyntheticCombatState();
  const copy = cloneFixtureValue(state);
  copy.participants[0].display_name = 'Changed';
  assert.notEqual(state.participants[0].display_name, copy.participants[0].display_name);
});

test('6D.17 failure reports include fixture, checkpoint, cleanup, and concise diagnostic data', () => {
  const context = createSyntheticFixtureRunContext({
    fixture: getSyntheticCombatFixture('synthetic.foundation.attack_roll_hit'),
    fixture_run_id: 'synthetic-failure-demo',
  });
  context.checkpoints.push({ checkpoint_id: 'before_failure' });
  context.cleanup.reset_called = true;

  const failure = buildSyntheticFixtureFailureReport(
    Object.assign(new Error('Expected synthetic failure.'), { code: 'EXPECTED_SYNTHETIC_FAILURE' }),
    context
  );

  assert.equal(failure.fixture_id, 'synthetic.foundation.attack_roll_hit');
  assert.equal(failure.last_checkpoint_id, 'before_failure');
  assert.equal(failure.code, 'EXPECTED_SYNTHETIC_FAILURE');
  assert.equal(failure.cleanup_status.reset_called, true);
});

test('6D.17 Flutter fixture adapter returns active, reaction, recovery, focus, and resolution player-safe shapes', () => {
  for (const stateKind of ['active_turn', 'reaction', 'recovery', 'focus', 'resolution']) {
    const projection = projectSyntheticFixtureForFlutter({ state_kind: stateKind });
    assertNoSyntheticFixturePlayerHiddenData(projection);
    assert.equal(projection.encounter_title, 'Neutral Synthetic Encounter');
  }

  const reaction = projectSyntheticFixtureForFlutter({ state_kind: 'reaction' });
  assert.equal(reaction.reaction_state, 'waiting_for_player');
  assert.equal(reaction.ordinary_controls_available, false);

  const recovery = projectSyntheticFixtureForFlutter({ state_kind: 'recovery' });
  assert.equal(recovery.combat_status, 'recovery_needed');
  assert.equal(recovery.combat_controls_available, false);

  const resolution = projectSyntheticFixtureForFlutter({ state_kind: 'resolution' });
  assert.equal(resolution.status, undefined);
  assert.equal(resolution.aftermath.title, 'Synthetic Aftermath');
});

test('6D.17 selected suite execution and registry filtering are stable', () => {
  const registry = createSyntheticFixtureRegistry();
  const flutterFixtures = registry.list({ layer: SYNTHETIC_COMBAT_FIXTURE_LAYERS.FLUTTER_CONTRACT });
  assert.ok(flutterFixtures.length >= 3);

  const suite = runSyntheticCombatFixtureSuite({
    suite_id: SYNTHETIC_COMBAT_FIXTURE_SUITES.FLUTTER,
    allow_synthetic_fixtures: true,
  });
  assert.equal(suite.fixture_count, 1);
  assert.equal(suite.results[0].fixture.fixture_id, 'synthetic.flutter.active_turn_states');
});

test('6D.17 all-fixture helper remains explicit, bounded, and successful', () => {
  const result = runAllSyntheticCombatFixtures({ allow_synthetic_fixtures: true, max_parallelism: 1 });
  assert.equal(result.status, 'passed');
  assert.equal(result.fixture_count, DEFAULT_SYNTHETIC_COMBAT_FIXTURES.length);
});

