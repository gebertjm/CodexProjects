import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import {
  cloneFixture,
  dialogueSceneFixture,
  validMinimalDialogueScene,
} from './fixtures/dialogue-focus-commit-fixtures.js';

function codes(result, severity = 'hard_errors') {
  return new Set(result[severity].map((issue) => issue.code));
}

function hasCode(result, code, severity = 'hard_errors') {
  return codes(result, severity).has(code);
}

test('Build 2 valid minimal Dialogue Focus/Commit scene passes validation', () => {
  const result = validateDialogueFocusCommitScene(validMinimalDialogueScene);

  assert.equal(result.ok, true);
  assert.deepEqual(result.hard_errors, []);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.debug_notices));
});

test('Build 2 validation returns hard_errors, warnings, and debug_notices structure', () => {
  const scene = dialogueSceneFixture({
    clarifying_questions: [],
    committed_social_moves: [],
    dialogue_exits: [],
  });

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.hard_errors));
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.debug_notices));
  assert.equal(hasCode(result, 'no_clarifying_questions', 'warnings'), true);
  assert.equal(hasCode(result, 'no_committed_social_moves', 'warnings'), true);
  assert.equal(hasCode(result, 'no_dialogue_exits', 'warnings'), true);
});

test('Build 2 missing required scene and surface IDs fail validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  delete scene.id;
  delete scene.slug;
  delete scene.conversation_surface.surface_id;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_required_id'), true);
  assert.ok(result.hard_errors.some((issue) => issue.path === 'dialogue_scene.id'));
  assert.ok(result.hard_errors.some((issue) => issue.path === 'conversation_surface.surface_id'));
});

test('Build 2 duplicate IDs within a dialogue scene fail validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.clarifying_questions.push({
    ...cloneFixture(scene.clarifying_questions[0]),
    label: 'Duplicate question',
  });

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'duplicate_id'), true);
});

test('Build 2 checked Clarifying Question requires check data', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.clarifying_questions[1].check = {
    mode: 'standard',
    skill: 'insight',
    visibility: 'visible',
  };

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_check_dc'), true);
});

test('Build 2 checked Committed Social Move requires ability, skill, DC, visibility, and branches', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.committed_social_moves[0].check = {
    mode: 'standard',
    visibility: 'visible',
  };
  delete scene.committed_social_moves[0].on_success;
  delete scene.committed_social_moves[0].on_failure;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_check_ability'), true);
  assert.equal(hasCode(result, 'missing_check_skill'), true);
  assert.equal(hasCode(result, 'missing_check_dc'), true);
  assert.equal(hasCode(result, 'missing_result_branch'), true);
});

test('Build 2 no-check Committed Social Move requires authored result behavior', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  delete scene.committed_social_moves[1].no_check_result;
  delete scene.committed_social_moves[1].result;
  delete scene.committed_social_moves[1].variants;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_authored_result'), true);
});

test('Build 2 Committed Social Move requires explicit requires_check declaration', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  delete scene.committed_social_moves[0].requires_check;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_requires_check'), true);
});

test('Build 2 state writes require explicit scope and registered field', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.committed_social_moves[0].on_success.relationship_writes[0] = {
    field: 'trust',
    operation: 'increment',
    value: 1,
    visibility: 'gm_and_player_perceived',
    reason: 'Missing explicit scope.',
  };

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_required_value'), true);
});

test('Build 2 unregistered relationship field fails validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.committed_social_moves[0].on_success.relationship_writes[0].field = 'unregistered_trust';

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'unregistered_relationship_field'), true);
});

test('Build 2 invalid ladder value fails validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.committed_social_moves[1].no_check_result.relationship_writes[0].value = 99;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'invalid_ladder_value'), true);
});

test('Build 2 ambiguous shorthand relationship read fails validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.relationship_state_definitions.push({
    field: 'trust',
    scope: 'dialogue_scene_state',
    type: 'ladder',
    values: ['closed', 'open'],
    default: 'closed',
    labels: {
      closed: 'closed',
      open: 'open',
    },
    override: true,
    override_behavior: 'compatible_extension',
    override_mapping: {
      closed: 0,
      open: 1,
    },
  });
  scene.committed_social_moves[0].requires_state = 'trust >= 1';

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'ambiguous_shorthand_read'), true);
});

test('Build 5 unambiguous shorthand relationship read is allowed', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.committed_social_moves[0].requires_state = 'trust >= 1';

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, true);
});

test('Build 5 relationship write scopes and collisions are validated', () => {
  const badScope = cloneFixture(validMinimalDialogueScene);
  badScope.relationship_state_definitions[0].allowed_write_scopes = ['persistent_npc_state'];
  badScope.committed_social_moves[0].on_success.relationship_writes[0].scope = 'dialogue_scene_state';

  const badScopeResult = validateDialogueFocusCommitScene(badScope);
  assert.equal(badScopeResult.ok, false);
  assert.equal(hasCode(badScopeResult, 'relationship_scope_mismatch'), true);

  const collision = cloneFixture(validMinimalDialogueScene);
  collision.relationship_state_definitions.push({
    field: 'trust',
    scope: 'dialogue_scene_state',
    type: 'number',
    default: 0,
  });

  const collisionResult = validateDialogueFocusCommitScene(collision);
  assert.equal(collisionResult.ok, false);
  assert.equal(hasCode(collisionResult, 'relationship_field_collision'), true);
});

test('Build 5 relationship ladder override requires explicit value mapping', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.relationship_state_definitions.push({
    field: 'trust',
    scope: 'dialogue_scene_state',
    type: 'ladder',
    values: ['closed', 'open'],
    default: 'closed',
    override: true,
    override_behavior: 'replacement',
    override_reason: 'Scene posture uses words instead of numeric trust.',
  });

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_override_mapping'), true);
});

test('Build 2 unsafe generic fallback fails validation', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.generic_fallback = {
    enabled: true,
    usage_limit: 1,
    allowed_social_move_types: ['ask'],
    result_scope_constraints: { may_grant_major_clue: true },
    success_behavior: { text: 'She confesses the hidden secret.' },
    failure_behavior: { text: 'Nothing changes.' },
    knowledge_grants: ['major_hidden_secret'],
  };

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'unsafe_generic_fallback'), true);
});

test('Build 2 lifecycle links are checked', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.correction_chains[0].annotation_id = 'missing_annotation';

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'broken_lifecycle_link'), true);
});

test('Build 2 player-facing records cannot reference hidden-only sources', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.completed_dialogue_record.player_facing_sources[0].visibility = 'hidden_only';
  scene.completed_dialogue_record.summary_sources = [{ source_id: 'audit', visibility: 'debug' }];
  scene.summary_behavior.sources = [{ source_id: 'hidden_route', visibility: 'hidden_only' }];
  scene.npc_profile_recap = {
    player_facing: true,
    include_raw_relationship_state: true,
  };
  scene.dialogue_search_index = {
    visibility: 'debug',
  };
  scene.transcript_turns[0].visibility = 'hidden_only';
  scene.transcript_turns[0].player_facing = true;

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'player_facing_hidden_source'), true);
});

test('Build 9 lifecycle validation blocks unsafe player-facing and broken review states', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.annotation_chains.push({
    annotation_id: 'ann_pending_visible',
    target_type: 'completed_dialogue_record',
    target_id: 'completed_elin_memory_template',
    review_status: 'pending_review',
    lifecycle_status: 'draft',
    player_facing: true,
    source_visibility: 'player_visible',
    original_text: 'Debug route and preview confidence should not be exposed.',
  });
  scene.correction_chains.push({
    correction_id: 'corr_suppressed_missing_scope',
    annotation_id: 'ann_surface_safety',
    target_type: 'completed_dialogue_record',
    target_id: 'completed_elin_memory_template',
    review_status: 'suppressed',
    lifecycle_status: 'inactive',
    source_visibility: 'player_visible',
  });
  scene.correction_chains.push({
    correction_id: 'corr_retracted_missing_reason',
    annotation_id: 'ann_surface_safety',
    target_type: 'completed_dialogue_record',
    target_id: 'completed_elin_memory_template',
    review_status: 'approved',
    lifecycle_status: 'retracted',
    source_visibility: 'player_visible',
  });

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'player_facing_pending_lifecycle'), true);
  assert.equal(hasCode(result, 'player_facing_internal_terms'), true);
  assert.equal(hasCode(result, 'missing_suppression_scope'), true);
  assert.equal(hasCode(result, 'missing_retraction_reason'), true);
});

test('Build 2 dialogue exit requires explicit behavior and transition target when needed', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.dialogue_exits[0] = {
    exit_id: 'exit_missing_target',
    label: 'Leave',
    exit_type: 'transition',
  };

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_exit_behavior'), true);
  assert.equal(hasCode(result, 'missing_exit_target'), true);
});

test('Build 2 missing override mapping fails when an override references unknown content', () => {
  const scene = cloneFixture(validMinimalDialogueScene);
  scene.override_mappings = [{ target_id: 'missing_move' }];

  const result = validateDialogueFocusCommitScene(scene);

  assert.equal(result.ok, false);
  assert.equal(hasCode(result, 'missing_override_mapping'), true);
});
