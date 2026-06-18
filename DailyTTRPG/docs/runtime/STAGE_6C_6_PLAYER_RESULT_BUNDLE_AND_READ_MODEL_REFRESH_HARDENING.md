# Stage 6C.6 - Player Result Bundle And Read Model Refresh Hardening

## Stage Summary

Stage 6C.6 adds shared helpers that connect committed beat result bundles to refreshed player read models. The goal is to prove that a player-safe result and the current player view agree after committed writes, transition orchestration, and next-beat selection.

This is a backend/runtime hardening pass, not a player UI redesign and not a runtime rewrite. Exploration and dialogue adapters remain domain-specific.

No combat, open-world navigation, AI narration, expanded rules transparency, SMS requirement, major Greyvale content change, player UI redesign, or database/schema migration was added.

## Runtime Module Location

Shared helpers live in:

- `backend/src/services/interactionCore/resolutionPipeline.js`

They are exported through:

- `backend/src/services/interactionCore/index.js`

## Player Result Bundle Projection Rules

Player result bundles continue to use the Stage 6C.3 section vocabulary:

- `attempted_action`
- `result`
- `consequences`
- `discoveries`
- `progress`
- `complications`
- `next`
- `recovery`
- `status`

Stage 6C.6 keeps those sections deterministic, authored/content-driven, and player-safe. Empty sections are omitted by existing bundle normalization rules. Raw output writes, GM/dev diagnostics, hidden mechanics, mutation internals, transition internals, and future/combat handoff labels remain outside the player-facing result bundle.

## Result Bundle And Read Model Alignment

Added helpers:

- `normalizePlayerReadModel(...)`
- `createActiveStateSummary(...)`
- `createResultReadModelAlignmentDiagnostics(...)`
- `assertResultReadModelAligned(...)`
- `createPlayerResolutionView(...)`

Alignment diagnostics check that:

- result discoveries are present in the player-visible knowledge/clue read model
- result progress is present in the player-visible objective read model
- scene transitions match the refreshed scene
- dialogue next beats match the active dialogue read model
- endpoint/future-supported results produce a review-only endpoint read model
- recovery, stale, duplicate, or unavailable states do not expose unsafe old actions
- refresh timing happens after mutation commit or after next-beat selection

The assertion helper is designed for tests and adapter integration points. It does not force every current runtime route through a new universal read-model path.

## Read Model Refresh Timing

Added refresh timing vocabulary:

- `after_mutation_commit`
- `after_next_beat_selection`
- `before_player_response`
- `recovery_only`

`createReadModelRefreshHook(...)` now normalizes timing aliases and keeps `after_mutation_commit` as the default. GM/dev diagnostics can inspect whether the hook is scheduled late enough for the read model to reflect committed writes and next-beat decisions.

## Active State Summary

The shared active state summary is a small player-safe composition helper, not a new journal system or generated recap.

It can summarize:

- current state kind
- current scene or dialogue
- what changed
- current goal
- available next step
- endpoint or recovery status
- latest development

It is assembled from stored read-model fields and the player result bundle. It does not invent new narrative prose.

## Exploration Read Model Behavior

`normalizePlayerReadModel(...)` supports exploration-shaped payloads with:

- current scene/location
- safe scene summary
- action status
- action-window kind/status without internal lifecycle details
- available action labels/summaries
- dialogue entry labels/summaries
- objectives
- knowledge/clues
- latest development
- recent history

The projection strips or ignores debug fields, hidden requirements, raw state writes, GM/dev notes, transition internals, and path harness metadata.

## Dialogue Read Model Behavior

The same helper supports dialogue-shaped payloads with:

- active dialogue id/title/status
- NPC/conversation title
- Clarifying Question labels/summaries
- Committed Social Move labels/summaries
- exits
- safe objective/latest development context where present

It does not expose raw relationship/social meters, hidden checks, branch ids, GM/dev diagnostics, transcript internals, or provenance internals.

## Endpoint And Review-Only Behavior

Endpoint and future-supported read models normalize player state to `endpoint_review` or `awaiting_support`.

Player projections hide:

- `combat_pending`
- `future_supported`
- target encounter ids
- internal future stage labels
- GM/dev handoff details

GM/dev diagnostics can still inspect the internal transition and next-beat decisions from Stage 6C.5.

## Recovery, Stale, Duplicate, And Unavailable Behavior

Alignment diagnostics verify that recovery-like states do not keep unsafe old action lists visible. Safe recovery read models should show the current true state, a safe recovery/status message, and no stale normal actions.

Duplicate and stale submit handling still belongs to the mutation safety layer from 6C.4. Stage 6C.6 adds read-model checks around the player-facing aftermath.

## GM/Dev Diagnostics

Resolution traces now preserve:

- `read_model_refresh_diagnostics`
- `result_read_model_alignment_diagnostics`

The diagnostics include refresh timing, target hints, transition/next-beat references, active state summary, player read-model projection, alignment checks, and mismatch details. They are GM/dev scoped and omitted from player projections.

Precomputed diagnostics are preserved when a trace envelope is normalized again inside a response.

Stage 6C.7 extends this diagnostic layer with generated/attached GM/dev trace inspection, lifecycle checkpoint summaries, projection comparison, and trace serialization redaction. Persistent trace storage remains deferred.

## Greyvale Acceptance Extensions

The Greyvale vertical-slice acceptance fixture now includes `read_model_refresh_assertions`.

Canonical route steps carry semantic expected read-model states and markers for:

- start/resume
- Broken Caravan result
- Grey Road Inn transition
- Tomas and Elin dialogue outcomes
- Dunmere transition
- Mara, Lysa, and Garren dialogue outcomes
- old-path and shrine transitions
- Rusk endpoint
- endpoint review

The fixture remains semantic and ID/status oriented. It avoids brittle full-prose assertions.

## Tests

Added:

- `backend/test/interaction-core-read-model-refresh.test.js`

Updated:

- `backend/package.json`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`

Coverage includes:

- active state summary projection safety
- discovery/objective alignment with read model
- scene and dialogue next-beat alignment
- endpoint review-only safety
- recovery state hiding unsafe actions
- GM/dev-only trace diagnostics
- Greyvale acceptance fixture read-model refresh markers

## Minimal Frontend Alignment

No frontend files were changed in this stage. Existing UI/read-model behavior is preserved. The shared helpers are ready for minimal UI alignment later if the player client needs to render standardized result bundles or active state summaries explicitly.

## Known Limitations

- The helpers are shared assertions and projection utilities; they do not yet force every exploration/dialogue runtime route through a single read-model refresh function.
- Generated/attached GM/dev trace inspection exists from 6C.7; durable trace persistence remains deferred.
- Final 6C regression suite consolidation remains 6C.8.
- Full frontend result-bundle rendering can remain incremental as long as existing player views stay safe and current.
