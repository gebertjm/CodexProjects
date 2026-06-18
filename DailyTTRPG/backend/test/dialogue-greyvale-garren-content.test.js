import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import {
  greyvaleDialogueFocusCommitScenes,
  greyvaleElinMemoryDialogueScene,
  greyvaleGarrenPathKnowledgeDialogueScene,
  greyvaleGarrenPathKnowledgeExpectedPaths,
  greyvaleLysaGriefSuspicionDialogueScene,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleRuskAtShrineDialogueScene,
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

test('Stage 6B.12.4 Greyvale Garren Focus/Commit fixture validates without hard errors', () => {
  assert.equal(greyvaleDialogueFocusCommitScenes.length, 6);
  const sceneIds = ids(greyvaleDialogueFocusCommitScenes, 'id');
  assert.equal(sceneIds.size, greyvaleDialogueFocusCommitScenes.length);
  assert.ok(sceneIds.has(greyvaleElinMemoryDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleTomasRoadsideWorriesDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleMaraDunmerePressureDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleLysaGriefSuspicionDialogueScene.id));
  assert.ok(sceneIds.has('greyvale_garren_path_knowledge_dialogue'));
  assert.ok(sceneIds.has(greyvaleRuskAtShrineDialogueScene.id));

  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.equal(validation.ok, true, `${scene.id} should validate`);
    assert.deepEqual(validation.hard_errors, [], `${scene.id} should have no hard errors`);
  }
});

test('Stage 6B.12.4 Garren preserves old-path and shrine-route knowledge without final mystery leakage', () => {
  const scene = greyvaleGarrenPathKnowledgeDialogueScene;
  assert.equal(scene.id, 'greyvale_garren_path_knowledge_dialogue');
  assert.equal(scene.slug, 'greyvale-garren-path-knowledge-dialogue');
  assert.equal(scene.interaction_domain, 'dialogue_focus_commit');
  assert.equal(scene.participants[0].npc_key, 'garren-holt');
  assert.equal(scene.entry_behavior.entry_source, 'dunmere-village');

  const questionIds = ids(scene.clarifying_questions, 'question_id');
  assert.ok(questionIds.has('clarify_garren_old_path_sighting'));
  assert.ok(questionIds.has('clarify_garren_shrine_change'));
  assert.ok(questionIds.has('clarify_read_garren_warning'));

  const moveIds = ids(scene.committed_social_moves, 'move_id');
  assert.ok(moveIds.has('move_ask_what_garren_saw_without_accusation'));
  assert.ok(moveIds.has('move_press_for_whole_trail'));
  assert.ok(moveIds.has('move_accuse_garren_hiding_something'));
  assert.ok(moveIds.has('move_ask_safest_way_to_approach_shrine'));

  const serialized = JSON.stringify(scene);
  assert.match(serialized, /garren_knows_old_paths/);
  assert.match(serialized, /old_path_still_used/);
  assert.match(serialized, /tracks_converge_on_shrine/);
  assert.match(serialized, /clue_garren_observation/);
  assert.match(serialized, /shrine_path_known/);
  assert.match(serialized, /understanding_medium/);
  assert.match(serialized, /gather-local-insight/);
  assert.match(serialized, /follow-the-leads/);
  assert.match(serialized, /scene_unlock/);
  assert.match(serialized, /shrine-ruins/);
  assert.match(serialized, /old-forest-path/);
  assert.doesNotMatch(serialized.toLowerCase(), /whispering presence|anchor stone|subterranean hollow|final mystery/);

  const knowledgeIds = allKnowledgeIds(scene);
  assert.ok(knowledgeIds.has('garren_knows_old_paths'));
  assert.ok(knowledgeIds.has('old_path_still_used'));
  assert.ok(knowledgeIds.has('tracks_converge_on_shrine'));

  const exits = new Map(scene.dialogue_exits.map((exit) => [exit.exit_id, exit]));
  assert.equal(exits.get('exit_return_to_dunmere_village').transition.target_id, 'dunmere-village');
  assert.equal(exits.get('exit_follow_old_path_lead').transition.target_id, 'old-forest-path');
  assert.equal(exits.get('exit_follow_old_path_lead').metadata_json.canonical_transition, 'follow-the-old-path');
  assert.equal(exits.get('exit_follow_old_path_lead').metadata_json.shrine_handoff, 'follow-the-tracks-to-the-shrine');
  assert.equal(scene.dialogue_search_index.player_facing, true);
  assert.equal(scene.completed_dialogue_record.template, true);
});

test('Stage 6B.12.4 Garren includes authored relationship-gated move metadata with player-safe lock wording', () => {
  const move = greyvaleGarrenPathKnowledgeDialogueScene.committed_social_moves.find(
    (candidate) => candidate.move_id === 'move_press_for_whole_trail'
  );
  assert.ok(move);
  assert.equal(move.requires_check, true);
  assert.equal(move.check.skill, 'persuasion');
  assert.equal(move.check.visibility, 'visible');
  assert.match(move.availability.player_locked_text, /will not give the whole trail/i);
  assert.deepEqual(
    move.availability.relationship_reads.map((read) => `${read.scope}:${read.field}${read.operator}${read.value}`),
    ['persistent_npc_state:respect>=1', 'dialogue_scene_state:openness>=1']
  );
  assert.equal(JSON.stringify(move.availability).includes('guardedness'), false);
});

test('Stage 6B.12.4 expected paths cover Garren while preserving prior Greyvale registry', () => {
  assert.equal(greyvaleGarrenPathKnowledgeExpectedPaths.fixture_id, greyvaleGarrenPathKnowledgeDialogueScene.id);

  const pathNames = ids(greyvaleGarrenPathKnowledgeExpectedPaths.paths, 'name');
  for (const required of [
    'happy_path',
    'refusal_or_failure_path',
    'fallback_path',
    'minimal_exit_path',
    'relationship_state_path',
    'transition_path',
  ]) {
    assert.ok(pathNames.has(required), `Garren expected paths should include ${required}`);
  }

  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleElinMemoryDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleTomasRoadsideWorriesDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleMaraDunmerePressureDialogueScene.id));
  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleLysaGriefSuspicionDialogueScene.id));
});

test('Stage 6B.12.4 leaves legacy Garren and prior source dialogue files in place', () => {
  for (const file of [
    'content/dialogue/greyvale/garren-path-knowledge.json',
    'content/dialogue/greyvale/mara-dunmere-pressure.json',
    'content/dialogue/greyvale/lysa-grief-and-suspicion.json',
    'content/dialogue/greyvale/tomas-roadside-worries.json',
    'content/dialogue/greyvale/elin-fragments-of-memory.json',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, `${file} should remain available`);
  }
});
