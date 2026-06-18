# Stage 6B.15.6 - Player UI Playthrough Polish

Status: implemented  
Primary scope: Flutter player UI endpoint/status polish and rendered visibility regression  
Primary files: `apps/player_app/lib`, `apps/player_app/test`

## Purpose

Stage 6B.15.6 makes the web-first Greyvale player UI clearer at the current vertical-slice endpoint. The backend already exposes a player-safe `slice_endpoint` projection after the Rusk boundary; this pass aligns the Flutter models and screens so a normal player sees that the playable slice has reached its current stopping point instead of seeing a broken action window or unsupported combat state.

This is intentionally not a redesign. Existing start/resume, scene, exploration, dialogue, objective, knowledge, history, and archive surfaces remain in place.

## UI Flow Confirmed

The supported player flow remains:

1. Sign in as a normal player.
2. Start or resume Greyvale from the dashboard/campaign preview.
3. Play the canonical route through Broken Caravan, Grey Road Inn, Dunmere, old path, shrine ruins, and Rusk.
4. Reach the Rusk boundary.
5. Review the endpoint state, current scene, campaign history, knowledge journal, and campaign overview.
6. Refresh or return later without seeing unsupported combat controls.

The screens touched in this pass are:

- `DashboardPage`
- `CampaignPreviewPage`
- `CampaignScenePage`
- shared campaign endpoint/status card

## Start And Resume UI

The dashboard and campaign preview now parse `current_adventure.slice_endpoint` and render a player-safe endpoint review card when the slice endpoint has been reached. The existing start/resume behavior remains unchanged before the endpoint.

Endpoint dashboard/preview behavior:

- Shows the endpoint label, headline, message, latest development, current status, and next step from the player read model.
- Offers review actions for current scene, history, knowledge, and campaign overview where appropriate.
- Uses "Review Current Scene" wording instead of implying new unsupported combat progression.
- Does not display internal scene keys, encounter ids, `combat_pending`, or `future_supported`.

## Scene And Exploration UI

The current scene page now recognizes `slice_endpoint.state == endpoint_reached` and the action status `slice_endpoint_reached`.

At endpoint:

- The scene remains reviewable.
- The player sees a prominent endpoint card near the current aim/status area.
- The freeform action composer is hidden, preventing unsupported post-Rusk submit attempts.
- History and knowledge review links remain available.

Before endpoint, existing scene/exploration UI behavior is preserved:

- Scene title and surface text render from the current read model.
- Conversations and exploration actions remain available where the backend exposes them.
- Free Focus and Beat Action preview/submit flows continue to use the existing widgets and tests.

## Preview, Submit, And Resolution UI

This pass does not change preview/submit runtime semantics. It tightens the UI boundary after the final supported resolution:

- Endpoint status is treated as a terminal review state for the current slice.
- Old action controls are not rendered after endpoint.
- Existing safe stale/unavailable/error messages remain available for non-endpoint lifecycle failures.
- API error mapping now treats endpoint/future-support errors as safe player-facing messages.

## Dialogue UI

Dialogue page behavior remains unchanged in this pass. The Stage 6B.15.3 dialogue UI remains the expected interaction model:

- Conversation surface establishes NPC context.
- Clarifying Questions are non-committing.
- Committed Social Moves are commit-level choices.
- Exits finalize or return to the current scene.

The endpoint review UI complements this by ensuring that after the Rusk boundary, the player is not dropped back into a misleading active-action state.

## Memory Surfaces

The endpoint card links to existing memory surfaces instead of creating a new journal system:

- Latest Development is shown directly in the endpoint card when present.
- Current Status and Next Step guide resume/review.
- History and Knowledge actions route to the existing history and knowledge pages.
- Campaign overview remains accessible from campaign preview.

No objective, knowledge, history, archive, or transcript persistence semantics were changed.

## Error And Recovery Behavior

The API client now maps endpoint/future-support conditions to safe recovery language:

- Endpoint reached: "This Greyvale slice has reached its current endpoint. Review your progress or return to the current scene."
- Awaiting future support: "This path is not playable yet. Review your progress or choose another available action."

The player-facing error scrubber treats `combat_pending` as an internal term, matching the existing denylist approach for `future_supported`, branch ids, stack traces, debug fields, and internal routing details.

## Hidden-Data Safety

Rendered player UI tests now include the Rusk endpoint surface in the denylist pass.

The player UI must not render:

- `combat_pending`
- `future_supported`
- encounter ids
- internal routing labels
- hidden DCs
- raw rolls
- branch ids
- GM notes
- stack traces
- source paths

GM/dev debug behavior remains backend-owned and permission-gated; this pass does not add or expose GM/dev UI.

## Frontend Model And API Alignment

Frontend model additions:

- `GreyvaleSliceEndpointStatus`
- `CurrentAdventureDashboard.sliceEndpoint`
- `CurrentSceneView.sliceEndpoint`

The parser is permissive and handles absent endpoint fields safely, so pre-endpoint read models continue to work.

No backend read-model shape changes were needed.

## Tests Added Or Updated

Flutter coverage now includes:

- `models_test.dart`: parses dashboard and scene `slice_endpoint` payloads.
- `player_ui_recovery_test.dart`: renders endpoint scene review state, hides action composer, and runs rendered hidden-data checks.
- `slice_entry_start_resume_test.dart`: renders endpoint status in campaign preview and verifies safe review navigation.

Existing recovery, dialogue, journal, history, and hidden-data tests remain in the same suite.

## Manual Playthrough Checklist Updates

The Stage 6B.15 manual checklist now includes UI-specific endpoint checks:

- Endpoint wording is visible and understandable.
- Review Current Scene, History, and Knowledge actions are reachable.
- Unsupported combat controls do not appear.
- Internal labels such as `combat_pending` and `future_supported` are absent.
- Refresh at endpoint returns to a stable review state.

## Known Limitations

- This pass does not add browser-driven end-to-end automation; Flutter widget tests cover the UI state with representative player payloads.
- It does not implement combat UI, navigation UI, AI narration, SMS, or new GM/dev inspector features.
- The final canonical browser playthrough and deployed smoke remain Stage 6B.15.7/6B.15.8 work.

## Validation Commands

Run from repo root unless noted:

```powershell
cd apps/player_app
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
cd ..\..
npm run test:greyvale-full-loop
npm run build
```

Use the bundled Flutter/Dart path above if `flutter` or `dart` are not available on `PATH`.
