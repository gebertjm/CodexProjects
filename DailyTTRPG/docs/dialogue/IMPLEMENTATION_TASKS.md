# Dialogue Focus/Commit Implementation Tasks

This file splits future work into ordered Codex tasks. Each task should be small, testable, and mergeable.

## Task 0 - Planning/Spec Package

Goal:

- Create the docs-only planning package.

Files/modules likely touched:

- `docs/dialogue/*`

Acceptance criteria:

- Planning docs exist.
- No runtime code changed.
- No migrations created.
- Future tasks are clearly split.

Tests to add/run:

- No code tests required.
- Run markdown lint only if repo provides it.

Non-goals:

- Runtime implementation.
- Database migrations.
- UI changes.
- Production behavior changes.

## Task 1 - Shared Interaction Core + Dialogue Adapter Skeleton

Goal:

- Extract or define reusable interaction primitives without changing behavior.
- Add dialogue adapter skeleton that normalizes dialogue Focus/Commit content into primitives.

Files/modules likely touched:

- `backend/src/services/interactionCore/*`
- `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitTypes.js`
- `backend/test/dialogue-focus-commit-adapter.test.js`

Acceptance criteria:

- Shared primitive names exist.
- Dialogue adapter maps conversation surface, passive insight, clarifying questions, committed moves, and exits into shared primitive shape.
- Existing exploration behavior is unchanged.
- Existing dialogue graph behavior is unchanged.
- Adapter code is pure normalization only and is not wired into runtime routes or persistence.

Tests to add/run:

- Unit tests for primitive normalization.
- Unit tests for dialogue adapter mapping.
- Existing Stage 6B.9 tests.

Non-goals:

- Database writes.
- API routes.
- Flutter UI.
- Runtime replacement.

## Task 2 - Schema + Validation

Goal:

- Add validation support for dialogue Focus/Commit JSON.

Files/modules likely touched:

- `backend/src/content/contentValidation.js`
- `backend/src/content/dialogueFocusCommitValidation.js`
- `backend/src/content/contentRepository.js`
- `backend/test/dialogue-focus-commit-validation.test.js`
- optional fixture files under `content/dialogue/greyvale`

Acceptance criteria:

- Legacy dialogue validates as before.
- Focus/Commit dialogue validates under legacy/playtest-ready profiles.
- Hard errors, warnings, and debug notices follow `VALIDATION_PLAN.md`.
- Unsafe generic fallback and hidden-source leaks are rejected.
- Build 2 implementation currently provides standalone validation in `backend/src/content/dialogueFocusCommitValidation.js`; importer/runtime wiring remains a later task.

Tests to add/run:

- Validation unit tests.
- Content package validation for Greyvale.
- Existing content validation regression.

Non-goals:

- Database migrations.
- Runtime resolution.
- UI.

## Task 3 - Database Migrations

Goal:

- Add database tables for dialogue records, transcripts, relationship state, audit, and annotation/correction lifecycle.

Files/modules likely touched:

- `db/init/033-stage-dialogue-focus-commit-persistence.sql`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js`
- `backend/src/db/queries/dialogueFocusCommit.js`
- `backend/test/dialogue-focus-commit-migration.test.js`

Acceptance criteria:

- Migration applies cleanly.
- Migration is idempotent with existing init style.
- Tables match approved subset of `MIGRATION_PLAN.md`.
- No runtime writes are enabled unless explicitly in this task.

Tests to add/run:

- Schema ensure tests.
- Full backend test with DB.

Non-goals:

- Player UI.
- GM/dev tooling.
- Full runtime behavior.

Build 3 implementation note:

- Added the persistence migration and schema helper only.
- Added contract tests for table creation, FK/index coverage, relationship state separation, visibility columns, and idempotent re-apply behavior.
- Did not add runtime writes, API endpoints, fixtures, or UI behavior.

## Task 4 - Dialogue Runtime MVP

Goal:

- Implement load, Clarifying Question resolution, preview, submit/resolve, and exits for a minimal dialogue Focus/Commit path.

Files/modules likely touched:

- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitService.js`
- `backend/src/services/dialogueFocusCommit/clarifyingQuestionService.js`
- `backend/src/services/dialogueFocusCommit/socialMovePreviewService.js`
- `backend/src/services/dialogueFocusCommit/socialMoveResolutionService.js`
- `backend/src/services/dialogueFocusCommit/dialogueExitService.js`
- `backend/src/routes/playDialogueRoutes.js`
- `backend/src/server.js`

Acceptance criteria:

- Player can load active dialogue scene.
- Clarifying Question resolves without consuming beat.
- Preview resolves committed move and handles overlap.
- Submit/resolve consumes committed move according to configured dialogue window behavior.
- Existing dialogue graph runtime still works.

Tests to add/run:

- API tests for load/resolve/preview/submit/exit.
- Overlap warning tests.
- Hidden-truth tests.
- Existing backend regression.

Non-goals:

- Full transcript/completed record system beyond minimal required records.
- GM/dev workspace.
- Annotation/correction lifecycle.

## Task 5 - Relationship/Social State Runtime

Goal:

- Implement registered relationship/social state reads, writes, visibility, and audit.

Files/modules likely touched:

- `backend/src/services/dialogueFocusCommit/relationshipStateService.js`
- `backend/src/services/dialogueFocusCommit/socialMoveResolutionService.js`
- `backend/src/services/dialogueFocusCommit/dialogueDiagnosticsService.js`
- `backend/test/dialogue-relationship-state.test.js`

Acceptance criteria:

- Relationship definitions load.
- Reads/writes validate scope and field.
- Social move outcomes can apply registered writes.
- Audit records are created.
- Player-safe reads omit hidden values.
- GM/dev reads require capability.

Tests to add/run:

- Relationship state unit/integration tests.
- Hidden visibility tests.
- Social move branch tests.

Non-goals:

- Correction lifecycle.
- Broad UI beyond safe read-model fields.

## Task 6 - Transcript/Completed Records/Summaries/Search

Goal:

- Persist active transcripts, completed dialogue records, deterministic summaries, and safe search index entries.

Files/modules likely touched:

- `backend/src/services/dialogueFocusCommit/dialogueTranscriptService.js`
- `backend/src/services/dialogueFocusCommit/completedDialogueRecordService.js`
- `backend/src/services/dialogueFocusCommit/dialogueSummaryService.js`
- `backend/src/services/dialogueFocusCommit/dialogueSearchService.js`
- `backend/src/routes/playDialogueRoutes.js`
- `backend/test/dialogue-transcript-records.test.js`

Acceptance criteria:

- Transcript turns persist.
- Completed record is created on dialogue end.
- Summary is deterministic and player-safe.
- Player search sees only safe completed records.
- GM/dev search can be added with capability, if included.

Tests to add/run:

- Transcript and completed record integration tests.
- Summary safety tests.
- Search visibility tests.

Non-goals:

- AI summaries.
- Annotation/correction lifecycle.
- Full player UI.

## Task 7 - Player UI

Goal:

- Add dialogue player UI using typed API models.

Files/modules likely touched:

- `apps/player_app/lib/api/models.dart`
- `apps/player_app/lib/api/api_client.dart`
- `apps/player_app/lib/dialogue/*`
- route integration in existing app shell/router

Acceptance criteria:

- Conversation surface renders.
- Passive Social Insight renders safely.
- Clarifying Questions resolve and persist.
- Social move composer previews, handles overlap, and submits.
- Exits render and work.
- Transcript/reference is collapsed.
- No GM/dev data appears.

Tests to add/run:

- Flutter model tests.
- Widget tests for key UI states.
- `flutter test`
- `flutter analyze`
- `flutter build web`

Non-goals:

- GM/dev workspace.
- Annotation/correction UI.

## Task 8 - GM/Dev Debug Workspace

Goal:

- Add authorized diagnostic read APIs and UI panels.

Files/modules likely touched:

- `backend/src/services/dialogueFocusCommit/dialogueDiagnosticsService.js`
- `backend/src/routes/devDialogueRoutes.js`
- `apps/player_app/lib/dialogue/dialogue_dev_workspace.dart`

Acceptance criteria:

- Normal players cannot call or see diagnostics.
- Dev/GM can inspect scene state, availability, preview mapping, relationship state, transcript, audit, validation, and test paths.
- No secrets/tokens exposed.

Tests to add/run:

- Unauthorized/authorized API tests.
- Flutter visibility tests.

Non-goals:

- Destructive repair tools.
- Correction publish workflow.

Build 8 implementation note:

- Added `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`.
- Added `GET /api/dev/dialogue-debug` to the existing dev router and endpoint listing.
- Added `DialogueDebugWorkspace` Flutter models and `PlayerDashboardApi.getDialogueDebugWorkspace`.
- Added `/play/dev/dialogue-debug` route and `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`.
- Added a link from the existing Campaign Diagnostics page to Dialogue Debug.
- Added backend and Flutter focused tests for permission boundaries, panel rendering, selection linking, and player-facing debug exclusion.

Deferred to Build 9/10:

- Annotation/correction approval/edit/reject/suppress/retract workflows.
- Full forced-outcome dialogue path harness.
- Destructive repair actions.

## Task 9 - Annotation/Correction Lifecycle

Goal:

- Implement structured annotation and correction lifecycle for dialogue content/play records.

Files/modules likely touched:

- `backend/src/services/dialogueFocusCommit/annotationCorrectionService.js`
- `backend/src/routes/devDialogueRoutes.js`
- `apps/player_app/lib/dialogue/dialogue_annotation_workspace.dart`

Acceptance criteria:

- Annotation chains can be created and updated by authorized accounts.
- Corrections can be drafted, reviewed, superseded, and published.
- Broken lifecycle links are rejected.
- Historical player-facing records are not silently rewritten.

Tests to add/run:

- Lifecycle API tests.
- Visibility tests.
- Audit tests.

Non-goals:

- Automated content rewriting.
- Normal player access.

Build 9 implementation note:

- Added `backend/src/services/dialogueFocusCommit/dialogueAnnotationCorrectionService.js`.
- Added GM/dev lifecycle write routes under `/api/dev/dialogue-lifecycle/*`.
- Player archive detail now includes only active approved player-facing lifecycle records.
- Dialogue search index text refreshes when active player-facing lifecycle understanding changes.
- The GM/dev debug workspace now reads full lifecycle chains, including pending, rejected, suppressed, superseded, and retracted records.
- Flutter `AnnotationCorrectionChainPanel` renders chain history read-only; workflow action buttons remain deferred.
- Validation now blocks pending player-facing lifecycle records, missing suppression/retraction metadata, hidden/debug source exposure, and obvious internal/debug terms in player-facing lifecycle text.

Deferred to Build 10/11:

- Full forced-outcome path harness.
- Large Greyvale dialogue regression fixtures.
- Rich GM/dev approval/edit/reject/suppress/retract button workflows in Flutter.

## Task 10 - Full Path Test Harness

Goal:

- Build deterministic end-to-end tests for dialogue Focus/Commit.

Files/modules likely touched:

- `backend/test/dialogue-focus-commit-e2e.test.js`
- fixture helpers under `backend/test/helpers`
- optional Greyvale fixture content

Acceptance criteria:

- Test loads dialogue.
- Resolves Passive Social Insight deterministically.
- Resolves Clarifying Question.
- Previews and submits Committed Social Move.
- Applies relationship/knowledge updates.
- Creates transcript and completed record.
- Exits dialogue.
- Verifies player and GM/dev visibility boundaries.

Tests to add/run:

- New full path test.
- Full backend suite.

Non-goals:

- Broad content expansion.

Build 10 implementation note:

- Added `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js`.
- Added `POST /api/dev/dialogue-path-test/run`.
- Updated GM/dev debug `test_paths` read model with available harness modes and run endpoint.
- Updated `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart` so `TestPathsPanel` can run harness modes and render ordered step results.
- Added `PlayerDashboardApi.runDialoguePathTest`.
- Added backend coverage in `backend/test/dialogue-path-test-harness.test.js`.
- Expanded Flutter GM/dev widget coverage in `apps/player_app/test/dialogue_debug_workspace_test.dart`.

The harness currently uses the active GM/dev test context and therefore requires explicit mutation acknowledgement for non-validation modes. Build 11 Greyvale fixture work can add broader content-path coverage and, if needed, a more isolated fixture runner.

## Task 11 - Greyvale Fixtures + Regression Pass

Goal:

- Add or upgrade a minimal Greyvale dialogue fixture, likely Elin memory dialogue, to prove the system.

Files/modules likely touched:

- `content/dialogue/greyvale/*`
- `content/campaigns/shadows_grey_road/knowledge/*`
- `content/campaigns/shadows_grey_road/quests/*`
- `backend/test/dialogue-greyvale-fixture.test.js`
- docs/manual QA checklist

Acceptance criteria:

- Fixture uses conversation surface, passive insight, clarifying questions, committed moves, exits, relationship state, transcript/completed records.
- Content validation passes.
- 1 deterministic success path passes.
- 1 deterministic failure/withheld-info path passes if feasible.
- No hidden truth leaks.

Tests to add/run:

- Content validation/import dry run.
- Backend regression.
- Flutter regression if UI exists.

Non-goals:

- Full Greyvale dialogue expansion.
- AI-generated dialogue.

Build 11 implementation note:

- Added `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json` as the authored Greyvale Dialogue Focus/Commit fixture.
- Added `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json` for named path harness expectations.
- Added `backend/test/fixtures/greyvale-dialogue-fixtures.js` to load authored content fixtures into runtime tests.
- Added `backend/test/dialogue-greyvale-fixture-regression.test.js` covering validation, runtime loading, Clarifying Questions, Committed Social Moves, overlap warnings, fallback success/failure/exhaustion, relationship state/audit, transcripts, completed records, summaries, lifecycle visibility, archive/search safety, GM/dev debug data, and path harness named modes.
- Added `docs/dialogue/GREYVALE_FIXTURES.md`.
- Updated fallback runtime handling so forced GM/dev/test fallback failure uses authored `generic_fallback.failure_behavior` and increments failed fallback usage without affecting normal player fallback behavior.

Deferred after Build 11:

- Production importer/registry wiring for Dialogue Focus/Commit scene JSON.
- Isolated sandbox execution for path harness runs instead of active GM/dev test context.
- Broader Greyvale dialogue content expansion beyond the Elin regression fixture.

## Task 12 - Greyvale Dialogue Expansion Pass

Goal:

- Convert and expand existing Greyvale legacy dialogue into authored Dialogue Focus/Commit scenes after human creative briefs are prepared.

Planning source:

- See `docs/dialogue/GREYVALE_DIALOGUE_EXPANSION_PLAN.md`.

Sub-builds:

- `6B.12.0` - Audit existing Greyvale dialogue and build conversion plan.
- `6B.12.1` - Author Greyvale dialogue creative briefs. This requires human-authored direction before Codex generates final scene JSON.
- `6B.12.2` - Tomas + Elin integration conversion.
- `6B.12.3` - Mara + Lysa conversion.
- `6B.12.4` - Garren conversion.
- `6B.12.5` - Rusk conversion.
- `6B.12.6` - Dialogue regression, visibility, and path harness pass.

Files/modules likely touched in later sub-builds:

- `content/dialogue_focus_commit/greyvale/*`
- `content/dialogue/greyvale/*` as source material only unless production registration is intentionally changed
- `content/worlds/greyvale/manifest.json` or future Focus/Commit registry/import wiring if approved
- `backend/test/fixtures/greyvale-dialogue-fixtures.js`
- `backend/test/dialogue-greyvale-fixture-regression.test.js`
- dialogue path harness expected-path fixtures
- player and GM/dev dialogue visibility tests

Acceptance criteria for Stage 6B.12:

- Legacy Greyvale dialogue facts, clues, objectives, NPC tone, and consequences are preserved.
- Converted scenes use Focus/Commit structure rather than recreating legacy node graphs verbatim.
- Player-facing output stays clean and excludes hidden/debug mechanics.
- GM/dev debug workspace can inspect routing, checks, state, transcripts, lifecycle records, and expected paths.
- Production importer/registry behavior is explicitly decided before legacy files are replaced or bypassed.

Build 12.0 implementation note:

- Added `docs/dialogue/GREYVALE_DIALOGUE_EXPANSION_PLAN.md` as a docs-only audit and conversion plan.
- Inventoried the six production legacy Greyvale dialogue files and the Elin Focus/Commit fixture pair.
- Documented that legacy dialogue is currently imported by the Greyvale manifest, while the Focus/Commit Elin scene is currently test-loaded through fixture helpers.
- Deferred all final scene JSON generation until Stage 6B.12.1 creative briefs exist.

Build 12.1 implementation note:

- Added the creative brief package under `dialogue/greyvale-briefs/`.
- Added overview guidance in `dialogue/greyvale-briefs/README.md`.
- Added per-NPC briefs for Tomas Rell, Elin Harrow, Mara Vellin, Lysa Fen, Garren Holt, and Rusk.
- Kept the briefs docs-only: no production JSON, manifests, runtime, frontend, tests, or player-facing behavior changed.

Build 12.2 implementation note:

- Added the Tomas Rell Focus/Commit conversion fixture at `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json`.
- Added Tomas expected path metadata at `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json`.
- Preserved Elin Focus/Commit content unchanged as the new-format exemplar.
- Updated Greyvale dialogue fixture exports so Tomas and Elin can be registered together in tests.
- Added non-DB Tomas content validation in `backend/test/dialogue-greyvale-tomas-content.test.js`.
- Expanded the DB-backed Greyvale fixture regression test with Tomas runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Updated Tomas/Elin briefs and the Stage 6B.12 plan with canonical IDs and routing decisions.

Build 12.3 implementation note:

- Added the Mara Vellin Focus/Commit conversion fixture at `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json`.
- Added Mara expected path metadata at `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json`.
- Added the Lysa Fen Focus/Commit conversion fixture at `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json`.
- Added Lysa expected path metadata at `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json`.
- Updated Greyvale dialogue fixture exports so Elin, Tomas, Mara, and Lysa can be registered together in tests.
- Added non-DB Mara/Lysa content validation in `backend/test/dialogue-greyvale-mara-lysa-content.test.js`.
- Expanded the DB-backed Greyvale fixture regression test with Mara/Lysa runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Updated Mara/Lysa briefs and the Stage 6B.12 plan with canonical IDs, misleading-clue mappings, and Dunmere-only transition decisions.

Build 12.4 implementation note:

- Added the Garren Holt Focus/Commit conversion fixture at `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json`.
- Added Garren expected path metadata at `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json`.
- Updated Greyvale dialogue fixture exports so Elin, Tomas, Mara, Lysa, and Garren can be registered together in tests.
- Added non-DB Garren content validation in `backend/test/dialogue-greyvale-garren-content.test.js`.
- Expanded the DB-backed Greyvale fixture regression test with Garren runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Mapped legacy `clue_garren_observation` to canonical `tracks_converge_on_shrine`, while preserving `shrine_path_known`, `understanding_medium`, `garren_respected`, and `garren_accused` as authored flags/metadata.
- Kept the live dialogue route handoff to `old-forest-path`; direct shrine transition remains represented by route knowledge plus `shrine-ruins` scene-unlock metadata rather than a player-facing jump.

Build 12.5 implementation note:

- Added the Rusk Focus/Commit conversion fixture at `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.scene.json`.
- Added Rusk expected path metadata at `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json`.
- Updated Greyvale dialogue fixture exports so Elin, Tomas, Mara, Lysa, Garren, and Rusk can be registered together in tests.
- Added non-DB Rusk content validation in `backend/test/dialogue-greyvale-rusk-content.test.js`.
- Expanded the DB-backed Greyvale fixture regression test with Rusk runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Mapped legacy `clue_bandit_instability` to canonical `bandits_not_fully_self_directed`, while preserving `shrine_depth_unlocked`, `understanding_high`, `rusk_confronted_directly`, and `subterranean-hollow` scene-unlock intent as authored outputs/metadata.
- Kept combat handoff as `combat_pending` metadata tied to `shrine-rusk-confrontation`; direct dialogue-to-combat start remains future-supported.
- Kept hollow routing future-supported through `descend-beneath-the-shrine`, which still requires `surface_threat_resolved` plus `shrine_depth_unlocked`.

Build 12.6 implementation note:

- Added `backend/test/dialogue-greyvale-stage6b12-regression.test.js` as the final non-DB Greyvale dialogue regression inventory.
- The suite checks all six converted scene files, expected-path files, schema validation, registry id/slug aliases, required named paths, canonical references, relationship/social state definitions, player-facing archive/search safety, continuity anchors, and legacy file retention.
- Kept DB-backed runtime/path-harness coverage in `backend/test/dialogue-greyvale-fixture-regression.test.js` as the source for live CQ, CSM, fallback, exit, archive/search, GM/dev debug, permission, and visibility assertions.
- Documented remaining future-supported items: production importer registration for Focus/Commit JSON, isolated path-harness sandboxing, direct Rusk combat start, and frontend UI regression expansion.

## Task 13 - Post-Dialogue Full Loop Stabilization

Goal:

- Harden the integrated Greyvale play loop after the dialogue expansion pass.

Planning source:

- See `docs/full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md`.

Sub-builds:

- `6B.13.0` - Full Loop Stabilization Audit & Test Plan.
- `6B.13.1` - Exploration to Dialogue Handoff Hardening.
- `6B.13.2` - Action Window, Preview, Submit, and Resolution Lifecycle Hardening.
- `6B.13.3` - Knowledge, History, Objective, Archive, and Search Consistency.
- `6B.13.4` - Player UI State and Error Recovery Pass.
- `6B.13.5` - GM/Dev Full Loop Inspector and Visibility Regression.
- `6B.13.6` - Greyvale Full Loop Regression Suite.

Build 13 should not add new Greyvale content, implement open-world navigation, overhaul combat, or consolidate the shared interaction core.

## Build 4 Completion Note

Implemented in this repo:

- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- Authenticated routes under `backend/src/routes/play.js`
- Endpoint listing updates in `backend/src/app.js`
- Runtime coverage in `backend/test/dialogue-focus-commit-runtime.test.js`

Build 4 intentionally keeps dialogue scene loading behind a server-side registry. Future content work should connect validated JSON packages/importer output to that loader without allowing client-authored runtime behavior.

Build 5 should start from the existing runtime hooks for authored `knowledge_grants`, `state_changes`, and relationship writes, then replace the current minimal bookkeeping with the full relationship/social state service and audit behavior.

## Build 5 Completion Note

Implemented in this repo:

- `backend/src/services/dialogueFocusCommit/dialogueRelationshipStateService.js`
- Runtime integration in `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- Relationship validation tightening in `backend/src/content/dialogueFocusCommitValidation.js`
- Regression coverage in `backend/test/dialogue-relationship-state-runtime.test.js` and expanded validation tests

The service now initializes persistent NPC state separately from scene-local posture, evaluates authored state reads for availability, applies authored writes from Clarifying Questions, Committed Social Moves, and exits, and records relationship/social audit rows. Player-facing responses expose only authored/perceived update summaries.

Build 6 should treat transcript/completed records/summaries/search as the next layer and should reuse the relationship audit links rather than recomputing relationship state history from player-facing summaries.

## Build 6 Completion Note

Implemented in this repo:

- `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`
- Runtime integration in `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- Player archive/search routes in `backend/src/routes/play.js`
- Endpoint listing updates in `backend/src/app.js`
- Archive/runtime coverage in `backend/test/dialogue-archive-runtime.test.js`
- Summary/search/visibility validation tightening in `backend/src/content/dialogueFocusCommitValidation.js`

The archive service now creates structured transcript turns, finalizes compact completed dialogue records, prefers authored summaries, generates conservative summaries only from player-facing sources when needed, indexes player-facing search text, and keeps GM/dev transcript access behind an explicit backend-only service boundary.

Build 7 should consume these backend read models in the player UI. It should not expose GM/dev metadata, relationship audit internals, preview confidence, or hidden-only source links through player-facing archive/search views.

## Build 7 Completion Note

Implemented in this repo:

- `apps/player_app/lib/campaign/dialogue_scene_page.dart`
- Dialogue models in `apps/player_app/lib/api/models.dart`
- `DialogueApi` in `apps/player_app/lib/api/api_client.dart`
- Player-safe current transcript route in `backend/src/routes/play.js`
- `/play/campaign/dialogue` route wiring in `apps/player_app/lib/main.dart`
- Dialogue navigation entry from `apps/player_app/lib/campaign/campaign_scene_page.dart`
- Widget/model coverage in `apps/player_app/test/dialogue_ui_test.dart` and `apps/player_app/test/models_test.dart`

The player UI now renders conversation surface, Latest Development, Passive Social Insight, Clarifying Questions, Committed Social Move preview/submit, authored exits, and a collapsed transcript/archive section. GM/dev workspace, annotation/correction UI, NPC profile recap UI, and full Greyvale path fixtures remain deferred.

Build 8 should add authorized GM/dev workspace panels without reusing the player archive route for debug data.
