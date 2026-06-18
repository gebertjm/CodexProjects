# Stage 6C.7 - GM/Dev Resolution Trace And Provenance Inspector

## Stage Summary

Stage 6C.7 formalizes the GM/dev resolution trace and provenance inspection layer for committed beat resolutions.

This stage uses generated/attached GM-dev trace envelopes and inspector helpers. It does not add persistent trace storage or a database migration. It also does not build the full GM Campaign Inspector product UI.

No combat, open-world navigation, AI narration, player-facing rules transparency, SMS requirement, major Greyvale content change, player UI redesign, or database/schema migration was added.

## Trace Storage And Generation Strategy

Current strategy:

- `generated_in_memory`
- `attached_gm_dev_response`
- existing output/provenance records remain the durable source of truth

Persistent per-beat trace tables remain deferred. If a later stage needs replayable durable trace records, the likely future shape is a JSON trace table keyed by campaign, character, action window, dialogue state, or resolution id. That requires explicit schema approval and was not added here.

## Runtime Module Location

Shared trace helpers live in:

- `backend/src/services/interactionCore/resolutionPipeline.js`

They are exported through:

- `backend/src/services/interactionCore/index.js`

## Trace Envelope Behavior

`createResolutionTraceEnvelope(...)` now carries:

- `trace_schema_version`
- `trace_storage_strategy`
- `trace_collection_points`
- request/scope/source ids
- authorization result
- active state summary
- validation result
- stale/duplicate/idempotency result
- preview consistency diagnostics
- selected deterministic outcome
- authored source
- GM/dev check metadata
- output bundle and validation
- player result bundle
- mutation plan
- mutation result
- transaction boundary
- action-window lifecycle decision
- transition decision
- next-beat decision
- read-model refresh target and diagnostics
- result/read-model alignment diagnostics
- outcome quality diagnostics
- player projection summary
- GM/dev projection summary
- visibility filtering notes
- recovery-needed envelope
- errors, warnings, timestamps, and durations

Player response projection still omits the whole trace envelope.

## Lifecycle Collection Points

Added lifecycle checkpoint vocabulary:

- `request_received`
- `scope_auth_resolved`
- `active_state_loaded`
- `request_validated`
- `stale_duplicate_checked`
- `outcome_selected`
- `output_bundle_built`
- `player_result_bundle_built`
- `mutation_plan_built`
- `mutation_plan_applied`
- `transition_decision_made`
- `next_beat_decision_made`
- `action_window_lifecycle_applied`
- `read_model_refreshed`
- `visibility_projection_applied`
- `response_returned`
- `recovery_needed_triggered`

`createResolutionTraceLifecycle(...)` summarizes which checkpoints are captured and which remain unavailable for a given trace.

## Exploration Trace Coverage

Generated traces can inspect exploration committed beats with:

- source scene/location
- selected Beat Action
- validation/idempotency results
- selected authored outcome
- output bundle
- objective/knowledge/history/latest-development outputs
- mutation plan and write groups
- transition decision
- next exploration/dialogue/endpoint decision
- action-window lifecycle decision
- read-model refresh diagnostics
- player-vs-GM projection comparison

Greyvale acceptance metadata now marks the Broken Caravan and old-path exploration beats as trace-covered.

## Dialogue Trace Coverage

Generated traces can inspect dialogue committed beats with:

- active dialogue/source dialogue id
- selected social move or exit option id
- selected authored outcome
- relationship/social writes when present
- completed record/transcript/archive/search output groups when present
- transition and next-beat decisions
- read-model refresh diagnostics
- projection comparison

Greyvale acceptance metadata now marks Tomas, Elin, Mara, Lysa, Garren, and Rusk path steps with expected trace sections where relevant.

## Endpoint And Future-Supported Trace Coverage

Rusk-style endpoint traces preserve GM/dev-only handoff details:

- internal `combat_pending` or future-supported transition target
- target encounter id where supplied
- endpoint status write group
- next-beat review-only decision
- player-safe endpoint result bundle
- player projection stripping checks

Player projections continue to hide `combat_pending`, `future_supported`, target encounter ids, branch ids, and GM/dev routing.

## Recovery Trace Coverage

Recovery/stale/duplicate/unavailable traces can include:

- recovery kind
- failed lifecycle step
- stale/duplicate/idempotency result
- mutation result or no-mutation status
- partial write groups known
- safe player message
- recommended GM/dev repair action
- retry/refresh recommendation

`createRecoveryNeededEnvelope(...)` remains the shared recovery payload. The trace inspector now summarizes it.

## Provenance Inspector Behavior

Added helper:

- `createResolutionProvenanceInspector(...)`

The helper returns:

- trace storage strategy
- trace access decision
- redacted GM/dev trace
- lifecycle summary
- request/source summary
- output reference counts
- mutation write groups
- transition and next-beat kinds
- recovery kind
- result sections
- diagnostics from preview, outcome quality, mutation safety, transition orchestration, read-model refresh, result/read-model alignment, recovery, warnings, and errors
- player-vs-GM projection comparison
- explicit `player_trace_projection: null`

This is a shared backend helper, not a product GM dashboard.

## Player-vs-GM Projection Comparison

Added helper:

- `compareResolutionPlayerGmDevProjections(...)`

The comparison verifies:

- player projection passes hidden-data scanning
- player projection does not include trace or diagnostic fields
- GM/dev projection preserves trace/provenance diagnostics
- player response still includes required safe response fields

The helper provides diff-style leak messages if a player projection contains forbidden trace fields or hidden-data violations.

## Permission And Access Control

Added helper:

- `createResolutionTraceAccessDecision(...)`

It follows the existing repo convention that GM/dev debug access is represented by `can_advance_beats`, or by an explicit GM/dev/admin role in tests/helpers.

Existing dev routes such as `/api/dev/greyvale-slice-inspector` remain responsible for route-level authorization. This stage does not expose any new player route.

## Trace Redaction And Safe Serialization

Added helpers:

- `serializeResolutionTraceForGmDev(...)`
- `projectResolutionTraceForPlayer(...)`

GM/dev serialization redacts obvious secrets such as tokens, passwords, credentials, auth headers, cookies, private keys, and API keys. It preserves useful authorization result metadata such as `status` and `capability`.

`projectResolutionTraceForPlayer(...)` intentionally returns `null`.

## Greyvale Acceptance Extensions

The Greyvale vertical-slice acceptance fixture now includes `resolution_trace_assertions`.

Canonical route steps now include expected trace section markers for:

- Broken Caravan exploration
- Tomas dialogue
- Elin dialogue
- Mara dialogue
- Lysa dialogue
- Garren dialogue
- old-path exploration
- Rusk endpoint

The fixture remains semantic and ID/status oriented. It does not assert exact prose.

## Tests

Added:

- `backend/test/interaction-core-resolution-trace.test.js`

Updated:

- `backend/package.json`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`

Coverage includes:

- formal trace envelope sections
- lifecycle checkpoint summaries
- non-persistent storage strategy
- provenance inspector summary
- trace access decision
- player-vs-GM projection comparison
- endpoint future-supported traceability
- recovery/stale traceability
- GM/dev trace serialization redaction
- player trace projection returning null
- Greyvale acceptance fixture trace markers

## Known Limitations

- No persistent resolution trace table was added.
- Existing production exploration/dialogue routes are not fully migrated into one shared trace persistence path.
- The helper produces generated/attached trace inspection, not durable per-beat replay.
- Full GM Campaign Inspector UI remains Stage 6F.1.
- Final Stage 6C regression consolidation remains 6C.8.
