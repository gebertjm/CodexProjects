import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SAFE_INTERACTION_ERROR_CODES,
  VISIBILITY_SCOPES,
  assertDialoguePlayerSafe,
  assertExplorationPlayerSafe,
  assertNoPlayerHiddenData,
  buildVisibilityProjection,
  commonSafeResponse,
  dialogueVisibilityAdapter,
  explorationVisibilityAdapter,
  projectDialogueForGmDev,
  projectDialogueForPlayer,
  projectExplorationForGmDev,
  projectExplorationForPlayer,
  projectForGmDev,
  projectForPlayer,
  projectForTestHarness,
  projectForVisibilityScope,
  scanForPlayerHiddenData,
  stripInternalFields,
  toGmDevErrorDetails,
  toPlayerSafeError,
} from '../src/services/interactionCore/index.js';

function unsafeInteractionPayload() {
  return {
    title: 'Tomas and the Road',
    player_result: {
      text: 'Tomas lowers his voice and points you toward Elin.',
      safe_check_type: 'Persuasion check',
    },
    debugEnvelope: {
      checks: [{ hidden_dc: 14, raw_roll: 7 }],
      selectedBranch: { branch_id: 'success' },
    },
    check: {
      hiddenDc: 14,
      resultBand: { id: 'strong_success' },
      player_label: 'Persuasion check',
    },
    relationship_audit: [{ old_value: 0, new_value: 2 }],
    stateReads: [{ path: 'flags.greyvale.trust', value: 2 }],
    transition: {
      player_label: 'Brace for violence',
      future_supported_reason: 'combat handoff is not live',
      gm_dev_routing: { combat_routing: 'encounter:rusk' },
    },
  };
}

test('6B.14.3 player projection strips hidden/debug/internal fields and preserves safe text', () => {
  const projected = projectForPlayer(unsafeInteractionPayload());
  const text = JSON.stringify(projected);

  assert.equal(projected.title, 'Tomas and the Road');
  assert.equal(projected.player_result.text.includes('Elin'), true);
  assert.equal(projected.player_result.safe_check_type, 'Persuasion check');
  assert.equal(text.includes('hidden_dc'), false);
  assert.equal(text.includes('hiddenDc'), false);
  assert.equal(text.includes('raw_roll'), false);
  assert.equal(text.includes('branch_id'), false);
  assert.equal(text.includes('relationship_audit'), false);
  assert.equal(text.includes('stateReads'), false);
  assert.equal(text.includes('future_supported_reason'), false);
  assert.equal(text.includes('combat_routing'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(projected));
});

test('6B.14.3 GM/dev projection preserves debug metadata for authorized surfaces', () => {
  const projected = projectForGmDev(unsafeInteractionPayload());

  assert.equal(projected.debugEnvelope.checks[0].hidden_dc, 14);
  assert.equal(projected.check.hiddenDc, 14);
  assert.equal(projected.relationship_audit[0].new_value, 2);
  assert.equal(projected.transition.gm_dev_routing.combat_routing, 'encounter:rusk');
  assert.equal(projected.visibility_projection.visibility_scope, VISIBILITY_SCOPES.GM_DEV);
  assert.equal(projected.visibility_projection.preserves_debug, true);
});

test('6B.14.3 denylist helper reports readable object paths and supports path allowlists', () => {
  const payload = {
    result: {
      summary: 'Safe surface text.',
      nested: {
        hidden_dc: 15,
      },
    },
    rendered_text: 'This prose mentions hidden_dc as an internal token.',
  };

  const violations = scanForPlayerHiddenData(payload);
  assert.equal(violations.some((entry) => entry.path === '$.result.nested.hidden_dc'), true);
  assert.equal(violations.some((entry) => entry.path === '$.rendered_text'), true);

  const allowlisted = scanForPlayerHiddenData(payload, {
    allowlistPaths: ['$.result.nested.hidden_dc'],
    scanStrings: false,
  });
  assert.deepEqual(allowlisted, []);

  assert.throws(() => assertNoPlayerHiddenData(payload), /hidden\/internal/);
});

test('6B.14.3 safe error projection hides internal causes and constraints from players', () => {
  const error = {
    code: SAFE_INTERACTION_ERROR_CODES.INTERNAL_ERROR,
    message: 'duplicate key value violates constraint dnd5e_secret_idx',
    stack: 'Error: duplicate key\n at service.js:1:2',
    internal_cause: {
      constraint: 'dnd5e_secret_idx',
      branch_id: 'failure',
    },
  };

  const player = toPlayerSafeError(error);
  const gmDev = toGmDevErrorDetails(error, { includeStack: true });

  assert.equal(player.code, SAFE_INTERACTION_ERROR_CODES.INTERNAL_ERROR);
  assert.equal(player.player_safe_message.includes('Something went wrong'), true);
  assert.equal(JSON.stringify(player).includes('constraint'), false);
  assert.equal(JSON.stringify(player).includes('branch_id'), false);
  assert.equal(gmDev.internal_cause.constraint, 'dnd5e_secret_idx');
  assert.equal(gmDev.stack.includes('service.js'), true);
});

test('6B.14.3 projection routing supports player, GM/dev, test harness, and safe wrappers', () => {
  const payload = unsafeInteractionPayload();
  const playerProjection = buildVisibilityProjection(payload, {
    visibilityScope: VISIBILITY_SCOPES.PLAYER,
  });
  const gmProjection = buildVisibilityProjection(payload, {
    visibilityScope: VISIBILITY_SCOPES.GM_DEV,
  });
  const harness = projectForVisibilityScope(payload, {
    visibilityScope: VISIBILITY_SCOPES.TEST_HARNESS,
  });
  const safeResponse = commonSafeResponse(payload, {
    visibilityScope: VISIBILITY_SCOPES.PLAYER,
  });

  assert.equal(playerProjection.visibility_scope, VISIBILITY_SCOPES.PLAYER);
  assert.deepEqual(playerProjection.player_hidden_data_violations, []);
  assert.equal(gmProjection.projected_payload.debugEnvelope.checks[0].hidden_dc, 14);
  assert.equal(harness.player_hidden_data_violations.length > 0, true);
  assert.equal(safeResponse.body.player_result.text.includes('Tomas'), true);
  assert.equal(JSON.stringify(safeResponse.body).includes('debugEnvelope'), false);
});

test('6B.14.3 exploration adapter strips exploration-specific internals but keeps GM/dev detail', () => {
  const payload = {
    scene: { title: 'Broken Caravan' },
    latest_development: { text: 'You noticed a road pattern.' },
    mechanical_details: { action_window_id: 'window-1' },
    exploration_mechanics_debug: {
      check_details: [{ hidden_dc: 13 }],
      state_reads: [{ path: 'scene.flags' }],
      npc_schedule_debug: [{ npc: 'tomas' }],
    },
  };

  const player = projectExplorationForPlayer(payload);
  const gmDev = projectExplorationForGmDev(payload);

  assert.equal(player.scene.title, 'Broken Caravan');
  assert.equal(JSON.stringify(player).includes('mechanical_details'), false);
  assert.equal(JSON.stringify(player).includes('exploration_mechanics_debug'), false);
  assert.equal(gmDev.exploration_mechanics_debug.check_details[0].hidden_dc, 13);
  assert.doesNotThrow(() => assertExplorationPlayerSafe(player));
});

test('6B.14.3 dialogue adapter strips social/debug internals but keeps GM/dev detail', () => {
  const payload = {
    dialogue_scene: { title: 'Garren and the Old Paths' },
    completed_dialogue_summary: 'Garren warned you about the old paths.',
    relationship_state: { respect: 2, hostility: 1 },
    relationship_audit_links_json: ['audit:1'],
    preview_debug_json: { preview_confidence: 0.8 },
    gm_dev_content_ref_json: { source: 'fixture' },
  };

  const player = projectDialogueForPlayer(payload);
  const gmDev = projectDialogueForGmDev(payload);

  assert.equal(player.dialogue_scene.title, 'Garren and the Old Paths');
  assert.equal(player.completed_dialogue_summary.includes('old paths'), true);
  assert.equal(JSON.stringify(player).includes('relationship_state'), false);
  assert.equal(JSON.stringify(player).includes('preview_debug_json'), false);
  assert.equal(gmDev.relationship_state.respect, 2);
  assert.equal(gmDev.preview_debug_json.preview_confidence, 0.8);
  assert.doesNotThrow(() => assertDialoguePlayerSafe(player));
});

test('6B.14.3 archive/search/output-shaped payloads stay player-safe after projection', () => {
  const archivePayload = {
    completed_dialogue_record: {
      npc: 'Rusk',
      summary: 'Rusk was unstable near the shrine.',
      transcript: [{ speaker: 'Rusk', text: 'It heard you.' }],
      gm_dev_content_ref_json: { source_content_id: 'rusk-at-the-shrine' },
      hiddenClueMetadata: { finalMystery: 'do not reveal' },
    },
    search_result: {
      title: 'Rusk at the Shrine',
      snippet: 'Shrine influence made violence feel close.',
      pathHarness: { expectedPath: 'rusk.combat_transition_path' },
    },
    objective_display: {
      label: 'Resolve the threat',
      progress: 'The shrine confrontation is close.',
      stateWrites: [{ flag: 'combat_pending' }],
    },
  };

  const player = projectDialogueForPlayer(archivePayload);
  const text = JSON.stringify(player);

  assert.equal(player.completed_dialogue_record.summary.includes('unstable'), true);
  assert.equal(player.search_result.snippet.includes('Shrine influence'), true);
  assert.equal(text.includes('gm_dev_content_ref_json'), false);
  assert.equal(text.includes('hiddenClueMetadata'), false);
  assert.equal(text.includes('finalMystery'), false);
  assert.equal(text.includes('pathHarness'), false);
  assert.equal(text.includes('stateWrites'), false);
  assert.doesNotThrow(() => assertNoPlayerHiddenData(player));
});

test('6B.14.3 domain adapters can be applied through shared projection API', () => {
  const explorationPayload = {
    title: 'Grey Road Inn',
    mechanical_details: { action_window_id: 'window-1' },
  };
  const dialoguePayload = {
    title: 'Elin and the Hearth',
    relationship_state_reads: [{ field: 'trust' }],
  };

  const explorationPlayer = projectForVisibilityScope(explorationPayload, {
    visibilityScope: VISIBILITY_SCOPES.PLAYER,
    adapter: explorationVisibilityAdapter,
  });
  const dialoguePlayer = projectForVisibilityScope(dialoguePayload, {
    visibilityScope: VISIBILITY_SCOPES.PLAYER,
    adapter: dialogueVisibilityAdapter,
  });
  const harness = projectForTestHarness(dialoguePayload, {
    extraHiddenKeys: ['relationship_state_reads'],
  });

  assert.equal(explorationPlayer.title, 'Grey Road Inn');
  assert.equal(JSON.stringify(explorationPlayer).includes('mechanical_details'), false);
  assert.equal(dialoguePlayer.title, 'Elin and the Hearth');
  assert.equal(JSON.stringify(dialoguePlayer).includes('relationship_state_reads'), false);
  assert.equal(harness.player_hidden_data_violations[0].path, '$.relationship_state_reads');
});

test('6B.14.3 stripInternalFields is a conservative player projection alias', () => {
  const stripped = stripInternalFields({
    player_text: 'Safe route label',
    internalCause: { stack: 'secret' },
    debug: { rawRoll: 4 },
  });

  assert.deepEqual(stripped, { player_text: 'Safe route label' });
});
