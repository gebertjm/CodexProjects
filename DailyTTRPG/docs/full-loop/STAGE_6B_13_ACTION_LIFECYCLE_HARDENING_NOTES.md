# Stage 6B.13.2 Action Lifecycle Hardening Notes

These notes record the concrete action-window, preview, submit, resolution, and stale-state hardening added in Stage 6B.13.2. The pass intentionally keeps the current exploration/dialogue runtime architecture and adds boundary checks around existing services.

## Runtime Code Paths

| Lifecycle concern | Route or service | Current behavior |
| --- | --- | --- |
| Exploration current window | `GET /api/play/current-scene`, `characterSceneViewService.js`, `beatWindowTimingService.js` | Returns `action_status`, current `action_window_id`, submit/edit availability, and submitted action summary. |
| Exploration Beat Action preview | `POST /api/play/action/preview`, `previewWebAction` | Resolves player input against visible affordances and Free Focus overlap; does not write committed action state. |
| Exploration Beat Action submit | `POST /api/play/action/submit`, `submitWebAction`, `storeWebActionSubmission` | Stores one row per `(action_window_id, character_id)` using existing conflict/update semantics. |
| Exploration Beat Action resolution | `POST /api/dev/advance-beat`, `advanceBeatForDevAccount` | Locks the open action window, resolves through play state, marks the window resolved, records a player beat result, and refreshes current scene. |
| Free Focus | `POST /api/play/free-focus/resolve`, `resolveFreeFocusForAccount` | Persists/reopens a versioned `free_focus` interaction result without creating a web action submission. |
| Dialogue current state | `GET /api/play/dialogue/current`, `prepareDialogueRuntime` | Creates or loads active dialogue runtime state and transcript. |
| Dialogue Clarifying Question | `POST /api/play/dialogue/clarifying-question/resolve` | Persists/reopens CQ result without increasing committed social move count. |
| Dialogue CSM preview | `POST /api/play/dialogue/social-move/preview` | Resolves authored move/fallback/overlap without creating a social move record. |
| Dialogue CSM submit | `POST /api/play/dialogue/social-move/submit` | Persists one resolved social move record per accepted submit, increments committed move count, and appends transcript turns. |
| Dialogue exit | `POST /api/play/dialogue/exit`, `finalizeDialogueArchive` | Marks dialogue exited, completes transcript, creates or reuses completed record, and indexes archive/search. |
| GM/dev lifecycle visibility | `/api/dev/exploration-mechanics`, `/api/dev/dialogue-debug` | Existing capability-gated debug routes expose submitted action, preview mapping, dialogue state, relationship writes, transcript, validation, and audit timeline. |

## Lifecycle Context Tokens

Exploration previews now include:

```json
{
  "lifecycle_context": {
    "action_window_id": "123",
    "submission_version": 0
  }
}
```

Submitting with this context verifies:

- the submitted `action_window_id` still matches the current active action window
- the expected `submission_version` still matches the current submitted action version

Dialogue previews now include:

```json
{
  "lifecycle_context": {
    "dialogue_scene_state_id": "456",
    "committed_social_move_count": 0
  }
}
```

Submitting or mutating dialogue with this context verifies:

- the submitted dialogue scene state still matches the active runtime state row
- the expected committed social move count still matches the current dialogue count

These tokens are backwards-compatible. Existing clients that do not send them keep current behavior. Clients that do send them get deterministic stale-state rejection.

## Fixes Applied

- Added action lifecycle context to exploration preview and submit responses.
- Added optional action-window/version validation to exploration submit.
- Added dialogue lifecycle context to CSM preview, overlap preview, CQ result/reopen result, CSM submit result, and exit result.
- Added optional dialogue state/count validation to CQ, CSM preview, CSM submit, and dialogue exit.
- Added a player-safe active-dialogue conflict guard to exploration preview/submit. While a dialogue runtime is active for the character/campaign, exploration actions return: `Finish or leave the active conversation before submitting an exploration action.`
- Kept existing web action one-row-per-window storage semantics. Duplicate submits with a stale lifecycle context are rejected; submits without lifecycle context can still use the existing edit/update path.

## Regression Coverage Added

New suite: `backend/test/full-loop-action-lifecycle-regression.test.js`

Covered scenarios:

- Exploration preview does not create a web action submission.
- Free Focus persists/reopens once and does not consume the Beat Action slot.
- Exploration submit creates one web action submission.
- Duplicate exploration submit with stale lifecycle context is rejected safely.
- Dev beat advance resolves the action window and records one player beat result.
- Submitting against an old action window after resolution is rejected safely.
- Dialogue CQ resolves/reopens without creating a social move record.
- Dialogue CSM preview does not create a social move record.
- Dialogue CSM submit creates one social move record.
- Duplicate dialogue submit with stale committed-move count is rejected safely.
- Dialogue exit finalizes completed record once.
- Active dialogue blocks exploration preview/submit until exited.
- Foreign action lifecycle tokens and dialogue lifecycle tokens cannot be used by another character/account.

## Player-Facing Error Behavior

Player-safe lifecycle errors now use these messages:

- Stale exploration action/window/version: `That moment has changed. Review the current scene and choose your next action.`
- Active dialogue conflict: `Finish or leave the active conversation before submitting an exploration action.`
- Ended dialogue: `This conversation has ended. Return to the current scene.`
- Stale dialogue state/count: `That moment has changed. Review the current conversation and choose your next move.`

The regression suite asserts these errors do not expose stack traces, constraint names, debug mapping, hidden requirements, raw rolls, hidden DCs, or GM-only state.

## Current Gaps Deferred

- Full two-tab race simulation is represented by stale lifecycle-token resubmission, not true concurrent HTTP orchestration.
- Submits without lifecycle context retain existing edit/update behavior for compatibility. A later UI pass should make lifecycle context mandatory from the player app.
- Frontend submit-button disabling, stale preview clearing, and refresh recovery remain routed to 6B.13.4.
- Richer Latest Development/history/objective consistency after multiple output sources remains routed to 6B.13.3.
- No open-world navigation or combat handoff behavior changed.

## Validation Commands

Run from `DailyRPG/backend` with a local DB override when executing outside Docker:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
node --test test/full-loop-action-lifecycle-regression.test.js
node --test test/dialogue-greyvale-handoff-regression.test.js test/dialogue-greyvale-fixture-regression.test.js
node --test test/stage6b5-action-composer-unit.test.js test/stage6b9-surface-focus-commit-unit.test.js test/exploration-mechanics-visibility-boundary.test.js test/exploration-greyvale-mechanics-regression.test.js
node --test test/dialogue-focus-commit-runtime.test.js test/dialogue-archive-runtime.test.js test/dialogue-debug-workspace.test.js test/dialogue-path-test-harness.test.js
```

Syntax-only checks:

```powershell
node --check backend/src/services/actionComposerService.js
node --check backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js
node --check backend/test/full-loop-action-lifecycle-regression.test.js
```
