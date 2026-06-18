import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGreyvaleSliceEndpointActionStatus,
  buildGreyvaleSliceEndpointState,
} from '../src/services/greyvaleSliceEndpointService.js';

const playerForbiddenTerms = [
  'combat_pending',
  'future_supported',
  'awaiting_future_support',
  'shrine-rusk-confrontation',
  'branch_id',
  'debug',
  'state_writes',
  'gm_notes',
];

function assertPlayerSafe(payload) {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of playerForbiddenTerms) {
    assert.equal(text.includes(term.toLowerCase()), false, `player endpoint leaked ${term}`);
  }
}

test('Stage 6B.15.5 Rusk endpoint projects safe player status and GM/dev routing diagnostics', () => {
  const endpoint = buildGreyvaleSliceEndpointState({
    worldSlug: 'greyvale',
    campaignSlug: 'shadows-grey-road',
    sceneKey: 'shrine-ruins',
    objectiveKey: 'resolve-the-threat',
    campaignId: 101,
    characterId: 202,
    flags: {
      combat_pending: true,
      shrine_confrontation_ready: true,
      shrine_depth_unlocked: true,
    },
  });

  assert.ok(endpoint);
  assert.equal(endpoint.player.state, 'endpoint_reached');
  assert.match(endpoint.player.message, /end of the current Greyvale playable slice/i);
  assert.match(endpoint.player.current_status, /combat support is enabled/i);
  assertPlayerSafe(endpoint.player);

  assert.equal(endpoint.debug.internal_status, 'awaiting_future_support');
  assert.equal(endpoint.debug.handoff_kind, 'combat_pending');
  assert.equal(endpoint.debug.future_supported_status, 'future_supported_until_combat_system');
  assert.equal(endpoint.debug.target_encounter_id, 'shrine-rusk-confrontation');

  const actionStatus = buildGreyvaleSliceEndpointActionStatus(
    {
      state: 'action_needed',
      can_submit: true,
      can_edit: true,
      action_window_id: '303',
    },
    endpoint.player
  );

  assert.equal(actionStatus.state, 'slice_endpoint_reached');
  assert.equal(actionStatus.can_submit, false);
  assert.equal(actionStatus.can_edit, false);
  assert.equal(actionStatus.action_window_id, '303');
});

test('Stage 6B.15.5 Rusk endpoint is not active outside Greyvale shrine handoff state', () => {
  assert.equal(
    buildGreyvaleSliceEndpointState({
      worldSlug: 'greyvale',
      sceneKey: 'shrine-ruins',
      flags: { combat_pending: true },
    }),
    null
  );
  assert.equal(
    buildGreyvaleSliceEndpointState({
      worldSlug: 'greyvale',
      sceneKey: 'dunmere-village',
      flags: { combat_pending: true, shrine_confrontation_ready: true },
    }),
    null
  );
  assert.equal(
    buildGreyvaleSliceEndpointState({
      worldSlug: 'other-world',
      campaignSlug: 'other-campaign',
      sceneKey: 'shrine-ruins',
      flags: { combat_pending: true, shrine_confrontation_ready: true },
    }),
    null
  );
});
