# Stage 6B.13 Greyvale Full Loop Regression Status

Stage 6B.13 hardened the post-dialogue Greyvale loop across exploration, dialogue, action lifecycle, output consistency, player UI/read models, GM/dev visibility, permissions, stale-state handling, archive/search, and content continuity.

This is not the Stage 6B.15 playable vertical slice declaration. It is the regression foundation that should be run before deeper playtesting and before later shared-core/navigation/combat work.

## Primary Regression Command

Run from the repository root with a local test database available:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
$env:DB_HOST='localhost'
npm run test:greyvale-full-loop
```

The command runs:

- Greyvale content validation in read-only mode.
- Stage 6B.13.6 inn/village/shrine full-loop smoke tests.
- Stage 6B.12 completed Greyvale dialogue schema, registry, content, path-harness, archive/search, and continuity tests.
- Stage 6B.13.1 handoff tests.
- Stage 6B.13.2 action lifecycle tests.
- Stage 6B.13.3 output consistency tests.
- Stage 6B.13.5 GM/dev visibility and player denylist tests.
- Greyvale exploration mechanics and player-vs-GM visibility boundary tests.

Companion UI checks:

```powershell
cd apps/player_app
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test test\dialogue_debug_workspace_test.dart test\dialogue_ui_test.dart test\exploration_mechanics_greyvale_regression_test.dart test\exploration_mechanics_inspector_test.dart test\exploration_mechanics_visibility_boundary_test.dart test\models_test.dart test\player_ui_recovery_test.dart
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
```

The Flutter command is documented separately because the SDK path is local-machine-specific.

## Coverage Summary

Inn cluster:

- Loads Greyvale entry/current scene.
- Resolves Free Focus without consuming a committed Beat Action.
- Previews, submits, and advances a Greyvale exploration action.
- Enters Tomas dialogue and grants Pattern of Attacks/road-pattern knowledge.
- Completes Tomas and verifies archive/search/debug safety.
- Enters Elin dialogue and grants survivor-memory/shrine-warning clues.
- Verifies completed dialogue records, player-safe archive/search, knowledge journal, and GM/dev debug.

Village cluster:

- Enters Mara dialogue and preserves Mara's Assumption as incomplete/misleading.
- Enters Lysa dialogue and preserves Lysa's Suspicion as partial/misleading.
- Enters Garren dialogue and grants old-path/shrine-route knowledge.
- Verifies no final mystery reveal, player-safe knowledge journal wording, archive/search, and GM/dev relationship/output provenance.

Shrine cluster:

- Enters Rusk dialogue.
- Resolves shrine-instability clue path.
- Resolves deeper-source/hollow clue path without final mystery exposition.
- Verifies combat-pending/future-supported status remains player-safe and GM/dev inspectable.
- Verifies completed dialogue archive/search and player-facing denylist.

Optional chained smoke:

- Deferred intentionally. The current system does not yet implement open-world navigation or live combat handoff, so the reliable capstone coverage is clustered rather than a brittle single test that pretends future navigation exists.
- Route to Stage 6B.15 for playable vertical-slice declaration after Stage 6B.14 shared interaction cleanup.
- Stage 6B.15 planning now lives at `docs/greyvale/STAGE_6B_15_VERTICAL_SLICE_PLAN.md` and defines the canonical start/resume -> inn -> village -> shrine/Rusk endpoint route.

## Dialogue Path Harness Coverage

Tomas:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `transition_path`

Elin:

- `happy_path`
- `failure_path`
- `fallback_path`
- `minimal_interaction_path`
- `max_clarifying_question_path`
- `relationship_state_edge_case`
- `exit_transition_path`

Mara:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`

Lysa:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`

Garren:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`
- `transition_path`

Rusk:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `instability_state_path`
- `combat_transition_path`
- `deeper_source_transition_path`

The executable path harness is covered by `backend/test/dialogue-greyvale-fixture-regression.test.js` and the Stage 6B.12.6 static inventory in `backend/test/dialogue-greyvale-stage6b12-regression.test.js`.

## Validation Results

Latest local run of `npm run test:greyvale-full-loop`:

- Greyvale content validation: `ok`, 34 files processed, 0 warnings, 0 errors.
- Focused backend full-loop regression: 56 tests passed, 0 failed.

Additional local checks from Stage 6B.13.5/6B.13.6:

- Full backend suite: 291 tests passed, 0 failed.
- Stage 5J.2 environment current-scene expectation was updated to accept the current Grey Road Inn rain overlay wording while preserving the environment-enhanced scene invariant.
- Flutter targeted UI tests: 50 tests passed, 0 failed.
- Flutter analyze: no issues found.
- Hosting check: passed.

## Visibility Status

Player-facing denylist coverage includes exploration scene read models, dialogue scene read models, Free Focus results, CQs, CSM previews/results, action preview/submit/result, dialogue exits, history, knowledge journal, completed dialogue archive/search, player-facing errors, and targeted Flutter rendered surfaces.

Player payloads must not expose hidden DCs, raw rolls, result-band internals, branch ids, hidden requirements, GM notes, debug summaries, raw relationship/social state, state read/write internals, preview/routing confidence, path-harness metadata, validation debug notices, future-supported internals, combat routing internals, hidden clue metadata, GM-only truth labels, final mystery notes, stack traces, or database constraint details.

Authorized GM/dev users can inspect exploration mechanics, dialogue mechanics, action lifecycle/stale-state diagnostics, output provenance, transition/handoff/future-supported status, relationship/social state, completed records, transcript hooks, path harness data, and validation notices through the existing GM/dev debug surfaces.

## Remaining Gaps

- Unified full-loop GM/dev timeline remains future work. Route to Stage 6F.1 or later GM tooling.
- Optional fully chained Greyvale smoke is deferred until navigation/combat handoffs are live enough not to fake future systems. Route to Stage 6B.15 after 6B.14.
- Open-world movement and scene navigation are out of scope. Route to Stage 6G.
- Rusk combat remains `combat_pending`/future-supported rather than a live combat web handoff. Route to Stage 6I.
- Shared interaction core cleanup is still pending. Route to Stage 6B.14.
- Full rules/check transparency for players remains out of scope. Route to Stage 6H.

## Readiness Recommendation

Stage 6B.13 is ready to close.

Proceed to Stage 6B.14 - Shared Interaction Core Consolidation, then Stage 6B.15 - Greyvale Playable Vertical Slice validation.

Stage 6B.14 planning lives at `docs/interaction-core/STAGE_6B_14_SHARED_INTERACTION_CORE_CONSOLIDATION_PLAN.md`. It is an internal consolidation plan for shared contracts/helpers, not a player-facing feature stage.
