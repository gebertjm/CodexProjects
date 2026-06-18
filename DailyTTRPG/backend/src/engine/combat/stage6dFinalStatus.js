export const STAGE_6D_FINAL_STATUS_VALUES = Object.freeze({
  COMPLETE: 'COMPLETE',
  IMPLEMENTATION_BLOCKED: 'NOT COMPLETE - IMPLEMENTATION BLOCKED',
  VERIFICATION_BLOCKED: 'NOT COMPLETE - VERIFICATION BLOCKED',
});

export const STAGE_6D_SUBSTAGE_STATUSES = Object.freeze({
  VERIFIED_COMPLETE: 'verified complete',
  IMPLEMENTED_VERIFICATION_BLOCKED: 'implemented but verification blocked',
  INCOMPLETE: 'incomplete',
  SUPERSEDED_IN_PART: 'superseded in part',
  NOT_FOUND: 'not found',
});

export const STAGE_6D_REQUIREMENT_RESULTS = Object.freeze({
  VERIFIED: 'verified',
  FAILED: 'failed',
  NOT_IMPLEMENTED: 'not implemented',
  NOT_EXECUTED: 'not executed',
  ENVIRONMENT_BLOCKED: 'environment blocked',
  SUPERSEDED: 'superseded by adopted specification',
  NOT_APPLICABLE: 'not applicable with documented reason',
});

export const STAGE_6D_BLOCKER_SEVERITIES = Object.freeze({
  CRITICAL_RELEASE_BLOCKER: 'critical release blocker',
  STAGE_BLOCKER: 'stage blocker',
  NON_BLOCKING_DEFECT: 'non-blocking defect',
  OBSERVATION: 'observation',
});

export const STAGE_6D_FINAL_COMMAND_RESULTS = Object.freeze([
  {
    command: 'npm --prefix backend install',
    result: 'passed',
    evidence: 'Installed uncommitted backend dependencies in the GitHub-backed checkout so imported source could be validated.',
  },
  {
    command: 'npm --prefix backend run test:stage:6d',
    result: 'passed',
    totals: { tests: 204, passed: 204, failed: 0, skipped: 0 },
    evidence: 'Passed after harmless dummy DB env values were supplied for import-time env validation in mocked Stage 6D.2 tests.',
  },
  {
    command: 'npm --prefix backend run test:stage:6d:fixtures',
    result: 'passed',
    totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
    evidence: 'Synthetic fixture suite passed.',
  },
  {
    command: 'npm --prefix backend run test:stage:6d:rusk-acceptance',
    result: 'passed',
    totals: { tests: 10, passed: 10, failed: 0, skipped: 0 },
    evidence: 'Canonical Rusk backend/service-boundary acceptance suite passed.',
  },
  {
    command: 'npm --prefix backend run test:stage:6c',
    result: 'environment blocked',
    evidence: 'Interaction-core segment passed 135/135; Greyvale vertical-slice content validation failed before acceptance with CLI error under dummy local DB env.',
  },
  {
    command: 'npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale',
    result: 'environment blocked',
    evidence: 'Content validation could not complete without a usable local/Neon DB connection in the imported checkout.',
  },
  {
    command: 'npm --prefix backend test',
    result: 'environment blocked',
    evidence: 'Full backend suite reached DB-backed tests and failed with ECONNREFUSED against dummy local DB settings.',
  },
  {
    command: 'npm run build',
    result: 'environment blocked',
    evidence: 'Static hosting validation requires generated frontend/play/index.html; generated Flutter web output is not committed.',
  },
  {
    command: 'npm run build:player',
    result: 'environment blocked',
    evidence: 'Missing Flutter web build environment variables and Flutter tooling in this shell.',
  },
  {
    command: 'flutter test',
    result: 'environment blocked',
    evidence: 'flutter executable is not available on PATH.',
  },
  {
    command: 'flutter analyze',
    result: 'environment blocked',
    evidence: 'flutter executable is not available on PATH.',
  },
  {
    command: 'node --check backend/src/engine/combat/canonicalRuskAcceptanceSuite.js; node --check backend/src/engine/combat/canonicalRuskEncounter.js; node --check backend/src/engine/combat/playerTurnRuntime.js',
    result: 'passed',
    evidence: 'Syntax checks completed with no output.',
  },
  {
    command: 'npm --prefix backend audit --audit-level=high',
    result: 'failed',
    evidence: 'Reported 13 advisories, including 3 high-severity advisories in transitive dependencies.',
  },
]);

export const STAGE_6D_FINAL_BLOCKERS = Object.freeze([
  {
    id: '6D19-BLOCKER-001',
    severity: STAGE_6D_BLOCKER_SEVERITIES.STAGE_BLOCKER,
    category: 'Flutter verification',
    summary: 'Flutter and Dart tooling are unavailable on PATH, so required Flutter tests, analyzer, formatter, and web build could not execute.',
    requiredToClose: 'Install Flutter/Dart, configure the player app, run flutter test, flutter analyze, dart format checks, and npm run build:player.',
  },
  {
    id: '6D19-BLOCKER-002',
    severity: STAGE_6D_BLOCKER_SEVERITIES.STAGE_BLOCKER,
    category: 'DB/content verification',
    summary: 'DB-backed Greyvale content validation, vertical-slice acceptance, and full backend web tests could not execute without a usable local/Neon DB connection.',
    requiredToClose: 'Provide test DB env/secrets or a local test database, then rerun content validation, Greyvale vertical-slice acceptance, and the full backend suite.',
  },
  {
    id: '6D19-BLOCKER-003',
    severity: STAGE_6D_BLOCKER_SEVERITIES.STAGE_BLOCKER,
    category: 'Hosting build verification',
    summary: 'Static hosting validation failed because generated Flutter web output is absent and could not be rebuilt in this environment.',
    requiredToClose: 'Run npm run build:player with Firebase/API build env vars, then rerun npm run build.',
  },
  {
    id: '6D19-BLOCKER-004',
    severity: STAGE_6D_BLOCKER_SEVERITIES.STAGE_BLOCKER,
    category: 'Dependency security verification',
    summary: 'npm audit --audit-level=high failed with high-severity advisories.',
    requiredToClose: 'Assess and update dependencies or document an approved exception through the project security process, then rerun npm audit.',
  },
]);

export const STAGE_6D_SUBSTAGE_STATUS_MATRIX = Object.freeze([
  ['6D.1', 'Combat Adapter Contract and Architecture', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.2', 'Legacy Combat Engine Verification', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.3', 'Authoritative Roll and Rules Resolution Foundation', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.4', 'Action, Effect, and Resource Framework', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.5', 'Conditions, Concentration, and Zero-Hit-Point Rules', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.6', 'Positioning, Movement, Zones, Cover, Reach, and Size', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.7', 'Incremental Player Turn and Preview/Submit Consistency', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.8', 'Reactions and Interrupt Orchestration', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.9', 'Automatic Turns and Deterministic Tactical Profiles', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.10', 'Multi-Target, Area, Visibility, and Faction Dynamics', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.11', 'Combat Focus', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.12', 'Persistence, Idempotency, Replay, and Recovery', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.13', 'Canonical Rusk Encounter Integration', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.14', 'Encounter Resolution, Aftermath, and Rewards', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.15', 'GM/Dev Trace and Visibility Inspector', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.16', 'Flutter Combat Interface', STAGE_6D_SUBSTAGE_STATUSES.IMPLEMENTED_VERIFICATION_BLOCKED],
  ['6D.17', 'Synthetic Combat Fixture Suites', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.18', 'Rusk End-to-End Acceptance Suite', STAGE_6D_SUBSTAGE_STATUSES.IMPLEMENTED_VERIFICATION_BLOCKED],
]);

export const STAGE_6D_FINAL_STATUS = Object.freeze({
  stage: '6D.19',
  title: 'Final Regression Gate and Status',
  status: STAGE_6D_FINAL_STATUS_VALUES.VERIFICATION_BLOCKED,
  statusReason:
    'Backend Stage 6D combat evidence passes, but required Flutter, DB-backed Greyvale/content, hosting build, and dependency security gates could not all be verified successfully.',
  generatedDate: '2026-06-18',
  sourceOfTruth: {
    adoptedMasterSpecification: 'docs/combat/STAGE_6D_0_EXISTING_COMBAT_SYSTEM_AUDIT_AND_MVP_SPECIFICATION.md',
    formalDefinitionOfDone:
      'Stage 6D.19 prompt acceptance criteria converted into docs/combat/stage-6d-requirement-traceability.json',
    implementationReports: 'docs/combat/STAGE_6D_1_*.md through docs/combat/STAGE_6D_18_*.md',
  },
  blockers: STAGE_6D_FINAL_BLOCKERS,
  substageStatusMatrix: STAGE_6D_SUBSTAGE_STATUS_MATRIX.map(([stage, title, status]) => ({
    stage,
    title,
    status,
  })),
  commandResults: STAGE_6D_FINAL_COMMAND_RESULTS,
});

export function listStage6DFinalBlockers() {
  return [...STAGE_6D_FINAL_BLOCKERS];
}

export function listStage6DSubstageStatuses() {
  return STAGE_6D_SUBSTAGE_STATUS_MATRIX.map(([stage, title, status]) => ({
    stage,
    title,
    status,
  }));
}

export function listStage6DFinalCommandResults() {
  return [...STAGE_6D_FINAL_COMMAND_RESULTS];
}

export function canCloseStage6D(status = STAGE_6D_FINAL_STATUS) {
  return (
    status.status === STAGE_6D_FINAL_STATUS_VALUES.COMPLETE &&
    Array.isArray(status.blockers) &&
    status.blockers.length === 0 &&
    Array.isArray(status.commandResults) &&
    status.commandResults.every((command) => command.result === 'passed')
  );
}

export function assertStage6DFinalStatusShape(status = STAGE_6D_FINAL_STATUS) {
  if (!Object.values(STAGE_6D_FINAL_STATUS_VALUES).includes(status.status)) {
    throw new Error(`Invalid Stage 6D final status: ${status.status}`);
  }

  const stages = new Set(status.substageStatusMatrix.map((entry) => entry.stage));
  for (let index = 1; index <= 18; index += 1) {
    const stage = `6D.${index}`;
    if (!stages.has(stage)) {
      throw new Error(`Missing Stage 6D substage status: ${stage}`);
    }
  }

  if (status.status !== STAGE_6D_FINAL_STATUS_VALUES.COMPLETE && status.blockers.length === 0) {
    throw new Error('A non-complete Stage 6D status must list blockers.');
  }

  if (status.status === STAGE_6D_FINAL_STATUS_VALUES.COMPLETE && status.blockers.length > 0) {
    throw new Error('Stage 6D cannot be complete while blockers remain.');
  }

  return true;
}
