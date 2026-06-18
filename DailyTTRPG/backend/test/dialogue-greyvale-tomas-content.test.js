import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import {
  greyvaleDialogueFocusCommitScenes,
  greyvaleElinMemoryDialogueScene,
  greyvaleElinMemoryExpectedPaths,
  greyvaleTomasRoadsideWorriesDialogueScene,
  greyvaleTomasRoadsideWorriesExpectedPaths,
} from './fixtures/greyvale-dialogue-fixtures.js';

const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

function ids(items, key) {
  return new Set(items.map((item) => item[key]).filter(Boolean));
}

test('Stage 6B.12.2 Greyvale Tomas and Elin Focus/Commit fixtures validate without hard errors', () => {
  assert.ok(greyvaleDialogueFocusCommitScenes.length >= 2);
  const sceneIds = ids(greyvaleDialogueFocusCommitScenes, 'id');
  assert.equal(sceneIds.size, greyvaleDialogueFocusCommitScenes.length);
  assert.ok(sceneIds.has('greyvale_elin_memory_dialogue'));
  assert.ok(sceneIds.has('greyvale_tomas_roadside_worries_dialogue'));

  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.equal(validation.ok, true, `${scene.id} should validate`);
    assert.deepEqual(validation.hard_errors, [], `${scene.id} should have no hard errors`);
  }
});

test('Stage 6B.12.2 Tomas fixture preserves canonical Greyvale IDs and player-safe hooks', () => {
  const scene = greyvaleTomasRoadsideWorriesDialogueScene;
  assert.equal(scene.id, 'greyvale_tomas_roadside_worries_dialogue');
  assert.equal(scene.interaction_domain, 'dialogue_focus_commit');
  assert.equal(scene.participants[0].npc_key, 'tomas-rell');
  assert.equal(scene.entry_behavior.entry_source, 'grey-road-inn');

  const questionIds = ids(scene.clarifying_questions, 'question_id');
  assert.ok(questionIds.has('clarify_bandit_pattern'));
  assert.ok(questionIds.has('clarify_survivor_by_hearth'));
  assert.ok(questionIds.has('clarify_read_what_tomas_avoids'));

  const moveIds = ids(scene.committed_social_moves, 'move_id');
  assert.ok(moveIds.has('move_reassure_tomas'));
  assert.ok(moveIds.has('move_compare_caravan_pattern'));
  assert.ok(moveIds.has('move_press_for_survivor'));

  const serialized = JSON.stringify(scene);
  assert.match(serialized, /innkeeper_tracks_road_patterns/);
  assert.match(serialized, /woman_near_hearth_survived_road_attack/);
  assert.match(serialized, /knows_elin_name/);
  assert.match(serialized, /gather-local-insight/);

  const exits = new Map(scene.dialogue_exits.map((exit) => [exit.exit_id, exit]));
  assert.equal(exits.get('exit_return_to_common_room').transition.target_id, 'grey-road-inn');
  assert.equal(exits.get('exit_follow_elin_lead').transition.target_id, 'elin-memory-fragments');

  assert.equal(scene.dialogue_search_index.player_facing, true);
  assert.equal(scene.dialogue_search_index.visibility, 'player');
  assert.equal(scene.completed_dialogue_record.template, true);
});

test('Stage 6B.12.2 expected paths cover Tomas while preserving Elin path metadata', () => {
  assert.equal(greyvaleElinMemoryExpectedPaths.fixture_id, greyvaleElinMemoryDialogueScene.id);
  assert.equal(greyvaleElinMemoryExpectedPaths.paths.length, 7);

  assert.equal(
    greyvaleTomasRoadsideWorriesExpectedPaths.fixture_id,
    greyvaleTomasRoadsideWorriesDialogueScene.id
  );
  const pathNames = ids(greyvaleTomasRoadsideWorriesExpectedPaths.paths, 'name');
  for (const required of [
    'happy_path',
    'refusal_or_failure_path',
    'fallback_path',
    'minimal_exit_path',
    'transition_path',
  ]) {
    assert.ok(pathNames.has(required), `Tomas expected paths should include ${required}`);
  }
});

test('Stage 6B.12.2 leaves legacy Tomas and Elin source dialogue files in place', () => {
  for (const file of [
    'content/dialogue/greyvale/tomas-roadside-worries.json',
    'content/dialogue/greyvale/elin-fragments-of-memory.json',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, `${file} should remain available`);
  }
});
