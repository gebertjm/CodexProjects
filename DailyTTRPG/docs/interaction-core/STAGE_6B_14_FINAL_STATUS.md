# Stage 6B.14 Final Status

Stage 6B.14 created the shared interaction core consolidation layer for exploration and dialogue while preserving domain-specific runtime behavior.

## Stage Summary

Stage 6B.14 remained an internal refactor and safety-hardening stage.

It did not:

- rewrite exploration runtime
- rewrite dialogue runtime
- merge exploration and dialogue into one runtime
- rename player-facing concepts
- add Greyvale content
- implement combat
- implement navigation
- change frontend UI
- add database/schema migrations

## Completed Sub-Builds

### 6B.14.0 Audit And Plan

Plan:

- `docs/interaction-core/STAGE_6B_14_SHARED_INTERACTION_CORE_CONSOLIDATION_PLAN.md`

### 6B.14.1 Shared Interaction Contracts

Code:

- `backend/src/services/interactionCore/contracts.js`
- `backend/src/services/interactionCore/visibility.js`
- `backend/src/services/interactionCore/outputBundle.js`
- `backend/src/services/interactionCore/transitionOutput.js`
- `backend/src/services/interactionCore/debugEnvelope.js`
- `backend/src/services/interactionCore/errors.js`
- `backend/src/services/interactionCore/pathExpectations.js`

Tests:

- `backend/test/interaction-core-contracts.test.js`

Docs:

- `docs/interaction-core/STAGE_6B_14_1_SHARED_INTERACTION_CONTRACTS.md`

### 6B.14.2 Shared Lifecycle Helpers

Code:

- `backend/src/services/interactionCore/lifecycle.js`

Tests:

- `backend/test/interaction-core-lifecycle.test.js`

Docs:

- `docs/interaction-core/STAGE_6B_14_2_SHARED_LIFECYCLE_HELPERS.md`

### 6B.14.3 Shared Visibility And Error Boundary

Code:

- `backend/src/services/interactionCore/visibilityBoundary.js`
- `backend/src/services/interactionCore/explorationVisibilityAdapter.js`
- `backend/src/services/interactionCore/dialogueVisibilityAdapter.js`

Tests:

- `backend/test/interaction-core-visibility-boundary.test.js`

Docs:

- `docs/interaction-core/STAGE_6B_14_3_SHARED_VISIBILITY_AND_ERROR_BOUNDARY.md`

### 6B.14.4 Shared Output Bundle And Provenance Pipeline

Code:

- `backend/src/services/interactionCore/outputPipeline.js`
- `backend/src/services/interactionCore/explorationOutputAdapter.js`
- `backend/src/services/interactionCore/dialogueOutputAdapter.js`

Tests:

- `backend/test/interaction-core-output-pipeline.test.js`

Docs:

- `docs/interaction-core/STAGE_6B_14_4_SHARED_OUTPUT_BUNDLE_AND_PROVENANCE_PIPELINE.md`

### 6B.14.5 Shared Path Harness And Regression Rewire

Code:

- `backend/test/interaction-core/sharedPathHarness.js`

Tests:

- `backend/test/interaction-core-path-harness.test.js`
- representative rewire in `backend/test/dialogue-focus-commit-adapter.test.js`
- representative rewire in `backend/test/stage6b9-surface-focus-commit-unit.test.js`

Docs:

- `docs/interaction-core/STAGE_6B_14_5_SHARED_PATH_HARNESS_AND_REGRESSION_REWIRE.md`

## Command Set

Deterministic interaction-core regression:

```powershell
npm run test:interaction-core
```

Backend equivalent:

```powershell
npm --prefix backend run test:interaction-core
```

DB-backed Greyvale full-loop regression:

```powershell
npm run test:greyvale-full-loop
```

The full-loop command requires the local Docker/Postgres environment.

## Adapter Boundary

Exploration and dialogue adapters remain separate.

Shared internals now cover:

- contracts
- lifecycle helper logic
- visibility projection and safe errors
- output bundle/provenance helpers
- test harness assertions

Domain-owned behavior remains in:

- exploration runtime services
- dialogue Focus/Commit runtime services
- persistence writers
- archive/search services
- frontend UI
- authored content schemas
- expected path files

## Known Limitations

- DB-backed Greyvale tests cannot run unless Postgres/Docker are available.
- Runtime output writers are not migrated to the shared output pipeline yet.
- Path harness utilities are test-facing; DB-backed route tests can adopt them gradually.
- Combat and navigation remain future-stage systems.

## Readiness For Stage 6B.15

Stage 6B.14 is ready to hand off to Stage 6B.15 once the DB-backed Greyvale full-loop suite is run in an environment with Docker/Postgres available.

Recommended next stage:

- Stage 6B.15 — Greyvale Playable Vertical Slice

Planning document:

- `docs/greyvale/STAGE_6B_15_VERTICAL_SLICE_PLAN.md`
