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
    evidence: 'Backend dependencies are installed from the committed lockfile in the GitHub-backed checkout.',
  },
  {
    command: 'npm --prefix backend run test:stage:6d',
    result: 'passed',
    totals: { tests: 204, passed: 204, failed: 0, skipped: 0 },
    evidence: 'Full Stage 6D backend regression gate passed.',
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
    result: 'passed',
    totals: {
      interactionCore: { tests: 135, passed: 135, failed: 0 },
      greyvaleVerticalSlice: { tests: 4, passed: 4, failed: 0 },
    },
    evidence: 'Stage 6C regression command passed with local DB-backed Greyvale validation.',
  },
  {
    command: 'npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale',
    result: 'passed',
    evidence: 'Greyvale content validation completed successfully against the local Docker Postgres database.',
  },
  {
    command: 'npm --prefix backend run test:greyvale-full-loop',
    result: 'passed',
    totals: { tests: 68, passed: 68, failed: 0, skipped: 0 },
    evidence: 'Greyvale full-loop regression suite passed.',
  },
  {
    command: 'npm --prefix backend test',
    result: 'passed',
    totals: { tests: 618, passed: 618, failed: 0, skipped: 0 },
    evidence: 'Full backend suite passed against the local Docker Postgres database.',
  },
  {
    command: 'npm run build',
    result: 'passed',
    evidence: 'Static hosting validation passed after regenerating Flutter web output.',
  },
  {
    command: 'npm run build:player',
    result: 'passed',
    evidence: 'Flutter web build completed with untracked local frontend environment configuration.',
  },
  {
    command: 'flutter test',
    result: 'passed',
    totals: { tests: 68, passed: 68, failed: 0, skipped: 0 },
    evidence: 'Flutter player app test suite passed.',
  },
  {
    command: 'flutter analyze',
    result: 'passed',
    evidence: 'Flutter analyzer reported no issues.',
  },
  {
    command: 'dart format --output=none --set-exit-if-changed apps/player_app/lib apps/player_app/test',
    result: 'passed',
    evidence: 'Dart formatter check passed after confirming no committed formatting drift.',
  },
  {
    command: 'node --check backend/src/engine/combat/canonicalRuskAcceptanceSuite.js; node --check backend/src/engine/combat/canonicalRuskEncounter.js; node --check backend/src/engine/combat/playerTurnRuntime.js',
    result: 'passed',
    evidence: 'Syntax checks completed with no output.',
  },
  {
    command: 'npm --prefix backend audit --audit-level=high',
    result: 'passed',
    evidence:
      'High-severity audit gate passes after lockfile remediation; moderate Firebase Admin transitive advisories remain as a non-blocking follow-up because the force fix is breaking.',
  },
]);

export const STAGE_6D_FINAL_BLOCKERS = Object.freeze([]);

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
  ['6D.16', 'Flutter Combat Interface', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.17', 'Synthetic Combat Fixture Suites', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
  ['6D.18', 'Rusk End-to-End Acceptance Suite', STAGE_6D_SUBSTAGE_STATUSES.VERIFIED_COMPLETE],
]);

export const STAGE_6D_FINAL_STATUS = Object.freeze({
  stage: '6D.19',
  title: 'Final Regression Gate and Status',
  status: STAGE_6D_FINAL_STATUS_VALUES.COMPLETE,
  statusReason:
    'Stage 6D backend, Flutter, Greyvale/content, hosting build, and high-severity dependency security gates have all been verified successfully.',
  generatedDate: '2026-06-20',
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
