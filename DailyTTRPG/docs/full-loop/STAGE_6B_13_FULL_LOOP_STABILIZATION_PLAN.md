# Stage 6B.13 Full Loop Stabilization Plan

Stage 6B.13 is the post-dialogue hardening and integration stage for the Greyvale web play loop. It asks one practical question:

Can a player start Greyvale, move through exploration and dialogue, submit actions, receive results, accumulate knowledge, transition scenes, and continue playing without broken state, confusing UI, hidden-data leaks, duplicate outputs, or dead ends?

This is not a new content stage. It is not the combat overhaul, open-world navigation, shared interaction core consolidation, or final Greyvale playable vertical slice declaration. It prepares the system for Stage 6B.14 shared interaction cleanup and Stage 6B.15 vertical slice validation.

## 1. Scope And Purpose

Stage 6B.13 should harden the integrations that already exist:

- Exploration Surface / Focus / Commit from Stage 6B.9.
- Dialogue Focus / Commit from Stage 6B.10 and the Greyvale conversion from Stage 6B.12.
- Exploration mechanics visibility from Stage 6B.11.
- Player-facing web scene, action, dialogue, history, knowledge, objective, and archive UI.
- GM/dev debug tools and permission boundaries.

Stage 6B.13 should not:

- Add major runtime systems.
- Add new Greyvale story content.
- Rewrite converted dialogue or exploration scenes.
- Implement open-world navigation.
- Implement combat overhaul or combat web MVP.
- Consolidate shared interaction internals.
- Add database migrations unless a later sub-build proves a small fixture/metadata migration is unavoidable.
- Broaden player-facing mechanics or debug visibility.

## 2. Current Full-Loop Inventory

### Backend Systems

| Area | Current implementation | Known tests | Likely gaps | Target sub-build |
| --- | --- | --- | --- | --- |
| Campaign/adventure runtime | `adventureRuntimeService.js`, `adventureProgressionService.js`, `playerDashboardService.js`, Greyvale starter assignment | `stage6b3-campaign-dashboard.test.js`, `stage6a-sms-campaign-assignment.test.js`, `stage6a-sms-e2e.test.js` | Web-first Greyvale multi-scene smoke is still clustered rather than one full path | 6B.13.6 |
| Exploration scene runtime | `characterSceneViewService.js`, `sceneNarrationComposer.js`, `sceneContentOverlayService.js`, `freeFocusService.js` | `stage6b4-rich-scene-view.test.js`, `stage6b8-scene-narration-unit.test.js`, `stage6b9-surface-focus-commit-unit.test.js`, `exploration-greyvale-mechanics-regression.test.js` | Multi-scene progression from Broken Caravan to Inn/Village/Shrine remains thin | 6B.13.1, 6B.13.6 |
| Dialogue runtime | `dialogueFocusCommitRuntimeService.js`, `dialogueRelationshipStateService.js` | `dialogue-focus-commit-runtime.test.js`, `dialogue-relationship-state-runtime.test.js`, `dialogue-greyvale-fixture-regression.test.js` | Production importer wiring for Focus/Commit JSON remains deferred; exploration-to-dialogue entry needs full-loop proof | 6B.13.1 |
| Action preview | `actionComposerService.js`, dialogue preview functions in runtime service | `stage6b5-action-composer-unit.test.js`, `stage6b9-surface-focus-commit-unit.test.js`, dialogue runtime tests | Stale preview tokens and cross-tab replay need explicit regression | 6B.13.2 |
| Action submit | `webActionSubmissionService.js`, play routes, dialogue submit endpoints | `stage6b5-action-composer-unit.test.js`, `dialogue-focus-commit-runtime.test.js`, Greyvale fixture tests | Double-submit, stale action id, and refresh after submit need stronger tests | 6B.13.2 |
| Beat/action resolution | `beatAdvanceService.js`, `playerBeatResultService.js`, `resultBandService.js` | `stage6b6-player-beat-result-unit.test.js`, `stage6a-sms-e2e.test.js`, exploration Greyvale tests | Dialogue outcomes and latest development need cross-system consistency checks | 6B.13.2, 6B.13.3 |
| Action-window lifecycle | `beatWindowTimingService.js`, `webActionSubmissionService.js`, dev beat route | `stage6b5-action-composer-unit.test.js`, `web-beat-windows.md` manual checklist | Two-tab and refresh-mid-window state are likely under-tested | 6B.13.2 |
| Scene transitions | Content transitions plus runtime scene/current-scene handling | exploration Greyvale regression, scene tests | Direct dialogue-to-dialogue is intentionally not used; Rusk combat/hollow handoff is future-supported | 6B.13.1, 6B.13.6 |
| Knowledge service | `characterKnowledgeService.js`, living-world state services | `stage5j-living-world-state.test.js`, `stage6b4-rich-scene-view.test.js`, Greyvale dialogue tests | Idempotency across exploration and dialogue grants needs full-loop checks | 6B.13.3 |
| History/event service | `eventService.js`, `gameplayHistoryService.js`, campaign log queries | `stage6b4-rich-scene-view.test.js`, `recent-result-summary-unit.test.js`, exploration/dialogue regressions | Ordering between latest development, history, and completed dialogue records needs audit | 6B.13.3 |
| Objective/progression | `progressionService.js`, `adventureProgressionService.js`, quest content | dashboard and Greyvale regression tests | Objective progression can be tested more directly through full Greyvale clusters | 6B.13.3, 6B.13.6 |
| Completed dialogue records | `dialogueArchiveService.js` | `dialogue-archive-runtime.test.js`, `dialogue-greyvale-fixture-regression.test.js` | Player archive and current scene refresh after dialogue finalization need UI proof | 6B.13.3, 6B.13.4 |
| Transcript/summary/archive/search | `dialogueArchiveService.js`, play archive routes | archive/runtime tests, dialogue UI tests | Search ranking is out of scope, but safe indexing and duplicate records need full-loop checks | 6B.13.3 |
| Player read models | `/api/play/current-scene`, dialogue routes, history/knowledge endpoints | Stage 6B.4, dialogue, exploration visibility tests | Error payloads and stale-state messages need player-safe consistency | 6B.13.4 |
| GM/dev read models | `explorationMechanicsDebugReadModel.js`, `dialogueDebugWorkspaceService.js`, playtest diagnostics | Stage 6B.11 tests, `dialogue-debug-workspace.test.js`, path harness tests | No single full-loop inspector timeline joins exploration and dialogue yet | 6B.13.5 |
| Content importer/validator | `contentImporter.js`, validation modules, fixture helpers | content validation, Greyvale stage tests | Focus/Commit production import remains deferred and should be decided before 6B.15 | 6B.13.6 or 6B.14 |
| Path harness/test fixtures | `dialoguePathTestHarnessService.js`, Greyvale expected paths | `dialogue-path-test-harness.test.js`, `dialogue-greyvale-fixture-regression.test.js` | Harness mutates active test context rather than isolated sandbox | 6B.13.6 or later |

### Frontend Systems

| Area | Current implementation | Known tests | Likely gaps | Target sub-build |
| --- | --- | --- | --- | --- |
| Campaign dashboard | `dashboard_page.dart`, `campaign_preview_page.dart` | backend dashboard tests; limited Flutter model coverage | Full Greyvale start-to-scene UI smoke is thin | 6B.13.4, 6B.13.6 |
| Scene view | `campaign_scene_page.dart` | `models_test.dart`, exploration inspector tests | Refresh and stale submitted action UI need targeted tests | 6B.13.4 |
| Exploration surface/focus/action UI | Scene page, action composer, API models | exploration mechanics Flutter tests | Multi-scene Greyvale player UI coverage is representative, not live | 6B.13.4, 6B.13.6 |
| Action composer preview/submit | `campaign_scene_page.dart`, `api_client.dart`, models | `models_test.dart`, backend action tests | Disable/enable and double-click states need UI assertions | 6B.13.4 |
| Latest Development UI | `campaign_scene_page.dart` | backend latest result tests | Dialogue-generated latest development expectations need audit | 6B.13.3, 6B.13.4 |
| Dialogue UI | `dialogue_scene_page.dart` | `dialogue_ui_test.dart` | Live Greyvale dialogue navigation and stale-ended-dialogue recovery need more coverage | 6B.13.1, 6B.13.4 |
| Clarifying Question UI | `dialogue_scene_page.dart` | `dialogue_ui_test.dart` | Asked/reopened state survives mock tests; live refresh coverage remains thin | 6B.13.4 |
| Committed Social Move UI | `dialogue_scene_page.dart` | `dialogue_ui_test.dart` | Stale preview/submit UX needs stronger test coverage | 6B.13.2, 6B.13.4 |
| Completed dialogue summary/archive UI | Dialogue archive widgets/routes | `dialogue_ui_test.dart`, `models_test.dart` | Archive/search full loop after multiple NPCs needs service/UI smoke | 6B.13.3, 6B.13.4 |
| Knowledge journal/history/objectives | `campaign_knowledge_page.dart`, `campaign_history_page.dart`, scene widgets | backend route tests and model tests | Greyvale dialogue/exploration combined output display needs smoke | 6B.13.3, 6B.13.6 |
| Error/loading/empty states | Shared app/page widgets | limited route/model tests | Stale-state friendly errors need design and widget assertions | 6B.13.4 |
| GM/dev inspectors | `exploration_mechanics_inspector_page.dart`, `dialogue_debug_workspace_page.dart`, diagnostics page | exploration and dialogue debug Flutter tests | Full-loop GM/dev context is split across inspectors | 6B.13.5 |

### Content Systems

| Area | Current implementation | Known tests | Likely gaps | Target sub-build |
| --- | --- | --- | --- | --- |
| Greyvale exploration scenes | `content/scenes/greyvale/*`, overlays, transitions | Stage 6B.9/6B.11 tests | Live regression centers heavily on Broken Caravan | 6B.13.6 |
| Greyvale dialogue scenes | `content/dialogue_focus_commit/greyvale/*` fixtures; legacy files retained | Stage 6B.12 content/runtime/path tests | Production manifest registration not yet decided | 6B.13.6 or 6B.14 |
| Greyvale NPCs | `content/entities/greyvale/npcs/greyvale-npcs.json` | NPC presence and Greyvale tests | Schedule/presence across dialogue handoff needs smoke | 6B.13.1, 6B.13.6 |
| Greyvale knowledge/clues | `greyvale-living-world-knowledge.json` plus authored fixture grants | living-world and Greyvale tests | Canonical vs fixture-local clue ids need final production decision | 6B.13.3 |
| Greyvale objectives | `shadows-grey-road.json` | dashboard and content tests | Full objective path from local insight to shrine/hollow needs smoke | 6B.13.3, 6B.13.6 |
| Greyvale transitions | `greyvale-transitions.json` | exploration and dialogue tests | Combat/hollow target gating remains future-supported | 6B.13.6 |
| Environment modifiers | Greyvale environment content, environment services | Stage 5J.2 and 6B.11 tests | Full-loop player-safe environment changes need broader regression | 6B.13.6 |
| Path harness fixtures | Six dialogue expected-path files | Stage 6B.12 tests | No unified exploration+dialogue path harness yet | 6B.13.6 |
| Legacy dialogue files | `content/dialogue/greyvale/*.json` | Stage 6B.12 retention tests | Reachability after production registration decision remains open | 6B.13.6 or 6B.14 |

## 3. Representative Greyvale Journey Map

| Step | Entry condition | Backend service | Frontend surface | Player output | GM/dev output | State/output effects | Likely failure modes | Needed coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Start/load Greyvale | Authenticated account with active character | `playerDashboardService`, campaign assignment | Dashboard/campaign preview | Starter campaign visible | Diagnostics show active character/campaign | Campaign instance and objective state | Missing active character, stale dashboard | Dashboard + start smoke |
| B. Reach Grey Road entry | Campaign current scene exists | `characterSceneViewService` | Scene page | Scene surface and objective | Exploration inspector scene state | Current scene/action window | No action window, wrong scene | 6B.13.6 full-loop smoke |
| C. Read exploration surface | Current scene loaded | narration/environment/NPC services | Scene view | Player-safe surface | Surface sources, env/NPC debug | None unless passive outputs authored | Hidden data leak, missing surface | Visibility denylist |
| D. Use Free Focus | Visible Closer Look | `freeFocusService` | Scene Reference / Closer Looks | Safe result, persisted viewed state | Check/result/state debug | Knowledge/state if authored | Reroll on refresh, stale focus | Free Focus persistence tests |
| E. Submit exploration Beat Action | Open action window | `actionComposerService`, `webActionSubmissionService` | Action composer | Preview then submitted action | Preview mapping, result band expectations | Submitted action row | Stale preview, double submit | 6B.13.2 |
| F. Resolve and see Latest Development | GM/dev advance or scheduler | `beatAdvanceService`, `playerBeatResultService` | Latest Development card | Result summary | Result band/check/state debug | History/knowledge/objective/window | Duplicate result, missing next window | 6B.13.2/3 |
| G. Enter Tomas dialogue | Inn/common room lead available | dialogue runtime registry | Dialogue page | Tomas surface | Dialogue debug scene state | Active dialogue state | Dialogue scene not registered | 6B.13.1 |
| H. Gain Pattern of Attacks | CQ/CSM resolves | dialogue runtime, archive, knowledge | Dialogue result/summary | Road-pattern clue | CSM routing and state writes | `innkeeper_tracks_road_patterns` | Duplicate clue, hidden DC leak | 6B.13.3 |
| I. Get pointed toward Elin | Tomas exit/lead | dialogue runtime/transition | Dialogue exits/scene page | Lead to Elin/survivor | Transition/lead provenance | Target `elin-memory-fragments` | Broken direct dialogue route | 6B.13.1 |
| J. Enter Elin dialogue | Elin scene reachable | dialogue runtime | Dialogue page | Survivor memory surface | Existing path harness/debug | Active dialogue state | Legacy vs Focus/Commit mismatch | 6B.13.1/6 |
| K. Gain survivor memory | Elin path resolves | dialogue runtime/archive/knowledge | Dialogue result/archive | Shrine bell/hollow lead | Full path/debug metadata | Knowledge and completed record | Premature final reveal | Visibility + continuity |
| L. Return to exploration | Dialogue exit resolved | dialogue runtime/current scene | Scene page | Current exploration state | Active dialogue cleared | Completed record, action state | Orphaned active dialogue | 6B.13.1 |
| M. Reach Dunmere | Exploration transition/lead | scene/current state | Scene page | Dunmere pressure context | Transition debug | Scene/action window | Scene not unlocked | 6B.13.6 |
| N. Speak with Mara | Dunmere dialogue available | dialogue runtime | Dialogue page | Practical pressure | State/check/routing debug | Misleading clue/objective | Assumption treated as truth | 6B.13.3 |
| O. Speak with Lysa | Dunmere dialogue available | dialogue runtime | Dialogue page | Grief/suspicion | State/check/routing debug | Partial clue/objective | Suspicion confirmed too hard | 6B.13.3 |
| P. Speak with Garren | Dunmere/old path lead | dialogue runtime | Dialogue page | Old path warning | Gated move/debug reqs | Shrine route knowledge/reward | Accusation hard-locks campaign | 6B.13.1/6 |
| Q. Gain shrine route | Respectful Garren path | dialogue runtime/reward | Dialogue result/scene page | Safe route direction | Reward/transition provenance | `shrine-ruins` unlock metadata | Broken shrine target | 6B.13.6 |
| R. Reach shrine ruins | Route/transition valid | current scene/transition | Scene page | Shrine scene | Exploration inspector | Scene/action window | Future-supported route exposed | 6B.13.6 |
| S. Enter Rusk dialogue | Shrine confrontation | dialogue runtime | Dialogue page | Dangerous antagonist surface | Antagonist state/debug | Active dialogue state | Casual safe exit or spoiler | 6B.13.1/6 |
| T. Trigger combat pending | Rusk hard/failure path | dialogue runtime/result metadata | Dialogue result/scene page | Safe combat-risk warning | `combat_pending` routing details | Encounter metadata/objectives | Broken combat target, dead end | 6B.13.6 |
| U. Review outputs | Multiple outputs exist | history/knowledge/archive services | History, Knowledge, Archive, Search | Coherent player records | Provenance/debug | Completed records and indexed topics | Duplicate/noisy records | 6B.13.3 |
| V. Continue play | Valid scene/action window | current scene/window services | Scene page | Clear next action | Diagnostics ok | Open next action window | Stuck window, stale UI | 6B.13.2/4 |

## 4. Exploration To Dialogue Handoff Audit

Expected behavior:

- Exploration can open dialogue only through visible, authorized, current-scene affordances or explicit scene/lead routing.
- Dialogue exits return to exploration or a documented local context without leaving an active dialogue orphan.
- Dialogue can produce knowledge, objective, reward, and completed-record outputs without forcing exploration result duplication.
- Dialogue finalization should leave the player with a valid next action state, current scene, or safe redirect.
- Active dialogue should block incompatible exploration submissions where runtime state says the conversation is still active.
- Unresolved exploration actions should block incompatible dialogue submission or return a safe conflict.
- Completed dialogue can be reopened only when authored; asked CQ state and completed summaries should persist.
- The current scene read model should reflect dialogue outputs once they are player-known.

Current code paths:

- Exploration scene read model: `characterSceneViewService.js`, `sceneNarrationComposer.js`, `freeFocusService.js`, `/api/play/current-scene`.
- Dialogue runtime: `dialogueFocusCommitRuntimeService.js`, `/api/play/dialogue/*`.
- Archive/finalization: `dialogueArchiveService.js`.
- Debug: `dialogueDebugWorkspaceService.js`, `explorationMechanicsDebugReadModel.js`.

Current coverage:

- Dialogue runtime and archive tests cover entry, CQ, CSM, fallback, exits, transcripts, summaries, and GM/dev debug.
- Exploration tests cover current scene, Free Focus, action preview/submit, and mechanics visibility.
- Greyvale dialogue path harness covers all converted dialogue fixtures.

Gaps for 6B.13.1:

- Prove exploration-to-dialogue entry from actual Greyvale scene context, not only direct dialogue runtime registration.
- Prove dialogue exit refreshes scene/current-state safely and clears active dialogue.
- Prove one NPC dialogue can complete and another can begin without stale active dialogue state.
- Prove dialogue output can appear in history/knowledge/archive without duplicating Latest Development.
- Prove Rusk combat-pending metadata is safe and does not emit a broken combat transition.

6B.13.1 implementation status:

- Added `docs/full-loop/STAGE_6B_13_HANDOFF_HARDENING_NOTES.md` with actual route/service paths and handoff findings.
- Added `backend/test/dialogue-greyvale-handoff-regression.test.js` for Tomas -> Elin, Mara -> Lysa, Garren route, Rusk escalation, stale-ended-dialogue rejection, archive/search, knowledge/history/current-scene safety, and GM/dev permission coverage.
- Hardened `dialogueFocusCommitRuntimeService.js` so already exited dialogues reject CQ resolution, CSM preview, CSM submit, and duplicate exit with a safe 409 message.
- Stripped internal social-move match confidence from player-facing dialogue preview responses while preserving internal/debug persistence.
- Confirmed dialogue exits currently return transition intent rather than performing open-world navigation. Live scene movement remains routed to later navigation/combat stages.
- Confirmed active dialogue does not yet globally block all exploration Beat Actions. Broader committed-action conflict policy remains a 6B.13.2 item.

## 5. Action Window, Preview, Submit, And Resolution Lifecycle Audit

Expected invariants:

- One unresolved committed action per character/campaign/action window.
- Preview is read-only and does not create committed state.
- Submit creates committed state exactly once.
- Double-submit is rejected or idempotent.
- Stale preview cannot be submitted silently.
- Stale action id returns a player-safe error.
- Clarifying Questions and Free Focus do not consume committed beat.
- Committed Social Moves consume the dialogue beat.
- Beat Actions consume the exploration beat.
- Exits finalize without corrupting beat state.
- Resolution opens the next valid action window or returns a clear no-next-window state.
- Refresh/reload does not corrupt submitted action, active dialogue, or viewed Free Focus state.
- Two browser tabs cannot duplicate committed actions.
- Active character switch does not leak prior campaign/action state.

Current code paths:

- `beatWindowTimingService.js`
- `webActionSubmissionService.js`
- `actionComposerService.js`
- `beatAdvanceService.js`
- `dialogueFocusCommitRuntimeService.js`
- `/api/play/action/preview`, `/api/play/action/submit`, `/api/dev/advance-beat`

Current coverage:

- Stage 6B.5 unit tests cover resolver, action windows, preview, and dev advance conversion.
- Stage 6B.9 tests cover Free Focus overlap and committed follow-up behavior.
- Dialogue runtime tests cover CQs not spending beats and CSMs spending dialogue beats.
- Stage 6B.7 diagnostics covers duplicate/open/future-locked windows.

Gaps for 6B.13.2:

- Explicit stale preview id and stale action id tests.
- Browser refresh after preview, after submit, and after resolution.
- Double-click submit and two-tab submit tests.
- Race between dialogue exit and action submit.
- Character switch during active action/dialogue.
- Player-safe stale-state errors with no schema/internal payload leakage.

6B.13.2 implementation status:

- Added `docs/full-loop/STAGE_6B_13_ACTION_LIFECYCLE_HARDENING_NOTES.md` with actual action/dialogue lifecycle paths, tokens, error behavior, and validation commands.
- Added `backend/test/full-loop-action-lifecycle-regression.test.js` for exploration preview/submit/advance, Free Focus non-commit, dialogue CQ/CSM/exit lifecycle, stale token rejection, active dialogue conflict blocking, and cross-account token misuse.
- Added optional exploration `lifecycle_context` with `action_window_id` and `submission_version` to preview/submit responses.
- Added optional dialogue `lifecycle_context` with `dialogue_scene_state_id` and `committed_social_move_count` to CSM preview, CQ result, CSM submit result, and exit result.
- Hardened exploration submit to reject stale action-window/version contexts with a safe player message.
- Hardened dialogue mutating routes to reject stale dialogue state/count contexts with a safe player message.
- Added active-dialogue conflict protection so exploration preview/submit cannot proceed while an active dialogue runtime row exists for the same character/campaign.
- Preserved existing no-token compatibility: clients that do not send lifecycle context still follow current edit/update behavior until the player app is updated.

## 6. Knowledge, History, Objective, Archive, And Search Audit

Expected behavior:

- Knowledge grants are idempotent and do not create journal noise.
- Misleading/partial clues remain player-safe and are not promoted to confirmed truth.
- Objective updates activate, progress, and complete in coherent Greyvale order.
- Rewards and scene unlocks point to valid targets or are documented future-supported.
- History event order matches player-facing chronology.
- Latest Development reflects the latest resolved exploration result without swallowing dialogue summaries.
- Completed dialogue records finalize once and use player-facing sources.
- Transcripts persist player-facing turns and hide GM/dev-only metadata.
- Archive/search indexes player-safe topics only.

Greyvale expectations:

- Tomas preserves Pattern of Attacks without duplicate noise.
- Elin preserves survivor memory, shrine bell, and hollow lead without final answer leakage.
- Mara's Assumption stays useful but incomplete/misleading.
- Lysa's Suspicion stays emotionally meaningful but partial/misleading.
- Garren route knowledge points toward shrine without making him final culprit.
- Rusk shrine instability and deeper-source hint remain partial and do not solve the mystery.
- Objective flow remains coherent: `gather-local-insight` -> `follow-the-leads` -> `uncover-the-truth` -> `resolve-the-threat`.

Gaps for 6B.13.3:

- Cross-system idempotency tests where exploration and dialogue both grant related knowledge.
- Latest Development expectations after dialogue completion or dialogue-triggered outputs.
- Multi-NPC archive/search state after Tomas/Elin/Mara/Lysa/Garren/Rusk sequence.
- Objective progress regression tests for no skip/no rollback.
- Knowledge journal ordering and duplicate suppression across full-loop clusters.

## 7. Player UI State And Error Recovery Audit

Expected UI behavior:

- Initial campaign and scene loading survive browser refresh.
- Scene surface, Closer Looks, action composer, Latest Development, objectives, history, and knowledge render from current backend state.
- Dialogue surface, CQs, CSMs, fallback, exits, summaries, and archive render safely.
- Asked CQ state persists and reopens without rerolling.
- Submit buttons disable during pending network calls and after successful commit where appropriate.
- Failed preview/submit/resolution states show safe recovery actions.
- Invalid/ended dialogue state prompts return to current scene.
- Expired auth redirects or asks the player to sign in without losing hidden state into the UI.
- Active character switch reloads scene/campaign state and clears stale local action/dialogue state.
- Mobile/responsive basics remain usable for GM/dev tooling and player pages.

Player-safe error examples:

- "That moment has changed. Review the current scene and choose your next action."
- "This conversation has ended. Return to the current scene."
- "That action is no longer available."
- "Refresh the scene to continue."

Current Flutter files:

- `campaign_scene_page.dart`
- `dialogue_scene_page.dart`
- `campaign_history_page.dart`
- `campaign_knowledge_page.dart`
- `dialogue_debug_workspace_page.dart`
- `exploration_mechanics_inspector_page.dart`
- `api_client.dart`
- `models.dart`

Current tests:

- `dialogue_ui_test.dart`
- `dialogue_debug_workspace_test.dart`
- `exploration_mechanics_inspector_test.dart`
- `exploration_mechanics_visibility_boundary_test.dart`
- `exploration_mechanics_greyvale_regression_test.dart`
- `models_test.dart`

Gaps for 6B.13.4:

- Scene page stale action widget tests.
- Dialogue ended/stale submit widget tests.
- Refresh/reload recovery tests with mocked backend state changes.
- Knowledge/history/objective update display after dialogue outputs.
- Direct route access and active character switch state clearing.
- Friendly error text assertions for player surfaces.

## 8. GM/Dev Inspector And Visibility Audit

Expected GM/dev visibility:

Exploration inspector should expose surface source data, passive discoveries, Free Focus availability, Beat Action availability, check details, result bands, environment modifiers, NPC presence, state reads/writes, knowledge/history/objective outputs, transitions, validation, audit timeline, and visibility boundaries.

Dialogue debug workspace should expose conversation surface source data, passive social insight, CQ/CSM availability and routing, checks and hidden DCs where authored, relationship/social reads/writes, failed requirements, preview mapping, fallback usage, transition routing, transcript/completed record hooks, lifecycle chains, validation, and path harness coverage.

Full-loop diagnostics should expose active character/campaign/adventure state, active exploration/action window, active dialogue state, unresolved action status, last resolution, latest development, state transition timeline, output provenance, and permission boundary status.

Permission requirements:

- Normal players cannot access GM/dev debug.
- Unauthenticated users cannot access GM/dev debug.
- Non-owners cannot inspect another player/character/campaign debug payload.
- GM/dev authorization follows the existing `can_advance_beats` convention unless a future capability is added.
- Frontend hiding is never the only guard; backend routes must enforce permissions.

Gaps for 6B.13.5:

- Full-loop provenance is split across exploration inspector, dialogue debug workspace, and diagnostics.
- No single view ties latest result, action window, active dialogue, knowledge/history outputs, and archive records into one timeline.
- Player-vs-GM denylist coverage exists, but should be run across combined exploration/dialogue full-loop payloads.
- Direct id manipulation tests should include dialogue, exploration mechanics, archive, and diagnostics routes together.

## 9. Player-Facing Visibility Boundary Audit Plan

Player-facing surfaces to audit:

- Exploration scene read model.
- Dialogue scene read model.
- Free Focus result.
- Clarifying Question result.
- Action preview.
- Committed Social Move preview.
- Action/beat resolution.
- Latest Development.
- History.
- Knowledge Journal.
- Objective display.
- Completed dialogue summary.
- Dialogue archive.
- Search results.
- Player API errors.
- Flutter rendered UI.
- Cached/local state where applicable.

Denylisted values:

- Hidden DC.
- Raw roll.
- Total result.
- Modifier breakdown.
- Result band internals.
- Branch id.
- Hidden requirements.
- Exact failed requirements.
- GM notes.
- Debug summaries.
- State read/write internals.
- Raw relationship meters.
- Raw social meters.
- NPC schedule internals.
- Environment debug data.
- Hidden clue metadata.
- Preview confidence.
- Routing confidence.
- Path harness metadata.
- Validation warnings/debug notices.
- Future-supported internals.
- Combat routing internals.
- Annotation/correction internals not player-facing.

Allowed player-facing values:

- Narrative result text.
- Safe check type if policy allows.
- Player-safe relationship perception summaries.
- Player-safe locked/blocked wording.
- Player-safe clue/result summaries.
- Player-safe transition labels.
- Safe Rusk combat-risk warning.

Current coverage:

- Stage 6B.11.5 covers exploration player-facing boundaries.
- Dialogue archive/runtime tests cover player-facing archive/search boundaries.
- Flutter visibility tests cover inspector entry points and player UI non-leakage for targeted surfaces.

Gaps:

- A combined full-loop denylist suite should inspect exploration, dialogue, latest result, history, knowledge, archive, search, and UI surfaces in one Greyvale flow.
- Player-safe API errors need denylist assertions, not only happy-path payloads.
- Future-supported/combat-pending metadata must stay GM/dev-only except for safe narrative warnings.

## 10. Stale State, Refresh, And Concurrency Audit

Cases to harden:

- Browser refresh during exploration.
- Browser refresh during dialogue.
- Browser refresh after preview.
- Browser refresh after submit.
- Browser refresh after resolution.
- Double-click submit.
- Two browser tabs submitting the same window.
- Stale preview id.
- Stale action id.
- Stale dialogue turn id.
- Stale scene state.
- Expired auth token.
- Active character changed mid-session.
- Campaign/adventure state changed by another operation.
- Race between dialogue exit and action submit.
- Race between transition and scene reload.

Expected behavior:

- No duplicate committed actions.
- No duplicate dialogue records.
- No duplicate knowledge grants.
- No duplicate history events.
- No orphaned active dialogue.
- No impossible action window state.
- Player-safe stale-state errors.
- GM/dev raw error/debug trace available only through authorized diagnostics.

Primary target sub-builds:

- 6B.13.2 for backend lifecycle and concurrency invariants.
- 6B.13.4 for player UI recovery and safe errors.
- 6B.13.5 for GM/dev diagnosis of stale-state failures.

## 11. Greyvale Content Continuity Audit

Checks:

- NPC names and labels are consistent.
- Scene titles are consistent.
- Knowledge titles and clue wording are consistent.
- Objective labels and statuses are consistent.
- Transition labels are consistent.
- Archive/search topics remain player-safe.
- Misleading/partial clue language stays consistent.
- Final mystery remains unrevealed.
- Summaries do not contradict each other.
- Converted scene ids/slugs are unique.
- Legacy node dialogues do not override new Focus/Commit scenes.
- Shrine/combat/hollow future-supported details do not leak to players.

Allowed minimal fixes in later builds:

- Typo fix.
- Broken reference.
- Unclear player-facing label.
- Summary consistency.
- Transition label cleanup.
- Clue classification cleanup.
- Duplicate id fix.
- Missing archive/search topic.
- Missing completed-record hook.

Route this work mainly to 6B.13.6 unless it blocks an earlier handoff/lifecycle build.

## 12. Test Matrix

| Priority | Area | Scenario | Player path | Backend service | Frontend surface | Fixtures | Expected before | Action | Expected after | Player output | GM/dev output | Denylist checks | Test type | Existing coverage | Gap | Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Critical | Handoff | Enter dialogue from exploration | Scene -> NPC dialogue | current scene + dialogue runtime | Scene/dialogue pages | Tomas/Elin | Scene open | Open dialogue | Active dialogue | NPC surface | Dialogue state/routing | No debug ids | Integration/widget | Dialogue direct load exists | Live scene entry | 6B.13.1 |
| Critical | Handoff | Exit dialogue to exploration | Dialogue -> scene | dialogue runtime + current scene | Dialogue/scene pages | Elin/Tomas | Active dialogue | Exit | Dialogue finalized | Return/current scene | Exit provenance | No hidden transition internals | Integration | Dialogue exits covered | Scene refresh proof | 6B.13.1 |
| Critical | Lifecycle | Committed exploration action lifecycle | Scene action | action composer/submission/beat | Scene page | Broken Caravan | Open window | Preview/submit/advance | Result + next window | Latest result | Result-band/debug | No raw roll/DC leak | Service/integration | Existing exploration tests | Multi-scene repeat | 6B.13.2 |
| Critical | Lifecycle | Committed dialogue move lifecycle | Dialogue CSM | dialogue runtime/archive | Dialogue page | All NPCs | Active dialogue | Preview/submit | Beat spent/finalized | Safe result | CSM routing/state | No raw meters/DC leak | Path harness | 6B.12 harness | Full-loop join | 6B.13.2 |
| Critical | Stale | Stale preview submit rejected | Preview -> submit | action/dialogue submit | Composer/dialogue page | Any | Preview old | Submit after state change | Safe conflict | Review current scene | Exact stale reason | No stack/schema | Service/widget | Partial | Needs explicit stale ids | 6B.13.2 |
| Critical | Concurrency | Double-submit prevention | Two clicks/tabs | submit services | Composer/dialogue page | Any | Open window | Submit twice | One commit | Safe duplicate status | Audit/raw details | No duplicate records | Integration | Dev advance guard exists | Submit guard proof | 6B.13.2 |
| Critical | Outputs | Knowledge idempotency | Repeated clue sources | knowledge service | Journal | Tomas/Mara/Lysa | Clue absent/present | Grant twice | One journal entry | Clean clue | Provenance | No hidden metadata | Service | Some DB tests | Cross-system duplicate | 6B.13.3 |
| Critical | Outputs | Objective progression | Full Greyvale path | progression service | Objectives | All clusters | Objective active | Resolve outputs | Correct status | Clear next goal | Objective provenance | No hidden criteria | Integration | Cluster tests | Full sequence | 6B.13.3 |
| Critical | Visibility | Player hidden-data denylist | All player payloads | play routes | Scene/dialogue/history/knowledge | Full loop | Any | Fetch/render | Clean payload | Player-safe | GM route only | Full denylist | Service/widget | 6B.11/6B.12 | Combined flow | 6B.13.5 |
| Critical | Permission | GM/dev gate | Debug routes | debug services | Inspectors | Any | Normal user | Call debug | 403 | Safe denial | None | No hidden payload | Integration/widget | Existing | Combined route sweep | 6B.13.5 |
| Critical | Content | Tomas -> Elin path | Inn cluster | dialogue/current scene | Dialogue/scene | Tomas/Elin | Tomas open | Gain lead | Elin reachable | Lead text | Routing debug | No direct broken target | Integration | Path fixtures | Live handoff | 6B.13.6 |
| Critical | Content | Garren shrine route | Village cluster | dialogue/reward/transition | Dialogue/scene | Garren | Respect route | Resolve | Route lead/unlock | Safe shrine route | Reward provenance | No hidden req leak | Integration | Path fixture | Scene route smoke | 6B.13.6 |
| Critical | Content | Rusk combat-pending path | Shrine cluster | dialogue/metadata | Dialogue/scene | Rusk | Shrine active | Escalate | Combat pending | Safe risk warning | Handoff debug | No combat internals | Integration | Path fixture | Downstream handling | 6B.13.6 |
| High | Fallback | Fallback exhaustion | Dialogue | dialogue runtime | Dialogue page | All NPCs | Fallback unused | Use twice | Revise prompt | Safe refusal | Usage/exhaustion | No major clue | Path/widget | Existing | UI stale variants | 6B.13.4 |
| High | Failure | Failed social move | Dialogue | dialogue runtime | Dialogue page | Mara/Lysa/Rusk | Move available | Forced fail | Safe failure state | Tension/closure | Branch debug | No hidden DC/result band | Path harness | Existing | Full-loop output | 6B.13.3 |
| High | Failure | Failed focus/action | Exploration | free focus/beat result | Scene page | Broken Caravan | Focus/action available | Fail/advance | Safe result | Narrative failure | Check debug | No hidden fail leak | Integration | Stage 6B.11 | Multi-scene | 6B.13.6 |
| High | Archive | Completed dialogue archive/search | Multi-NPC | archive service | Archive/search | All NPCs | Records exist | Search/view | Safe records | Summaries/transcript | Full chain debug | No raw state | Service/widget | Existing | Multi-NPC search | 6B.13.3 |
| High | Latest | Latest Development after dialogue | Dialogue output | history/latest services | Scene page | Tomas/Elin | Dialogue completed | Return scene | Latest sane | No duplicate | Provenance | No debug | Integration | Thin | Needs design | 6B.13.3 |
| High | Refresh | Refresh mid-dialogue | Active dialogue | play/dialogue routes | Dialogue page | Any | Active dialogue | Reload | State restored | Same surface/state | Runtime state | No raw ids | Widget/service | Partial | Browser-like tests | 6B.13.4 |
| High | Character | Active character switch | Any active state | auth/player state | App routes | Any | Character A active | Switch B | A state cleared | B scene | Owner debug only | No cross-character leak | Integration/widget | Character mgmt tests | Full-loop active state | 6B.13.4 |
| Medium | UI | Loading/error states | Network failures | API client | Scene/dialogue pages | Mocks | Loading | Fail/retry | Safe recovery | Friendly text | None | No stack/debug | Widget | Partial | Needs stale copy | 6B.13.4 |
| Medium | UI | Mobile/responsive sanity | Narrow viewport | Flutter UI | Scene/dialogue/debug | Mocks | Page open | Resize/render | Usable layout | No overflow basics | N/A | N/A | Widget/manual | Limited | Manual + targeted | 6B.13.4 |
| Medium | Search | Archive search ranking | Many records | archive service | Archive/search | Multi-NPC | Records indexed | Search | Relevant order | Safe results | Index debug | No hidden topics | Service | Basic | Ranking later | 6B.13.3 |
| Medium | Continuity | Non-happy paths | Failure/refusal | dialogue/exploration | Scene/dialogue | All NPCs | Path active | Fail/refuse | No dead end | Safe next step | Debug explains | No spoiler | Path/integration | Path fixtures | Full-loop join | 6B.13.6 |

## 13. Proposed Stage 6B.13 Sub-Build Plan

### 6B.13.1 - Exploration To Dialogue Handoff Hardening

- Goal: prove active dialogue lifecycle and exploration handoffs are safe.
- Scope: exploration-to-dialogue entry, dialogue-to-exploration exit, dialogue transitions, latest development after dialogue, action window after dialogue, no orphaned active dialogue.
- Likely files: `dialogueFocusCommitRuntimeService.js`, `play.js`, `characterSceneViewService.js`, `dialogueArchiveService.js`, Flutter scene/dialogue pages, Greyvale tests.
- Tests: live Greyvale Tomas/Elin entry and exit, multi-dialogue sequence, active dialogue blocks incompatible exploration actions, completed dialogue clears active state.
- Non-goals: no open-world navigation, no new content.
- Acceptance: player can move from exploration into dialogue and back without stale/orphaned state.
- Validation commands: targeted dialogue/exploration tests, Greyvale fixture regression, Flutter dialogue UI tests if UI touched.
- 6B.13.1 result: DB-backed tests now cover direct Greyvale dialogue handoff clusters and stale-ended-dialogue rejection. Full scene-affordance UI entry and global exploration-action blocking remain deferred.

### 6B.13.2 - Action Window, Preview, Submit, And Resolution Lifecycle Hardening

- Goal: harden committed action lifecycle across exploration and dialogue.
- Scope: preview vs submit, committed action uniqueness, stale preview/action, refresh/reload, double-submit, two tabs, next action window.
- Likely files: `webActionSubmissionService.js`, `actionComposerService.js`, `beatAdvanceService.js`, `beatWindowTimingService.js`, dialogue runtime submit paths, scene/dialogue UI submit controls.
- Tests: stale preview submit, stale action id, double-click submit, two-tab submit, refresh after preview/submit/resolution, CQ/Free Focus non-beat, CSM/Beat Action beat spend.
- Non-goals: no scheduler overhaul or beat resolver redesign.
- Acceptance: no duplicate committed actions or corrupted windows; player receives safe stale-state recovery.
- Validation commands: backend action/beat tests, dialogue runtime tests, full backend test when practical.
- 6B.13.2 result: lifecycle-token tests now cover stale/double-submit behavior for exploration and dialogue. True frontend two-tab UI orchestration remains deferred to 6B.13.4.

### 6B.13.3 - Knowledge, History, Objective, Archive, And Search Consistency

- Goal: unify output consistency across exploration and dialogue.
- Scope: idempotent knowledge, objective flow, history ordering, latest development, completed records, summaries, transcripts, archive/search, misleading/partial clue consistency.
- Likely files: `characterKnowledgeService.js`, `gameplayHistoryService.js`, `progressionService.js`, `dialogueArchiveService.js`, `playerBeatResultService.js`, Greyvale content tests.
- Tests: duplicate knowledge grants, objective no-skip/no-regress, multi-NPC archive/search, latest development after dialogue/exploration, safe clue classifications.
- Non-goals: no new Greyvale clues.
- Acceptance: output records are coherent, idempotent, player-safe, and searchable without hidden metadata.
- Validation commands: dialogue archive/runtime tests, living-world tests, Greyvale content/runtime regressions.
- 6B.13.3 result: `backend/test/full-loop-output-consistency-regression.test.js` now covers Tomas knowledge dedupe, Mara/Lysa partial clue framing, completed-record/archive/search single-write and scoping, Garren route output, Rusk deeper-source output, player denylist checks, and GM/dev debug permission gating.
- 6B.13.3 result: dialogue CQs/CSMs now apply existing authored `objective_updates`, `character_flags`, `campaign_flags`, and `rewards` through `applyAdventureOutcome`, while progression sync still prevents Greyvale objective-order skips.
- 6B.13.3 remaining gap: frontend output widgets and a full multi-scene Greyvale vertical-slice smoke remain deferred to 6B.13.4 and 6B.13.6.

### 6B.13.4 - Player UI State And Error Recovery Pass

- Goal: make player UI resilient when state changes under it.
- Scope: scene UI, dialogue UI, action composer, preview/submit/resolution UI, loading/error/empty states, stale-state errors, refresh/reload recovery.
- Likely files: `campaign_scene_page.dart`, `dialogue_scene_page.dart`, `api_client.dart`, `models.dart`, history/knowledge pages.
- Tests: widget tests for stale action, ended dialogue, failed preview/submit, retry/refresh, active character switch, archive/search display, safe error strings.
- Non-goals: no major redesign.
- Acceptance: player always sees a clear next step and never sees internal/debug details.
- Validation commands: targeted Flutter tests, `flutter analyze`, model tests, backend routes for matching errors.
- 6B.13.4 result: `apps/player_app/test/player_ui_recovery_test.dart` now covers stale exploration preview recovery, stale dialogue CSM recovery, completed-dialogue control hiding, Knowledge Journal clue rendering, Campaign History output rendering, and rendered hidden-data denylist checks.
- 6B.13.4 result: `api_client.dart` now maps stale/ended/unavailable/auth/internal-looking failures to stable player-safe messages with recovery-oriented error codes.
- 6B.13.4 result: the Flutter app now parses and submits backend lifecycle context for exploration previews and dialogue CQs/CSMs/exits, clearing stale preview controls when lifecycle errors occur.
- 6B.13.4 result: exploration scenes now surface dialogue-enabled NPCs in a main-flow `Conversations` card and dialogue latest-result cards can bridge `Dialogue started` results into the Focus/Commit dialogue route.
- 6B.13.4 result: Grey Road Inn authored targets now bridge `the innkeeper`/`tomas` affordance aliases to the Tomas Focus/Commit scene id, so the player-facing scene payload has the `dialogue_scene_id` needed by Flutter.
- 6B.13.4 deployment audit: local and hosted `main.dart.js` bundles were stale and lacked the new dialogue UI strings, so current source changes were not visible in the app until `npm run build:player` regenerated `frontend/play`.
- 6B.13.4 deployment audit: after rebuilding, `frontend/play/main.dart.js` contains `Conversations`, `conversation_entry`, `latest_dialogue_entry`, and `Open conversation`; Firebase Hosting still requires `npm run deploy:hosting` to publish this bundle.
- 6B.13.4 diagnostic fix: playtest diagnostics now avoid a false `Missing Latest Scene Feed Entry` warning when the latest result is scoped to another scene/feed, which can happen around dialogue or transition handoff flows.
- 6B.13.4 remaining gap: full browser refresh/two-tab automation, archive/search page-level smoke, active-character switch UI smoke, and mobile viewport coverage remain deferred to 6B.13.6/6B.15 as appropriate.

### 6B.13.5 - GM/Dev Full Loop Inspector And Visibility Regression

- Goal: ensure GM/dev observability and player boundary coverage span the combined loop.
- Scope: exploration debug, dialogue debug, state/output provenance, permissions, player-vs-GM denylist, debug route security.
- Likely files: `explorationMechanicsDebugReadModel.js`, `dialogueDebugWorkspaceService.js`, `playtestDiagnosticsService.js`, dev routes, Flutter debug pages.
- Tests: normal/unauth/debug access, cross-character id manipulation, combined denylist across player payloads, GM/dev positive-control debug payloads.
- Non-goals: no new full inspector UI unless a small link/route bug blocks coverage.
- Acceptance: GM/dev can debug enough of the full loop; players cannot access hidden/debug mechanics.
- Validation commands: Stage 6B.11 visibility tests, dialogue debug tests, Flutter inspector tests.
- 6B.13.5 result: added `docs/full-loop/STAGE_6B_13_GM_DEV_VISIBILITY_NOTES.md` and `backend/test/full-loop-gm-dev-visibility-regression.test.js`.
- 6B.13.5 result: `/api/play/current-scene?include_debug=true` now requires non-production plus `account.can_advance_beats = TRUE`; normal players can still request safe `include_mechanics=true` details but cannot force the player route to emit the debug object.
- 6B.13.5 result: dialogue GM/dev debug availability now includes authored move output metadata and authored exit transition metadata, so Rusk combat-pending and hollow future-supported handoff details are inspectable through `/api/dev/dialogue-debug` only.
- 6B.13.5 result: regression coverage spans normal/unauth/GM debug access, current-scene query-param abuse, exploration mechanics debug, dialogue debug, archive/search scoping, inn/village/shrine Greyvale clusters, Rusk combat/deeper-source visibility, and player-facing denylist checks.
- 6B.13.5 remaining gap: GM/dev visibility is still split across exploration mechanics, dialogue debug, diagnostics, and archive/search views. A single joined full-loop inspector remains future work, not a prerequisite for 6B.13.5.

### 6B.13.6 - Greyvale Full Loop Regression Suite

- Goal: prove the integrated Greyvale vertical-slice loop is regression-covered.
- Scope: inn cluster, village cluster, shrine cluster, converted dialogue path harnesses, exploration/dialogue continuity, final docs/status, CI-ready command set.
- Likely files: backend Greyvale full-loop tests, fixture helpers, path-harness fixtures, docs.
- Tests: Broken Caravan -> Inn/Tomas/Elin, Dunmere/Mara/Lysa/Garren, Shrine/Rusk, history/knowledge/objective/archive/search, player visibility, GM/dev debug.
- Non-goals: not the final 6B.15 playable vertical slice declaration.
- Acceptance: a focused command proves Greyvale can progress through the current core loop without leaks or dead ends.
- Validation commands: full backend tests, targeted Flutter tests, hosting check, documented manual smoke if full E2E is too heavy.
- 6B.13.6 result: added `backend/test/greyvale-full-loop-regression.test.js` with inn, village, and shrine cluster smoke coverage.
- 6B.13.6 result: added `npm run test:greyvale-full-loop` at the repo root and `npm --prefix backend run test:greyvale-full-loop` in the backend package. The command validates Greyvale content, then runs focused Greyvale exploration, dialogue, handoff, lifecycle, output, visibility, permission, path-harness, and full-loop smoke tests.
- 6B.13.6 result: added `docs/full-loop/STAGE_6B_13_GREYVALE_FULL_LOOP_REGRESSION_STATUS.md` with final coverage, command set, path inventory, remaining gaps, and readiness recommendation.
- 6B.13.6 result: latest local `npm run test:greyvale-full-loop` passed with Greyvale content validation `ok`, 34 files processed, 0 warnings, 0 errors, and 56 backend tests passing.
- 6B.13.6 result: full backend `npm test` passed with 291 tests passing after updating the stale Stage 5J.2 Grey Road Inn rain-overlay assertion to match current authored environment prose.
- 6B.13.6 result: targeted Flutter UI tests passed with 50 tests passing, and `flutter analyze` reported no issues.
- 6B.13.6 remaining gap: a single chained inn -> village -> shrine -> combat smoke remains deferred until open-world navigation and combat handoff are live enough to test without faking future systems.

## 14. Validation Command Inventory

| Command | Purpose | Location | Required environment | Expected runtime | Stage use | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run test:greyvale-full-loop` | Stage 6B.13.6 Greyvale full-loop regression command | repo root | `DATABASE_URL`, local DB | A few minutes | 6B.13.6+ | Validates content and runs focused Greyvale backend full-loop regression |
| `npm --prefix backend test` | Full backend Node test suite | repo root | `DATABASE_URL` for DB-backed tests | Several minutes | 6B.13.6 and final checks | Available script: `node --test --test-concurrency=1 test/*.test.js` |
| `node --test backend/test/full-loop-gm-dev-visibility-regression.test.js` | Stage 6B.13.5 GM/dev visibility and player denylist regression | repo root | `DATABASE_URL` for DB-backed tests | Under a minute | 6B.13.5+ | Covers current-scene debug query gating, inn/village/shrine debug, Rusk combat/deeper-source visibility, and archive/search scoping |
| `node --test backend/test/full-loop-action-lifecycle-regression.test.js` | Stage 6B.13.2 action-window/dialogue lifecycle regression | repo root | `DATABASE_URL` for DB-backed tests | Under a minute | 6B.13.2+ | Covers lifecycle context, stale rejection, active-dialogue conflict, and scope isolation |
| `node --test backend/test/dialogue-greyvale-handoff-regression.test.js` | Stage 6B.13.1 Greyvale exploration-dialogue handoff regression | repo root | `DATABASE_URL` for DB-backed tests | Under a minute | 6B.13.1+ | Use localhost DB override when running outside Docker |
| `node --test backend/test/dialogue-*.test.js` | Dialogue runtime/archive/debug/path/Greyvale suite | repo root | `DATABASE_URL` for DB-backed dialogue tests | Minutes | 6B.13.1, 6B.13.3, 6B.13.6 | Useful focused dialogue regression |
| `node --test backend/test/exploration-*.test.js backend/test/stage6b9-surface-focus-commit-unit.test.js` | Exploration mechanics and Surface/Focus/Commit regression | repo root | `DATABASE_URL` for exploration mechanics tests | Minutes | 6B.13.1, 6B.13.5, 6B.13.6 | Adjust exact file list as needed |
| `node --test backend/test/stage6b5-action-composer-unit.test.js backend/test/stage6b6-player-beat-result-unit.test.js backend/test/recent-result-summary-unit.test.js` | Preview/submit/result/latest-development unit coverage | repo root | Usually no DB | Fast | 6B.13.2, 6B.13.3 | Add stale-state tests here or adjacent |
| `node --check <file>` | JS syntax check for new/changed files | repo root | None | Fast | Any sub-build | No backend typecheck script exists |
| `npm run build` | Root hosting/static page compliance check | repo root | Node/npm | Fast | docs/UI-safe final check | Runs `check:hosting` only |
| `& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test ...` | Targeted Flutter widget/model tests | `apps/player_app` | Flutter SDK | Fast to moderate | 6B.13.4, 6B.13.5 | Must run from Flutter project root |
| `& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze` | Flutter static analysis | `apps/player_app` | Flutter SDK | Fast | 6B.13.4+ when frontend touched | Passed in prior dialogue regression |
| `npm run build:player` | Flutter web build through repo script | repo root | Flutter on PATH | Moderate | final UI builds | Use when frontend code changes are substantial |
| `rg -n "<pattern>" docs backend apps content dialogue` | Audit/discovery | repo root | ripgrep | Fast | 6B.13.0 | Use to inventory docs/code/tests |

Unavailable in current repo:

- No root/backend lint script.
- No root/backend typecheck script.
- No Makefile or justfile.
- No markdownlint configuration found.

## 15. Risk Register

| Risk | Severity | Likelihood | Detection | Mitigation | Target |
| --- | --- | --- | --- | --- | --- |
| Exploration and dialogue state machines drift apart | Critical | Medium | Handoff integration tests | Centralize active state checks and safe conflict errors | 6B.13.1 |
| Action-window lifecycle has stale-state bugs | Critical | High | Stale preview/action and two-tab tests | Idempotency guards, player-safe stale errors | 6B.13.2 |
| Duplicate knowledge grants create journal noise | High | Medium | Idempotency tests across exploration/dialogue | Deduplicate by character/campaign/knowledge id | 6B.13.3 |
| Objective progress skips or regresses | High | Medium | Full-loop objective tests | Assert allowed transitions and idempotent progress | 6B.13.3 |
| Latest Development cannot represent dialogue outcomes cleanly | High | Medium | Dialogue completion to scene read-model tests | Define whether dialogue summaries appear in latest result or archive-only | 6B.13.3 |
| Archive/search includes hidden/debug metadata | Critical | Low/Medium | Denylist tests | Filter by player-facing source records only | 6B.13.3, 6B.13.5 |
| Player UI renders stale action buttons | High | Medium | Widget tests with changed backend state | Disable pending/stale controls and refresh state | 6B.13.4 |
| GM/dev visibility lacks full-loop provenance | Medium | High | Debug positive-control tests | Link diagnostics to exploration/dialogue debug records | 6B.13.5 |
| Rusk combat handoff remains future-supported | High | High | Shrine cluster regression | Keep combat-pending player-safe and route combat overhaul to 6I | 6B.13.6 |
| Legacy dialogue conflicts with new Focus/Commit registration | High | Medium | Registry/import tests | Keep legacy as source until production registration decision | 6B.13.6 or 6B.14 |
| Path harness coverage exists but does not execute through full runtime | Medium | Medium | Path harness run results | Keep DB-backed harness and document sandbox limitation | 6B.13.6 |
| Frontend tests are too thin | Medium | Medium | Test gap review | Add targeted widget tests for stale/error states | 6B.13.4 |
| Full E2E is too heavy locally | Medium | High | Command runtime/failure reports | Use clustered integration tests plus documented manual smoke | 6B.13.6 |

## 16. Overall Stage 6B.13 Acceptance Criteria

By the end of Stage 6B.13:

- A player can progress through the core Greyvale exploration/dialogue loop without broken state.
- Exploration and dialogue handoffs work both directions.
- Action windows do not get stuck or duplicate committed actions.
- Preview/submit/resolution lifecycle is stale-state safe.
- Knowledge, history, objectives, completed records, summaries, archive, and search remain coherent.
- Greyvale clues are idempotent and player-safe.
- Player UI clearly shows what can be done next.
- Player-facing payloads do not leak hidden mechanics/debug data.
- GM/dev tools can inspect enough state to debug failures.
- Refresh, stale state, and double-submit cases are handled safely.
- A Greyvale full-loop regression suite or command set exists.
- Remaining gaps are documented and routed to 6B.14, 6B.15, 6C, 6G, 6H, or 6I.

## 17. Out-Of-Scope Routing

- Shared interaction core cleanup -> Stage 6B.14.
- Declaring Greyvale playable vertical slice -> Stage 6B.15.
- Beat resolution quality/orchestration overhaul -> Stage 6C.
- GM campaign-level tools -> Stage 6F.1.
- Open-world movement/navigation -> Stage 6G.
- Full rules/check transparency -> Stage 6H.
- Combat encounter web MVP/combat overhaul -> Stage 6I.

## 18. Stage 6B.13.0 Lightweight Validation

For this docs-first build, validation should stay lightweight:

- Confirm no docs/tooling instructions block the plan.
- Confirm actual command inventory from `package.json`, backend scripts, Flutter app layout, and absence of Makefile/justfile/markdownlint.
- Run root hosting docs/static check if available: `npm run build`.
- Run a targeted `rg`/file-discovery command proving relevant full-loop docs/tests/content paths were reviewed.
- Run ASCII/path sanity on changed docs.

No runtime/player-facing behavior should change in 6B.13.0.
