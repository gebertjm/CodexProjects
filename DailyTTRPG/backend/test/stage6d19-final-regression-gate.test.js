import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  STAGE_6D_FINAL_STATUS,
  STAGE_6D_FINAL_STATUS_VALUES,
  assertStage6DFinalStatusShape,
  canCloseStage6D,
  listStage6DFinalBlockers,
  listStage6DFinalCommandResults,
  listStage6DSubstageStatuses,
} from '../src/engine/combat/stage6dFinalStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

test('6D.19 final status records a verification-blocked gate instead of false completion', () => {
  assert.equal(
    STAGE_6D_FINAL_STATUS.status,
    STAGE_6D_FINAL_STATUS_VALUES.VERIFICATION_BLOCKED
  );
  assert.equal(canCloseStage6D(STAGE_6D_FINAL_STATUS), false);
  assertStage6DFinalStatusShape(STAGE_6D_FINAL_STATUS);
});

test('6D.19 substage matrix covers every Stage 6D.1 through 6D.18 substage', () => {
  const statuses = listStage6DSubstageStatuses();
  assert.equal(statuses.length, 18);

  for (let index = 1; index <= 18; index += 1) {
    const stage = `6D.${index}`;
    const entry = statuses.find((candidate) => candidate.stage === stage);
    assert.ok(entry, `missing ${stage}`);
    assert.ok(entry.title);
    assert.ok(entry.status);
  }
});

test('6D.19 blockers include Flutter, DB/content, hosting build, and security audit gates', () => {
  const blockers = listStage6DFinalBlockers();
  assert.ok(blockers.length >= 4);

  const summaries = blockers.map((blocker) => `${blocker.category} ${blocker.summary}`).join('\n');
  assert.match(summaries, /Flutter/i);
  assert.match(summaries, /DB|content/i);
  assert.match(summaries, /Hosting|build/i);
  assert.match(summaries, /audit|advisories/i);
});

test('6D.19 command inventory keeps passing and blocked gates distinct', () => {
  const commands = listStage6DFinalCommandResults();
  const byCommand = new Map(commands.map((entry) => [entry.command, entry]));

  assert.equal(byCommand.get('npm --prefix backend run test:stage:6d')?.result, 'passed');
  assert.equal(byCommand.get('npm --prefix backend run test:stage:6d:fixtures')?.result, 'passed');
  assert.equal(
    byCommand.get('npm --prefix backend run test:stage:6d:rusk-acceptance')?.result,
    'passed'
  );
  assert.equal(byCommand.get('flutter test')?.result, 'environment blocked');
  assert.equal(byCommand.get('flutter analyze')?.result, 'environment blocked');
  assert.equal(byCommand.get('npm --prefix backend audit --audit-level=high')?.result, 'failed');
});

test('6D.19 machine-readable status and traceability artifacts are valid and aligned', () => {
  const statusArtifact = readJson('docs/combat/stage-6d-final-status.json');
  const traceability = readJson('docs/combat/stage-6d-requirement-traceability.json');

  assert.equal(statusArtifact.status, STAGE_6D_FINAL_STATUS.status);
  assert.equal(statusArtifact.stage, STAGE_6D_FINAL_STATUS.stage);
  assert.equal(statusArtifact.blockers.length, STAGE_6D_FINAL_STATUS.blockers.length);
  assert.ok(Array.isArray(traceability.requirements));
  assert.ok(traceability.requirements.length >= 20);

  const requirementResults = new Set(traceability.requirements.map((entry) => entry.current_result));
  assert.ok(requirementResults.has('verified'));
  assert.ok(requirementResults.has('environment blocked'));
  assert.ok(requirementResults.has('failed'));
});
