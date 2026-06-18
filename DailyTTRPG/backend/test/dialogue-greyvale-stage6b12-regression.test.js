import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateDialogueFocusCommitScene } from '../src/content/dialogueFocusCommitValidation.js';
import {
  clearDialogueFocusCommitSceneRegistryForTests,
  getRegisteredDialogueFocusCommitSceneForDebug,
  listRegisteredDialogueFocusCommitSceneKeysForTests,
  registerDialogueFocusCommitSceneForTests,
} from '../src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js';
import {
  greyvaleDialogueFocusCommitScenes,
  greyvaleElinMemoryDialogueScene,
  greyvaleElinMemoryExpectedPaths,
  greyvaleGarrenPathKnowledgeDialogueScene,
  greyvaleGarrenPathKnowledgeExpectedPaths,
  greyvaleLysaGriefSuspicionDialogueScene,
  greyvaleLysaGriefSuspicionExpectedPaths,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleMaraDunmerePressureExpectedPaths,
  greyvaleRuskAtShrineDialogueScene,
  greyvaleRuskAtShrineExpectedPaths,
  greyvaleTomasRoadsideWorriesDialogueScene,
  greyvaleTomasRoadsideWorriesExpectedPaths,
} from './fixtures/greyvale-dialogue-fixtures.js';

const repoRoot = process.cwd().endsWith(`${path.sep}backend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const pathFixtures = [
  greyvaleElinMemoryExpectedPaths,
  greyvaleTomasRoadsideWorriesExpectedPaths,
  greyvaleMaraDunmerePressureExpectedPaths,
  greyvaleLysaGriefSuspicionExpectedPaths,
  greyvaleGarrenPathKnowledgeExpectedPaths,
  greyvaleRuskAtShrineExpectedPaths,
];

const registryInventory = [
  {
    npc: 'Elin Harrow',
    scene: greyvaleElinMemoryDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json',
    expectedPathFile: 'content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'failure_path',
      'fallback_path',
      'minimal_interaction_path',
      'max_clarifying_question_path',
      'relationship_state_edge_case',
      'exit_transition_path',
    ],
    continuityNeedles: [
      'elin_sash_has_roadward_knot',
      'wheel_split_before_quiet',
      'shrine_bell_stopped_attack',
      'hollow_path_behind_inn',
    ],
  },
  {
    npc: 'Tomas Rell',
    scene: greyvaleTomasRoadsideWorriesDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json',
    expectedPathFile:
      'content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'transition_path',
    ],
    continuityNeedles: [
      'innkeeper_tracks_road_patterns',
      'woman_near_hearth_survived_road_attack',
      'knows_elin_name',
      'gather-local-insight',
    ],
  },
  {
    npc: 'Mara Vellin',
    scene: greyvaleMaraDunmerePressureDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json',
    expectedPathFile:
      'content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'relationship_state_path',
    ],
    continuityNeedles: [
      'dunmere_wants_simple_answer',
      'clue_mara_assumption',
      'gather-local-insight',
      'follow-the-leads',
    ],
  },
  {
    npc: 'Lysa Fen',
    scene: greyvaleLysaGriefSuspicionDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json',
    expectedPathFile:
      'content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'relationship_state_path',
    ],
    continuityNeedles: [
      'village_blames_hunter_and_road',
      'clue_lysa_suspicion',
      'gather-local-insight',
      'follow-the-leads',
    ],
  },
  {
    npc: 'Garren Holt',
    scene: greyvaleGarrenPathKnowledgeDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json',
    expectedPathFile:
      'content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'relationship_state_path',
      'transition_path',
    ],
    continuityNeedles: [
      'tracks_converge_on_shrine',
      'shrine_path_known',
      'old-forest-path',
      'shrine-ruins',
    ],
  },
  {
    npc: 'Rusk',
    scene: greyvaleRuskAtShrineDialogueScene,
    sceneFile: 'content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.scene.json',
    expectedPathFile:
      'content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json',
    requiredPaths: [
      'happy_path',
      'refusal_or_failure_path',
      'fallback_path',
      'minimal_exit_path',
      'instability_state_path',
      'combat_transition_path',
      'deeper_source_transition_path',
    ],
    continuityNeedles: [
      'bandits_not_fully_self_directed',
      'shrine_depth_unlocked',
      'hollow_reaches_shrine_above',
      'combat_pending',
      'shrine-rusk-confrontation',
    ],
  },
];

const legacyDialogueFiles = [
  'content/dialogue/greyvale/elin-fragments-of-memory.json',
  'content/dialogue/greyvale/tomas-roadside-worries.json',
  'content/dialogue/greyvale/mara-dunmere-pressure.json',
  'content/dialogue/greyvale/lysa-grief-and-suspicion.json',
  'content/dialogue/greyvale/garren-path-knowledge.json',
  'content/dialogue/greyvale/rusk-at-the-shrine.json',
];

const allowedLocalExplorationTargets = new Set([
  'grey_road_inn_common_room',
  'grey_road_inn_hollow_path',
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function ids(items, keys) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  return new Set(
    items
      .map((item) => keyList.map((key) => item?.[key]).find(Boolean))
      .filter(Boolean)
  );
}

function assertUnique(values, message) {
  const filtered = values.filter(Boolean);
  assert.equal(new Set(filtered).size, filtered.length, message);
}

function walk(value, visit, ancestry = []) {
  if (!value || typeof value !== 'object') {
    return;
  }
  visit(value, ancestry);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...ancestry, index]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walk(child, visit, [...ancestry, key]);
  }
}

function collectObjects(scene, predicate) {
  const matches = [];
  walk(scene, (object, ancestry) => {
    if (!Array.isArray(object) && predicate(object, ancestry)) {
      matches.push({ object, ancestry });
    }
  });
  return matches;
}

function collectStrings(value, ancestry = []) {
  if (typeof value === 'string') {
    return [{ value, ancestry }];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, [...ancestry, index]));
  }
  return Object.entries(value).flatMap(([key, child]) => collectStrings(child, [...ancestry, key]));
}

function pathFixtureFor(scene) {
  return pathFixtures.find((fixture) => fixture.fixture_id === scene.id);
}

function sourceIdsFor(scene) {
  return new Set([
    scene.conversation_surface?.surface_id,
    ...(scene.passive_social_insight ?? []).map((insight) => insight.insight_id),
    ...(scene.clarifying_questions ?? []).map((question) => question.question_id),
    ...(scene.committed_social_moves ?? []).map((move) => move.move_id),
    ...(scene.dialogue_exits ?? []).map((exit) => exit.exit_id),
    'summary_behavior',
  ].filter(Boolean));
}

function normalizeNpcTarget(targetId) {
  if (!targetId?.startsWith?.('npc:')) {
    return null;
  }
  return targetId.slice('npc:'.length).replaceAll('_', '-');
}

function playerFacingArchivePayload(scene) {
  return {
    title: scene.title,
    conversation_surface: scene.conversation_surface,
    summary_behavior: {
      mode: scene.summary_behavior?.mode,
      player_summary_template: scene.summary_behavior?.player_summary_template,
      sources: scene.summary_behavior?.sources,
    },
    completed_dialogue_record: scene.completed_dialogue_record,
    dialogue_search_index: scene.dialogue_search_index,
    generic_fallback: {
      text: scene.generic_fallback?.success_behavior?.text,
      summary: scene.generic_fallback?.success_behavior?.summary,
      failure_text: scene.generic_fallback?.failure_behavior?.text,
      failure_summary: scene.generic_fallback?.failure_behavior?.summary,
    },
  };
}

test('Stage 6B.12.6 inventory covers every converted Greyvale dialogue scene and fixture file', () => {
  assert.equal(greyvaleDialogueFocusCommitScenes.length, 6);
  assert.equal(registryInventory.length, 6);

  assertUnique(greyvaleDialogueFocusCommitScenes.map((scene) => scene.id), 'scene ids must be unique');
  assertUnique(
    greyvaleDialogueFocusCommitScenes.map((scene) => scene.slug),
    'scene slugs must be unique'
  );

  for (const item of registryInventory) {
    assert.equal(fs.existsSync(path.join(repoRoot, item.sceneFile)), true, `${item.sceneFile} exists`);
    assert.equal(
      fs.existsSync(path.join(repoRoot, item.expectedPathFile)),
      true,
      `${item.expectedPathFile} exists`
    );
    assert.equal(item.scene.interaction_domain, 'dialogue_focus_commit');
    assert.equal(item.scene.scene_type, 'dialogue');
    assert.equal(item.scene.participants?.length >= 1, true, `${item.npc} has a participant`);
    assert.equal(pathFixtureFor(item.scene)?.fixture_id, item.scene.id);
  }
});

test('Stage 6B.12.6 schema validation stays clean for the completed Greyvale set', () => {
  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const validation = validateDialogueFocusCommitScene(scene, { profile: 'playtest_ready' });
    assert.equal(validation.ok, true, `${scene.id} validates`);
    assert.deepEqual(validation.hard_errors, [], `${scene.id} has no hard errors`);
  }
});

test('Stage 6B.12.6 registry aliases resolve every converted scene by id and slug', () => {
  clearDialogueFocusCommitSceneRegistryForTests();
  for (const scene of greyvaleDialogueFocusCommitScenes) {
    registerDialogueFocusCommitSceneForTests(scene);
  }

  const registeredKeys = listRegisteredDialogueFocusCommitSceneKeysForTests();
  for (const scene of greyvaleDialogueFocusCommitScenes) {
    assert.ok(registeredKeys.includes(scene.id), `${scene.id} id alias is registered`);
    assert.ok(registeredKeys.includes(scene.slug), `${scene.slug} slug alias is registered`);
    assert.equal(getRegisteredDialogueFocusCommitSceneForDebug({ dialogue_scene_id: scene.id }).id, scene.id);
    assert.equal(getRegisteredDialogueFocusCommitSceneForDebug({ slug: scene.slug }).id, scene.id);
  }
});

test('Stage 6B.12.6 expected path coverage includes each required NPC path', () => {
  for (const item of registryInventory) {
    const fixture = pathFixtureFor(item.scene);
    assert.ok(fixture, `${item.npc} expected path fixture exists`);
    assert.equal(fixture.fixture_id, item.scene.id);
    assertUnique(fixture.paths.map((expectedPath) => expectedPath.name), `${item.npc} path names unique`);

    const pathNames = ids(fixture.paths, 'name');
    for (const requiredPath of item.requiredPaths) {
      assert.ok(pathNames.has(requiredPath), `${item.npc} includes ${requiredPath}`);
    }

    for (const expectedPath of fixture.paths) {
      if (Array.isArray(expectedPath.steps)) {
        assert.equal(expectedPath.steps[0]?.type, 'enter_dialogue', `${item.npc} ${expectedPath.name} enters`);
      }
      assert.ok(
        ['active', 'exited', 'completed'].includes(expectedPath.expected_final_status),
        `${item.npc} ${expectedPath.name} has a known final status`
      );
    }
  }
});

test('Stage 6B.12.6 references resolve to canonical Greyvale NPCs, scenes, objectives, and rewards', () => {
  const npcSlugs = ids(readJson('content/entities/greyvale/npcs/greyvale-npcs.json'), 'slug');
  const sceneSlugs = ids(readJson('content/scenes/greyvale/scenes.json'), 'slug');
  const transitionSlugs = ids(readJson('content/scenes/greyvale/transitions/greyvale-transitions.json'), 'slug');
  const objectiveSlugs = ids(
    readJson('content/campaigns/shadows_grey_road/quests/shadows-grey-road.json').objectives,
    'slug'
  );
  const canonicalKnowledgeIds = ids(
    readJson('content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json'),
    'knowledge_id'
  );

  for (const item of registryInventory) {
    const scene = item.scene;
    const participant = scene.participants[0];
    assert.ok(npcSlugs.has(participant.npc_key), `${item.npc} participant npc_key resolves`);
    assert.ok(sceneSlugs.has(scene.entry_behavior.entry_source) || scene.entry_behavior.entry_source.includes('_'));

    for (const { object } of collectObjects(scene, (object) => object.target_id?.startsWith?.('npc:'))) {
      assert.ok(npcSlugs.has(normalizeNpcTarget(object.target_id)), `${scene.id} npc target resolves`);
    }

    for (const { object } of collectObjects(scene, (object) => object.knowledge_id)) {
      assert.ok(
        canonicalKnowledgeIds.has(object.knowledge_id) ||
          (typeof object.title === 'string' && typeof object.summary === 'string'),
        `${scene.id} knowledge ${object.knowledge_id} resolves or carries fixture grant text`
      );
    }

    for (const { object } of collectObjects(scene, (object) => object.objective_key || object.objective_id)) {
      const objectiveKey = object.objective_key ?? object.objective_id;
      assert.equal(object.quest_key, 'shadows_grey_road', `${scene.id} objective uses Greyvale quest`);
      assert.ok(objectiveSlugs.has(objectiveKey), `${scene.id} objective ${objectiveKey} resolves`);
    }

    for (const { object } of collectObjects(scene, (object) => object.reward_type === 'scene_unlock')) {
      assert.ok(sceneSlugs.has(object.scene_slug), `${scene.id} reward scene ${object.scene_slug} resolves`);
    }

    for (const exit of scene.dialogue_exits ?? []) {
      const transition = exit.transition ?? {};
      if (transition.target_type === 'exploration') {
        assert.ok(
          sceneSlugs.has(transition.target_id) || allowedLocalExplorationTargets.has(transition.target_id),
          `${scene.id} exit ${exit.exit_id} target resolves`
        );
      }
      const handoff = exit.metadata_json?.handoff_transition ?? exit.metadata_json?.requires_existing_transition;
      if (handoff) {
        assert.ok(transitionSlugs.has(handoff), `${scene.id} exit ${exit.exit_id} transition ${handoff} resolves`);
      }
    }
  }
});

test('Stage 6B.12.6 relationship state writes and source hooks stay internally consistent', () => {
  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const definitions = scene.relationship_state_definitions ?? [];
    const persistentFields = new Set(
      definitions
        .filter((field) => field.scope === 'persistent_npc_state')
        .map((field) => field.field)
    );
    const sceneFields = new Set(
      definitions
        .filter((field) => field.scope === 'dialogue_scene_state')
        .map((field) => field.field)
    );
    const sourceIds = sourceIdsFor(scene);

    for (const { object } of collectObjects(scene, (object) => object.field && object.operation)) {
      if (object.scope === 'persistent_npc_state') {
        assert.ok(persistentFields.has(object.field), `${scene.id} persistent write ${object.field} is defined`);
      }
      if (object.scope === 'dialogue_scene_state') {
        assert.ok(sceneFields.has(object.field), `${scene.id} scene write ${object.field} is defined`);
      }
      if (object.visibility === 'player_perceived') {
        assert.equal(typeof object.summary, 'string', `${scene.id} player-perceived write has summary`);
        assert.notEqual(object.summary.trim(), '', `${scene.id} player-perceived write summary is not empty`);
      }
    }

    for (const source of scene.summary_behavior?.sources ?? []) {
      assert.ok(sourceIds.has(source.source_id), `${scene.id} summary source ${source.source_id} exists`);
    }
    for (const source of scene.completed_dialogue_record?.player_facing_sources ?? []) {
      assert.ok(sourceIds.has(source.source_id), `${scene.id} completed source ${source.source_id} exists`);
    }
  }
});

test('Stage 6B.12.6 player-facing archive/search hooks avoid debug and hidden mechanics terms', () => {
  const forbiddenTerms = [
    'hidden_dc',
    'raw_roll',
    'total_result',
    'modifier_breakdown',
    'result_band',
    'selected_result_band',
    'gm_debug_summary',
    'gm_notes',
    'debug_mapping',
    'preview_confidence',
    'instrumentation_status',
    'debug_notices',
    'path_harness',
    'expected_path',
  ];

  for (const scene of greyvaleDialogueFocusCommitScenes) {
    const payload = playerFacingArchivePayload(scene);
    const text = JSON.stringify(payload).toLowerCase();
    for (const term of forbiddenTerms) {
      assert.equal(text.includes(term), false, `${scene.id} player archive/search excludes ${term}`);
    }
    assert.equal(scene.dialogue_search_index?.player_facing, true, `${scene.id} search index is player-facing`);
    assert.equal(scene.dialogue_search_index?.visibility, 'player', `${scene.id} search index is player-visible`);
  }
});

test('Stage 6B.12.6 continuity keeps Greyvale clues coherent without final-mystery leakage', () => {
  for (const item of registryInventory) {
    const serialized = JSON.stringify(item.scene);
    for (const needle of item.continuityNeedles) {
      assert.match(serialized, new RegExp(needle.replaceAll('-', '[-_]')), `${item.npc} preserves ${needle}`);
    }
  }

  for (const scene of [
    greyvaleTomasRoadsideWorriesDialogueScene,
    greyvaleMaraDunmerePressureDialogueScene,
    greyvaleLysaGriefSuspicionDialogueScene,
    greyvaleGarrenPathKnowledgeDialogueScene,
    greyvaleRuskAtShrineDialogueScene,
  ]) {
    const playerText = collectStrings(playerFacingArchivePayload(scene))
      .map((entry) => entry.value)
      .join(' ')
      .toLowerCase();
    assert.equal(playerText.includes('whispering presence'), false, `${scene.id} avoids final entity reveal`);
    assert.equal(playerText.includes('anchor stone'), false, `${scene.id} avoids unsupported final mechanism`);
  }
});

test('Stage 6B.12.6 legacy dialogue files remain retained and non-conflicting', () => {
  const newIdsAndSlugs = new Set(
    greyvaleDialogueFocusCommitScenes.flatMap((scene) => [scene.id, scene.slug]).filter(Boolean)
  );

  for (const file of legacyDialogueFiles) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, `${file} remains available`);
    const legacy = readJson(file);
    for (const key of [legacy.id, legacy.slug, legacy.dialogue_scene_id].filter(Boolean)) {
      assert.equal(newIdsAndSlugs.has(key), false, `${file} does not conflict with new scene key ${key}`);
    }
  }
});
