# Stage 6D.17 Synthetic Combat Fixture Suites

## Executive Result

Stage 6D.17 adds a neutral, deterministic synthetic combat fixture harness for the Stage 6D combat runtime.

The harness is intentionally not a new combat engine. It is a small suite registry and execution layer that drives the existing Stage 6D modules through reusable fixtures:

- player turn preview/submit/end-turn
- reactions and interrupt handoff
- deterministic automatic turns
- targeting and visibility preview
- Combat Focus read/answer surfaces
- persistence, duplicate, conflict, and recovery boundaries
- encounter-resolution review shape
- GM/dev visibility inspection
- Flutter combat-state contract payloads

No Greyvale or Rusk narrative content is registered as a synthetic fixture.

## Prerequisite Confirmation

The Stage 6D.17 harness was built on the completed Stage 6D.1 through Stage 6D.16 code paths:

- `playerTurnRuntime.js`
- `reactionInterruptRuntime.js`
- `automaticTurnRuntime.js`
- `targetingParticipantDynamics.js`
- `combatFocus.js`
- `combatPersistenceRuntime.js`
- `encounterResolutionRuntime.js`
- `combatTraceVisibilityInspector.js`
- Flutter combat model parsing from `apps/player_app/lib/combat/combat_models.dart`

The fixtures preserve the D&D 5e 2014 rules identity and use existing deterministic roll override authorization.

## Existing Fixture Evidence

Before this stage, each Stage 6D test file carried local helper states for neutral combatants, actions, resources, positioning, reactions, persistence, and inspector projections. Stage 6D.17 consolidates reusable versions of those patterns without deleting the focused stage tests.

The new harness lives at:

- `backend/src/engine/combat/syntheticCombatFixtures.js`

The focused backend regression is:

- `backend/test/stage6d17-synthetic-combat-fixtures.test.js`

The Flutter model-side contract smoke test is:

- `apps/player_app/test/combat_synthetic_fixtures_test.dart`

## Fixture Architecture

The synthetic fixture layer provides:

- `DEFAULT_SYNTHETIC_COMBAT_FIXTURES`
- `createSyntheticFixtureRegistry`
- `validateSyntheticCombatFixture`
- `validateSyntheticCombatFixtureRegistry`
- `listSyntheticCombatFixtures`
- `getSyntheticCombatFixture`
- `runSyntheticCombatFixture`
- `runSyntheticCombatFixtureSuite`
- `runAllSyntheticCombatFixtures`
- `generateSyntheticCombatCoverageReport`
- `assertSyntheticCombatCoverageComplete`
- `projectSyntheticFixtureForFlutter`

Fixtures are declarative records with:

- stable fixture id
- fixture version
- suite id
- executor id
- ruleset
- runtime layers
- mechanic coverage tags

Execution is opt-in only. Production-style listing or execution requires explicit synthetic fixture permission.

## Deterministic Controls

Fixture executions use:

- deterministic neutral combatants
- deterministic action definitions
- deterministic zone/cover/reach setup
- deterministic reaction resources
- deterministic tactical profiles
- authorized `deterministic_test_override` roll origins
- stable fixture ids and run ids
- explicit idempotency keys in commit/replay cases

The harness avoids live randomness and avoids production data.

## Suite Catalog

Current suites:

- `foundation`: player-turn attack preview/commit
- `action_resource`: resource/idempotency/persistence replay boundary
- `condition_concentration`: concentration and zero-hit-point transition characterization
- `positioning`: movement, cover, reach, and opportunity candidate handoff
- `player_turn`: preview/submit/end-turn confirmation
- `reaction_interrupt`: opportunity interrupt window, preview, submit, and resume handoff
- `automatic_turn`: deterministic automatic operation through the Stage 6D.9 runtime
- `multi_target`: area/ally/visibility preview through Stage 6D.10
- `combat_focus`: Combat Focus question/read-model behavior
- `persistence_recovery`: replay, duplicate/conflict, and recovery-needed freeze
- `encounter_resolution`: neutral aftermath/review contract shape
- `visibility_inspector`: GM/dev visibility safety and decision report
- `flutter`: active turn, reaction, recovery, focus, and resolution JSON shapes for the player app

## Mechanic Coverage

The coverage report maps required mechanics to fixture ids and layers. Required coverage includes:

- ruleset identity
- preview non-mutation
- commit revalidation
- player result bundle safety
- parent turns and sub-resolutions
- end-turn confirmation
- movement, cover, reach
- opportunity candidates
- action resource dedupe
- zero HP
- concentration
- reaction interrupt/resume
- automatic deterministic profile
- area/ally/visibility targeting
- Combat Focus
- persistence replay/conflict
- recovery-needed freeze
- encounter review
- player denylist
- GM/dev inspector projection
- Flutter state contracts

`assertSyntheticCombatCoverageComplete` fails if a required mechanic or layer is uncovered.

## Backend Execution

Backend fixture execution uses the existing runtime modules directly. It does not fork logic into synthetic-only rules.

Representative execution examples:

- `synthetic.foundation.attack_roll_hit` opens a player turn, previews an action, commits it, and validates the player read model.
- `synthetic.positioning.cover_reach_movement` previews movement, commits movement, and preserves opportunity-candidate handoff information.
- `synthetic.reactions.opportunity_interrupt` opens a reaction window, previews a reaction, submits it, and records continuation metadata.
- `synthetic.automatic.deterministic_profile` opens an automatic turn and commits a deterministic action through Stage 6D.9.
- `synthetic.persistence.replay_recovery` exercises replay and recovery-needed boundaries through Stage 6D.12 helpers.

## Persistence And Replay

The harness uses existing serialized aggregate helpers from Stage 6D.12:

- `ensureCombatPersistenceState`
- `beginDurableCombatOperation`
- `recordCombatOperationCheckpoint`
- `completeDurableCombatOperation`
- `resumeDurableCombatOperation`
- `enterCombatRecoveryNeeded`

No database migration was added. Durable cross-process persistence remains governed by the existing serialized aggregate posture and later Stage 6D persistence work.

## Projection And Visibility

Synthetic fixtures enforce player-safe output through `assertNoSyntheticFixturePlayerHiddenData`.

Player projections must not expose:

- GM notes
- debug envelopes
- hidden DCs
- raw rolls
- exact enemy HP
- hidden requirements
- raw state writes
- mutation plans
- idempotency keys
- source-state versions
- action-window internals
- internal routing
- Rusk/future handoff labels
- path harness metadata
- stack traces
- GM/dev traces

GM/dev traces may retain diagnostic data. The inspector fixture checks player-safe read-model output separately from GM/dev diagnostic payloads.

## Flutter Execution

Stage 6D.17 adds a Flutter model-side fixture test that parses synthetic combat states through `CombatView.fromJson`.

Covered states:

- active turn
- reaction prompt
- recovery-needed
- Combat Focus
- resolution/review

Flutter command execution is environment-dependent. In this workspace, Flutter/Dart tooling was not available on PATH during validation, so the Dart test is added but must be run in an environment with Flutter installed.

## Performance And Parallelism

The harness defaults to serial execution for deterministic isolation. `runSyntheticCombatFixtureSuite` accepts a requested parallelism but caps it at `2` and reports bounded parallelism.

Backend tests continue to use Node's repository-standard `--test-concurrency=1`.

## Canonical Rusk Boundary

Canonical Rusk and Greyvale content are intentionally excluded from the synthetic registry.

The synthetic fixtures use neutral participants and neutral encounter labels only. Rusk remains covered by canonical Stage 6D.13, Stage 6D.14, Stage 6D.15, and Greyvale acceptance tests.

## Bugs Discovered

During integration, two harness issues were corrected:

- Synthetic action commits must use the existing authorized `deterministic_test_override` roll origin.
- GM/dev inspector diagnostics must not be passed through player hidden-data assertions as player payloads.

No authored content or live player behavior was changed.

## Commands

Focused backend fixture suite:

```bash
cd backend
npm run test:stage:6d:fixtures
```

Full Stage 6D backend regression including Stage 6D.17:

```bash
cd backend
npm run test:stage:6d
```

Flutter model-side fixture smoke test:

```bash
cd apps/player_app
flutter test test/combat_synthetic_fixtures_test.dart
```

## Known Limitations

- The synthetic fixture runner is an in-process deterministic test/dev harness, not a production route.
- It does not replace the canonical Rusk acceptance path.
- It does not introduce a new database-backed fixture seed system.
- Flutter validation requires local Flutter tooling.
- Synthetic fixtures cover representative runtime paths; detailed per-mechanic edge cases remain in the focused Stage 6D.1 through Stage 6D.16 tests.

## Stage 6D.18 Readiness

Stage 6D.17 provides a reusable fixture harness and coverage map that Stage 6D.18 can consume for broader combat acceptance/regression work.

No blockers were introduced. The main follow-up is to run the new Flutter fixture test in an environment with Flutter/Dart available and to extend fixtures only when Stage 6D.18 identifies concrete acceptance gaps.

