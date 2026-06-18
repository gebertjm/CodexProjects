# Dialogue Test Plan

This document defines a future test strategy for Dialogue Focus/Commit.

## Test Principles

- Use real services and persisted state once migrations exist.
- Keep unit tests available before migrations exist.
- Separate player-safe visibility tests from GM/dev visibility tests.
- Prefer deterministic fixtures and fixed clocks.
- Do not assert long prose unless intentionally stable.
- Assert structured IDs, state changes, visibility, and provenance.

## Recommended Fixtures

### Greyvale/Elin Memory Dialogue Fixture

Use an Elin memory dialogue because Greyvale already has:

- active `content/dialogue/greyvale/elin-fragments-of-memory.json`
- active Grey Road Inn and Elin memory scenes
- survivor identity/knowledge boundaries
- social pressure around the caravan attack
- useful relationship state examples such as trust, pressure, fear, and guardedness

Fixture path idea:

```text
content/dialogue/greyvale/elin-memory-focus-commit.fixture.json
```

Suggested deterministic path:

1. Load Elin conversation surface.
2. Passive Social Insight checks whether the character notices she avoids the shrine.
3. Clarifying Question asks what she remembers first.
4. Clarifying Question asks what changed when the road went quiet.
5. Committed Social Move presses gently about the shrine bell.
6. Relationship trust increases on success or pressure increases on failure.
7. Dialogue exits back to the Grey Road Inn.
8. Completed dialogue record summarizes safe outcomes.

## Schema Validation Tests

Cover:

- Legacy graph dialogue still validates.
- Focus/Commit dialogue with minimum valid fields passes.
- Missing required IDs fail.
- Duplicate IDs fail.
- Checked Passive Social Insight missing ability/skill/DC fails.
- Checked Clarifying Question missing reachable result text fails.
- Checked Committed Social Move missing reachable outcome text fails.
- Invalid check visibility fails.
- Invalid committed follow-up resolution fails.
- State write missing scope fails.
- Ambiguous shorthand relationship read fails.
- Unregistered relationship field fails.
- Invalid ladder value fails.
- Missing override mapping fails.
- Unsafe generic fallback fails.
- Broken annotation/correction lifecycle links fail.
- Player-facing field using hidden-only source fails.
- Authoring quality warnings do not fail legacy profile.
- Debug notices emit for reachability/tooling gaps.

## Dialogue Scene Loading Tests

Cover:

- Auth required.
- No active character handled safely.
- No active campaign handled safely.
- Active dialogue scene loads.
- Existing graph dialogue still loads through old path.
- Conversation surface is character-safe.
- Unknown NPC true names remain hidden.
- Known NPC identity uses learned name.
- Hidden participants are excluded.
- Passive Social Insight first result is persisted.
- Passive Social Insight failure does not leak under `success_only`.
- Clarifying Questions are listed when visible.
- Hidden Clarifying Questions are omitted.
- Committed Social Moves are listed when visible.
- Hidden/unavailable moves are omitted or only shown in dev diagnostics.
- Exits are listed when visible.

## Clarifying Question Resolution Tests

Cover:

- Unauthenticated request rejected.
- Wrong account/character rejected.
- Scene/session mismatch rejected.
- Hidden question rejected safely.
- Unavailable question rejected safely.
- No-check question resolves immediately.
- Checked question runs shared check engine.
- `visible` check shows compact mechanics label.
- `hidden` check suppresses mechanics.
- `success_only` failure suppresses visible detail.
- `narrative_only` returns prose without mechanics.
- Result persists.
- Reopen returns same persisted result without reroll.
- Concurrent open does not duplicate result or event.
- No knowledge/state grant creates no canonical event.
- Authored knowledge grant creates event and updates Knowledge Journal.
- Authored relationship write creates audit record.
- Clarifying Question does not consume dialogue beat/window.
- Resolved question appears in transcript/reference if policy allows.
- Surface-only result does not spam campaign history.

## Committed Social Move Preview Tests

Cover:

- Natural text resolves to visible authored move.
- Selected move takes priority over ambiguous text.
- Selected target is validated server-side.
- Hidden move cannot be targeted.
- Generic fallback only applies to safe intents.
- Generic fallback exhaustion returns guidance.
- Missing/unsafe fallback returns invalid.
- Ambiguous natural text asks for clarification.
- Multi-intent text asks for one committed move.
- Checked move preview includes safe check preview.
- Relationship read constraints affect availability.
- Overlap with unresolved Clarifying Question returns blocking choice.
- Overlap with already resolved question can offer committed follow-up.
- Continue-as-committed applies authored/default check resolution.
- Preview does not expose hidden relationship values or secret DCs.

## Committed Social Move Resolution Tests

Cover:

- Submit requires valid preview state.
- Backend revalidates move before submit.
- Submit consumes/locks dialogue beat/window.
- No-check move resolves deterministic authored outcome.
- Checked success applies success branch.
- Checked failure applies failure branch.
- Hidden check failure does not leak.
- Relationship writes are applied through registered state definitions.
- Relationship audit record is created.
- Knowledge grants update Knowledge Journal.
- Objective/state changes apply only when authored.
- Transcript turn is written.
- Completed record is created when dialogue ends.
- Duplicate submit does not duplicate turn, audit, or completed record.
- Stale submitted move after state change is rejected or requires re-preview.

## Check And Branch Tests

Cover modes:

- standard
- advantage
- take_20 if supported
- passive
- hidden/gm_roll if supported

Cover visibility:

- visible
- hidden
- success_only
- narrative_only

Cover:

- Success branch.
- Failure branch.
- No-check branch.
- Partial/critical future branch should fail validation if referenced but unsupported.

## Generic Fallback Tests

Cover:

- Safe fallback handles ordinary ask/listen/reassure.
- Unsafe fallback cannot reveal a clue.
- Fallback cannot write relationship state without authored rule.
- Fallback cannot transition dialogue.
- Exhaustion limit prevents repetitive generic loops.
- Exhausted fallback gives safe guidance.
- Fallback transcript is compact.

## Relationship State Tests

Cover:

- Definition loads.
- Unregistered reads/writes rejected.
- Ladder bounds enforced.
- Numeric/ranged fields validated.
- Player-safe read returns perceived cues only.
- GM/dev read returns full authorized value.
- Write requires scope, target, field, operation, visibility, and reason.
- Audit record stores old/new values and provenance.
- Hidden state does not leak through surface, preview, transcript, history, or search.

## Transcript And Completed Record Tests

Cover:

- Transcript created on dialogue start.
- Surface turn recorded if policy requires.
- Clarifying Question turn recorded.
- Committed Social Move turn recorded.
- Exit turn recorded.
- Completed record created on terminal dialogue.
- Completed record links transcript and provenance.
- Player transcript omits GM-only turns.
- GM/dev transcript includes authorized debug rows.
- Completed record summary is deterministic and safe.
- Search index includes completed record safe text.

## Summaries Tests

Cover:

- Summary uses authored safe result text.
- Summary includes safe knowledge/objective changes.
- Summary includes visible relationship changes only.
- Summary excludes hidden motives, secret names, hidden DCs, and GM notes.
- Empty/no-change dialogue has a safe fallback summary.

## Annotation/Correction Tests

Cover:

- Annotation creates chain.
- Correction links to annotation.
- Broken lifecycle links rejected.
- Correction can supersede earlier correction.
- Draft/review/published statuses enforce transitions.
- Player-facing historical records are not silently rewritten.
- GM/dev can inspect correction chain by capability.
- Normal player cannot access annotation/correction endpoints.

## Exits And Transitions Tests

Cover:

- Visible exit appears.
- Hidden exit omitted.
- Unavailable exit rejected if called directly.
- Exit can end dialogue.
- Exit can return to scene.
- Exit can transition scene if authored.
- Exit can create completed record.
- Exit does not leak hidden future scene.

## Player Versus GM/Dev Visibility Tests

Player must not see:

- hidden NPCs
- unknown true names
- secret roles
- hidden relationship values
- GM notes
- secret DCs under hidden visibility
- failed hidden checks
- raw event payloads
- annotation/correction internals
- future content

GM/dev can see diagnostics only with server-side capability.

## Build 5 Relationship/Social State Runtime Tests

Implemented coverage now includes:

- Persistent NPC relationship state initializes separately from dialogue scene-local posture.
- Existing persistent state is not overwritten by scene load initialization.
- Committed Social Move branches can write persistent NPC relationship state.
- Failed checked branches can write scene-local posture/state.
- Clarifying Question results and dialogue exits can apply authored relationship/social writes.
- Relationship reads can gate Committed Social Move availability and update after authored writes.
- Write audit records are persisted.
- Player-facing dialogue responses do not expose raw old/new relationship audit values.

## Build 6 Transcript, Archive, Summary, And Search Tests

Implemented coverage now includes:

- Dialogue entry, Clarifying Question resolution, Committed Social Move submission, exit, and final summary append structured transcript turns.
- Non-canonical Clarifying Questions are transcripted without becoming campaign history entries by default.
- Completed dialogue records finalize with compact summaries and transcript links.
- Authored compact summaries are preferred over generated summaries.
- Conservative generated summaries use only player-facing result/exit/transcript text and exclude hidden/debug-only source text.
- Player-facing archive list/detail routes expose safe completed records and player transcript turns.
- Player-facing dialogue search indexes and returns player-safe transcript/summary text.
- NPC/profile recap hook metadata is recorded from safe completed summaries when authored.
- GM/dev archive access remains an explicit backend service boundary rather than a player route.
- Dialogue validation rejects hidden-only summary/search/recap sources in player-facing records.

## Build 7 Player UI Tests

Implemented coverage now includes:

- Dialogue runtime/read-model parsing for conversation surface, passive insight, Clarifying Questions, Committed Social Moves, exits, and archive records.
- Narrative-first component ordering with conversation surface before Latest Development, Passive Social Insight, Clarifying Questions, and composer.
- Clarifying Question cards show check type, hide exact DC, resolve once, and keep persisted results reopenable.
- Committed Social Move composer previews authored/no-check moves, shows beat-spend confirmation, assistance notes, and submits.
- Overlap warning UI exposes the three required choices: Ask Clarifying Question, Continue as Committed Social Move, and Edit Action.
- Authored exits render and call the exit action.
- Transcript/archive stays collapsed by default and expands to active or completed player-facing transcript content.
- Widget tests assert debug/audit strings are not rendered in the player-facing archive surface.

## Build 8 GM/Dev Debug Workspace Tests

Implemented coverage now includes:

- Normal player accounts receive `403` from `/api/dev/dialogue-debug`.
- Authorized GM/dev accounts receive scene state, availability, preview mapping, relationship/social state, transcript, audit timeline, validation, annotation/correction placeholder, and test-path placeholder data.
- Debug read model includes preview mapping internals and relationship audit details only through the GM/dev endpoint.
- Player-facing dialogue routes still omit debug workspace fields, preview confidence, raw runtime state, old/new relationship audit JSON, and GM/dev transcript references.
- Flutter widget tests render all required workspace panels.
- Availability selection links the selected interaction to related panel context.
- Transcript panel can toggle player-facing-only turns versus GM/dev visible turns.

## Build 9 Annotation/Correction Lifecycle Tests

Implemented coverage now includes:

- Authorized GM/dev users can create lifecycle chains and annotation/correction records for completed dialogue records.
- Normal player accounts receive `403` from lifecycle write APIs.
- Pending lifecycle suggestions are hidden from player-facing archive detail.
- Approve-with-edits preserves original text and publishes only the approved edited player-facing text.
- Generated corrections using forbidden hidden/audit/debug sources are rejected.
- Suppression requires an explicit suppression scope.
- Rejection preserves the rejection reason in GM/dev chain history.
- Replacement/supersession creates a linked active follow-up record without rewriting the original completed summary.
- Retraction preserves retraction reason and removes the record from player-facing archive output.
- Player-facing dialogue search is refreshed when active player-facing lifecycle understanding changes.
- GM/dev debug workspace can inspect full chain history, including pending, approved, rejected, and retracted records.
- Validation catches pending player-facing lifecycle records, missing suppression/retraction metadata, and obvious internal/debug terms in player-facing lifecycle text.
- Flutter widget tests render full lifecycle chain statuses in the GM/dev annotation/correction panel.

## Build 10 Dialogue Path Harness Tests

Implemented coverage now includes:

- Normal player accounts receive `403` from `/api/dev/dialogue-path-test/run`.
- `validation_only` mode returns validation output without requiring active runtime mutation acknowledgement.
- Runtime modes require `allow_active_runtime_mutation=true` so test-context mutation is explicit.
- Happy-path simulation uses real runtime services for dialogue entry, Clarifying Question resolution, social move preview, social move submission, exit/finalization, and lifecycle probe.
- Clarifying Question simulation does not increment committed social move count.
- Transcript effects report new committed move, result, exit, and summary turns.
- Relationship/social state diffs report authored state writes.
- Completed-record effects report compact summary and transcript linkage after exit.
- Lifecycle probe verifies pending records remain hidden and approved active records surface in player-facing archive output.
- Forced failure path exercises authored checked failure branches deterministically.
- Fallback path exercises generic fallback preview, submit, and exhaustion behavior.
- Player-facing snapshots are checked for debug-only field leaks.
- GM/dev Test Paths widget can run a simulation callback and render ordered steps, relationship diff counts, finding counts, final status, and export JSON.

## Build 11 Greyvale Fixture Regression Tests

Implemented coverage now includes:

- Authored Greyvale Dialogue Focus/Commit fixture at `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json`.
- Expected named path metadata at `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json`.
- Validation over Greyvale Focus/Commit scene fixtures with no hard errors.
- Greyvale conversation surface, Passive Social Insight, Clarifying Questions, Committed Social Moves, and exits load through player-facing runtime state.
- No-check Clarifying Question grants authored knowledge and unlocks another Clarifying Question.
- Checked Clarifying Question failure persists and does not reroll on reopen.
- Overlap warning appears for shallow submitted text that matches an unasked Clarifying Question.
- Continue-as-committed overlap path resolves to an authored deeper follow-up move with an advantage-mode check.
- No-check and checked Committed Social Moves preview and resolve.
- Generic fallback success, forced failure, usage, failed count, and exhaustion are covered.
- Relationship/social state writes produce GM/dev-visible audit data while player-facing responses remain safe.
- Transcript turns, completed dialogue records, authored summaries, conservative generated-summary fallback, archive detail, and player search are covered.
- Annotation/correction lifecycle regression verifies pending records stay hidden, approved edited text surfaces, and hidden audit/debug sources are rejected.
- GM/dev debug workspace returns scene state, availability, preview mapping, relationship state, transcript, lifecycle chains, audit timeline, validation, and test-path data behind the capability guard.
- Path harness runs named Greyvale modes: `happy_path`, `failure_path`, `fallback_path`, `minimal_interaction_path`, `max_clarifying_question_path`, `relationship_state_edge_case`, and `exit_transition_path`.
- Player-facing snapshots are checked for debug-only fields across the fixture regression.

## Stage 6B.12 Greyvale Dialogue Expansion Test Plan

The Stage 6B.12 conversion pass should use `docs/dialogue/GREYVALE_DIALOGUE_EXPANSION_PLAN.md` as its test planning source.

Converted Greyvale scenes should add or preserve tests for:

- Schema validation for every new `dialogue_focus_commit` scene.
- Runtime loading for Tomas, Elin, Mara, Lysa, Garren, and Rusk.
- Clarifying Question resolution, persistence, checked success/failure, and reopen behavior.
- Committed Social Move preview, submit, checked/no-check branch routing, refusal paths, and authored exits.
- Generic fallback only where explicitly enabled.
- Relationship/social state writes and GM/dev audit visibility.
- Knowledge, objective, reward, scene unlock, and transition outputs.
- Transcript turns, completed records, authored summaries, player archive, and player search.
- Annotation/correction lifecycle visibility where a scene includes lifecycle fixture data.
- Player-facing visibility boundaries for hidden DCs, raw relationship state, hidden requirements, debug route data, and GM/dev transcript metadata.
- GM/dev debug workspace visibility for checks, routing, state, transcript, lifecycle, validation, and path harness details.

Minimum expected path coverage by NPC:

- Tomas: happy clue path, minimal Elin referral, failure/refusal path, max Clarifying Question path.
- Elin: preserve existing seven named paths from the Elin Focus/Commit expected-paths fixture.
- Mara: bandit-assumption path, proof-demand path, refusal path, minimal exit.
- Lysa: trust path, suspicion clue path, pressure/refusal path, misleading-clue visibility path.
- Garren: respect unlock path, accusation failure path, shrine transition path, relationship state path.
- Rusk: instability reveal path, direct escalation path, deeper-source unlock path, combat transition path if supported.

Stage 6B.12.0 is docs-only, so it does not require code tests unless optional read-only validation is run.

Stage 6B.12.2 adds Tomas-specific coverage:

- `backend/test/dialogue-greyvale-tomas-content.test.js` validates Tomas and Elin Focus/Commit fixtures without a database.
- `backend/test/dialogue-greyvale-fixture-regression.test.js` now includes Tomas runtime, fallback, archive, GM/dev debug, and path-harness assertions when a database is available.
- Tomas expected paths live at `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json`.
- Elin expected paths remain unchanged at `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json`.

Stage 6B.12.3 adds Mara/Lysa-specific coverage:

- `backend/test/dialogue-greyvale-mara-lysa-content.test.js` validates Mara, Lysa, Tomas, and Elin Focus/Commit fixtures without a database.
- `backend/test/dialogue-greyvale-fixture-regression.test.js` now includes Mara/Lysa runtime, fallback, archive, GM/dev debug, and path-harness assertions when a database is available.
- Mara expected paths live at `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json`.
- Lysa expected paths live at `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json`.
- Mara's misleading clue mapping is `clue_mara_assumption` -> `dunmere_wants_simple_answer`.
- Lysa's misleading clue mapping is `clue_lysa_suspicion` -> `village_blames_hunter_and_road`.

Stage 6B.12.4 adds Garren-specific coverage:

- `backend/test/dialogue-greyvale-garren-content.test.js` validates Garren plus the prior Elin/Tomas/Mara/Lysa Focus/Commit fixtures without a database.
- `backend/test/dialogue-greyvale-fixture-regression.test.js` now includes Garren runtime, fallback, archive, GM/dev debug, and path-harness assertions when a database is available.
- Garren expected paths live at `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json`.
- Garren's legacy clue mapping is `clue_garren_observation` -> `tracks_converge_on_shrine`.
- Garren preserves `shrine_path_known`, `understanding_medium`, `garren_respected`, and `garren_accused` as authored flags/metadata.
- The live route handoff is `old-forest-path`; the `shrine-ruins` unlock is preserved as reward metadata instead of a direct dialogue exit.

Stage 6B.12.5 adds Rusk-specific coverage:

- `backend/test/dialogue-greyvale-rusk-content.test.js` validates Rusk plus the prior Elin/Tomas/Mara/Lysa/Garren Focus/Commit fixtures without a database.
- `backend/test/dialogue-greyvale-fixture-regression.test.js` now includes Rusk runtime, fallback, archive, GM/dev debug, and path-harness assertions when a database is available.
- Rusk expected paths live at `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json`.
- Rusk's legacy clue mapping is `clue_bandit_instability` -> `bandits_not_fully_self_directed`.
- Rusk preserves `shrine_depth_unlocked`, `understanding_high`, `rusk_confronted_directly`, and `shrine-rusk-confrontation` as authored flags/metadata.
- Combat handoff is `combat_pending`; the player-facing transition returns to `shrine-ruins` without directly starting combat.
- Hollow/deeper-source handoff remains future-supported through the existing `descend-beneath-the-shrine` gate.

Stage 6B.12.6 adds final Greyvale dialogue regression coverage:

- `backend/test/dialogue-greyvale-stage6b12-regression.test.js` inventories all six converted Focus/Commit scenes and expected-path fixtures without requiring a database.
- The suite validates `playtest_ready` schema, id/slug uniqueness, registry alias resolution by id and slug, required named path coverage, canonical NPC/scene/objective/reward references, relationship/social state writes, player-facing archive/search boundary terms, cross-dialogue continuity anchors, and legacy file retention.
- Local Elin exploration context ids `grey_road_inn_common_room` and `grey_road_inn_hollow_path` are intentionally accepted as local handoff targets.
- `backend/test/dialogue-greyvale-fixture-regression.test.js` remains the DB-backed runtime/path-harness coverage for entry, CQ/CSM resolution, fallback, exits, archive/search, GM/dev debug, permissions, and player visibility snapshots.
- No Flutter tests were added in this pass because no frontend files changed; frontend dialogue coverage remains deferred to a later UI-focused stabilization pass.

Stage 6B.13 planning:

- The post-dialogue full-loop stabilization plan lives at `docs/full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md`.
- Dialogue tests in 6B.13 should focus on exploration-to-dialogue handoff, dialogue exit back to current scene, stale preview/submit safety, completed-record/archive/search consistency after multiple Greyvale NPCs, and combined player-vs-GM visibility boundaries.
- The existing 6B.12 dialogue path harness remains the dialogue-specific foundation; 6B.13 should add clustered full-loop tests rather than rewriting the converted scenes.

Stage 6B.13.1 adds handoff-specific coverage:

- `backend/test/dialogue-greyvale-handoff-regression.test.js` covers Tomas -> Elin, Mara -> Lysa, Garren route, and Rusk escalation handoffs using real converted Greyvale Focus/Commit scenes.
- The suite verifies current-scene refresh after dialogue exit, completed-record/archive/search linkage, knowledge journal persistence, safe campaign history reads, and GM/dev debug permission gating.
- Completed dialogue stale operations are now covered: CQ after exit, CSM preview after exit, CSM submit after exit, and duplicate exit all return safe 409 errors without duplicate completed records.
- Player-facing dialogue previews assert that internal match confidence is hidden while check labels/DC visibility remain policy-safe.
- Open-world scene movement, global exploration-action locking during dialogue, and Flutter stale-dialogue UI handling remain deferred to 6B.13.2, 6B.13.4, and 6B.13.6 as appropriate.

Stage 6B.13.2 adds action/dialogue lifecycle coverage:

- `backend/test/full-loop-action-lifecycle-regression.test.js` covers dialogue lifecycle context for CQ, CSM preview, CSM submit, duplicate stale submit, exit, and cross-account token rejection.
- Dialogue lifecycle context consists of `dialogue_scene_state_id` plus `committed_social_move_count`; stale context returns a safe player-facing 409 without creating duplicate social move records.
- Clarifying Questions remain non-committing and reopen persisted answers without increasing committed social move count.
- Exploration action preview/submit lifecycle context now blocks exploration preview/submit while an active dialogue runtime is present for the same character/campaign.
- No frontend tests were added in 6B.13.2; UI submit disabling and refresh recovery remain deferred to 6B.13.4.

Stage 6B.13.3 adds output consistency coverage:

- `backend/test/full-loop-output-consistency-regression.test.js` covers knowledge dedupe, objective progression, completed dialogue single-write behavior, archive/search scoping, misleading/partial clue safety, and GM/dev output provenance permissions.
- Dialogue Focus/Commit CQ/CSM branches now apply existing authored objective, flag, and reward outputs through the shared adventure progression service.
- Tomas Pattern of Attacks remains a single player journal entry even when multiple dialogue paths grant it.
- Mara's Assumption and Lysa's Suspicion remain player-safe partial/misleading clues rather than confirmed truth.
- Garren shrine-route and Rusk deeper-source outputs now validate flags, scene-unlock rewards, objective state, and player-facing denylist boundaries.
- Frontend Knowledge Journal, objective, history, archive, and search widgets remain deferred to 6B.13.4.

Stage 6B.13.4 adds player UI recovery coverage:

- `apps/player_app/test/player_ui_recovery_test.dart` covers stale dialogue CSM preview/submit recovery, completed-dialogue state display, Knowledge Journal clue rendering, Campaign History output rendering, and rendered hidden-data denylist assertions.
- The Flutter dialogue UI now sends lifecycle context for CQs, CSM previews, CSM submits, and exits so stale conversation state returns the backend's safe lifecycle errors.
- Completed dialogue views no longer render active CQ/CSM/exit controls; they show a completion card with current-scene/archive recovery actions.
- Full multi-NPC archive/search page smoke remains deferred to 6B.13.6.

Stage 6B.13.5 adds GM/dev visibility regression coverage:

- `backend/test/full-loop-gm-dev-visibility-regression.test.js` covers normal-player denial, unauthenticated denial, authorized GM/dev exploration/dialogue debug, current-scene `include_debug` gating, archive/search scoping, inn/village/shrine Greyvale clusters, and player-facing denylist checks.
- `/api/play/current-scene?include_debug=true` now requires the existing `account.can_advance_beats` capability outside production; normal players can still receive safe `include_mechanics=true` details.
- Dialogue GM/dev debug availability now exposes authored move output metadata and authored exit transition metadata, including Rusk `combat_pending` and hollow `future_supported_until_surface_threat_resolved` routing, only through `/api/dev/dialogue-debug`.
- Targeted Flutter inspector tests continue to cover the dialogue debug workspace, exploration mechanics inspector, player visibility boundary, and player UI recovery surfaces.
- A unified full-loop GM/dev timeline remains deferred; current coverage uses the existing authorized exploration debug, dialogue debug, diagnostics, archive/search, and path-harness surfaces.

Stage 6B.13.6 adds the capstone Greyvale full-loop regression command:

- `backend/test/greyvale-full-loop-regression.test.js` covers the inn cluster, village cluster, and shrine cluster through real backend routes and imported Greyvale content.
- `npm run test:greyvale-full-loop` validates Greyvale content, then runs the focused backend suite covering converted dialogue paths, handoff, action lifecycle, output consistency, GM/dev visibility, player denylist checks, archive/search, and Greyvale exploration mechanics.
- Final status and command documentation live at `docs/full-loop/STAGE_6B_13_GREYVALE_FULL_LOOP_REGRESSION_STATUS.md`.
- Fully chained inn -> village -> shrine -> combat smoke remains deferred until navigation and combat handoffs are live enough to test without pretending future systems exist.

Stage 6B.14 planning:

- Shared interaction core consolidation planning lives at `docs/interaction-core/STAGE_6B_14_SHARED_INTERACTION_CORE_CONSOLIDATION_PLAN.md`.
- Stage 6B.14.1 contract coverage lives at `backend/test/interaction-core-contracts.test.js` and validates that Clarifying Questions/Free Focus and Committed Social Moves/Beat Actions map to shared internal categories without changing player-facing dialogue terms.
- Stage 6B.14.2 lifecycle helper coverage lives at `backend/test/interaction-core-lifecycle.test.js` and validates stale context, duplicate submit, non-committing inquiry, committed action, safe error, and GM/dev diagnostic helper behavior without rewiring dialogue runtime services.
- Stage 6B.14.3 visibility boundary coverage lives at `backend/test/interaction-core-visibility-boundary.test.js` and validates shared player projection, GM/dev projection, safe error projection, dialogue/exploration adapters, archive/search-shaped payloads, and hidden-data denylist paths.
- Stage 6B.14.4 output pipeline coverage lives at `backend/test/interaction-core-output-pipeline.test.js` and validates shared output bundle builders, provenance, normalization, dedupe/idempotency helpers, validation, player/GM projections, exploration/dialogue output adapters, and Rusk future-supported/combat-pending output visibility.
- Stage 6B.14.5 shared path harness coverage lives at `backend/test/interaction-core-path-harness.test.js` and validates shared content loading, expected-path readers, context helpers, inquiry/preview/submit/resolution assertions, forced-check wrappers, output assertions, visibility assertions, next-state assertions, and stale/duplicate lifecycle assertions.
- `npm run test:interaction-core` runs the deterministic non-DB interaction-core harness suite for 6B.14 helpers.
- Dialogue tests in 6B.14 should prove that shared contracts/helpers do not rename player-facing dialogue concepts, weaken Dialogue Focus/Commit path coverage, duplicate completed records, or leak GM/dev debug fields.
- Every 6B.14 sub-build should preserve `npm run test:greyvale-full-loop` before being considered complete.

Stage 6B.15 planning:

- Greyvale playable vertical-slice planning lives at `docs/greyvale/STAGE_6B_15_VERTICAL_SLICE_PLAN.md`.
- Dialogue acceptance for 6B.15 should prove that Tomas, Elin, Mara, Lysa, Garren, and Rusk are visible and usable from the Flutter web player route, not only schema-valid in backend fixtures.
- The 6B.15 dialogue route should stop safely at the Rusk shrine confrontation boundary while keeping combat/future-supported internals player-hidden and GM/dev inspectable.
- Stage 6B.15.4 memory-flow coverage lives at `backend/test/stage6b15-memory-recap-flow.test.js` and proves the canonical Greyvale route writes objective, knowledge, history, completed-record, archive/search, and resume recap surfaces without duplicate player-facing entries or hidden-data leaks.
- Stage 6B.15.7 GM/dev inspection coverage lives at `backend/test/stage6b15-gm-dev-slice-inspector.test.js` and verifies `/api/dev/greyvale-slice-inspector` permission gating, active dialogue diagnostics, Rusk endpoint handoff debug, path-harness readiness metadata, and reduced player-projection hidden-data checks.
- Stage 6B.15.6 Flutter coverage parses and renders the Rusk `slice_endpoint` review state, hides unsupported post-endpoint action controls, and verifies the rendered player UI does not expose `combat_pending`, `future_supported`, encounter ids, or other hidden/internal routing terms.
- Stage 6B.15.8 final acceptance coverage lives at `backend/test/greyvale-vertical-slice-acceptance.test.js` with semantic route fixture `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`; run it with `npm run test:greyvale-vertical-slice`.

## Regression Tests

Run future full regression:

- existing dialogue graph/session tests
- Surface / Focus / Commit exploration tests
- action composer preview/submit/edit tests
- beat/window timing tests
- history/knowledge tests
- NPC identity and knowledge filtering tests
- content validation/import tests
- Flutter model tests
- Flutter analyze
- Flutter build web

Current repo commands likely include:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
npm run build
```
