# Stage 6B.14.2 Shared Lifecycle Helpers

Stage 6B.14.2 introduces pure shared lifecycle helpers for preview, submit, resolution, stale-state handling, duplicate-submit handling, non-committing inquiries, ended interactions, safe errors, and GM/dev lifecycle diagnostics.

This build preserves existing exploration and dialogue behavior. It does not rewire the exploration runtime, dialogue runtime, action-window persistence, output pipeline, visibility filtering, path harness, combat, navigation, or database schema.

## Module Location

The shared helper module is:

- `backend/src/services/interactionCore/lifecycle.js`

It is exported through:

- `backend/src/services/interactionCore/index.js`

Focused coverage lives in:

- `backend/test/interaction-core-lifecycle.test.js`

## Lifecycle Statuses

The helper module defines internal statuses only:

- Interaction lifecycle: `not_started`, `previewed`, `submitted`, `resolving`, `resolved`, `completed`, `ended`, `stale`, `unavailable`, `blocked`, `future_supported`
- Commit state: `no_commit`, `commit_available`, `commit_pending`, `commit_resolved`, `commit_blocked`, `commit_consumed`
- Resolution status: `pending`, `resolved`, `failed`, `cancelled`, `exited`, `transitioned`, `future_supported`

These are not player-facing labels.

## Current-Context Validation

`validateCurrentInteractionContext` compares requested and current context fields:

- domain
- campaign
- adventure
- character
- actor
- user
- scene/location
- active dialogue
- action window
- turn/beat
- interaction state version

Mismatches return structured safe errors and GM/dev diagnostics. Ended/completed interactions are rejected unless the caller explicitly allows archive/reopen-style reads.

## Availability Validation

`validateInteractionAvailability` normalizes availability statuses:

- `available`
- `unavailable`
- `hidden`
- `locked`
- `completed`
- `exhausted`
- `future_supported`

Player results contain safe messages. Failed requirements and raw reasons stay in GM/dev diagnostics and are stripped by `projectLifecyclePayloadForPlayer`.

## Non-Committing Inquiry Helper

`validateNonCommittingInquiry` supports the shared internal category used by:

- exploration Free Focus / Closer Look
- dialogue Clarifying Questions

It enforces:

- option kind is `non_committing_inquiry`
- `consumes_commit_slot` is false
- prior results can be reopened when the adapter supplies them
- invalid commit attempts produce GM/dev diagnostics

The helper does not persist or reopen records itself. Free Focus and Clarifying Question persistence remains domain-owned.

## Committed Action Helper

`validateCommittedAction` supports the shared internal category used by:

- exploration Beat Actions
- dialogue Committed Social Moves
- future combat/navigation committed actions

It validates:

- option kind is `committed_action`
- `consumes_commit_slot` is true
- interaction is not ended/completed
- commit slot is available
- requested/current context is fresh when supplied
- availability requirements pass

It returns safe errors for stale, unavailable, already resolving, and ended cases.

## Preview, Submit, And Resolution Helpers

Preview helpers:

- `buildInteractionPreviewLifecycleResult`
- `assertPreviewHasNoCommittedEffects`
- `validatePreviewContextFreshness`

Submit helpers:

- `validateInteractionSubmit`
- `buildInteractionSubmitAccepted`
- `buildInteractionSubmitRejected`
- `normalizeIdempotencyKey`

Resolution helpers:

- `buildInteractionResolutionLifecycleResult`
- `attachOutputBundle`
- `attachNextState`
- `attachLifecycleDebug`
- `markResolutionStatus`

These helpers build shared contract-compatible objects but do not own domain-specific semantics such as action-window writes, dialogue finalization, transcript creation, or next-scene derivation.

## Safe Errors And Diagnostics

`createLifecycleSafeError` wraps the Stage 6B.14.1 safe error contract.

`projectSafeInteractionErrorForPlayer` returns only:

- safe code
- player-safe message
- retryable flag
- recovery action

`createLifecycleDiagnostics` builds a GM/dev debug envelope with lifecycle diagnostics for:

- requested/current context
- stale reason
- duplicate/idempotency status
- failed requirements
- commit state
- interaction status
- next state
- safe error mapping notes

`projectLifecyclePayloadForPlayer` strips debug envelopes, diagnostics, GM/dev messages, internal causes, failed requirements, stale metadata, and domain debug sections.

## Runtime Integration Status

No runtime services were rewired in this build.

The following remain domain-owned:

- exploration preview/submit persistence in `actionComposerService.js` and `webActionSubmissionService.js`
- Free Focus persistence in `freeFocusService.js`
- dialogue CQ/CSM/exit persistence in `dialogueFocusCommitRuntimeService.js`
- action-window state machine
- dialogue finalization and archive records
- output writing
- player/GM visibility filtering

Stage 6B.14.2 provides helpers that later sub-builds can adopt gradually.

Stage 6B.14.3 adds the shared visibility/error projection layer in `backend/src/services/interactionCore/visibilityBoundary.js`. Lifecycle diagnostics and safe errors should use that boundary before any player-facing projection.

Stage 6B.14.4 adds the shared output pipeline in `backend/src/services/interactionCore/outputPipeline.js`. Lifecycle helpers may wrap resolution output bundles with that pipeline in later migrations, but this stage does not move persistence, output ordering, or completed-record creation into lifecycle code.

## Migration Notes

Recommended future usage:

- Use context validation helpers at low-risk stale-state boundaries.
- Use availability helpers where exploration/dialogue already produce equivalent statuses.
- Use non-committing/committed helpers in tests first, then in adapters.
- Use safe error projections only behind existing player-facing error behavior.
- Use diagnostics in GM/dev payloads only after Stage 6B.14.3 visibility filtering is ready.

No database or schema migration was added for Stage 6B.14.2.
