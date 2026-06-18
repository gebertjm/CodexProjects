# Stage 6B.14.5 Shared Path Harness And Greyvale Regression Rewire

Stage 6B.14.5 adds shared test-only path harness utilities for exploration and dialogue regression coverage.

This is a harness consolidation layer. It does not change exploration runtime, dialogue runtime, authored Greyvale content, expected path JSON formats, player-facing UI, or persistence.

## Harness Module

Shared harness utilities live at:

- `backend/test/interaction-core/sharedPathHarness.js`

Focused coverage lives at:

- `backend/test/interaction-core-path-harness.test.js`

The helpers are test-facing and intentionally live under `backend/test`.

## Helper Categories

### Content And Package Loading

Added helpers:

- `loadInteractionTestContent`
- `loadGreyvaleRegressionContent`
- `requireContentId`
- `requireSceneId`
- `requireDialogueId`
- `requireNpcId`
- `requireExpectedPath`
- `readDialogueExpectedPath`
- `readExplorationExpectedPath`
- `normalizeExpectedPathStepsForSharedAssertions`

These helpers read existing content and expected path fixtures. They do not change import behavior or registry behavior.

### Test Campaign And Context

Added helpers:

- `createInteractionTestCampaign`
- `createInteractionTestCharacter`
- `setActiveInteractionCharacter`
- `enterExplorationScene`
- `enterDialogueScene`
- `buildExplorationInteractionContext`
- `buildDialogueInteractionContext`
- `getCurrentPlayerReadModel`
- `getCurrentGmDevReadModel`

These are lightweight test-state helpers around the Stage 6B.14.1 shared context contract.

### Non-Committing Inquiry

Added helpers:

- `runNonCommittingInquiry`
- `assertInquiryDidNotConsumeCommitSlot`
- `assertInquiryDidNotWriteCommittedAction`
- `assertInquiryResultPlayerSafe`
- `assertInquiryGmDevDebugAvailable`
- `assertInquiryOutputBundle`

They cover exploration Free Focus and dialogue Clarifying Questions without consuming committed action slots.

### Preview, Submit, And Resolution

Added helpers:

- `previewCommittedInteraction`
- `assertPreviewDidNotCommit`
- `assertPreviewPlayerSafe`
- `assertPreviewGmDevDebugAvailable`
- `assertPreviewShowsAvailability`
- `assertPreviewStaleWhenContextVersionChanges`
- `submitCommittedInteraction`
- `resolveSubmittedInteraction`
- `submitAndResolveCommittedInteraction`
- `assertSubmitCommittedExactlyOnce`
- `assertResolutionOutputBundle`
- `assertResolutionNextState`
- `assertResolutionPlayerSafe`
- `assertResolutionGmDevDebugAvailable`
- `assertTransitionOutput`
- `assertFutureSupportedPlayerHidden`
- `assertCombatPendingPlayerHidden`

These use Stage 6B.14.2 lifecycle helpers and Stage 6B.14.4 output helpers.

### Forced Checks

Added deterministic helper wrappers:

- `withForcedCheckSuccess`
- `withForcedCheckFailure`
- `withForcedResultBand`
- `assertForcedCheckApplied`
- `restoreCheckBehavior`

These do not modify production randomness. They provide test-only metadata wrappers for path tests.

### Output Assertions

Added helpers:

- `assertKnowledgeOutput`
- `assertObjectiveOutput`
- `assertHistoryOutput`
- `assertLatestDevelopment`
- `assertStateWrite`
- `assertRelationshipOrSocialWrite`
- `assertCompletedRecord`
- `assertTranscriptOutput`
- `assertArchiveSearchEntry`
- `assertOutputNotDuplicated`
- `assertPlayerOutputBundleSafe`
- `assertGmDevOutputProvenance`

These use the Stage 6B.14.4 shared output bundle and projection helpers.

### Visibility Assertions

Added helpers:

- `assertPlayerPayloadSafe`
- `assertNoHiddenDataLeak`
- `assertGmDevPayloadIncludesDebug`
- `assertGmDevPayloadIncludesChecks`
- `assertGmDevPayloadIncludesStateWrites`
- `assertUnauthorizedCannotAccessGmDev`
- `assertFutureSupportedHiddenFromPlayer`
- `assertCombatPendingHiddenFromPlayer`

These use the Stage 6B.14.3 shared visibility boundary.

### Next-State Assertions

Added helpers:

- `assertCurrentScene`
- `assertSceneTransitionedTo`
- `assertDialogueActive`
- `assertDialogueExited`
- `assertActionWindowOpen`
- `assertActionWindowClosed`
- `assertNextActionWindowReady`
- `assertKnowledgeState`
- `assertObjectiveState`
- `assertHistoryState`
- `assertArchiveSearchState`

These are assertion-only helpers for read model and state progression tests.

### Stale And Duplicate Lifecycle Assertions

Added helpers:

- `assertStalePreviewRejected`
- `assertStaleSubmitRejected`
- `assertDuplicateSubmitHandled`
- `assertEndedInteractionRejected`
- `assertUnavailableActionRejected`
- `assertWrongCharacterRejected`
- `assertWrongCampaignRejected`
- `assertSafeRecoveryMessage`
- `assertLifecycleDiagnostic`

These wrap Stage 6B.14.2 lifecycle validation helpers.

## Expected Path Boundary

Expected path files remain domain-specific.

Current dialogue expected path files remain under:

- `content/dialogue_focus_commit/greyvale/*.expected-paths.json`

Stage 6B.14.5 does not create a universal expected path format.

The shared harness can read and normalize expected path steps for assertions, but authored files keep their current dialogue-shaped schema.

## Representative Test Rewire

Representative local tests now use shared harness helpers:

- `backend/test/dialogue-focus-commit-adapter.test.js`
- `backend/test/stage6b9-surface-focus-commit-unit.test.js`

The DB-backed Greyvale route tests were not broadly rewritten while local Postgres/Docker are unavailable.

## Greyvale Regression Status

The shared harness test reads real Greyvale dialogue scene and expected path files, including Tomas and Rusk paths.

The full route-level Greyvale regression remains:

- `npm run test:greyvale-full-loop`

That command remains DB-backed and must be run with the compose/Postgres environment available.

## Command Updates

Added:

- `npm run test:interaction-core`
- `npm --prefix backend run test:interaction-core`

This command runs deterministic shared interaction-core, harness, visibility, lifecycle, output, adapter, and selected exploration tests without requiring the local DB.

## Behavior Preservation

No runtime behavior changed.

No player-facing copy changed.

No expected path content changed.

No content files changed.

No database or schema migration was added.

## Follow-Up

Future stages can adopt the harness in DB-backed Greyvale tests when the local DB is available:

- `greyvale-full-loop-regression.test.js`
- `dialogue-greyvale-fixture-regression.test.js`
- `dialogue-greyvale-handoff-regression.test.js`
- `full-loop-action-lifecycle-regression.test.js`
- `full-loop-output-consistency-regression.test.js`
- `full-loop-gm-dev-visibility-regression.test.js`

Stage 6B.15 should use the harness to keep playtest-readiness assertions consistent while preserving domain-specific expected paths.
