import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../content/dialogue_focus_commit/greyvale'
);

function readJsonFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, fileName), 'utf8'));
}

export function cloneGreyvaleFixture(value) {
  return JSON.parse(JSON.stringify(value));
}

export const greyvaleElinMemoryDialogueScene = Object.freeze(
  readJsonFixture('elin-memory-focus-commit.scene.json')
);

export const greyvaleElinMemoryExpectedPaths = Object.freeze(
  readJsonFixture('elin-memory-focus-commit.expected-paths.json')
);

export const greyvaleTomasRoadsideWorriesDialogueScene = Object.freeze(
  readJsonFixture('tomas-roadside-worries-focus-commit.scene.json')
);

export const greyvaleTomasRoadsideWorriesExpectedPaths = Object.freeze(
  readJsonFixture('tomas-roadside-worries-focus-commit.expected-paths.json')
);

export const greyvaleMaraDunmerePressureDialogueScene = Object.freeze(
  readJsonFixture('mara-dunmere-pressure-focus-commit.scene.json')
);

export const greyvaleMaraDunmerePressureExpectedPaths = Object.freeze(
  readJsonFixture('mara-dunmere-pressure-focus-commit.expected-paths.json')
);

export const greyvaleLysaGriefSuspicionDialogueScene = Object.freeze(
  readJsonFixture('lysa-grief-and-suspicion-focus-commit.scene.json')
);

export const greyvaleLysaGriefSuspicionExpectedPaths = Object.freeze(
  readJsonFixture('lysa-grief-and-suspicion-focus-commit.expected-paths.json')
);

export const greyvaleGarrenPathKnowledgeDialogueScene = Object.freeze(
  readJsonFixture('garren-path-knowledge-focus-commit.scene.json')
);

export const greyvaleGarrenPathKnowledgeExpectedPaths = Object.freeze(
  readJsonFixture('garren-path-knowledge-focus-commit.expected-paths.json')
);

export const greyvaleRuskAtShrineDialogueScene = Object.freeze(
  readJsonFixture('rusk-at-the-shrine-focus-commit.scene.json')
);

export const greyvaleRuskAtShrineExpectedPaths = Object.freeze(
  readJsonFixture('rusk-at-the-shrine-focus-commit.expected-paths.json')
);

export const greyvaleDialogueFocusCommitScenes = Object.freeze([
  greyvaleElinMemoryDialogueScene,
  greyvaleTomasRoadsideWorriesDialogueScene,
  greyvaleMaraDunmerePressureDialogueScene,
  greyvaleLysaGriefSuspicionDialogueScene,
  greyvaleGarrenPathKnowledgeDialogueScene,
  greyvaleRuskAtShrineDialogueScene,
]);

export function greyvaleElinMemorySceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleElinMemoryDialogueScene),
    ...overrides,
  };
}

export function greyvaleTomasRoadsideWorriesSceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleTomasRoadsideWorriesDialogueScene),
    ...overrides,
  };
}

export function greyvaleMaraDunmerePressureSceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleMaraDunmerePressureDialogueScene),
    ...overrides,
  };
}

export function greyvaleLysaGriefSuspicionSceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleLysaGriefSuspicionDialogueScene),
    ...overrides,
  };
}

export function greyvaleGarrenPathKnowledgeSceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleGarrenPathKnowledgeDialogueScene),
    ...overrides,
  };
}

export function greyvaleRuskAtShrineSceneFixture(overrides = {}) {
  return {
    ...cloneGreyvaleFixture(greyvaleRuskAtShrineDialogueScene),
    ...overrides,
  };
}
