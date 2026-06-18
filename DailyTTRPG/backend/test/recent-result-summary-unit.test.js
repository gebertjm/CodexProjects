import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecentResultSummary } from '../src/engine/adventure/progressionEngine.js';

test('recent result summary stays scoped to the current exploration scene', () => {
  const history = [
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'You find fresh bootprints in the mud.',
      input_json: { scene_id: 10 },
      result_json: {},
      created_at: '2026-05-08T02:00:00.000Z',
    },
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'The caravan damage does not fit a simple robbery.',
      input_json: { scene_id: 9 },
      result_json: {},
      created_at: '2026-05-08T01:00:00.000Z',
    },
  ];

  assert.equal(
    buildRecentResultSummary(history, 10).summary,
    'You find fresh bootprints in the mud.'
  );
  assert.equal(
    buildRecentResultSummary(history, 9).summary,
    'The caravan damage does not fit a simple robbery.'
  );
});

test('recent result summary returns scene results newest first', () => {
  const history = [
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'You confirm the caravan was attacked.',
      input_json: { scene_id: 10 },
      result_json: {},
      created_at: '2026-05-08T03:00:00.000Z',
    },
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'You find fresh bootprints in the mud.',
      input_json: { scene_id: 10 },
      result_json: {},
      created_at: '2026-05-08T02:00:00.000Z',
    },
    {
      source_type: 'narrative',
      action_key: 'scene_enter',
      summary: 'Entered The Broken Caravan.',
      input_json: { to_scene_id: 10 },
      result_json: { to_scene: { id: 10, name: 'The Broken Caravan' } },
      created_at: '2026-05-08T01:00:00.000Z',
    },
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'Old inn result should not follow the scene.',
      input_json: { scene_id: 9 },
      result_json: {},
      created_at: '2026-05-08T00:00:00.000Z',
    },
  ];

  const summary = buildRecentResultSummary(history, 10);
  assert.equal(summary.summary, 'You confirm the caravan was attacked.');
  assert.deepEqual(
    summary.results.map((result) => result.summary),
    ['You confirm the caravan was attacked.', 'You find fresh bootprints in the mud.']
  );
});

test('recent result summary clears after scene movement instead of appending transition text', () => {
  const history = [
    {
      source_type: 'narrative',
      action_key: 'scene_move',
      summary: 'Moved to Grey Road Inn via Follow the road.',
      input_json: { from_scene_id: 9, to_scene_id: 11 },
      result_json: { to_scene: { id: 11, name: 'Grey Road Inn' } },
      created_at: '2026-05-08T02:00:00.000Z',
    },
    {
      source_type: 'narrative',
      action_key: 'scene_interaction',
      summary: 'The caravan damage does not fit a simple robbery.',
      input_json: { scene_id: 9 },
      result_json: {},
      created_at: '2026-05-08T01:00:00.000Z',
    },
  ];

  assert.equal(buildRecentResultSummary(history, 11), null);
});

test('recent result summary preserves legacy history without scene metadata', () => {
  const history = [
    {
      source_type: 'runtime',
      action_key: 'wait',
      summary: 'The room remains tense.',
      input_json: {},
      result_json: {},
      created_at: '2026-05-08T02:00:00.000Z',
    },
  ];

  assert.equal(buildRecentResultSummary(history, 10).summary, 'The room remains tense.');
});
