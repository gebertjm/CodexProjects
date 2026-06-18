# Stage 6B.15.1 - Slice Entry, Start/Resume, And Initial State

Status: implemented  
Scope: web-player Greyvale start/resume entry only

## Summary

Stage 6B.15.1 hardens the existing web starter adventure path so Greyvale starts and resumes as a playable web scene, not just as a campaign preview or SMS-derived assignment.

No Greyvale content, combat, navigation, AI narration, SMS dependency, or database/schema migration was added.

## Canonical Initial State

The canonical Greyvale start state remains the existing authored starter state:

| Field | Value |
| --- | --- |
| World id | `greyvale` |
| Campaign package id | `shadows_grey_road` |
| Start region slug | `greyvale-lowlands` |
| Start location slug | `broken-caravan-site` |
| Start scene slug | `broken-caravan-site` |
| Start objective slug | `witness-the-aftermath` |
| Quest slug | `shadows_grey_road` |
| Route after start | `/play/campaign/scene` |

The player should land on The Broken Caravan scene with an open exploration action window and the Witness the Aftermath objective active.

## Backend Entry Path

Backend route:

- `POST /api/play/start-adventure`

Existing assignment service:

- `backend/src/services/webCharacterCreationService.js`
- `backend/src/sms/smsCampaignAssignmentService.js`

6B.15.1 hardening:

- The route now returns the current player scene read model as `current_scene` after successful start/resume.
- The route now returns `/play/campaign/scene` when a playable scene is active.
- The starter intro copy now identifies the action as Greyvale-specific:
  - title: `Start Greyvale`
  - begin label: `Begin Greyvale`
  - route after start: `/play/campaign/scene`

The start operation remains backed by the existing idempotent campaign assignment behavior:

- First call creates/assigns the Greyvale campaign for the active character.
- Repeated calls resume the existing active campaign.
- Repeated calls do not create duplicate active campaign memberships.
- Repeated calls preserve the current scene/action window.

## Frontend Entry Path

Flutter routes:

- Dashboard: `/play`
- Campaign preview: `/play/campaign`
- Current scene: `/play/campaign/scene`

6B.15.1 hardening:

- Campaign preview start now navigates to the route returned by the backend, which is `/play/campaign/scene` for an active Greyvale scene.
- Campaign preview now shows an explicit active-character recovery state when no active character exists instead of presenting a misleading generic adventure-start state.
- Start buttons use `Start Greyvale` where the player is beginning the starter slice.

This is intentionally not a UI redesign.

## Active Character Handling

6B.15 remains single-player with one active character.

Behavior:

- Authenticated player with an active character can start or resume Greyvale.
- Authenticated player without an active character receives safe recovery wording.
- A start request without an active character returns a safe `409` error.
- Character ownership and active-character scoping remain enforced by existing web character services.

No party/shared campaign behavior was introduced.

## Initial Action Window

After start:

- `/api/play/start-adventure` returns `current_scene.state = active`.
- `current_scene.scene.key = broken-caravan-site`.
- `current_scene.current_objective.key = witness-the-aftermath`.
- `current_scene.action_status.state = action_needed`.
- `current_scene.action_window.action_window_id` is present.
- The action window is open for the player.
- Initial visible affordances are present.

## Initial Objective, History, And Latest Development

The build uses existing authored objective initialization through the Greyvale quest state:

- Active objective: `witness-the-aftermath`.

No new initial clue, lore, latest-development event, or history event was added. Existing campaign assignment/system logging remains internal/backend behavior and repeated starts preserve idempotency.

## Completion And Awaiting-Support Status

Full Rusk endpoint completion/awaiting-support status remains deferred to 6B.15.4.

This build establishes the entry/resume shape needed for later status handling:

- start/resume returns current adventure summary
- start/resume returns current scene read model
- start/resume can route to the playable scene
- no-active-character recovery is player-safe

## Player Read Model

The start response includes:

- `dashboard`
- `current_adventure`
- `current_scene`
- `route`

The `current_scene` payload is the normal player scene read model and is requested without GM/dev debug or mechanics internals.

Player payloads must not include hidden DCs, raw rolls, debug envelopes, GM notes, path harness metadata, future-supported internals, combat routing internals, stack traces, or database constraint details.

## GM/Dev Diagnostics

No new GM/dev endpoint was added.

Existing authorized diagnostics remain available through the established debug/current-scene and GM/dev mechanics paths. The player start response intentionally does not include GM/dev diagnostics.

## Tests Added Or Updated

Backend:

- `backend/test/stage6b15-slice-entry-start-resume.test.js`
- `backend/test/stage6b3-campaign-dashboard.test.js`

Frontend:

- `apps/player_app/test/slice_entry_start_resume_test.dart`
- `apps/player_app/test/models_test.dart`

Regression command:

- `backend/package.json` now includes the 6B.15.1 backend test in `test:greyvale-full-loop`.

## Known Limitations

- Rusk completion/awaiting-support display is still owned by 6B.15.4.
- Full exploration route playability is still owned by 6B.15.2.
- Dialogue hub playability is still owned by 6B.15.3.
- Production deploy/import alignment still needs a 6B.15.8 deployed smoke.
