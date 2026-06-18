import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import {
  greyvaleDialogueFocusCommitScenes,
  greyvaleElinMemoryDialogueScene,
  greyvaleGarrenPathKnowledgeDialogueScene,
  greyvaleLysaGriefSuspicionDialogueScene,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleRuskAtShrineDialogueScene,
  greyvaleRuskAtShrineExpectedPaths,
  greyvaleTomasRoadsideWorriesDialogueScene,
} from './fixtures/greyvale-dialogue-fixtures.js';

const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

function ids(items, key) {
  return new Set(items.map((item) => item[key]).filter(Boolean));
}

function allKnowledgeIds(scene) {
  const matches = JSON.stringify(scene).match(/"knowledge_id":"?([^",}]+)/g) ?? [];
  return new Set(matches.map((match) => match.replace(/^"knowledge_id":"?/, '').replace(/"$/, '')));
}

test('Stage 6B.12.5 Greyvale Rusk Focus/Commit fixture validates without hard errors', () => {
  assert.equal(greyvaleDialogueFocusCommitScenes.length, 6);
  const sceneIds = ids(greyvaleDialogueFocusCommitScenes, 'id');
  assert.equal(sceneIds.size, greyvaleDialogueFocusCommitScenes.length);
  assert.ok(sceneIds.has(greyvaleElinMemoryDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleTomasRoadsideWorriesDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleMaraDunmerePressureDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleLysaGriefSuspicionDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleGarrenPathKnowledgeDialogueScene.id));
  assert.ok(sceneIds.has('greyvale_rusk_at_the_shrine_dialogue'));

  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.equal(validation.ok, true, `${scene.id} should validate`);
    assert.deepEqual(validation.hard_errors, [], `${scene.id} should have no hard errors`);
  }
});

test('Stage 6B.12.5 Rusk preserves shrine instability, combat pressure, and partial hollow lead', () => {
  const scene = greyvaleRuskAtShrineDialogueScene;
  assert.equal(scene.id, 'greyvale_rusk_at_the_shrine_dialogue');
  assert.equal(scene.slug, 'greyvale-rusk-at-the-shrine-dialogue');
  assert.equal(scene.interaction_domain, 'dialogue_focus_commit');
  assert.equal(scene.participants[0].npc_key, 'rusk-bandit');
  assert.equal(scene.entry_behavior.entry_source, 'shrine-ruins');

  const questionIds = ids(scene.clarifying_questions, 'question_id');
  assert.ok(questionIds.has('clarify_rusk_what_he_hears'));
  assert.ok(questionIds.has('clarify_rusk_it_heard_you'));
  assert.ok(questionIds.has('clarify_read_rusk_control_fracture'));

  const moveIds = ids(scene.committed_social_moves, 'move_id');
  assert.ok(moveIds.has('move_keep_rusk_talking'));
  assert.ok(moveIds.has('move_push_rusk_to_name_source'));
  assert.ok(moveIds.has('move_challenge_rusk_control'));
  assert.ok(moveIds.has('move_end_this_now'));

  const serialized = JSON.stringify(scene);
  assert.match(serialized, /bandits_not_fully_self_directed/);
  assert.match(serialized, /clue_bandit_instability/);
  assert.match(serialized, /shrine_depth_unlocked/);
  assert.match(serialized, /understanding_high/);
  assert.match(serialized, /hollow_reaches_shrine_above/);
  assert.match(serialized, /uncover-the-truth/);
  assert.match(serialized, /resolve-the-threat/);
  assert.match(serialized, /subterranean-hollow/);
  assert.match(serialized, /combat_pending/);
  assert.match(serialized, /shrine_confrontation_ready/);
  assert.match(serialized, /shrine-rusk-confrontation/);
  assert.match(serialized, /descend-beneath-the-shrine/);
  assert.doesNotMatch(serialized.toLowerCase(), /whispering presence|anchor stone|final mystery/);

  const knowledgeIds = allKnowledgeIds(scene);
  assert.ok(knowledgeIds.has('bandits_not_fully_self_directed'));
  assert.ok(knowledgeIds.has('shrine_depth_unlocked'));
  assert.ok(knowledgeIds.has('hollow_reaches_shrine_above'));

  const exits = new Map(scene.dialogue_exits.map((exit) => [exit.exit_id, exit]));
  assert.equal(exits.get('exit_rusk_back_away').transition.target_id, 'shrine-ruins');
  assert.equal(exits.get('exit_rusk_combat_pending').transition.target_id, 'shrine-ruins');
  assert.equal(exits.get('exit_rusk_combat_pending').metadata_json.combat_handoff_status, 'combat_pending');
  assert.equal(exits.get('exit_rusk_combat_pending').metadata_json.encounter_id, 'shrine-rusk-confrontation');
  assert.equal(exits.get('exit_continue_at_shrine_ruins').metadata_json.hollow_transition_status, 'future_supported_until_surface_threat_resolved');
  assert.equal(scene.dialogue_search_index.player_facing, true);
  assert.equal(scene.completed_dialogue_record.template, true);
});

test('Stage 6B.12.5 Rusk deeper-source move is state-gated with player-safe lock wording', () => {
  const move = greyvaleRuskAtShrineDialogueScene.committed_social_moves.find(
    (candidate) => candidate.move_id === 'move_push_rusk_to_name_source'
  );
  assert.ok(move);
  assert.equal(move.requires_check, true);
  assert.equal(move.check.skill, 'insight');
  assert.equal(move.check.visibility, 'visible');
  assert.match(move.availability.player_locked_text, /narrow opening/i);
  assert.deepEqual(
    move.availability.relationship_reads.map((read) => `${read.scope}:${read.field}${read.operator}${read.value}`),
    ['dialogue_scene_state:focus>=1']
  );
  assert.equal(JSON.stringify(move.availability).includes('shrine_depth_unlocked'), false);
});

test('Stage 6B.12.5 Rusk fallback cannot grant major clues or bypass confrontation', () => {
  const fallback = greyvaleRuskAtShrineDialogueScene.generic_fallback;
  assert.equal(fallback.enabled, true);
  assert.equal(fallback.result_scope_constraints.may_grant_major_clue, false);
  assert.equal(fallback.result_scope_constraints.may_transition, false);
  assert.equal(fallback.result_scope_constraints.may_write_relationship_state, false);
  assert.equal(JSON.stringify(fallback).includes('shrine_depth_unlocked'), false);
  assert.equal(JSON.stringify(fallback).includes('hollow_reaches_shrine_above'), false);
  assert.equal(JSON.stringify(fallback).includes('shrine-rusk-confrontation'), false);
});

test('Stage 6B.12.5 expected paths cover Rusk while preserving prior Greyvale registry', () => {
  assert.equal(greyvaleRuskAtShrineExpectedPaths.fixture_id, greyvaleRuskAtShrineDialogueScene.id);

  const pathNames = ids(greyvaleRuskAtShrineExpectedPaths.paths, 'name');
  for (const required of [
    'happy_path',
    'refusal_or_failure_path',
    'fallback_path',
    'minimal_exit_path',
    'instability_state_path',
    'combat_transition_path',
    'deeper_source_transition_path',
  ]) {
    assert.ok(pathNames.has(required), `Rusk expected paths should include ${required}`);
  }

  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleElinMemoryDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleTomasRoadsideWorriesDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleMaraDunmerePressureDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleLysaGriefSuspicionDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleGarrenPathKnowledgeDialogueScene.id));
});

test('Stage 6B.12.5 leaves legacy Rusk and prior source dialogue files in place', () => {
  for (const file of [
    'content/dialogue/greyvale/rusk-at-the-shrine.json',
    'content/dialogue/greyvale/garren-path-knowledge.json',
    'content/dialogue/greyvale/mara-dunmere-pressure.json',
    'content/dialogue/greyvale/lysa-grief-and-suspicion.json',
    'content/dialogue/greyvale/tomas-roadside-worries.json',
    'content/dialogue/greyvale/elin-fragments-of-memory.json',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, `${file} should remain available`);
  }
});
