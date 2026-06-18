# Stage 6C.8 - Beat Resolution Regression Suite

## Stage Summary

Stage 6C.8 adds the capstone regression gate for the shared beat-resolution runtime.

The official Stage 6C command is:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:stage:6c
```

Backend-only equivalent:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend run test:stage:6c
```

The command runs the shared interaction-core runtime suite and the DB-backed Greyvale vertical-slice acceptance suite. It does not replace the broader Greyvale full-loop command, which remains the strongest legacy regression smoke for 6B-era coverage.

No combat, open-world navigation, AI narration, player-facing rules transparency expansion, SMS requirement, major Greyvale content, player UI redesign, full GM Campaign Inspector, or database/schema migration was added.

## Regression Suite Structure

The Stage 6C gate has two automated layers and one documented frontend limitation:

- Shared runtime regression: `npm run test:interaction-core`
- Greyvale acceptance extension: `npm run test:greyvale-vertical-slice`
- Frontend rendered-output limitation: no new browser E2E harness was introduced; existing Flutter/manual checks remain documented.

Root script:

```text
package.json -> test:stage:6c
```

Backend script:

```text
backend/package.json -> test:stage:6c
```

The shared-runtime layer includes:

- `backend/test/interaction-core-resolution-pipeline.test.js`
- `backend/test/interaction-core-preview-consistency.test.js`
- `backend/test/interaction-core-outcome-quality.test.js`
- `backend/test/interaction-core-mutation-safety.test.js`
- `backend/test/interaction-core-transition-orchestration.test.js`
- `backend/test/interaction-core-read-model-refresh.test.js`
- `backend/test/interaction-core-resolution-trace.test.js`
- `backend/test/stage6c-beat-resolution-regression.test.js`

The Greyvale layer includes:

- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- `content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json`

## Shared Runtime Contract Coverage

The shared runtime regression covers:

- resolution request and response shapes
- exploration and dialogue interaction domains
- adapter boundary expectations
- output bundle contract
- mutation plan contract
- transition decision contract
- next-beat decision contract
- player result bundle contract
- GM/dev trace envelope
- recovery-needed envelope
- player projection excluding GM/dev trace fields

The capstone regression test also checks that the orchestration map still exposes preview, commit, recovery, mutation, transition, read-model, and trace rules.

## Preview-To-Resolution Coverage

Covered behaviors:

- preview is non-mutating
- preview does not write objectives, knowledge, history, latest development, mutation plans, or transitions
- preview does not close or open action windows
- preview and commit share semantic alignment markers
- stale preview or commit returns safe recovery
- unavailable or locked preview returns safe recovery
- exploration and dialogue preview/commit consistency are represented
- player preview payloads pass hidden-data safety
- GM/dev diagnostics explain preview/result mismatches

## Outcome Quality And Result Bundle Coverage

Covered behaviors:

- committed result bundles include useful sections where relevant
- empty optional sections are omitted safely
- authored text is preserved
- no generated AI narration is introduced
- exploration outcomes can communicate consequence, discovery, progress, and next step
- dialogue outcomes can communicate response, social consequence, discovery, progress, and next step
- failure, partial-success, unavailable, and recovery results are safe
- result bundles pass hidden-data denylist checks

## Mutation Ordering, Dedupe, And Transaction Safety Coverage

Covered behaviors:

- mutation write groups are ordered
- objective, knowledge, history/latest development, completed record, archive/search, endpoint, action-window, read-model, and trace groups are represented
- duplicate submit does not duplicate outputs in DB-backed Greyvale acceptance
- stale submit does not mutate in DB-backed Greyvale acceptance
- source action windows close after successful commits where current runtime supports it
- exactly one next action window opens where appropriate
- endpoint states do not open unsupported combat action windows
- read model refresh happens after writes and next-beat selection
- simulated failures either roll back where supported or mark recovery-needed
- player responses hide mutation plans, dedupe keys, and transaction internals
- GM/dev diagnostics include mutation plan and write-group behavior

## Transition And Next-Beat Coverage

Covered behaviors:

- same-scene decisions
- scene-to-scene transitions
- exploration-to-dialogue entry markers
- dialogue continuation markers
- dialogue exit back to exploration
- endpoint/future-supported handoff
- recovery and unavailable transitions opening no unsafe normal window
- next exploration action-window selection
- next dialogue action-window selection
- endpoint review-only no-window behavior
- player projections hide internal routing
- GM/dev diagnostics preserve transition and next-beat decisions

## Result/Read-Model Alignment Coverage

Covered behaviors:

- result bundle aligns with refreshed read model
- clue discovery appears in player-visible knowledge
- objective progress appears in player-visible objectives
- scene transition appears in current scene read model
- dialogue entry appears in active dialogue read model
- dialogue exit returns to exploration read model
- endpoint result creates endpoint/review-only read model
- recovery result hides unsafe next actions
- active state summary remains player-safe
- endpoint read model hides internal future/combat labels

## GM/Dev Trace And Provenance Coverage

Covered behaviors:

- committed exploration beat has trace envelope coverage
- committed dialogue beat has trace envelope coverage
- Rusk endpoint/future-supported handoff has trace markers
- stale, duplicate, unavailable, and recovery-needed cases are traceable in helper coverage
- traces include request, validation, outcome, output bundle, mutation plan, transition decision, next-beat decision, read-model refresh, and projection notes where available
- authorized GM/dev can inspect traces through helper and existing inspector conventions
- normal players cannot access GM/dev inspector data
- player payloads do not include traces
- trace serialization redacts secrets and credentials

## Player Visibility And Security Coverage

Player payloads are checked against denylist coverage for:

- preview responses
- committed result responses
- player read models
- stale, duplicate, unavailable, and recovery responses
- endpoint responses
- completed records, summaries, archive, and search where supported

Forbidden player data includes:

- GM notes
- debug envelopes
- hidden DCs and raw rolls
- branch ids
- hidden requirements and failed hidden requirements
- raw relationship/social meters
- raw state writes
- mutation plans
- idempotency keys
- internal transition and next-beat labels
- action-window internals
- `combat_pending`
- `future_supported`
- target encounter ids
- source file paths
- path harness metadata
- stack traces and internal errors
- GM/dev trace internals
- final mystery truth

## Greyvale Acceptance Extensions

The Stage 6C command reuses the Stage 6B.15 vertical-slice route and its Stage 6C semantic markers.

The canonical route still covers:

- start Greyvale
- Broken Caravan opening
- Free Focus
- Broken Caravan committed action
- Grey Road Inn transition
- Tomas
- Elin
- Dunmere village pressure
- Mara
- Lysa
- Garren
- old forest path
- shrine ruins
- Rusk confrontation
- endpoint review/resume

Stage 6C markers on that route include:

- preview expectations
- expected result bundle sections
- expected mutation write groups
- expected transition decision
- expected next-beat decision
- expected read-model state
- expected trace sections
- expected read-model contents
- duplicate submit expectation
- stale submit expectation
- endpoint idempotency expectation

## Path Harness Fixture

Added:

```text
content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json
```

This fixture names the Stage 6C regression command, coverage layers, coverage groups, canonical route requirements, seed/test-data strategy, and preserved non-goals. It references the existing Greyvale vertical-slice fixture instead of replacing it.

## Test Data And Seed Strategy

The shared runtime layer is pure Node helper coverage and does not require external services.

The Greyvale acceptance layer requires the local test database and Greyvale content import.

Expected environment:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
```

Content validation command:

```powershell
npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale
```

The DB-backed acceptance tests use:

- mocked Firebase tokens through the existing `test-firebase:` convention
- unique test users
- one active character per player
- per-test campaign/adventure setup
- content import through the existing content importer

No production data is required.

## Frontend Coverage Limitation

No frontend files were touched in Stage 6C.8.

The repo does not currently have a full browser E2E harness for the authenticated Flutter web playthrough. The official Stage 6C gate is therefore backend/shared-runtime and Greyvale path/read-model based. Existing Flutter/manual playthrough checks from Stage 6B.15 remain the frontend safety layer until a future browser E2E harness is introduced.

## Commands

Fast shared runtime:

```powershell
npm run test:interaction-core
```

Greyvale acceptance:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```

Official Stage 6C gate:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:stage:6c
```

Stronger legacy Greyvale smoke:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-full-loop
```

Hosting/static sanity:

```powershell
npm run build
```

## Known Limitations

- The Stage 6C command does not include the slower Greyvale full-loop suite by default. Run `npm run test:greyvale-full-loop` for the broader 6B-era smoke.
- No persistent resolution trace table was added.
- Full GM Campaign Inspector remains deferred to Stage 6F.1.
- Full browser E2E automation remains deferred.
- Stage 6C.8 proves the shared hardening surface and the Greyvale acceptance route; it does not claim production readiness for combat, navigation, or future domains.

## Bugs Fixed

No runtime bugs were fixed in Stage 6C.8. The only code/test adjustment was the addition of the capstone regression test and command wiring.
