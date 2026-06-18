# Stage 6B.15.8 - End-To-End Greyvale Vertical Slice Acceptance Suite

Status: implemented  
Primary scope: formal Greyvale vertical-slice acceptance gate and manual playthrough checklist  
Primary files: `backend/test/greyvale-vertical-slice-acceptance.test.js`, `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`

## Purpose

Stage 6B.15.8 adds the capstone acceptance gate for the Greyvale playable vertical slice. The suite proves that a normal authenticated web player with one active character can start Greyvale, progress through the canonical authored route, reach the Rusk confrontation boundary, receive a player-safe endpoint state, and resume/review that endpoint without hidden/debug/internal data leakage.

This is validation and acceptance coverage. It does not add combat, open-world navigation, AI narration, SMS requirements, major content, a player UI redesign, the full GM Campaign Inspector, or database migrations.

## Acceptance Suite Structure

Dedicated command:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```

Backend package command:

```powershell
npm --prefix backend run test:greyvale-vertical-slice
```

The command runs:

- Greyvale content validation through `npm run --silent cli -- validate-content --path ../content/worlds/greyvale`.
- The force-exit Node acceptance test `backend/test/greyvale-vertical-slice-acceptance.test.js`.

The suite is DB-backed and expects the same local Postgres/Docker database used by the existing Greyvale full-loop regression tests. Firebase auth is mocked through the existing `test-firebase:` token convention.

## Canonical Happy Path

The official semantic route is defined in:

```text
content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json
```

The canonical test executes these steps:

1. Start Greyvale through `/api/play/start-adventure`.
2. Resume immediately and confirm the active campaign is reused.
3. Use Free Focus at the Broken Caravan without consuming the committed action slot.
4. Preview and submit the Broken Caravan investigation.
5. Reject duplicate/stale submit safely.
6. Transition to the Grey Road Inn.
7. Complete Tomas dialogue and gain the road-pattern clue.
8. Complete Elin dialogue and gain survivor memory/shrine bell clues.
9. Transition to Dunmere.
10. Complete Mara dialogue and gain the village-assumption clue.
11. Complete Lysa dialogue and gain the suspicion clue.
12. Complete Garren dialogue and gain the old-path/shrine-route clues.
13. Transition to the old forest path.
14. Resolve the old-path tracking step.
15. Transition to the shrine ruins.
16. Complete Rusk dialogue to the confrontation exit.
17. Reach `slice_endpoint.state == endpoint_reached`.
18. Resume again and confirm the endpoint state is stable.
19. Inspect GM/dev handoff details with an authorized debug account.
20. Confirm the player projection hides endpoint internals.

Assertions are semantic and ID/status based. The acceptance gate intentionally avoids brittle full-prose assertions unless the prose is part of a player-safe endpoint contract.

## Alternate Route Tolerance

The suite includes a focused alternate route tolerance test for village dialogue order:

- Lysa can be resolved before Mara.
- Mara can be resolved afterward.
- Both outputs remain player-safe.
- The player remains in an active, resumable state.
- No final mystery wording is exposed.

Other alternate routes remain covered by the focused 6B.15.2-6B.15.7 tests or are deferred until broader playtest telemetry proves they are necessary for the official slice.

## Lifecycle Safety

The canonical acceptance test covers:

- Preview does not commit.
- Free Focus does not create a committed Beat Action.
- Submit commits exactly once.
- Duplicate submit is rejected with safe recovery text.
- Stale submit using an old lifecycle context is rejected safely.
- Resume after start does not reset the campaign.
- Resume after endpoint does not duplicate knowledge or completed records.
- Endpoint preview/submit attempts are blocked with player-safe copy.

The broader Greyvale full-loop command continues to cover additional stale, duplicate, handoff, and action lifecycle cases from 6B.13 and 6B.14.

## Output And Memory Coverage

The suite verifies:

- Initial objective `witness-the-aftermath`.
- Objective progression through `gather-local-insight`, `follow-the-leads`, `uncover-the-truth`, and `resolve-the-threat`.
- Required knowledge keys appear once.
- History timeline ordering remains stable.
- Six completed dialogue records are written once each.
- Dialogue archive contains the six required records.
- Search finds Tomas, Elin, Mara, Lysa, Garren, and Rusk records.
- Endpoint resume does not duplicate completed records or knowledge rows.

The acceptance suite checks the following knowledge markers:

- `clue_caravan_irregularity`
- `innkeeper_tracks_road_patterns`
- `elin_sash_has_roadward_knot`
- `shrine_bell_stopped_attack`
- `dunmere_wants_simple_answer`
- `village_blames_hunter_and_road`
- `garren_knows_old_paths`
- `old_path_still_used`
- `tracks_converge_on_shrine`
- `clue_shrine_activity`
- `bandits_not_fully_self_directed`
- `shrine_depth_unlocked`
- `hollow_reaches_shrine_above`

## Visibility And Security

The acceptance suite applies a player hidden-data denylist to:

- Start/resume payloads.
- Current scene payloads.
- Free Focus results.
- Exploration previews/submits/results.
- Dialogue surfaces.
- Clarifying Question results.
- Committed Social Move previews/submits/results.
- Dialogue exits.
- Knowledge journal.
- Campaign history.
- Dialogue archive and search results.
- Rusk endpoint preview/submit errors.
- Endpoint resume payload.
- Player projections inside the GM/dev inspector response.

The denylist rejects terms and fields such as hidden DCs, raw rolls, branch ids, hidden requirements, raw relationship/social state, debug envelopes, path harness metadata, stack traces, `combat_pending`, `future_supported`, target encounter ids, and final mystery/truth labels.

The suite also proves:

- Authorized GM/dev users can inspect the endpoint handoff.
- Normal players cannot access `/api/dev/greyvale-slice-inspector`.
- Player-vs-GM visibility comparison reports no player hidden-data violations.

Stage 6C.7 extends the acceptance fixture with `resolution_trace_assertions` and per-step `expected_trace_sections` markers. These markers prepare the route to verify generated GM/dev beat-resolution traces for exploration beats, dialogue beats, Rusk endpoint handoff, projection comparison, and player-hidden trace diagnostics without relying on brittle exact prose.

Stage 6C.8 adds the capstone beat-resolution regression command and a Stage 6C-specific semantic fixture:

```text
content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json
```

Run the Stage 6C gate with:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:stage:6c
```

That command composes the shared interaction-core runtime regression suite with this Greyvale vertical-slice acceptance suite.

## Rusk Endpoint Acceptance

At the endpoint, the test asserts:

- Current scene remains `shrine-ruins`.
- Player action status is `slice_endpoint_reached`.
- Player endpoint state is `endpoint_reached`.
- Player endpoint message safely explains the current end of the playable slice.
- Unsupported post-endpoint preview returns a safe invalid result.
- Unsupported post-endpoint submit returns a safe conflict error.
- GM/dev inspector exposes internal `combat_pending` handoff details.
- Player projections hide `combat_pending`, `future_supported`, and `shrine-rusk-confrontation`.

## Web UI Coverage

The official automated acceptance gate is currently backend route and read-model based. It exercises the same player-facing web API path used by the Flutter app, but it does not drive a browser end-to-end.

Existing Flutter coverage from 6B.15.6 verifies endpoint model parsing, endpoint UI rendering, hidden-data rendered-output denial, and post-endpoint action-control suppression. A full browser E2E framework remains deferred because the repo does not currently have a stable browser E2E harness for authenticated Flutter web playthroughs.

Manual UI coverage is finalized in:

```text
docs/greyvale/GREYVALE_VERTICAL_SLICE_MANUAL_PLAYTHROUGH_CHECKLIST.md
```

## Command Set

Fast focused acceptance:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```

Broader Greyvale regression:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-full-loop
```

Shared interaction-core regression:

```powershell
npm run test:interaction-core
```

Hosting/player web sanity:

```powershell
npm run build
cd apps/player_app
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
```

## Known Limitations

- The canonical acceptance test uses one deterministic service-level seam for the old-path tracking check so the suite can remain stable without adding new UI automation or combat/navigation runtime.
- Browser-level full route E2E remains manual checklist backed by Flutter widget/model tests.
- Combat remains intentionally unsupported. The official endpoint is a player-safe awaiting-support boundary.
- Deployment verification still requires separately deploying hosting/backend and importing Greyvale content on the droplet.

## Readiness Recommendation

Stage 6B.15 is acceptance-covered for the current web-first Greyvale vertical slice when `npm run test:greyvale-vertical-slice` passes along with the broader Greyvale regressions. The slice is ready to hand off to Stage 6C for beat resolution/runtime orchestration hardening, with combat, navigation, and full GM Campaign Inspector still explicitly out of scope.
