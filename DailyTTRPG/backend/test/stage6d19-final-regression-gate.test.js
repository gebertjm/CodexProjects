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

test('6D.19 final status records a complete gate after all required verification passes', () => {
  assert.equal(STAGE_6D_FINAL_STATUS.status, STAGE_6D_FINAL_STATUS_VALUES.COMPLETE);
  assert.equal(canCloseStage6D(STAGE_6D_FINAL_STATUS), true);
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

test('6D.19 blockers are cleared after Flutter, DB/content, hosting build, and security gates pass', () => {
  const blockers = listStage6DFinalBlockers();
  assert.deepEqual(blockers, []);
});

test('6D.19 command inventory records all closeout gates as passed', () => {
  const commands = listStage6DFinalCommandResults();
  const byCommand = new Map(commands.map((entry) => [entry.command, entry]));

  assert.equal(byCommand.get('npm --prefix backend run test:stage:6d')?.result, 'passed');
  assert.equal(byCommand.get('npm --prefix backend run test:stage:6d:fixtures')?.result, 'passed');
  assert.equal(
    byCommand.get('npm --prefix backend run test:stage:6d:rusk-acceptance')?.result,
    'passed'
  );
  assert.equal(byCommand.get('npm --prefix backend run test:stage:6c')?.result, 'passed');
  assert.equal(
    byCommand.get('npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale')?.result,
    'passed'
  );
  assert.equal(byCommand.get('npm --prefix backend run test:greyvale-full-loop')?.result, 'passed');
  assert.equal(byCommand.get('npm --prefix backend test')?.result, 'passed');
  assert.equal(byCommand.get('npm run build')?.result, 'passed');
  assert.equal(byCommand.get('npm run build:player')?.result, 'passed');
  assert.equal(byCommand.get('flutter test')?.result, 'passed');
  assert.equal(byCommand.get('flutter analyze')?.result, 'passed');
  assert.equal(
    byCommand.get('dart format --output=none --set-exit-if-changed apps/player_app/lib apps/player_app/test')?.result,
    'passed'
  );
  assert.equal(byCommand.get('npm --prefix backend audit --audit-level=high')?.result, 'passed');
  assert.ok(commands.every((entry) => entry.result === 'passed'));
});

test('6D.19 machine-readable status and traceability artifacts are valid and aligned', () => {
  const statusArtifact = readJson('docs/combat/stage-6d-final-status.json');
  const traceability = readJson('docs/combat/stage-6d-requirement-traceability.json');

  assert.equal(statusArtifact.status, STAGE_6D_FINAL_STATUS.status);
  assert.equal(statusArtifact.stage, STAGE_6D_FINAL_STATUS.stage);
  assert.equal(statusArtifact.blockers.length, STAGE_6D_FINAL_STATUS.blockers.length);
  assert.equal(statusArtifact.final_readiness.stage_6d_may_close, true);
  assert.equal(statusArtifact.final_readiness.ready_for_stage_6e, true);
  assert.ok(Array.isArray(traceability.requirements));
  assert.ok(traceability.requirements.length >= 20);

  const requirementResults = new Set(traceability.requirements.map((entry) => entry.current_result));
  assert.ok(requirementResults.has('verified'));
  assert.equal(requirementResults.has('environment blocked'), false);
  assert.equal(requirementResults.has('failed'), false);
});
