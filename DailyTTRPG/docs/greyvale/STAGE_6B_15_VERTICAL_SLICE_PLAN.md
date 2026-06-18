# Stage 6B.15.0 - Greyvale Vertical Slice Audit & Playability Plan

Status: audit and plan  
Created: Stage 6B.15.0  
Primary predecessor: Stage 6B.14 Shared Interaction Core Consolidation  
Recommended implementation sequence: 6B.15.1 through 6B.15.8

## 1. Stage Purpose

Stage 6B.15 is the Greyvale playable vertical-slice readiness stage. It should answer one plain question:

Can a normal player start Greyvale, understand the current scene, take exploration actions, enter and complete Focus/Commit dialogue, accumulate knowledge and objective progress, reach the shrine confrontation boundary, and resume cleanly without broken state, hidden-data leaks, duplicate outputs, or confusing dead ends?

This stage is not a new content expansion. It is not the combat overhaul, open-world navigation, shared interaction core refactor, AI director pass, or SMS delivery pass. It is the player-facing proof pass that the existing Greyvale exploration and dialogue loop is coherent enough for deeper playtesting.

Stage 6B.15 prepares the project for:

- Stage 6B.15 playtest-ready declaration after sub-builds complete.
- Stage 6C beat resolution quality and orchestration hardening.
- Stage 6G scene movement and open-world navigation.
- Stage 6H rules/check transparency.
- Stage 6I combat encounter web MVP.

## 2. Playable Slice Definition

The intended Stage 6B.15 vertical slice is a bounded web-player journey through existing Greyvale content:

1. Start or resume the Greyvale starter adventure.
2. Read and act in the Broken Caravan exploration scene.
3. Continue to the Grey Road Inn.
4. Speak with Tomas Rell and Elin Harrow through Focus/Commit dialogue.
5. Continue through Dunmere village pressure scenes.
6. Speak with Mara Vellin, Lysa Fen, and Garren Holt.
7. Use Garren/old-path knowledge to reach the shrine route or shrine ruins using existing supported transitions.
8. Confront Rusk at the Shrine through Focus/Commit dialogue.
9. End at a safe Rusk combat_pending, future_supported, or equivalent escalation boundary without exposing unsupported combat internals or the final mystery.
10. Review knowledge, objectives, history, latest development, completed dialogue summaries, archive, and search.
11. Resume from the current state without orphaned dialogue/action windows.

The official Stage 6B.15 endpoint should be the Rusk confrontation boundary. The subterranean hollow and final mystery content already exist in Greyvale data, but this vertical slice should not require the final hollow resolution or reveal the final truth.

## 3. Current Greyvale Content Inventory

### World And Campaign

| Area | Current implementation | Files | Known tests | Likely gaps | Owner sub-build |
| --- | --- | --- | --- | --- | --- |
| World package | Greyvale world package is active and importable. | `content/worlds/greyvale/world.json`, `content/worlds/greyvale/manifest.json` | Greyvale content validation in `test:greyvale-full-loop` | Manifest still points `dialogues` to legacy dialogue package while Focus/Commit dialogue is lazy-loaded by runtime registry. Decide whether 6B.15 needs explicit manifest registration or documented runtime-bundled registration. | 6B.15.1, 6B.15.6 |
| Starter adventure | Web starter uses Greyvale defaults through SMS campaign assignment service. | `backend/src/sms/smsCampaignConfig.js`, `backend/src/services/playerDashboardService.js`, `backend/src/services/webCharacterCreationService.js` | Dashboard/start tests and full-loop backend tests | Need normal-player web start/resume acceptance test with active character recovery. | 6B.15.1 |
| Quest | Shadows on the Grey Road has objectives from aftermath to threat resolution. | `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json` | Content validation, output consistency tests | Need official 6B.15 objective acceptance path and endpoint status when combat is deferred. | 6B.15.5 |

### Exploration Scenes

| Scene | Slug | Current status | Main role in slice | Likely gaps | Owner sub-build |
| --- | --- | --- | --- | --- | --- |
| The Broken Caravan | `broken-caravan-site` | `surface_focus_commit`, starting scene | Opens aftermath, first clue/action loop, path to inn. | Need start-scene UI smoke and action/transition proof from fresh campaign. | 6B.15.1, 6B.15.2 |
| The Grey Road Inn | `grey-road-inn` | `surface_focus_commit` | Tomas/Elin dialogue hub. | Need clear dialogue affordances and no duplicate NPC narration. | 6B.15.2, 6B.15.3 |
| Fragments of Memory | `elin-memory-fragments` | Legacy scene type | Existing Elin memory transition target. | Need decide whether official route uses Focus/Commit Elin dialogue route, legacy scene, or both as supported alternatives. | 6B.15.3 |
| Dunmere | `dunmere-village` | `surface_focus_commit` | Mara/Lysa/Garren hub. | Need prove multiple NPC dialogues can be completed sequentially. | 6B.15.2, 6B.15.3 |
| Signs of Movement | `old-forest-path` | `surface_focus_commit` | Route from village to shrine. | Shrine transition requires `shrine_path_known`; need route-proof from Garren/output state. | 6B.15.4 |
| The Gathering Point | `shrine-ruins` | `surface_focus_commit` | Rusk confrontation scene. | Combat handoff boundary must be explicit and player-safe. | 6B.15.4 |
| The Truth Below | `subterranean-hollow` | `surface_focus_commit` | Existing later/endgame content. | Out of official slice except as a future_supported/deeper-source hint; avoid final mystery reveal. | 6B.15.7 |

### Transitions

| Transition | From -> To | Current status | Slice use | Notes |
| --- | --- | --- | --- | --- |
| `leave-broken-caravan-for-inn` | `broken-caravan-site` -> `grey-road-inn` | Live | Canonical route | Must be reachable from starting scene. |
| `speak-with-elin` | `grey-road-inn` -> `elin-memory-fragments` | Live legacy transition | Alternate or support route | Focus/Commit Elin uses dialogue page route; avoid confusing duplicate route presentation. |
| `return-to-common-room` | `elin-memory-fragments` -> `grey-road-inn` | Live | Recovery route | Useful if legacy Elin path remains visible. |
| `continue-to-dunmere` | `grey-road-inn` -> `dunmere-village` | Live | Canonical route | Must not require unsupported open-world navigation. |
| `follow-the-old-path` | `dunmere-village` -> `old-forest-path` | Live | Canonical route | Should be understandable after Garren/local clues. |
| `follow-the-tracks-to-the-shrine` | `old-forest-path` -> `shrine-ruins` | Live with `shrine_path_known` flag | Canonical route | Need prove Garren or equivalent route output sets/permits this. |
| `descend-beneath-the-shrine` | `shrine-ruins` -> `subterranean-hollow` | Gated by `surface_threat_resolved` and `shrine_depth_unlocked` | Not official endpoint | Should remain hidden/blocked until supported conditions; no broken player target. |

### NPCs And Dialogue

| NPC | NPC id | Focus/Commit scene id | Scene slug | Slice role | Status/gaps |
| --- | --- | --- | --- | --- | --- |
| Tomas Rell | `tomas-rell` | `greyvale_tomas_roadside_worries_dialogue` | `greyvale-tomas-roadside-worries-dialogue` | Innkeeper/local road pattern lead. | Runtime-loadable and UI-routable; needs live web start-to-dialogue proof. |
| Elin Harrow | `elin-harrow` | `greyvale_elin_memory_dialogue` | `greyvale-elin-memory-dialogue` | Survivor memory, shrine bell, hollow-path hint. | Focus/Commit scene exists; legacy `elin-memory-fragments` also exists. 6B.15 should clarify player route precedence. |
| Mara Vellin | `mara-vellin` | `greyvale_mara_dunmere_pressure_dialogue` | `greyvale-mara-dunmere-pressure-dialogue` | Authority pressure, incomplete/misleading assumption. | Needs village hub sequential dialogue smoke. |
| Lysa Fen | `lysa-fen` | `greyvale_lysa_grief_suspicion_dialogue` | `greyvale-lysa-grief-suspicion-dialogue` | Grief/suspicion, partial social clue. | Needs player-safe partial clue proof in UI/read model. |
| Garren Holt | `garren-holt` | `greyvale_garren_path_knowledge_dialogue` | `greyvale-garren-path-knowledge-dialogue` | Old path/shrine route lead. | Need prove route knowledge/flag supports shrine route. |
| Rusk | `rusk-bandit` | `greyvale_rusk_at_the_shrine_dialogue` | `greyvale-rusk-at-the-shrine-dialogue` | Shrine antagonist and endpoint boundary. | Combat remains combat_pending/future_supported; must be official safe stop. |

### Knowledge And Objective IDs

Core slice clues and outputs should use existing canonical IDs:

- `caravan_irregularity`
- `attack_staged`
- `strange_tracks_leave_road`
- `innkeeper_tracks_road_patterns`
- `woman_near_hearth_survived_road_attack`
- `knows_elin_name`
- `survivor_fears_more_than_bandits`
- `dunmere_wants_simple_answer`
- `village_blames_hunter_and_road`
- `garren_knows_old_paths`
- `old_path_still_used`
- `tracks_converge_on_shrine`
- `bandits_not_fully_self_directed`
- `shrine_depth_unlocked`
- `hollow_reaches_shrine_above`

Core objective IDs:

- `witness-the-aftermath`
- `gather-local-insight`
- `follow-the-leads`
- `uncover-the-truth`
- `resolve-the-threat`

High-risk hidden or late-game content:

- `knows_whispering_presence_name`
- `presence_bends_attention`
- `anchor_spreads_influence`
- `presence_encourages_false_certainty`
- `hollow_reaches_shrine_above`

These can exist in content but must remain player-safe, partial, or hidden according to current visibility policy.

## 4. Canonical Player Route

The recommended canonical route for Stage 6B.15 acceptance is:

| Step | Entry condition | Backend services | UI surfaces | Expected state/output | Likely failure modes | Test needed |
| --- | --- | --- | --- | --- | --- | --- |
| Start adventure | Active character exists or can be selected/created. | Dashboard/start adventure, campaign assignment, scene view. | Dashboard, campaign preview, scene page. | Greyvale campaign starts at `broken-caravan-site`, objective `witness-the-aftermath` active. | No active character, duplicate campaign, wrong start scene. | Web start/resume smoke. |
| Broken Caravan surface | Current scene is `broken-caravan-site`. | Exploration read model, narration composer. | Scene surface, references, action composer. | Player sees aftermath and safe possible actions. | Repetitive NPC/action narration, missing affordances. | UI/read-model scene clarity test. |
| First exploration action | Beat Action available. | Preview/submit/resolve, output bundle, history/knowledge. | Action preview/result, Latest Development. | Clue/objective progress, next action window. | Preview commits, duplicate output, stale controls. | Lifecycle regression plus start-scene smoke. |
| Move to inn | Caravan-to-inn transition available. | Transition handling/current scene. | Current scene page. | Current scene becomes `grey-road-inn`. | Transition intent emitted but scene not updated, player dead end. | Transition smoke. |
| Tomas dialogue | Inn scene has Tomas dialogue affordance. | Dialogue current, Focus/Commit runtime. | Conversations card, dialogue page. | Tomas scene loads with surface, CQs, CSMs, exits. | No Talk button, legacy action starts dialogue result but no route, missing content import. | UI and backend dialogue entry test. |
| Tomas output | Tomas path completed or minimally exited. | CSM/CQ/exit, output services. | Dialogue result, summary, current scene. | `innkeeper_tracks_road_patterns`, Elin lead if authored, completed record once. | Active dialogue orphaned, duplicate completed record. | Handoff/output regression. |
| Elin dialogue | Elin affordance/lead available. | Dialogue runtime and archive. | Dialogue page. | Survivor memory/shrine bell/hollow hint partial and player-safe. | Legacy Elin route conflicts with Focus/Commit route. | Route precedence/alternative route test. |
| Continue to Dunmere | Inn route available. | Transition handling/current scene. | Scene page. | Current scene `dunmere-village`. | Unsupported navigation expectation. | Minimal transition smoke. |
| Mara/Lysa/Garren cluster | Village scene loaded. | Dialogue runtime, output consistency. | Conversations card, dialogue pages. | Mara/Lysa partial/misleading clues, Garren old path lead. | One completed dialogue blocks next NPC; false clue treated as truth. | Village cluster smoke. |
| Old path and shrine | Route lead available. | Transition/current scene, objective/knowledge. | Scene page, latest development. | Reach `old-forest-path`, then `shrine-ruins` when `shrine_path_known` supported. | Missing route flag, target hidden forever, open-world gap. | Route unlock test. |
| Rusk dialogue | Shrine scene loaded. | Dialogue runtime, combat handoff metadata. | Dialogue page, completion/escalation UI. | Rusk unstable antagonist, shrine influence partial clue, combat_pending/future_supported safe endpoint. | Broken combat target, hidden internals leak, final mystery reveal. | Shrine cluster smoke. |
| Review and resume | Endpoint reached. | Knowledge/history/objectives/archive/search/read models. | Journal/history/archive/current scene. | Clean record of learned clues and current action state. | Duplicate journal, no next state, stale dialogue controls. | End-state smoke. |

## 5. Alternate Supported Routes

Alternate routes should be supported only where existing content already supports them:

- The player may complete more than one exploration action at the Broken Caravan before leaving for the inn.
- The player may speak with Elin before or after Tomas if the inn scene exposes her Focus/Commit dialogue safely.
- The legacy `speak-with-elin` route to `elin-memory-fragments` may remain available, but it should not confuse the Focus/Commit route or present two contradictory Elin experiences.
- The player may speak with Mara, Lysa, and Garren in different orders in Dunmere.
- Accusation/refusal/failure paths in dialogue should not hard-lock the campaign.
- Rusk refusal/failure should move toward combat_pending, future_supported escalation, or safe current-scene recovery.

Unsupported routes should be player-safe:

- Direct combat web resolution is not part of 6B.15.
- Open-world free navigation is not part of 6B.15.
- Final hollow resolution is not the official endpoint.

## 6. Start, Resume, And Recovery Audit

Current implementation:

- Dashboard route `/play` shows active character, starter adventure, and current adventure state.
- Campaign preview route `/play/campaign` can start the starter adventure or continue the current scene.
- Scene route `/play/campaign/scene` loads current scene.
- Dialogue route `/play/campaign/dialogue?dialogue_scene_id=...` loads Focus/Commit dialogue.
- Backend start path uses `startWebAdventure`, active character resolution, and Greyvale starter defaults.

Expected 6B.15 behavior:

- A new web player with an active character can start Greyvale without SMS.
- A player without an active character gets a clear recovery path.
- A returning player can resume current scene/dialogue safely.
- Refresh after action resolution or dialogue completion reloads current state.
- Completed dialogue controls do not remain active.
- No duplicate campaign/adventure is created by repeated start clicks.

Gaps to address:

- Add a fresh-account or representative start/resume web smoke test.
- Add a manual checklist item for "no active character" recovery.
- Confirm production seed/import path includes all content needed by web start and Focus/Commit dialogue.

Owner sub-build: 6B.15.1.

## 7. Exploration Playability Audit

Current implementation:

- Greyvale exploration scenes use `surface_focus_commit` where expected.
- Scene references include visible affordances, NPCs, paths, and dialogue scene IDs.
- Flutter scene UI renders narrative surface, scene references, Latest Development, Conversations card, and action composer.
- Recent narration work should avoid repeating NPCs in narration/opportunities/focus unless authored JSON explicitly repeats them.

Expected 6B.15 behavior:

- Possible actions are narrated once and feel natural.
- The UI clearly separates scene narration, conversations, freeform action, and current objective.
- Free Focus does not consume Beat Action.
- Beat Action preview/submit/resolution lifecycle is clear.
- Transition labels are safe and actionable.
- Latest Development reflects recent exploration or dialogue outcome without hiding the current scene state.

Gaps to address:

- Run real Flutter/web smoke through the Broken Caravan and Grey Road Inn scene pages.
- Add or verify tests that conversations do not disappear when NPCs are also mentioned in narration.
- Add manual playtest prompts for whether action opportunities feel artificial or repeated.

Owner sub-build: 6B.15.2.

## 8. Dialogue Playability Audit

Current implementation:

- Focus/Commit scenes exist for Tomas, Elin, Mara, Lysa, Garren, and Rusk.
- Flutter dialogue page renders conversation surface, passive social insight, Clarifying Questions, Committed Social Moves, exits, completed state, transcript/archive access.
- Flutter scene page can expose Talk buttons when `dialogue_scene_id` is present in current scene references.
- Runtime lazy-loads bundled Greyvale Focus/Commit scenes for dialogue registry.

Expected 6B.15 behavior:

- Dialogue is visibly different from exploration.
- Scene page exposes clear "Talk with ..." CTAs for available NPCs.
- Dialogue page shows:
  - NPC/conversation title.
  - Opening conversation surface.
  - Clarifying Questions that do not spend the dialogue beat.
  - Committed Social Moves that do spend the dialogue beat.
  - Preview/submit/resolution state.
  - Exit options.
  - Completed summary and route back to current scene.
- Player-facing dialogue hides hidden DCs, branch IDs, raw relationship/social meters, and debug routing.
- GM/dev debug remains permission-gated.

Gaps to address:

- Decide and document whether legacy Elin memory scene remains an alternate path or should be de-emphasized behind Focus/Commit dialogue entry.
- Add a live app smoke for each hub: inn, village, shrine.
- Confirm Focus/Commit dialogue registration is deploy/import-safe, not only test/lazy registry-safe.

Owner sub-build: 6B.15.3.

## 9. Objective, Knowledge, History, Recap, Archive, And Search Audit

Current implementation:

- Stage 6B.13.3 and 6B.13.6 added output consistency and full-loop regression coverage.
- Knowledge, objectives, history, Latest Development, completed records, transcripts, archive, and search have player-safety regression tests.
- Shared output bundle/provenance helpers exist from Stage 6B.14.4.
- Stage 6B.15.4 adds a canonical route memory regression, campaign-history dialogue entries, and journal coverage for active-campaign knowledge rows.

Expected 6B.15 behavior:

- Player journal shows each learned clue once.
- Misleading or partial clues remain framed as assumptions/suspicions, not final truth.
- Objective progress is coherent from aftermath to leads to shrine confrontation.
- History ordering is deterministic enough to understand what happened.
- Latest Development gives the player the latest meaningful result without replacing the current action state.
- Completed dialogue archive/search works after dialogue finalization.

Greyvale-specific constraints:

- Tomas preserves road pattern/local insight.
- Elin preserves survivor memory and shrine bell/hollow hint without revealing final truth.
- Mara preserves incomplete pressure-framed assumption.
- Lysa preserves partial suspicion.
- Garren preserves old path/shrine route knowledge.
- Rusk preserves instability/shrine influence and combat pressure without solving the mystery.

Gaps to address:

- Productize the final Rusk endpoint copy/status so `resolve-the-threat` remains active or awaiting support instead of falsely completed while combat remains future-supported.
- Add final rendered Flutter checks for the composed memory surfaces during the acceptance pass.

Owner sub-build: 6B.15.4 for memory flow; remaining endpoint status is 6B.15.5.

## 10. Rusk Boundary And Completion Audit

Current implementation:

- Rusk Focus/Commit scene id: `greyvale_rusk_at_the_shrine_dialogue`.
- Rusk NPC id: `rusk-bandit`.
- Scene context: `shrine-ruins`.
- Rusk outputs can include `bandits_not_fully_self_directed`, `shrine_depth_unlocked`, and `hollow_reaches_shrine_above`.
- Combat handoff status is modeled as combat_pending or future_supported rather than live web combat.
- Existing surface-resolution and hollow-final events exist, but combat and final hollow loop are outside this slice.

Expected 6B.15 behavior:

- Rusk is a real threat and visibly unstable.
- Conversation can collapse into violence/escalation.
- Success can reveal partial shrine influence/deeper-source clues only.
- Failure/refusal can safely reach combat_pending, future_supported, or a combat-ready current scene state.
- Player sees safe escalation/risk language.
- GM/dev can inspect exact combat/future_supported routing.
- No final mystery reveal.
- No broken combat or hollow transition target is emitted to players.

Required decision for 6B.15.4:

- Define the official vertical-slice endpoint label. Recommended label: "Shrine confrontation reached - combat pending."

Owner sub-build: 6B.15.4.

## 11. Player UI Audit

Current player routes:

- `/play`: dashboard/start/resume.
- `/play/campaign`: campaign preview.
- `/play/campaign/scene`: current scene.
- `/play/campaign/dialogue?dialogue_scene_id=...`: Focus/Commit dialogue.
- `/play/campaign/history`: history.
- `/play/campaign/knowledge`: knowledge journal.

Expected player UI behavior:

- Dashboard clearly shows whether the player can start or continue Greyvale.
- Scene page clearly shows current location, scene narration, current aim, conversations, action composer, latest result, and recovery warnings.
- Dialogue page clearly shows dialogue-specific interaction categories.
- Stale/ended/unavailable errors explain what to do next.
- Completed dialogue hides active controls and offers return/current-scene/archive affordances.
- Rusk endpoint shows safe escalation/combat-pending language, not internal routing metadata.

Gaps to address:

- Add a manual UI checklist for fresh start, resume, inn dialogue, village cluster, shrine/Rusk endpoint, refresh recovery, and mobile/narrow layout sanity.
- Add a single "slice endpoint reached" UI/read-model assertion if current product has a suitable status field; otherwise document as manual/GM-dev confirmation for 6B.15.4.

Owner sub-build: 6B.15.6.

## 12. GM/Dev Audit

Current implementation:

- GM/dev exploration mechanics, dialogue debug, visibility boundary, and output provenance tests exist from 6B.11, 6B.13.5, and 6B.14.
- Debug routes/panels should remain permission-gated.

Expected 6B.15 behavior:

- Authorized GM/dev can inspect:
  - current campaign/character/scene.
  - exploration surface/source data.
  - dialogue scene routing.
  - CQs/CSMs/checks/result bands.
  - state reads/writes.
  - knowledge/objective/history/output provenance.
  - stale/double-submit diagnostics.
  - Rusk combat_pending/future_supported routing.
- Normal players cannot access GM/dev debug routes.
- Cross-user, cross-character, and cross-campaign access remains blocked.

Gaps to address:

- Add one canonical-route GM/dev diagnostic acceptance check that confirms the final Rusk endpoint can be debugged.
- Include permission checks in final 6B.15 acceptance command group.

Owner sub-build: 6B.15.6.

## 13. Acceptance Suite Design

The final Stage 6B.15 acceptance suite should combine automated and manual coverage.

### Automated Critical Coverage

| Scenario | Test type | Expected result | Target sub-build |
| --- | --- | --- | --- |
| Fresh web start | Backend/service plus Flutter widget/mock | Starts Greyvale at `broken-caravan-site`. | 6B.15.1 |
| Resume current adventure | Backend/service plus UI smoke | Returns current scene/action state. | 6B.15.1 |
| Broken Caravan -> Inn | Backend clustered smoke | Exploration action and transition work. | 6B.15.2 |
| Inn dialogue cluster | Backend/UI smoke | Tomas and Elin Focus/Commit are visible and usable. | 6B.15.3 |
| Village dialogue cluster | Backend/UI smoke | Mara, Lysa, Garren complete without blocking each other. | 6B.15.3 |
| Garren route -> Shrine | Backend clustered smoke | Old path/shrine route is live or safely supported. | 6B.15.4 |
| Rusk endpoint | Backend/UI smoke | Rusk reaches safe combat_pending/future_supported boundary. | 6B.15.4 |
| Output coherence | Backend full-loop | Journal/objectives/history/archive/search are coherent. | 6B.15.5 |
| Player visibility denylist | Backend and Flutter rendered output | No hidden/debug/internal leak. | 6B.15.6 |
| GM/dev debug permissions | Backend security | GM/dev sees diagnostics; players do not. | 6B.15.6 |
| Refresh/stale recovery | Backend/UI | Safe recovery after stale/ended submissions. | 6B.15.6 |
| Full canonical route smoke | Backend/service | Complete route from start to Rusk endpoint. | 6B.15.7 |

### Recommended Commands

| Command | Purpose | Environment | Stage use |
| --- | --- | --- | --- |
| `npm run test:interaction-core` | Shared contracts/lifecycle/visibility/output/path harness regression. | Local node. | Every 6B.15 sub-build. |
| `npm run build` | Hosting page build/sanity. | Local node. | UI-related sub-builds. |
| `npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale` | Greyvale content validation from backend package. | Local node. | Content/connective checks. |
| `$env:DB_HOST='localhost'; $env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'; npm run test:greyvale-full-loop` | DB-backed Greyvale full-loop regression. | Local Postgres/Docker or matching DB. | Final acceptance and any backend integration change. |
| `cd apps/player_app; & 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test` | Flutter test suite if local SDK path applies. | Local Flutter SDK. | UI sub-builds. |
| `cd apps/player_app; & 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze` | Flutter static analysis. | Local Flutter SDK. | UI sub-builds. |

If local Flutter path differs, use the repo owner's installed Flutter command.

## 14. Minimal Connective Content Policy

Stage 6B.15 may allow tiny connective fixes only when required for playability:

- Missing safe transition label.
- Missing scene affordance that points to already-existing content.
- Missing player-safe summary for an existing output.
- Broken manifest/registration reference.
- Typo that confuses route or objective understanding.
- Safe endpoint label for combat_pending/future_supported Rusk boundary.

Stage 6B.15 must not add:

- New major lore.
- New final mystery explanation.
- New full scene branches.
- New combat resolution.
- Open-world navigation.
- Major dialogue rewrites.
- New hidden mechanics visibility for players.

## 15. Blockers And Open Questions

| Blocker/question | Severity | Why it matters | Detection | Proposed owner |
| --- | --- | --- | --- | --- |
| Focus/Commit dialogue registration is runtime-bundled while manifest points legacy dialogue import at `content/dialogue/greyvale`. | High | Deployed content import may not communicate clearly that Focus/Commit scenes are production content. | Fresh deploy/import and dialogue registry smoke. | 6B.15.1, 6B.15.3 |
| Official Rusk endpoint label/status is not productized as slice completion. | High | Playtesters need to understand "this is as far as this slice goes." | Rusk UI/read-model smoke. | 6B.15.4 |
| Direct combat web resolution is not live. | High | Rusk failure/refusal cannot complete combat. | Rusk combat_transition expected path and UI smoke. | 6B.15.4 |
| Open-world scene movement is not Stage 6B.15. | Medium | Route transitions must rely on existing supported scene-state changes, not future navigation. | Canonical route smoke. | 6B.15.2, 6B.15.7 |
| Legacy Elin scene may coexist with Focus/Commit Elin. | Medium | Player may see duplicate/conflicting Elin routes. | Inn scene UI smoke and route precedence test. | 6B.15.3 |
| Final hollow content exists but is out of official endpoint. | Medium | Player-facing outputs must not reveal final mystery or imply completed combat. | Visibility denylist and end-state journal/search audit. | 6B.15.4, 6B.15.5 |
| Full chained smoke has been deferred until 6B.15. | Medium | 6B.13 cluster tests do not prove one continuous player journey. | New full canonical route smoke. | 6B.15.7 |
| Live deployment content import may lag code deployment. | Medium | Flutter UI can be correct while droplet content is stale. | Deploy/import checklist and version smoke. | 6B.15.8 |

## 16. Proposed Stage 6B.15 Sub-Build Plan

### 6B.15.1 - Start, Resume, Import, And Registry Readiness

Goal: prove a normal web player can start/resume Greyvale and that production import/registry state contains the expected exploration and Focus/Commit dialogue content.

Status: implemented for web start/resume and initial state hardening. Implementation notes live at `docs/greyvale/STAGE_6B_15_1_SLICE_ENTRY_START_RESUME_INITIAL_STATE.md`.

Scope:

- Start/resume backend tests.
- Active character recovery.
- Greyvale content import validation.
- Dialogue registry/import audit.
- Dashboard/campaign preview route proof.

Non-goals:

- No route/content rewrite.
- No combat/navigation.

Acceptance:

- Fresh start reaches `broken-caravan-site`.
- Resume returns current scene/dialogue state.
- Focus/Commit scenes are discoverable in deployed/runtime registry.
- Legacy dialogue remains retained and non-conflicting.

### 6B.15.2 - Exploration Route Playability Pass

Status: implemented in [Stage 6B.15.2 Exploration Segment Playability Pass](STAGE_6B_15_2_EXPLORATION_SEGMENT_PLAYABILITY_PASS.md).

Goal: prove Broken Caravan -> Inn -> Dunmere -> Old Path exploration route can be played with clear actions, transitions, and no repetitive NPC narration.

Scope:

- Scene narration/action opportunity audit.
- Beat Action and Free Focus smoke.
- Transition smoke through route scenes.
- Latest Development/current aim clarity.

Acceptance:

- Player can understand where they are and what they can do next.
- NPCs are not artificially repeated unless JSON explicitly repeats them.
- Transition labels are safe and actionable.

Implemented notes:

- Player-facing scene read models now merge authored affordances with live runtime opportunities, deduping by interaction/transition/action reference so required route transitions remain visible.
- Travel phrasing such as "head", "continue", "travel", "return", and "take" resolves through existing movement transitions.
- Regression coverage now walks `broken-caravan-site` -> `grey-road-inn` -> `dunmere-village` -> `old-forest-path` -> `shrine-ruins`, verifies dialogue entry discoverability for Tomas, Elin, Mara, Lysa, Garren, and Rusk, and checks player-safe payloads and GM/dev exploration diagnostics.

### 6B.15.3 - Dialogue Hub Playability Pass

Status: implemented in [Stage 6B.15.3 Dialogue Segment Playability Pass](STAGE_6B_15_3_DIALOGUE_SEGMENT_PLAYABILITY_PASS.md).

Goal: prove inn and village dialogue hubs feel like dialogue in the Flutter app and are robust in backend runtime.

Scope:

- Conversations card/CTA proof.
- Tomas, Elin, Mara, Lysa, Garren dialogue page smoke.
- Legacy Elin route precedence audit.
- Dialogue completion and return-to-scene behavior.

Acceptance:

- Player sees and can enter all intended Focus/Commit dialogues.
- CQs and CSMs are clearly distinguished.
- Multiple NPC dialogues can be completed in a hub.

Implemented notes:

- Regression coverage now verifies Tomas, Elin, Mara, Lysa, Garren, and Rusk are discoverable from their exploration scenes and playable through the player dialogue API.
- Clarifying Questions are asserted non-committing; Committed Social Move previews are asserted non-committing; submits are asserted to commit exactly once.
- Garren route dialogue now proves the authored `shrine_path_known` handoff can reveal the shrine transition, and Rusk dialogue proves the combat-pending handoff remains player-safe and GM/dev inspectable.
- No frontend UI changes were required in this pass because the existing Flutter dialogue page already renders conversation surface, Clarifying Questions, Committed Social Move preview/submit, exits, and completed state.

### 6B.15.4 - Objective, Knowledge, History, And Recap Flow

Goal: prove the full route leaves coherent player-facing records and supports resume.

Scope:

- Canonical route knowledge/objective state.
- Latest Development and history ordering.
- Completed records/transcripts/archive/search.
- Duplicate/idempotency checks.
- Current-state recap from existing authored outputs.

Acceptance:

- No duplicate clue noise.
- Partial/misleading clues are not confirmed as truth.
- Objective state is coherent at Rusk boundary.
- Completed dialogue records appear in campaign history.

Implemented notes:

- `backend/test/stage6b15-memory-recap-flow.test.js` verifies the route memory arc from Broken Caravan through Rusk's combat-pending deeper-source handoff.
- Campaign history now includes player-safe completed dialogue records as `dialogue_completed` entries.
- The knowledge journal includes active-campaign knowledge rows without a world instance, fixing a read-model seam for deterministic exploration progression outputs.
- No frontend changes were required; recap remains composed from current scene, journal, history, and archive/search surfaces.

### 6B.15.5 - Shrine Route And Rusk Endpoint Hardening

Goal: prove the player can reach the shrine/Rusk boundary and stop safely at the supported endpoint.

Scope:

- Rusk dialogue success/failure/refusal smoke.
- Formal combat_pending/future_supported player-safe endpoint status.
- Slice completion or awaiting-support state/copy.
- GM/dev routing diagnostics.

Acceptance:

- No broken combat target.
- No final mystery reveal.
- Endpoint message is safe and clear.

### 6B.15.6 - Player UI, Visibility, And Recovery Pass

Status: implemented in [Stage 6B.15.6 Player UI Playthrough Polish](STAGE_6B_15_6_PLAYER_UI_PLAYTHROUGH_POLISH.md).

Goal: prove the Flutter app communicates current state, errors, and recovery clearly across the route.

Scope:

- Rendered hidden-data denylist.
- Stale/ended/unavailable error UI.
- Refresh/resume UI smoke.
- GM/dev route permission checks.
- Mobile/narrow layout sanity.

Acceptance:

- Normal player never sees hidden/debug/internal data.
- GM/dev remains inspectable and permission-gated.
- Player is never left in a confusing dead-end state.

Implemented notes:

- Flutter dashboard, campaign preview, and scene screens now parse and render player-safe `slice_endpoint` state.
- The Rusk endpoint renders as a review/completion card with current-scene, history, knowledge, and campaign-overview recovery actions.
- The scene action composer is hidden when `slice_endpoint_reached`, preventing unsupported post-Rusk combat submits.
- Player-facing error mapping treats slice endpoint and awaiting-future-support conditions as safe recovery states.
- Rendered UI tests assert the endpoint view does not leak `combat_pending`, `future_supported`, encounter ids, stack traces, or other hidden/internal terms.

### 6B.15.7 - GM/Dev Slice Inspector And Regression Coverage

Status: implemented.

Outcome:

- Focused `/api/dev/greyvale-slice-inspector` route and service exist.
- Authorized GM/dev can inspect current slice state, exploration diagnostics, dialogue diagnostics, memory/output state, Rusk handoff internals, and player-vs-GM visibility comparison.
- Normal players are denied and player projections remain hidden-data safe.

Docs:

- `docs/greyvale/STAGE_6B_15_7_GM_DEV_SLICE_INSPECTOR_AND_REGRESSION_COVERAGE.md`

### 6B.15.8 - Canonical Full Route Acceptance Suite

Goal: create and run the official end-to-end canonical Greyvale route smoke.

Scope:

- Automated full route where feasible.
- Manual checklist for any browser-only/deploy-specific steps.
- Consolidated regression command group.

Acceptance:

- One command or documented command group validates the core slice.
- Manual checklist matches the official route and endpoint.

Status: implemented.

Outcome:

- Formal acceptance command: `npm run test:greyvale-vertical-slice`.
- Acceptance test: `backend/test/greyvale-vertical-slice-acceptance.test.js`.
- Semantic path fixture: `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`.
- Manual checklist: `docs/greyvale/GREYVALE_VERTICAL_SLICE_MANUAL_PLAYTHROUGH_CHECKLIST.md`.
- Final status: `docs/greyvale/STAGE_6B_15_FINAL_STATUS.md`.

### Deployment And Playtest Readiness Pass

Goal: confirm deployed Flutter hosting and DigitalOcean backend/content import are aligned for playtest.

Scope:

- Hosting build/deploy checklist.
- Backend restart/import checklist.
- Smoke test against deployed app.
- Known rollback/reimport notes.

Acceptance:

- Deployed app shows current scene/dialogue UI.
- Droplet content import includes current Greyvale package.
- Known unsupported combat/final content is communicated safely.

## 17. Risk Register

| Risk | Severity | Likelihood | Detection | Mitigation | Target |
| --- | --- | --- | --- | --- | --- |
| Runtime scene transitions and dialogue exits do not create one seamless route. | High | Medium | Canonical route smoke. | Use existing supported transition mechanics; document future 6G gaps. | 6B.15.2, 6B.15.7 |
| Focus/Commit dialogue works in tests but not after production import/deploy. | High | Medium | Deployed registry/import smoke. | Make registration explicit or document bundled runtime registry. | 6B.15.1, 6B.15.8 |
| Rusk endpoint feels like a broken stop instead of intentional slice boundary. | High | Medium | Rusk UI/manual playtest. | Add safe endpoint copy/status if minimal and non-lore. | 6B.15.4 |
| Legacy and Focus/Commit Elin routes confuse players. | Medium | Medium | Inn UI route audit. | Define route precedence or safe labels; no deletion. | 6B.15.3 |
| Hidden late-game/final-mystery metadata leaks through journal/search. | High | Low | Visibility denylist/end-state audit. | Reuse 6B.14 visibility helpers and tests. | 6B.15.5, 6B.15.6 |
| Player cannot recover after stale dialogue/action state. | High | Low | Refresh/stale tests. | Keep 6B.13.2/6B.13.4 recovery tests in command group. | 6B.15.6 |
| Full web E2E is too brittle locally. | Medium | Medium | Test command execution. | Use service-level canonical smoke plus manual deployed checklist. | 6B.15.7 |
| Content import order leaves legacy dialogue preferred over new dialogue. | Medium | Medium | Registry conflict test. | Verify ID/slug uniqueness and route metadata. | 6B.15.1 |

## 18. Manual Playtest Checklist Draft

Use this as the first manual checklist for 6B.15.7/6B.15.8.

1. Open the deployed or local Flutter app.
2. Sign in as a normal player.
3. Create or select an active character.
4. Start the Greyvale starter adventure.
5. Confirm the first scene is The Broken Caravan.
6. Read scene narration and confirm possible actions are understandable and not repetitive.
7. Use a Free Focus option if available.
8. Preview and submit one exploration Beat Action.
9. Confirm Latest Development and current aim update safely.
10. Continue to The Grey Road Inn.
11. Confirm a Conversations card or equivalent Talk CTA is visible for Tomas.
12. Open Tomas Focus/Commit dialogue.
13. Confirm dialogue page shows conversation surface, Clarifying Questions, Committed Social Moves, and exits.
14. Ask one Clarifying Question and confirm it does not consume the committed move.
15. Preview/submit one Committed Social Move.
16. Exit or complete Tomas and return to current scene.
17. Confirm knowledge/history/objective updates are clean.
18. Open Elin Focus/Commit dialogue if available.
19. Confirm Elin outputs remain partial/player-safe.
20. Continue to Dunmere.
21. Speak with Mara, Lysa, and Garren in any order.
22. Confirm Mara/Lysa clues are framed as assumption/suspicion, not confirmed truth.
23. Confirm Garren points toward old path/shrine route without revealing final truth.
24. Reach old forest path and shrine ruins if supported.
25. Open Rusk dialogue.
26. Trigger success or hard-ending path.
27. Confirm the player sees "Greyvale slice endpoint reached" or equivalent safe endpoint wording.
28. Confirm no `combat_pending`, `future_supported`, encounter id, final mystery, or hidden routing metadata appears to the player.
29. Refresh browser and confirm current state recovers.
30. Open knowledge, history, archive/search and confirm outputs are scoped, clean, and non-duplicative.
31. Attempt a stale/old dialogue/action control if possible and confirm safe recovery wording.
32. As GM/dev, inspect diagnostics for final route state.
33. As normal player, confirm GM/dev routes are inaccessible.
34. Confirm the endpoint review card offers Review Current Scene, History, and Knowledge actions where the route exposes them.
35. Confirm the freeform exploration action composer is not visible at the Rusk endpoint.
36. Confirm campaign preview and dashboard both show endpoint/review wording rather than Start or unsupported combat wording.
37. As an authorized GM/dev account, call `/api/dev/greyvale-slice-inspector` and confirm it reports identity/scope, slice status, current scene, exploration diagnostics, dialogue diagnostics, memory/output diagnostics, Rusk handoff internals, visibility comparison, and path-harness readiness.
38. As a normal player, call `/api/dev/greyvale-slice-inspector` and confirm the request is denied with safe wording and no hidden/internal/debug payload.

## 19. Test And Validation Strategy

Stage 6B.15 should use layered validation:

- Content validation for Greyvale package, scenes, transitions, knowledge, objectives, and dialogue registry.
- Backend service/integration tests for start/resume, route transitions, dialogue entry/completion, outputs, and endpoint state.
- Shared interaction-core tests for lifecycle, visibility, output, and path harness helpers.
- Flutter widget/model tests for player-facing start/scene/dialogue/output/error rendering.
- DB-backed Greyvale full-loop regression with local Postgres/Docker where available.
- Manual deployed checklist before declaring playtest readiness.

For this docs-first build, lightweight validation should include:

- Relevant file discovery using `rg`.
- Path sanity for referenced docs/content files.
- Greyvale content validation if cheap.
- Interaction-core regression if cheap.
- Hosting build sanity if cheap.

## 20. Overall Stage 6B.15 Acceptance Criteria

By the end of Stage 6B.15:

- A normal player can start or resume Greyvale in the Flutter web app.
- The player can progress through Broken Caravan, Grey Road Inn, Dunmere, old path, shrine route, and Rusk boundary using existing supported mechanics.
- Exploration Surface/Focus/Commit is playable and clear.
- Dialogue Conversation Surface/CQs/CSMs/exits are playable and clear.
- Tomas, Elin, Mara, Lysa, Garren, and Rusk Focus/Commit scenes are visible and usable where appropriate.
- Outputs accumulate coherently in knowledge, objectives, history, Latest Development, completed records, transcripts, archive, and search.
- Rusk endpoint is safe, intentional, and does not require live combat.
- Player-facing UI does not leak hidden/debug/internal data.
- GM/dev can inspect enough state and provenance to debug the full route.
- Refresh/stale/double-submit cases recover safely.
- Legacy dialogue/content remains retained and non-conflicting.
- Deployed Flutter/backend/content import are aligned for playtest.
- Remaining gaps are routed to future stages.

## 20A. Stage 6B.15.5 Endpoint Status

Stage 6B.15.5 hardens the Rusk boundary as the official current endpoint:

- Route: Broken Caravan -> Grey Road Inn -> Tomas/Elin -> Dunmere -> Mara/Lysa/Garren -> old path -> shrine ruins -> Rusk -> `exit_rusk_combat_pending`.
- Player read model: exposes `slice_endpoint.state === endpoint_reached` with safe "current slice endpoint" wording.
- Player action status: projects `slice_endpoint_reached` and disables further exploration submit/edit at the unsupported combat boundary.
- Internal debug: authorized GM/dev reads `debug.slice_endpoint.handoff_kind === combat_pending`, `future_supported_status`, and `target_encounter_id`.
- Persistence: no migration; endpoint is derived from existing Greyvale scene/flag state.
- Regression: `npm --prefix backend run test:greyvale-full-loop` includes the Rusk endpoint boundary test.

## 20B. Stage 6B.15.6 Player UI Endpoint Status

Stage 6B.15.6 aligns Flutter player screens with the endpoint read model:

- Model parsing: `CurrentAdventureDashboard` and `CurrentSceneView` now parse `slice_endpoint`.
- Dashboard/campaign preview: endpoint state renders as a safe review card instead of a generic active adventure prompt.
- Scene page: endpoint state renders near the current aim/status area and hides the action composer.
- Recovery actions: endpoint review offers current-scene, history, knowledge, and campaign-overview navigation where appropriate.
- Error mapping: endpoint and awaiting-support API states map to safe player recovery text.
- Visibility: Flutter rendered-output tests include endpoint wording and denylist `combat_pending`, `future_supported`, encounter ids, branch ids, stack traces, and debug/internal terms.
- Persistence: no migration and no backend schema/read-model change; this pass consumes the existing 6B.15.5 endpoint projection.

## 20C. Stage 6B.15.7 GM/Dev Slice Inspector Status

Stage 6B.15.7 adds a focused GM/dev-only Greyvale vertical-slice inspector:

- Route: `GET /api/dev/greyvale-slice-inspector`.
- Permission: requires the existing `can_advance_beats` GM/dev capability.
- Scope: aggregates current slice status, identity/campaign/character scope, current scene, action window, exploration mechanics debug, dialogue debug workspace, objective/knowledge/history/archive/search diagnostics, Rusk endpoint handoff debug, player-vs-GM visibility comparison, and path-harness readiness.
- Player safety: normal player routes remain unchanged; the inspector embeds only reduced player-safe projections for comparison and denylist scanning.
- Rusk endpoint: GM/dev can inspect `combat_pending`, `future_supported` status, target encounter id, source scene/dialogue/exit ids, and endpoint flags; player projection hides those internals.
- Regression: `backend/test/stage6b15-gm-dev-slice-inspector.test.js` covers authorization, active-slice inspection, active-dialogue inspection, endpoint handoff inspection, and player-projection denylist checks.
- Command coverage: `npm --prefix backend run test:greyvale-full-loop` now includes the 6B.15.7 inspector regression.
- Persistence: no migration and no player-facing payload shape change.

## 21. Out Of Scope Routing

- Shared interaction core cleanup -> Stage 6B.14 already completed; future cleanup only if discovered.
- Playtest declaration after implementation -> end of Stage 6B.15.
- Beat resolution quality/orchestration overhaul -> Stage 6C.
- GM campaign-level tooling -> Stage 6F.1.
- Open-world scene movement/navigation -> Stage 6G.
- Full rules/check transparency for players -> Stage 6H.
- Combat encounter web MVP/combat overhaul -> Stage 6I.
- SMS delivery polish -> later SMS-focused stage.
- Final hollow mystery resolution playability -> post-Rusk/full-loop stage after combat/navigation decisions.

## 22. Readiness Recommendation

Stage 6B.14 left the codebase ready to begin Stage 6B.15. The recommended next step is 6B.15.1: start/resume/import/registry readiness. The biggest early risk is not creative content but production alignment: the Flutter app, DigitalOcean backend, content import, and Focus/Commit dialogue registry must all agree on the same Greyvale scene/dialogue IDs.

After 6B.15.1 proves that foundation, proceed through exploration playability, dialogue hub playability, shrine/Rusk endpoint, output end-state, UI/recovery, full route acceptance, and deployment readiness in order.
