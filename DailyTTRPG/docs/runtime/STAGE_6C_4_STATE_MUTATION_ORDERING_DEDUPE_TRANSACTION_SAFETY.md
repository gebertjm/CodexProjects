# Stage 6C.4 - State Mutation Ordering, Dedupe, And Transaction Safety

Status: implemented as shared helper and regression scaffolding  
Created: Stage 6C.4  
Primary code: `backend/src/services/interactionCore/resolutionPipeline.js`

## 1. Purpose

Stage 6C.4 hardens committed beat safety by making mutation order, write groups, dedupe/idempotency decisions, and recovery-needed diagnostics explicit and testable.

This is not a full runtime rewrite. Exploration and dialogue still own their persistence paths, but shared helpers now describe the canonical safe mutation shape they can adopt incrementally.

## 2. Canonical Mutation Ordering

Committed beat mutation order is exported as `COMMITTED_BEAT_MUTATION_ORDER`.

Canonical flow:

1. Validate current interaction.
2. Detect stale, duplicate, or idempotency status.
3. Select deterministic authored outcome.
4. Build normalized output bundle.
5. Build player result bundle.
6. Build mutation plan.
7. Apply objective writes.
8. Apply knowledge/clue writes.
9. Apply history and Latest Development writes.
10. Apply relationship/social or scene/dialogue state writes.
11. Apply completed record, transcript, summary, archive, and search writes.
12. Apply transition, endpoint, or status writes.
13. Close consumed action window and open the next permitted state.
14. Commit transaction where supported.
15. Refresh player read model.
16. Attach GM/dev trace/provenance scaffolding.
17. Apply visibility projection.
18. Return player-safe response.

Invariant: player read models must refresh after writes, and partial failures must not look like success.

## 3. Mutation Plan Behavior

`createCommittedBeatMutationPlan` builds a shared mutation plan from:

- commit request
- selected outcome metadata
- normalized output bundle
- action-window operations
- read-model refresh operations
- trace/provenance operations
- explicit adapter write groups

`createMutationPlan` remains backward-compatible with existing callers and now records:

- canonical order
- selected outcome
- normalized output bundle reference
- player result bundle reference
- transition and next-beat intent
- read-model refresh target
- transaction boundary hint
- recovery-on-failure envelope
- dedupe markers

## 4. Output Write Groups

Output writes are normalized into canonical groups:

- `objective_writes`
- `knowledge_writes`
- `history_latest_development_writes`
- `relationship_social_scene_dialogue_state_writes`
- `completed_record_transcript_archive_search_writes`
- `transition_endpoint_writes`
- `action_window_close_open_writes`
- `read_model_refresh_hook`
- `trace_provenance_writes`

Empty groups are omitted safely.

## 5. Dedupe And Idempotency

`buildCommittedBeatDedupeKey` creates stable best-effort keys from:

- campaign id
- character id
- action window id
- interaction domain
- source scene/dialogue id
- selected option id
- outcome id
- group/operation kind
- normalized output dedupe key

`createMutationWriteGroup` dedupes duplicate operations by key and records GM/dev-only dedupe markers.

`createMutationIdempotencyDecision` represents duplicate, stale, endpoint-review, recovery-needed, and current submit states. Non-current decisions are no-mutation decisions with safe recovery envelopes.

## 6. Transaction Safety

`createMutationApplicationResult` models plan application and failure behavior for tests and GM/dev diagnostics.

When no failure is present:

- status is `applied`
- read-model refresh is allowed
- transaction boundary records the plan hint or unavailable status

When a write group fails:

- status is `recovery_needed`
- applied and skipped write groups are reported for GM/dev
- read-model refresh is blocked
- recovery-needed envelope records the failed group and partial writes known

No database/schema migration was added.

## 7. Recovery-Needed Behavior

Recovery-needed is used for simulated or detected mutation failure, stale submits, duplicate submits, endpoint review-only submit attempts, and inconsistent state.

Player projection keeps only:

- safe recovery kind
- player-safe message
- retry/recovery action
- current safe state if supplied

GM/dev diagnostics keep:

- failed lifecycle step
- mutation plan
- applied/skipped write groups
- failed write group
- dedupe/idempotency markers
- recommended repair metadata

## 8. Action-Window Lifecycle Safety

Action-window close/open operations are represented as their own write group.

Successful committed beats should close the consumed window before the read model is refreshed. Endpoint plans should close or freeze the consumed state and avoid opening unsupported combat windows.

Full transition and next-beat orchestration remains Stage 6C.5.

## 9. Read Model Refresh Ordering

`assertMutationPlanOrdering` verifies write groups stay in canonical order and that read-model refresh does not precede committed write groups.

Read-model refresh failure handling is represented by recovery-needed envelopes. Full player read-model hardening remains Stage 6C.6.

## 10. Exploration Mutation Safety

Exploration adapters can use the shared plan for Beat Action commits, transitions, Broken Caravan outputs, Dunmere/village outputs, shrine approach outputs, and endpoint-adjacent outputs.

Current 6C.4 coverage is helper-level plus Greyvale acceptance metadata. Existing Greyvale regression tests still cover real exploration duplicate/stale submit behavior.

## 11. Dialogue Mutation Safety

Dialogue adapters can use the shared plan for Committed Social Moves, relationship/social writes, clue/objective/history outputs, exits/finalization, completed records, transcripts, summaries, archive/search, and Rusk endpoint-adjacent outputs.

Current 6C.4 coverage is helper-level plus Greyvale acceptance metadata. Existing Greyvale regression tests still cover real dialogue duplicate/stale submit behavior.

## 12. Endpoint Mutation Safety

Rusk endpoint expectations now include:

- endpoint status set once
- endpoint outputs not duplicated
- no unsupported combat action window opened
- start/resume returns review state
- GM/dev diagnostics preserve internal handoff
- player projection hides combat/future internals

The shared helper test covers endpoint plans with only a close-window operation and safe endpoint refresh.

## 13. GM/Dev Mutation Diagnostics

`createMutationSafetyDiagnostics` exposes GM/dev-only diagnostics:

- mutation plan
- write group order
- dedupe decisions
- idempotency decision
- transaction boundary
- mutation application result
- action-window lifecycle decision
- read-model refresh target
- warnings

`createResolutionTraceEnvelope` now includes `mutation_safety_diagnostics`.

Stage 6C.5 builds on this by adding transition-orchestration diagnostics and next-beat selection after mutation planning. The action-window lifecycle decision can now be compared against the selected transition and next-beat decisions in GM/dev diagnostics.

## 14. Player Visibility Safety

Player projections continue to omit:

- mutation plan
- write group internals
- transaction details
- dedupe/idempotency keys
- GM/dev diagnostics
- raw state writes
- branch ids
- hidden requirements/checks
- combat/future-supported internal labels

Focused tests assert player-safe projections for successful, duplicate/stale, failure, and endpoint-shaped responses.

## 15. Greyvale Acceptance Extensions

The Greyvale vertical-slice acceptance fixture now records mutation-safety assertions:

- canonical mutation write group order
- duplicate submit no duplicate outputs/action windows
- stale submit no mutation recovery
- stable dedupe/idempotency markers
- read-model refresh after commit
- endpoint no unsupported combat action window
- GM/dev mutation diagnostics
- player-hidden mutation internals

Fixture shape tests enforce these markers.

## 16. Tests Added

`backend/test/interaction-core-mutation-safety.test.js` covers:

- canonical write group ordering
- empty group omission
- operation dedupe markers
- stable committed beat dedupe keys
- duplicate/stale no-mutation recovery decisions
- simulated mutation failure and recovery-needed result
- read-model refresh blocked after failure
- endpoint no-combat-window mutation plan
- GM/dev mutation diagnostics and player-hidden internals

`npm run test:interaction-core` includes the new suite.

## 17. Known Limitations

- Runtime services are not fully routed through shared mutation-plan application yet.
- No durable mutation batch persistence was added.
- No new DB transaction wrapper was introduced in this stage.
- True rollback remains domain-owned where current services already use transactions.
- Shared transition/next-beat orchestration scaffolding exists from Stage 6C.5, but full runtime service adoption remains incremental.
- Shared player result/read-model refresh alignment exists from Stage 6C.6, but full runtime service adoption remains incremental.
- Generated/attached GM/dev trace inspection exists from Stage 6C.7; persisted trace storage remains deferred.

## 18. Behavior Preservation

No authored Greyvale content was changed.

No combat, navigation, AI narration, rules transparency expansion, SMS requirement, major UI redesign, or schema migration was added.
