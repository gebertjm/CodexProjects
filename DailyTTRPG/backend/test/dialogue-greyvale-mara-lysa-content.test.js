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
  greyvaleLysaGriefSuspicionExpectedPaths,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleMaraDunmerePressureExpectedPaths,
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

test('Stage 6B.12.3 Greyvale Mara and Lysa Focus/Commit fixtures validate without hard errors', () => {
  assert.equal(greyvaleDialogueFocusCommitScenes.length, 6);
  const sceneIds = ids(greyvaleDialogueFocusCommitScenes, 'id');
  assert.equal(sceneIds.size, greyvaleDialogueFocusCommitScenes.length);
  assert.ok(sceneIds.has(greyvaleElinMemoryDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleTomasRoadsideWorriesDialogueScene.id));
  assert.ok(sceneIds.has('greyvale_mara_dunmere_pressure_dialogue'));
  assert.ok(sceneIds.has('greyvale_lysa_grief_suspicion_dialogue'));
  assert.ok(sceneIds.has(greyvaleGarrenPathKnowledgeDialogueScene.id));
  assert.ok(sceneIds.has(greyvaleRuskAtShrineDialogueScene.id));

  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.equal(validation.ok, true, `${scene.id} should validate`);
    assert.deepEqual(validation.hard_errors, [], `${scene.id} should have no hard errors`);
  }
});

test('Stage 6B.12.3 Mara preserves useful-but-incomplete assumption without final mystery leakage', () => {
  const scene = greyvaleMaraDunmerePressureDialogueScene;
  assert.equal(scene.id, 'greyvale_mara_dunmere_pressure_dialogue');
  assert.equal(scene.slug, 'greyvale-mara-dunmere-pressure-dialogue');
  assert.equal(scene.interaction_domain, 'dialogue_focus_commit');
  assert.equal(scene.participants[0].npc_key, 'mara-vellin');
  assert.equal(scene.entry_behavior.entry_source, 'dunmere-village');

  const questionIds = ids(scene.clarifying_questions, 'question_id');
  assert.ok(questionIds.has('clarify_mara_bandit_explanation'));
  assert.ok(questionIds.has('clarify_read_mara_certainty'));

  const moveIds = ids(scene.committed_social_moves, 'move_id');
  assert.ok(moveIds.has('move_report_broken_caravan'));
  assert.ok(moveIds.has('move_suggest_deeper_pattern'));
  assert.ok(moveIds.has('move_present_local_insight'));

  const serialized = JSON.stringify(scene);
  assert.match(serialized, /dunmere_wants_simple_answer/);
  assert.match(serialized, /clue_mara_assumption/);
  assert.match(serialized, /gather-local-insight/);
  assert.match(serialized, /follow-the-leads/);
  assert.doesNotMatch(serialized.toLowerCase(), /whispering presence|anchor stone|subterranean hollow/);

  const knowledgeIds = allKnowledgeIds(scene);
  assert.ok(knowledgeIds.has('dunmere_wants_simple_answer'));

  const exits = new Map(scene.dialogue_exits.map((exit) => [exit.exit_id, exit]));
  assert.equal(exits.get('exit_return_to_dunmere_village').transition.target_id, 'dunmere-village');
  assert.equal(exits.get('exit_continue_gathering_local_insight').transition.target_id, 'dunmere-village');
  assert.equal(scene.dialogue_search_index.player_facing, true);
  assert.equal(scene.completed_dialogue_record.template, true);
});

test('Stage 6B.12.3 Lysa preserves partial suspicion without confirming it as truth', () => {
  const scene = greyvaleLysaGriefSuspicionDialogueScene;
  assert.equal(scene.id, 'greyvale_lysa_grief_suspicion_dialogue');
  assert.equal(scene.slug, 'greyvale-lysa-grief-suspicion-dialogue');
  assert.equal(scene.interaction_domain, 'dialogue_focus_commit');
  assert.equal(scene.participants[0].npc_key, 'lysa-fen');
  assert.equal(scene.entry_behavior.entry_source, 'dunmere-village');

  const questionIds = ids(scene.clarifying_questions, 'question_id');
  assert.ok(questionIds.has('clarify_lysa_hidden_truth'));
  assert.ok(questionIds.has('clarify_read_lysa_grief_from_evidence'));

  const moveIds = ids(scene.committed_social_moves, 'move_id');
  assert.ok(moveIds.has('move_take_lysa_fear_seriously'));
  assert.ok(moveIds.has('move_ground_lysa_suspicion'));
  assert.ok(moveIds.has('move_ask_detail_cannot_let_go'));

  const serialized = JSON.stringify(scene);
  assert.match(serialized, /village_blames_hunter_and_road/);
  assert.match(serialized, /clue_lysa_suspicion/);
  assert.match(serialized, /dunmere_wants_simple_answer/);
  assert.match(serialized, /gather-local-insight/);
  assert.match(serialized, /follow-the-leads/);
  assert.match(serialized, /not confirmed truth|rather than proof|not proof/i);
  assert.doesNotMatch(serialized.toLowerCase(), /whispering presence|anchor stone|subterranean hollow/);

  const knowledgeIds = allKnowledgeIds(scene);
  assert.ok(knowledgeIds.has('village_blames_hunter_and_road'));
  assert.ok(knowledgeIds.has('dunmere_wants_simple_answer'));

  const exits = new Map(scene.dialogue_exits.map((exit) => [exit.exit_id, exit]));
  assert.equal(exits.get('exit_return_to_dunmere_village').transition.target_id, 'dunmere-village');
  assert.equal(exits.get('exit_continue_gathering_local_insight').transition.target_id, 'dunmere-village');
  assert.equal(scene.dialogue_search_index.player_facing, true);
  assert.equal(scene.completed_dialogue_record.template, true);
});

test('Stage 6B.12.3 expected paths cover Mara and Lysa while preserving Tomas and Elin registry', () => {
  assert.equal(greyvaleMaraDunmerePressureExpectedPaths.fixture_id, greyvaleMaraDunmerePressureDialogueScene.id);
  assert.equal(greyvaleLysaGriefSuspicionExpectedPaths.fixture_id, greyvaleLysaGriefSuspicionDialogueScene.id);

  for (const [label, expectedPaths] of [
    ['Mara', greyvaleMaraDunmerePressureExpectedPaths],
    ['Lysa', greyvaleLysaGriefSuspicionExpectedPaths],
  ]) {
    const pathNames = ids(expectedPaths.paths, 'name');
    for (const required of [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'relationship_state_path',
    ]) {
      assert.ok(pathNames.has(required), `${label} expected paths should include ${required}`);
    }
  }

  assert.ok(greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleElinMemoryDialogueScene.id));
  assert.ok(
    greyvaleDialogueFocusCommitScenes.some((scene) => scene.id === greyvaleTomasRoadsideWorriesDialogueScene.id)
  );
});

test('Stage 6B.12.3 leaves legacy Mara and Lysa source dialogue files in place', () => {
  for (const file of [
    'content/dialogue/greyvale/mara-dunmere-pressure.json',
    'content/dialogue/greyvale/lysa-grief-and-suspicion.json',
    'content/dialogue/greyvale/tomas-roadside-worries.json',
    'content/dialogue/greyvale/elin-fragments-of-memory.json',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, `${file} should remain available`);
  }
});
