# Stage 6B.15.7 - GM/Dev Slice Inspector And Regression Coverage

Status: implemented  
Primary scope: focused GM/dev Greyvale vertical-slice inspection and visibility regression  
Primary files: `backend/src/services/greyvaleSliceInspectorService.js`, `backend/src/routes/devBeat.js`, `backend/test/stage6b15-gm-dev-slice-inspector.test.js`

## Purpose

Stage 6B.15.7 adds a focused, read-only GM/dev inspector for the Greyvale playable vertical slice. It aggregates existing player read models, existing exploration mechanics debug, existing dialogue debug workspace, output/memory diagnostics, Rusk endpoint handoff details, and player-vs-GM visibility comparison into one permission-gated route.

This is intentionally not the full GM Campaign Inspector. It does not add campaign management, content editing, broad dashboards, combat, navigation, AI narration, SMS behavior, new Greyvale content, or database migrations.

## Route And Authorization

Route:

```text
GET /api/dev/greyvale-slice-inspector
```

Authorization:

- The route requires Firebase auth through the existing `/api/dev` router.
- The service requires `account.can_advance_beats = TRUE`, matching existing GM/dev debug capability conventions.
- Unauthorized users receive a safe 403 message and no inspector payload.
- Normal player routes and payloads are unchanged.

## Inspector Output Shape

The inspector response is internal/dev-facing and organized into these sections:

- `inspector_scope`: stage, route, purpose, and explicit `not_full_gm_campaign_inspector` marker.
- `identity_scope`: account, active character, campaign, package, and world identifiers.
- `slice_status`: not-started/active/endpoint-style status derived from current player state.
- `current_scene`: player projection plus GM/dev scene debug summary.
- `exploration`: wrapped `/api/dev/exploration-mechanics` diagnostics and coverage flags.
- `dialogue`: wrapped `/api/dev/dialogue-debug` diagnostics and coverage flags.
- `memory_and_outputs`: player memory projection plus GM/dev objective, flag, completed-record, search-index, action-window, duplicate/stale diagnostics.
- `rusk_endpoint`: player endpoint projection plus GM/dev `combat_pending` / future-supported handoff diagnostics.
- `player_vs_gm_visibility_comparison`: shared denylist scan of player projection plus GM/dev signal summary.
- `path_harness`: canonical route-step readiness metadata for Stage 6B.15.8.
- `diagnostics`: inspector load warnings and notes.

## Current Slice State Inspection

The inspector can show, where available:

- Active account, character, campaign, package, and world scope.
- Current Greyvale slice status.
- Current scene/location id, key, title, and objective.
- Active action-window id/status.
- Active dialogue id/status.
- Current objective and knowledge state through player read models.
- Recent history and latest development through player read models.
- Endpoint status after the Rusk boundary.

## Exploration Inspection

Exploration inspection delegates to the existing exploration mechanics debug read model. GM/dev can inspect:

- Scene state and surface context.
- Passive discoveries.
- Free Focus items.
- Beat Action options.
- Submitted action and preview mapping.
- Check metadata and result-band internals.
- Environment modifiers and NPC presence diagnostics.
- State reads/writes.
- Knowledge/history outputs.
- Transition routing.
- Audit timeline, validation, and visibility-boundary notes.

The player projection in the same inspector response remains reduced to safe scene, objective, action, dialogue-entry, latest-development, and endpoint fields.

## Dialogue Inspection

Dialogue inspection delegates to the existing dialogue debug workspace. GM/dev can inspect:

- Active dialogue id/title/status.
- Clarifying Questions, Committed Social Moves, and exits.
- Preview mapping.
- Relationship/social state rows and audit records.
- Runtime state, fallback/exhaustion, exits, and transitions.
- Transcript and completed-record status.
- Annotation/correction chains.
- Validation and expected path metadata.

No dialogue debug payload is returned through normal player dialogue routes.

## Objective, Knowledge, History, And Recap Inspection

The inspector adds lightweight GM/dev diagnostics around the memory layer:

- Objective keys/statuses/timestamps.
- Character flags and source metadata.
- Completed dialogue records and transcript ids.
- Dialogue archive/search index counts.
- Recent action windows for stale/duplicate lifecycle diagnosis.
- Player memory projection for comparison.

Normal players continue to see only the existing player-safe objective, knowledge, history, Latest Development, archive, and search surfaces.

## Rusk Endpoint And Future-Supported Handoff

At the official Greyvale endpoint, the player projection remains:

- `state: endpoint_reached`
- Safe endpoint label/headline/message/current status/next step.
- No unsupported combat UI state.

Authorized GM/dev inspection additionally shows:

- `internal_status: awaiting_future_support`
- `handoff_kind: combat_pending`
- `future_supported_status`
- `target_encounter_id`
- source scene/dialogue/exit ids
- endpoint flags

The visibility comparison explicitly checks that `combat_pending`, `future_supported`, and the target encounter id are absent from player projection.

## Player-Vs-GM Visibility Comparison

The comparison helper scans only reduced player projections with the shared visibility denylist plus endpoint-specific patterns. It reports:

- Whether the player projection is safe.
- Any hidden-data violations with object paths.
- Which player sections were scanned.
- Whether GM/dev debug signals are present.
- Whether endpoint internals are hidden from player and visible to GM/dev.

The comparison is diagnostic only. It does not replace route permission checks.

## Path Harness Preparation

The inspector exposes canonical route-step metadata for the final 6B.15.8 acceptance suite:

```text
start_or_resume_greyvale
opening_broken_caravan_exploration
tomas_road_patterns_dialogue
elin_survivor_memory_dialogue
dunmere_village_pressure
mara_or_lysa_partial_clue_dialogue
garren_shrine_route_dialogue
shrine_approach
rusk_confrontation
endpoint_awaiting_future_support
```

Expected path files remain domain-specific. This route-step status is a regression/debug aid, not a replacement expected-path format.

## Tests Added

New suite:

```text
backend/test/stage6b15-gm-dev-slice-inspector.test.js
```

Coverage:

- Normal players are denied access to `/api/dev/greyvale-slice-inspector`.
- Authorized GM/dev can inspect active initial Greyvale state.
- Authorized GM/dev can inspect active Tomas dialogue diagnostics.
- Authorized GM/dev can inspect Rusk endpoint future-supported handoff internals.
- Player projections inside the inspector pass hidden-data denylist checks.
- Path harness readiness metadata is present.

`backend/package.json` now includes this suite in `test:greyvale-full-loop`.

## Known Limitations

- This is a backend/dev route, not a product-level GM dashboard.
- Full route path-harness acceptance remains Stage 6B.15.8.
- GM/dev inspection uses available persisted/runtime records; it does not reconstruct unavailable historical state.
- Dialogue Focus/Commit expected-path files remain fixture/domain-specific.

## Deferred Work

- Stage 6B.15.8: final automated acceptance suite and manual playthrough status.
- Stage 6F.1: full GM Campaign Inspector.
- Stage 6G: open-world navigation.
- Stage 6H: player-facing rules/check transparency.
- Stage 6I: combat encounter web MVP / combat overhaul.
