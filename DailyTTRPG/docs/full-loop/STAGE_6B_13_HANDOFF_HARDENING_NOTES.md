# Stage 6B.13.1 Handoff Hardening Notes

These notes record the concrete implementation paths and regression coverage added for the Stage 6B.13.1 exploration-dialogue handoff pass. They are intentionally narrow: this stage hardens the current loop without adding navigation, combat handoff, or shared interaction core changes.

## Runtime Code Paths

| Handoff concern | Route or service | Current behavior |
| --- | --- | --- |
| Load current exploration scene | `GET /api/play/current-scene`, `characterSceneViewService.js` | Returns the active campaign scene, action status, visible affordances, known facts, objective, and safe player state. |
| Enter/load dialogue | `GET /api/play/dialogue/current`, `getDialogueFocusCommitStateForAccount`, `prepareDialogueRuntime` | Resolves active player context, requested dialogue scene id, runtime state row, relationship defaults, and transcript. Bundled Greyvale Focus/Commit scene JSON now lazy-loads into the runtime registry outside test-only registration. |
| Runtime state storage | `dnd5e_dialogue_scene_state` with `field_name = '__runtime_state__'` | Stores per-character, per-dialogue scene status, asked CQs, committed move count, fallback usage, exit result, transition, latest development, transcript id, and completed record id. |
| Clarifying Question resolution | `POST /api/play/dialogue/clarifying-question/resolve` | Applies CQ result, knowledge grants, relationship writes, transcript turns, and player-facing current dialogue state. |
| Committed Social Move preview | `POST /api/play/dialogue/social-move/preview` | Returns player-safe preview text, check preview, beat-spend signal, and overlap/fallback guidance. Internal match confidence is now stripped from the player response. |
| Committed Social Move submit | `POST /api/play/dialogue/social-move/submit` | Applies check/no-check/fallback branch, knowledge grants, relationship writes, transcript turns, latest development, locks/unlocks, and player-facing current dialogue state. |
| Dialogue exit/finalization | `POST /api/play/dialogue/exit`, `resolveDialogueExitForAccount`, `finalizeDialogueArchive` | Marks runtime state exited, writes exit transcript turn, creates or reuses completed record, completes transcript, indexes archive/search, and returns transition intent. |
| Completed archive/search | `dialogueArchiveService.js` | Player archive/search reads completed records and player-facing transcript turns after active dialogue state is no longer needed. |
| GM/dev dialogue debug | `GET /api/dev/dialogue-debug`, `dialogueDebugWorkspaceService.js` | Requires existing debug/Advance Beat capability and exposes scene state, availability, preview mapping, relationship audit, transcript, validation, path data, and timeline. |

## Fixes Applied

- Added an active-runtime guard for dialogue mutating paths. CQ resolution, social-move preview, social-move submit, and dialogue exit now reject an already exited dialogue with the safe player message: `This conversation has ended. Return to the current scene.`
- Preserved `GET /api/play/dialogue/current` behavior for completed dialogues. Players can still see an exited read model and completed record linkage, but cannot mutate it.
- Stripped internal social-move match `confidence` from player-facing preview responses. The value remains available for persistence/debug use through the internal preview object and GM/dev diagnostics.
- Prevented duplicate exit attempts from appending new transcript turns or creating duplicate completed dialogue records.
- Added runtime discovery for bundled Greyvale Focus/Commit scenes under `content/dialogue_focus_commit/greyvale`, so real app sessions can load Tomas/Elin/Mara/Lysa/Garren/Rusk by `dialogue_scene_id` without test-only registration.
- Added player-safe dialogue entry metadata to visible NPCs, NPC affordances, and scene reference entries so exploration can route to a specific Focus/Commit scene instead of the generic dialogue page.

## Regression Coverage Added

New suite: `backend/test/dialogue-greyvale-handoff-regression.test.js`

Covered scenarios:

- Tomas entry from the current Greyvale exploration state, survivor CQ, player-safe CSM preview, move resolution, exit to Elin lead, current-scene refresh, knowledge journal check, archive detail, search, and subsequent Elin load.
- Stale completed-dialogue operations: CQ after exit, preview after exit, submit after exit, and duplicate exit all return safe 409 errors without duplicate completed records.
- Dunmere cluster continuity: Mara completes and exits to Dunmere village, then Lysa loads as a separate active dialogue without stale Mara locks.
- Shrine route and escalation continuity: Garren route lead exits to `old-forest-path`; Rusk escalation exits to `shrine-ruins` as combat-pending content without exposing hidden combat routing internals.
- GM/dev permission gate: normal player is denied dialogue debug; authorized GM/dev can inspect exited Garren and Rusk handoff state, relationship writes, and exit audit timeline.
- Player-facing denylist checks across current scene, dialogue state, CQ result, preview, CSM result, exit response, archive, search, history, knowledge, and safe stale-state errors.

## Current Gaps Deferred

- Exploration affordance-to-dialogue entry is now wired for visible NPC Focus/Commit scenes via `dialogue_scene_id` metadata and Flutter scene-reference Talk buttons. Full multi-scene browser/E2E smoke remains a 6B.13.6 item.
- Dialogue exits return transition intent such as `elin-memory-fragments`, `old-forest-path`, or `shrine-ruins`; they do not yet perform open-world navigation or scene movement. That remains out of scope for 6B.13.1 and routes to 6G/6I where appropriate.
- Active dialogue does not yet impose a global lock that blocks all exploration Beat Actions. The current 6B.13.1 tests verify dialogue state is not corrupted; broader action-window conflict policy belongs in 6B.13.2.
- Latest Development is dialogue-local in the current runtime response. Campaign history and scene read models remain safe, while richer full-loop presentation belongs in 6B.13.3.
- Flutter player UI now honors `dialogue_scene_id` query parameters and provides scene-reference Talk buttons for dialogue-enabled NPCs. Broader stale-ended-dialogue recovery remains covered in the 6B.13.4 notes.

## Validation Commands

Run from `DailyRPG/backend` with a local DB override when executing outside Docker:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
node --test test/dialogue-greyvale-handoff-regression.test.js
node --test test/dialogue-greyvale-fixture-regression.test.js
```

Syntax-only checks:

```powershell
node --check backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js
node --check backend/test/dialogue-greyvale-handoff-regression.test.js
```
