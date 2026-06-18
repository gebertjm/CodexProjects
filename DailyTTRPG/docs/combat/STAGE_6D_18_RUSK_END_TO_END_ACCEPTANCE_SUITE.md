# Stage 6D.18 Rusk End-to-End Acceptance Suite

## Executive Result

Stage 6D.18 adds the canonical Rusk acceptance gate for the Stage 6D combat runtime.

The backend acceptance harness is:

- `backend/src/engine/combat/canonicalRuskAcceptanceSuite.js`

The focused backend command is:

```bash
cd backend
npm run test:stage:6d:rusk-acceptance
```

The command exercises canonical Greyvale Rusk content through the existing Stage 6D runtime services. It does not register Rusk as a synthetic fixture and does not add a second combat runtime.

## Prerequisite Confirmation

The acceptance suite composes the completed Stage 6D layers:

- Stage 6D.13 canonical Rusk launch, start state, tactical profile, surrender, retreat, and completion handoff.
- Stage 6D.14 encounter resolution, shared Shrine Ruins aftermath, rewards, adventure outputs, and review.
- Stage 6D.15 GM/dev inspection, projection parity, and hidden-data checks.
- Stage 6D.16 Flutter combat model/interface contracts.
- Stage 6D.17 deterministic fixture controls and coverage posture.

Earlier Stage 6D runtime modules remain covered through the full `npm run test:stage:6d` command.

## Canonical Content Baseline

The suite validates the active canonical identifiers:

- Encounter: `shrine-rusk-confrontation`
- Combat: `greyvale:shrine-rusk-confrontation`
- Campaign: `shadows_grey_road`
- Shrine Ruins scene: `shrine-ruins`
- Rusk dialogue: `rusk-at-the-shrine`
- Rusk stat block: `rusk-bandit`
- Combat-resolution hook: `grey-road-shrine-combat-resolution`
- Shared aftermath state: `shrine_ruins_aftermath`
- Tactical profile: `greyvale-rusk-direct-aggressive`
- Surrender rule: `rusk-low-hp-and-narrative-permission`
- Retreat route: `grey-road-retreat`
- Ruleset: `dnd5e`, version `2014`

Canonical action identities:

- `greyvale-player-strike`
- `rusk-rusty-blade`
- `rusk-opportunity-strike`
- `greyvale-player-opportunity-strike`
- `dodge`

Canonical accepted outcome identifiers:

- `rusk_defeat_lethal`
- `rusk_defeat_nonlethal`
- `rusk_surrender`
- `player_retreat`
- `player_defeat_fail_forward`

The broader Stage 6D.1 exit contract still preserves additional future-safe outcome identifiers, but the Stage 6D.18 acceptance gate covers the five currently canonical Rusk outcomes.

## Acceptance Architecture

The backend harness provides:

- Scenario registry and versioning.
- Behavior-to-scenario matrix.
- Canonical content integrity checks.
- Isolated run identifiers for acceptance state.
- Canonical Rusk launch through `createOrResumeCanonicalRuskCombat`.
- Player turns through `openCanonicalRuskPlayerTurn`, previews, submits, and End Turn.
- Rusk automatic behavior through `executeCanonicalRuskAutomaticStep`.
- Reaction continuation handoff coverage.
- Combat Focus coverage through canonical Rusk state.
- Resolution through `resolveEncounterAftermath`.
- Review reconstruction through `rebuildEncounterResolutionReview`.
- Stage 6D.15 inspection through `inspectCombatTraceAndVisibility`.
- Replay/restart characterization through serialized aggregate reconstruction.
- Recovery-needed freeze through Stage 6D.12 recovery helpers.
- Flutter contract payload generation for canonical review payloads.

The harness intentionally does not:

- call legacy combat HTTP routes;
- mutate canonical Rusk content;
- create synthetic Rusk fixtures;
- directly grant rewards;
- directly select aftermath variants outside the existing resolution service;
- add database migrations.

## Scenario Registry

Registered scenarios:

- `rusk.acceptance.content_baseline`
- `rusk.acceptance.opening.player_first`
- `rusk.acceptance.opening.rusk_first`
- `rusk.acceptance.opening.initiative_tie`
- `rusk.acceptance.outcome.lethal_defeat`
- `rusk.acceptance.outcome.nonlethal_subdual`
- `rusk.acceptance.outcome.surrender`
- `rusk.acceptance.outcome.player_retreat`
- `rusk.acceptance.outcome.fail_forward_defeat`
- `rusk.acceptance.persistence.replay_restart_response_loss`
- `rusk.acceptance.reaction.continuation`
- `rusk.acceptance.combat_focus.live_state`
- `rusk.acceptance.visibility.inspector_parity`
- `rusk.acceptance.recovery.safe_freeze`
- `rusk.acceptance.flutter.contract_payloads`

Every scenario uses version `1.0.0`.

## Scenario Matrix

The registry maps scenarios to these behavior groups:

- canonical content
- production Stage 6D runtime
- player-safe projection
- Flutter contract
- Stage 6D.15 inspector parity
- player-first initiative
- Rusk-first initiative
- initiative tie/no reroll
- player turn preview/submit/End Turn
- Rusk automatic turn
- reaction interrupt continuation
- Combat Focus
- all five canonical outcomes
- shared Shrine Ruins aftermath
- experience/reward exact-once behavior
- objective, knowledge, history, and Latest Development outputs
- summary-first post-combat review
- duplicate-safe submit
- response-loss reconstruction
- process-restart reconstruction
- recovery-needed safe freeze

The matrix fails if any behavior group has no covering scenario.

## Outcome Paths

The five outcome scenarios use the existing canonical runtime:

- Lethal Rusk defeat: player strikes through canonical player turns until Rusk is defeated, then resolves aftermath.
- Nonlethal Rusk subdual: player declares nonlethal on the defeating strike, then resolves aftermath.
- Rusk surrender: player reduces Rusk to a qualifying state with narrative permission present, then Rusk selects surrender through the deterministic tactical profile.
- Player retreat: player takes the authored retreat route and Rusk opportunity reaction resolves deterministically before retreat aftermath.
- Player fail-forward defeat: Rusk attacks a low-hit-point acceptance character and the canonical fail-forward outcome resolves without ordinary death-save turns.

## Initiative And Automatic Turns

The opening-order scenarios prove:

- player-first initiative opens the player combat turn;
- Rusk-first initiative runs the canonical deterministic automatic behavior;
- initiative ties remain stable after serialized reconstruction;
- Rusk-first automatic behavior does not require a player Continue click inside this backend runtime boundary.

## Reactions

Reaction coverage proves:

- Rusk movement can produce a player reaction-required next decision;
- an active reaction window is preserved;
- continuation metadata is retained for Stage 6D.8/6D.9 flow;
- player projections remain safe.

The full Flutter reaction interaction remains covered by the existing Stage 6D.16 Flutter tests and the new contract payload test.

## Persistence, Replay, And Recovery

The persistence scenario proves:

- previews are non-mutating and available;
- first submit resolves once;
- exact duplicate submit is duplicate-handled;
- response loss can be reconstructed from cloned state;
- reconstructed aggregate preserves state version and current truth.

The recovery scenario proves:

- recovery-needed read model is player-safe;
- ordinary controls are removed;
- retry is unsafe unless explicitly repaired;
- GM/dev diagnostics remain internal.

## Resolution, Rewards, And Adventure Outputs

For every accepted outcome, the suite asserts:

- one shared aftermath state: `shrine_ruins_aftermath`;
- outcome-specific aftermath variant;
- `150` XP awarded through encounter resolution;
- no level-up application;
- objective output present;
- knowledge output present;
- history output exactly once;
- Latest Development exactly once;
- review exactly once;
- combat controls disabled after resolution.

The internal operation log can include multiple operation records related to completion/replay diagnostics. The exact-once acceptance assertion is therefore based on authoritative player/adventure effects and output provenance, not raw operation-count equality alone.

## Post-Combat Review

The review assertions cover:

- summary-first review;
- outcome-specific summary language;
- chronological log availability;
- calculation details availability;
- player-safe participant presentation;
- hidden Rusk statistics and internals absent from player payloads.

## Flutter Contract Coverage

Stage 6D.18 adds:

- `apps/player_app/test/combat_rusk_acceptance_contract_test.dart`

The Flutter contract test parses:

- all five canonical Rusk review outcomes;
- Rusk reaction prompt payload;
- recovery-needed payload.

It verifies that `CombatView.fromJson` can render the player-safe structures without ordinary controls and without hidden/internal fragments.

Local execution requires Flutter/Dart tooling:

```bash
cd apps/player_app
flutter test test/combat_rusk_acceptance_contract_test.dart
flutter analyze
dart format lib/combat/combat_models.dart test/combat_rusk_acceptance_contract_test.dart
```

## Visibility And Inspector

The visibility scenario uses Stage 6D.15 inspection and asserts:

- authorized developer inspection succeeds;
- production player projection is used;
- player projection has zero hidden-data leaks;
- inspector diagnostics remain GM/dev-only;
- Combat Focus and review payloads remain player-safe.

## Running The Suite

List scenarios via the exported registry:

- `listRuskAcceptanceScenarios`
- `buildRuskAcceptanceScenarioMatrix`

Run one scenario in code:

```js
runRuskAcceptanceScenario({ scenario_id: 'rusk.acceptance.outcome.surrender', encounter, dialogue, hook });
```

Run the focused backend gate:

```bash
cd backend
npm run test:stage:6d:rusk-acceptance
```

Run the full backend Stage 6D gate:

```bash
cd backend
npm run test:stage:6d
```

Run synthetic fixtures:

```bash
cd backend
npm run test:stage:6d:fixtures
```

## Current Limitations

This repository still lacks a true DB-backed `/api/play/combat/*` backend route implementation matching the Flutter `CombatHttpRepository` paths. Stage 6D.18 therefore provides a canonical backend acceptance gate through the current production runtime services and a Flutter contract/widget test layer, not a full HTTP/browser/database E2E runner.

Local validation in this workspace also depends on environment availability:

- Greyvale content validation currently requires a reachable `db` host.
- Flutter/Dart commands require Flutter tooling on PATH.

These are release-gate limitations for Stage 6D.19, not hidden successes.

## Bugs Discovered

No canonical content changes were needed.

Harness issues fixed during this stage:

- acceptance summary now uses semantic preview fields instead of a nonexistent generic preview status;
- serialized reconstruction summary now reads the flattened aggregate shape;
- exact-once summary now keys off stable adventure/player effects instead of raw diagnostic operation count;
- completion summaries normalize already-completed idempotent handoffs.

## Scope Confirmation

Stage 6D.18 did not:

- add a new combat mechanic;
- create a second Rusk implementation;
- register a synthetic Rusk fixture;
- alter Rusk stats, actions, surrender logic, retreat logic, reward values, or aftermath;
- create a separate aftermath scene;
- apply level-up choices;
- expose inspector data to players;
- add a database migration;
- begin Stage 6D.19.

## Stage 6D.19 Readiness

Stable assets now available for Stage 6D.19:

- Stage 6D.17 synthetic fixture suites.
- Stage 6D.18 canonical Rusk acceptance suite.
- Full backend Stage 6D regression command.
- Flutter combat model/widget/controller tests plus Rusk acceptance contract payload test.
- Visibility and inspector parity tests.
- Recovery and replay coverage.
- Scenario registry and coverage matrix.

Remaining blockers for a true final release gate:

- implement or expose production backend `/api/play/combat/*` routes if the product intends Flutter to call them directly;
- run Flutter tests/analyzer/format in an environment with Flutter installed;
- run Greyvale content validation with a reachable test database host;
- decide whether raw completion operation counts need stricter durable-event accounting in a later persistence/release-gate pass.

