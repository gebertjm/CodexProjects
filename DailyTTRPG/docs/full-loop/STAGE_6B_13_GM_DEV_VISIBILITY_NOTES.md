# Stage 6B.13.5 GM/Dev Visibility Notes

Stage 6B.13.5 hardens the split between authorized GM/dev diagnostics and normal player-facing play surfaces across the current Greyvale loop.

## Audited Surfaces

Backend GM/dev routes:

- `GET /api/dev/exploration-mechanics` in `backend/src/routes/devBeat.js`.
- `GET /api/dev/dialogue-debug` in `backend/src/routes/devBeat.js`.
- `GET /api/dev/playtest-diagnostics` in `backend/src/routes/devBeat.js`.
- `GET /api/play/current-scene?include_debug=true` in `backend/src/routes/play.js`.

Backend read models:

- `backend/src/services/explorationMechanicsDebugReadModel.js`.
- `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`.
- `backend/src/services/playtestDiagnosticsService.js`.
- Player-facing scene, dialogue, history, knowledge, archive, and search routes.

Frontend GM/dev UI:

- `apps/player_app/lib/campaign/exploration_mechanics_inspector_page.dart`.
- `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`.
- Campaign diagnostics and scene dev-diagnostics entry points.

## Permission Boundary

The active GM/dev capability remains `account.can_advance_beats`, matching Advance Beat, exploration mechanics debug, and dialogue debug.

Normal players can still request safe mechanics with `include_mechanics=true`. They cannot receive the current-scene `debug` object just by adding `include_debug=true`; that query flag is now honored only outside production and only for accounts with `can_advance_beats = TRUE`.

The dedicated `/api/dev/...` routes remain Firebase-authenticated and capability-gated. Frontend route hiding is treated as convenience only; backend permission checks are the authority.

## Player-Facing Denylist

The Stage 6B.13.5 backend regression applies denylist checks to normal player payloads and player-safe denial responses. Denied terms include hidden DCs, raw rolls, result-band internals, branch ids, hidden requirements, GM notes, debug summaries, state read/write internals, raw relationship/social meters, preview/routing confidence, path-harness metadata, validation debug notices, future-supported internals, combat routing internals, hidden clue metadata, GM-only truth labels, and final mystery notes.

Allowed player-facing values remain narrative result text, safe check labels where policy allows, player-safe clue/objective/history text, safe relationship perception summaries, safe transition labels, stale-state recovery messages, and Rusk combat-risk language.

## GM/Dev Positive-Control Coverage

Authorized GM/dev users can inspect:

- Exploration scene state, surface/passive discovery context, Free Focus and Beat Action availability, check details, result bands, environment modifiers, NPC presence, state reads/writes, outputs, transitions, audit timeline, validation, and visibility boundary notes.
- Dialogue scene state, CQ/CSM availability, check metadata, hidden DCs where authored, authored availability requirements, authored move output metadata, branch metadata, relationship/social state, preview mapping, fallback usage, exits, transition metadata, transcripts, completed records, validation, and path harness data.
- Output provenance for knowledge, objectives, history, completed records, archive/search, and Rusk combat/deeper-source flags.
- Stale/duplicate/ended dialogue diagnostics through authorized debug and lifecycle audit rows.

## Rusk Handoff Visibility

Rusk remains player-safe:

- Player payloads can mention combat risk and partial deeper-source information.
- Player payloads do not expose internal `future_supported` or combat routing metadata.

GM/dev debug now exposes the authored Rusk branch outputs and exit transition metadata, including `combat_pending`, `shrine_depth_unlocked`, `hollow_reaches_shrine_above`, and the hollow handoff status `future_supported_until_surface_threat_resolved`.

## Validation

Added:

- `backend/test/full-loop-gm-dev-visibility-regression.test.js`.

Relevant commands run in this pass:

- `node --check backend/src/routes/play.js`
- `node --check backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`
- `node --check backend/test/full-loop-gm-dev-visibility-regression.test.js`
- `node --test --test-concurrency=1 test/full-loop-gm-dev-visibility-regression.test.js`
- `node --test --test-concurrency=1 test/exploration-mechanics-debug-read-model.test.js test/exploration-mechanics-visibility-boundary.test.js test/dialogue-debug-workspace.test.js test/full-loop-output-consistency-regression.test.js test/stage5j3-npc-presence.test.js`
- `node --test --test-concurrency=1 test/dialogue-greyvale-fixture-regression.test.js test/full-loop-action-lifecycle-regression.test.js`
- `node --test --test-concurrency=1 test/dialogue-greyvale-handoff-regression.test.js`
- `npm run --silent cli -- validate-content --path ../content/worlds/greyvale`
- `flutter test test/dialogue_debug_workspace_test.dart test/exploration_mechanics_inspector_test.dart test/exploration_mechanics_visibility_boundary_test.dart test/player_ui_recovery_test.dart`
- `flutter analyze`

## Remaining Gaps

- There is still no single unified full-loop GM/dev timeline that joins exploration debug, dialogue debug, latest result, archive/search, and action-window state into one inspector. This remains appropriate for Stage 6B.13.6 or later GM tooling.
- Frontend GM/dev coverage remains targeted widget coverage rather than a deployed-browser permission smoke.
- Rusk combat remains `combat_pending`/future-supported; full combat handoff belongs to later combat work.
