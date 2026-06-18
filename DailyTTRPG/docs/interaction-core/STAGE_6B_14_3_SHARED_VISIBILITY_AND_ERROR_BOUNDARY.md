# Stage 6B.14.3 Shared Visibility And Error Boundary

Stage 6B.14.3 adds a shared internal visibility projection and safe error boundary layer for interaction systems, with thin exploration and dialogue adapters.

This build is internal and additive. It does not rewire exploration runtime, dialogue runtime, output processing, path harness execution, combat, navigation, frontend UI, or database schema.

## Module Location

Shared visibility boundary:

- `backend/src/services/interactionCore/visibilityBoundary.js`

Domain adapters:

- `backend/src/services/interactionCore/explorationVisibilityAdapter.js`
- `backend/src/services/interactionCore/dialogueVisibilityAdapter.js`

Exports:

- `backend/src/services/interactionCore/index.js`

Focused tests:

- `backend/test/interaction-core-visibility-boundary.test.js`

## Visibility Scopes

The shared layer uses the Stage 6B.14.1 scopes:

- `player`
- `gm_dev`
- `test_harness`
- `system_internal`

Projection is not a permission system. Routes and services must still enforce authentication, campaign scope, character scope, and GM/dev authorization.

## Player Projection Rules

Player projection is conservative. It strips:

- debug envelopes and diagnostics
- hidden DCs, raw rolls, totals, modifiers, result bands, and branch ids
- hidden/failed requirements
- GM notes and GM/dev messages
- internal causes, stack traces, and database constraint details
- state reads/writes
- raw relationship/social meters and audit links
- environment/NPC schedule internals
- preview/routing confidence and preview mapping
- path harness and expected path metadata
- validation/debug notices
- future-supported/internal routing details
- combat routing internals
- hidden clue metadata, final mystery notes, and GM-only truth labels
- annotation/correction internals not meant for players

Player projection may preserve:

- narrative result text
- safe check type labels
- player-safe clue summaries
- safe objective labels/progress
- safe relationship perception summaries
- safe blocked/locked wording
- safe transition labels
- safe stale/recovery messages
- safe completed-dialogue summaries and archive/search snippets

## GM/Dev Projection Rules

GM/dev projection preserves available debug details, including:

- debug envelopes
- check metadata and hidden DCs
- result bands and branch ids
- requirements and failed requirements
- state reads/writes
- raw relationship/social state
- environment/NPC schedule internals
- output provenance
- transition routing
- future-supported and combat-pending routing notes
- stale/duplicate/idempotency diagnostics
- validation messages
- content/source ids
- path harness metadata when supplied by dev/test surfaces

This projection should only be used after route/service authorization has already passed.

## Denylist Helper

`scanForPlayerHiddenData` recursively scans payloads for hidden-data keys and targeted internal value patterns. It reports readable paths such as `$.result.nested.hidden_dc`.

`assertNoPlayerHiddenData` throws with the first violations, making it suitable for tests.

The denylist favors field-key detection and targeted internal tokens to avoid brittle failures on normal player-safe prose.

## Safe Error Projection

`toPlayerSafeError` returns:

- `code`
- `player_safe_message`
- `retryable`
- `recovery_action`
- optional safe current-state hint

It does not use raw `error.message` as player-facing copy unless a caller explicitly opts in.

`toGmDevErrorDetails` preserves internal causes, validation details, debug envelopes, source metadata, and optionally stack traces for authorized dev surfaces.

## Domain Adapters

The exploration adapter adds exploration-specific hidden keys for:

- mechanical details
- exploration mechanics debug
- environment modifiers/debug
- NPC schedule/presence debug
- surface/affordance source debug
- raw state reads/writes
- action resolver/result-band debug

The dialogue adapter adds dialogue-specific hidden keys for:

- relationship/social state reads and writes
- raw relationship/social state
- relationship audit records/links
- failed social requirements
- preview debug metadata
- transcript GM/dev metadata
- annotation/correction internals

These adapters are thin wrappers. They do not call exploration or dialogue runtimes.

## Archive/Search/Output Coverage

The shared tests cover archive/search/output-shaped payloads for completed dialogue records, transcripts, objective displays, search snippets, and Rusk-style future-supported/combat-pending internals.

The output pipeline itself is not migrated in this build. Stage 6B.14.4 owns gradual output bundle adoption.

Stage 6B.14.4 now uses this visibility boundary through `projectOutputBundleForPlayer`, `projectOutputBundleForGmDev`, and `assertOutputBundlePlayerSafe`. Output projection strips provenance/debug/routing internals from player payloads while preserving GM/dev output provenance.

## Runtime Integration Status

No runtime services were rewired in Stage 6B.14.3.

Current read-model filtering remains domain-owned in:

- exploration scene/read model services
- exploration GM/dev mechanics inspector services
- dialogue runtime player read models
- dialogue archive/search services
- dialogue GM/dev debug workspace services

Stage 6B.14.3 provides reusable projection and assertion helpers for future gradual adoption.

## Frontend Impact

No frontend files were changed. Player-facing UI behavior is unchanged.

## Migration Notes

Recommended future adoption:

- Use shared denylist assertions in player-facing tests first.
- Use domain adapters at low-risk read-model boundaries.
- Keep GM/dev projection behind existing permission checks.
- Avoid exposing new internal fields to Flutter models.
- Re-run the full Greyvale regression after each runtime integration.

No database or schema migration was added for Stage 6B.14.3.
