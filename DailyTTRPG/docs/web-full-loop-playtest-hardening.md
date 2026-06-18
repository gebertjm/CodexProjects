# Stage 6B.7 - Full Loop Playtest Hardening

DailyTTRPG is web-first. Firebase Auth is the primary identity layer, and SMS/phone identity is not required for the web play loop.

Later post-dialogue stabilization is tracked in `docs/full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md`. Stage 6B.13 extends this earlier full-loop hardening work across the completed exploration, dialogue, mechanics visibility, archive/search, and Greyvale regression systems.

## Full Loop

The hardened loop is:

1. Sign in with Firebase.
2. Create or select an active character.
3. Start the Greyvale starter adventure.
4. Open `/play/campaign/scene`.
5. Inspect the current scene, objective, NPCs, environment, affordances, history, and knowledge.
6. Compose, preview, and submit one validated action.
7. Dev/GM or scheduler advances the beat through the real runtime.
8. A persisted player-facing beat result appears in the scene.
9. Campaign history and character knowledge reflect the resolved beat.
10. The next action window opens immediately according to the corrected beat-window model.

## Minimal Greyvale Playtest Path

The intended starter playtest path is narrow on purpose. It is only meant to prove the loop repeatedly:

1. Inspect the broken caravan or current starter scene clue.
2. Examine tracks or visible evidence.
3. Speak with Elira, the survivor, or another visible witness.
4. Ask about the old shrine, strange signs, or the next lead.
5. Move toward the next lead if the current scene supports movement.

Do not use this phase to expand Greyvale into a full campaign arc. Patch only missing affordances, aliases, result bands, knowledge definitions, objective hooks, and small transitions needed for deterministic play.

## Diagnostics Service

`PlaytestLoopValidationService` is implemented in `backend/src/services/playtestDiagnosticsService.js`.

It checks:

- Account, active character, and campaign linkage.
- World, current location, and current scene linkage.
- Active objective visibility.
- Action window health, duplicate active/open windows, and future-locked windows.
- Submitted action linkage to the current character/window.
- Latest beat result read-model existence and duplicate result read models.
- Scene result feed inclusion of the latest result.
- Knowledge/history counts and next-beat readiness.

The response status is:

- `ok`: no warnings or errors.
- `warning`: playable state exists but sync/read-model repair may be useful.
- `error`: loop state is inconsistent enough to need dev attention.

## Dev Endpoints

All dev endpoints require Firebase auth and server-side account capability. Normal players are rejected.

`GET /api/dev/playtest-diagnostics`

Query parameters:

- `campaign_instance_id`, optional. If omitted, diagnostics use the active campaign for the active character.

Returns:

- `summary`
- `warnings`
- `errors`
- `available_repair_actions`

`POST /api/dev/playtest-repair`

Body:

```json
{
  "campaign_instance_id": "123",
  "repair_action": "rebuild_scene_result_feed"
}
```

Allowed low-risk repair actions:

- `rebuild_scene_result_feed`: verifies dynamic scene result feed state from persisted player-facing beat results.
- `rebuild_knowledge_journal`: verifies dynamic knowledge journal state from canonical character knowledge.
- `refresh_current_scene_read_model`: reloads/recomputes dynamic current-scene state where applicable.
- `create_missing_next_action_window`: creates a next action window only when the latest beat is clearly resolved, campaign is active, and no active window already exists.

Rejected repair actions:

- `force_scene_transition`
- `reset_campaign`
- `delete_duplicate_windows`
- `rewrite_objective_state`
- `rerun_latest_beat_resolution`
- `edit_event_history`

Repairs must be idempotent and must not rerun beat resolution.

## Dev UI

`/play/campaign/scene` includes a compact dev-only diagnostics panel when the account has the required capability.

The panel shows:

- Beat number.
- Action window state.
- Latest result ID.
- Warning/error count.
- Run Check.
- Advance Beat.
- Open Full Diagnostics.

`/play/dev/campaign-diagnostics` is the full dev route. It shows campaign, character, scene, action window, result feed, knowledge/history sync, warnings/errors, and low-risk repair buttons. It does not dump raw JSON by default.

## Capability

6B.7 reuses the existing `can_advance_beats` capability for diagnostics and low-risk repairs.

Enable it for a dev/GM account:

```sql
UPDATE account
SET can_advance_beats = TRUE
WHERE email = 'your-email@example.com';
```

Disable it:

```sql
UPDATE account
SET can_advance_beats = FALSE
WHERE email = 'your-email@example.com';
```

Server-side authorization is required. Hiding Flutter buttons is only a convenience.

## Player Recovery

Normal players should see friendly recovery states:

- Try Again.
- Refresh.
- Reload Scene.
- Back to Campaign Overview.
- Back to Dashboard.

Normal players must not see repair tools, internal IDs, raw event payloads, raw stack traces, secrets, hidden NPCs, hidden clues, GM notes, secret DCs, or future content.

## Route Refresh

These routes should survive browser refresh by reloading auth state and fetching real backend state:

- `/play`
- `/play/campaign`
- `/play/campaign/scene`
- `/play/campaign/history`
- `/play/campaign/knowledge`
- `/play/dev/campaign-diagnostics`, dev/GM only

No route should depend on in-memory-only campaign state.

## Manual 5-Beat Checklist

1. Sign in with a test account.
2. Enable `can_advance_beats` for that account.
3. Create a Quick Start character or select an existing active character.
4. Start Greyvale.
5. Open `/play/campaign`.
6. Open `/play/campaign/scene`.
7. Confirm the dev diagnostics panel is visible.
8. Submit action 1, such as "I inspect the broken caravan."
9. Preview and confirm the action.
10. Click Advance Beat.
11. Confirm the latest result is highlighted in the scene.
12. Confirm history includes the result.
13. Confirm knowledge includes any newly learned clue/fact.
14. Confirm the next action window is open.
15. Refresh the page and confirm state persists.
16. Submit action 2, such as "I examine the tracks."
17. Advance Beat.
18. Submit action 3, such as "I ask Elira what happened."
19. Advance Beat.
20. Continue through at least 5 beats if content supports it.
21. Confirm no duplicate open action windows.
22. Confirm no duplicate player-facing beat result entries for one action window.
23. Open `/play/dev/campaign-diagnostics`.
24. Run diagnostics and confirm status is `ok` or warnings are expected/read-model-only.
25. Run a low-risk no-op repair, such as `refresh_current_scene_read_model`.
26. Confirm state remains valid.
27. Sign in as a normal non-dev account.
28. Confirm diagnostics panel, route, and repair endpoint are unavailable.

## Automated Regression Target

The required deterministic automated path should use real services and persisted state:

1. Create/load test account and character.
2. Start Greyvale.
3. Load current scene.
4. Preview and submit action 1.
5. Advance beat through the real dev/GM advance path.
6. Assert result/feed/history/knowledge/objective/window.
7. Repeat for actions 2 and 3.
8. Assert diagnostics is `ok` or only expected warnings.

Local execution currently requires a configured test database. If the database host is unavailable, full DB-backed regression is blocked and must be reported explicitly.

## Known Limitations

- The diagnostics repair set is intentionally low-risk.
- Dynamic read models may return no-op success for rebuild actions when no cache exists.
- The full 3-beat DB-backed automated playtest requires a configured test database.
- Greyvale content is still intentionally small and should not be treated as a complete adventure.
