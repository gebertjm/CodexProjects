# Stage 6C - Beat Resolution Runtime Audit And Hardening Plan

Status: audit and plan  
Created: Stage 6C.0  
Primary predecessor: Stage 6B.15 Greyvale Playable Vertical Slice  
Primary acceptance target: Greyvale vertical slice  
Implementation stages: 6C.1 through 6C.8

## Stage 6C.1 Implementation Status

Stage 6C.1 has been implemented as a shared contract/scaffolding pass, not a runtime migration.

Added:

- Shared resolution pipeline contract module: `backend/src/services/interactionCore/resolutionPipeline.js`
- Focused deterministic tests: `backend/test/interaction-core-resolution-pipeline.test.js`
- Contract and orchestration docs: `docs/runtime/STAGE_6C_1_RESOLUTION_PIPELINE_CONTRACT_AND_ORCHESTRATION_MAP.md`

The 6C.1 module defines the shared request/response envelopes, adapter boundary, preview/commit/recovery lifecycle maps, mutation plan contract, transition and next-beat contracts, player result bundle, GM/dev trace envelope, recovery-needed envelope, projection helpers, and migration strategy scaffolding.

No exploration or dialogue runtime behavior was rewired in 6C.1. No Greyvale content, player UI, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.2 Implementation Status

Stage 6C.2 has been implemented as a shared preview-consistency helper pass, not a runtime migration.

Added:

- Shared preview consistency rules and helper APIs in `backend/src/services/interactionCore/resolutionPipeline.js`
- Focused deterministic tests in `backend/test/interaction-core-preview-consistency.test.js`
- Greyvale vertical-slice acceptance fixture preview-consistency metadata in `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- Fixture-shape assertions in `backend/test/greyvale-vertical-slice-acceptance.test.js`
- Implementation notes in `docs/runtime/STAGE_6C_2_PREVIEW_TO_RESOLUTION_CONSISTENCY_PASS.md`

The 6C.2 helpers define preview non-mutation assertions, preview request validation, preview/commit alignment markers, commit-against-preview validation, semantic preview expectation/result outcome comparison, safe preview player projection, and GM/dev diagnostics.

No exploration or dialogue runtime behavior was rewired in 6C.2. No Greyvale story content, player UI, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.3 Implementation Status

Stage 6C.3 has been implemented as a shared outcome-quality and result-bundle helper pass, not a full runtime migration.

Added:

- Shared outcome-quality result bundle helpers in `backend/src/services/interactionCore/resolutionPipeline.js`
- GM/dev outcome-quality diagnostics on the shared resolution trace envelope
- Focused deterministic tests in `backend/test/interaction-core-outcome-quality.test.js`
- Greyvale vertical-slice acceptance fixture outcome-quality metadata in `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- Fixture-shape assertions in `backend/test/greyvale-vertical-slice-acceptance.test.js`
- Implementation notes in `docs/runtime/STAGE_6C_3_OUTCOME_QUALITY_CONSEQUENCE_FRAMING_FAILURE_HANDLING.md`
- Authoring guidance in `docs/runtime/BEAT_RESOLUTION_AUTHORING_GUIDELINES.md`

The 6C.3 helpers add deterministic `attempted_action` and `complications` sections, output-derived discovery/progress/consequence/next-step framing, safe unavailable/recovery result framing, and GM/dev diagnostics for present or missing result sections.

No exploration or dialogue runtime behavior was broadly rewired in 6C.3. No Greyvale story content, player UI, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.4 Implementation Status

Stage 6C.4 has been implemented as shared mutation-ordering, dedupe, idempotency, and recovery scaffolding, not a full runtime rewrite.

Added:

- Canonical committed beat mutation order in `backend/src/services/interactionCore/resolutionPipeline.js`
- Shared committed beat mutation plan builder and write-group normalization helpers
- Stable dedupe/idempotency markers for mutation operations
- Duplicate/stale no-mutation decision helpers
- Simulated mutation application result and recovery-needed diagnostics
- GM/dev mutation safety diagnostics on the shared resolution trace envelope
- Focused deterministic tests in `backend/test/interaction-core-mutation-safety.test.js`
- Greyvale vertical-slice acceptance fixture mutation-safety metadata
- Implementation notes in `docs/runtime/STAGE_6C_4_STATE_MUTATION_ORDERING_DEDUPE_TRANSACTION_SAFETY.md`

The 6C.4 helpers define canonical write group ordering, output-derived write groups, duplicate-operation dedupe, stale/duplicate submit decisions, recovery-needed failure results, action-window/read-model ordering diagnostics, and player-hidden mutation internals.

No exploration or dialogue runtime behavior was broadly rewired in 6C.4. No Greyvale story content, player UI, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.5 Implementation Status

Stage 6C.5 has been implemented as shared transition-orchestration and next-beat selection scaffolding, not a full transition runtime rewrite.

Added:

- Shared transition orchestration helpers in `backend/src/services/interactionCore/resolutionPipeline.js`
- Shared next-beat selection helpers for exploration, dialogue, endpoint, unavailable, and recovery outcomes
- Transition/result alignment assertions and GM/dev orchestration diagnostics
- Trace-envelope `transition_orchestration_diagnostics`
- Focused deterministic tests in `backend/test/interaction-core-transition-orchestration.test.js`
- Greyvale vertical-slice acceptance fixture transition/next-beat metadata
- Implementation notes in `docs/runtime/STAGE_6C_5_TRANSITION_ORCHESTRATION_AND_NEXT_BEAT_SELECTION.md`

The 6C.5 helpers normalize adapter proposals and output transition records into one internal transition decision, then select a safe next beat. Endpoint and future-supported handoffs are review-only for players, while GM/dev diagnostics retain internal routing and target details.

No exploration or dialogue runtime behavior was broadly rewired in 6C.5. No Greyvale story content, player UI, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.6 Implementation Status

Stage 6C.6 has been implemented as shared player result bundle/read-model refresh alignment scaffolding, not a full read-model runtime rewrite.

Added:

- Player read-model normalization helpers in `backend/src/services/interactionCore/resolutionPipeline.js`
- Active state summary helper for player-safe current-state composition
- Result/read-model alignment diagnostics and assertion helpers
- Read-model refresh timing diagnostics on the shared resolution trace envelope
- Focused deterministic tests in `backend/test/interaction-core-read-model-refresh.test.js`
- Greyvale vertical-slice acceptance fixture read-model refresh metadata
- Implementation notes in `docs/runtime/STAGE_6C_6_PLAYER_RESULT_BUNDLE_AND_READ_MODEL_REFRESH_HARDENING.md`

The 6C.6 helpers verify that discoveries, objective progress, scene/dialogue transitions, endpoint states, and recovery states agree with the refreshed player read model. Player projections hide read-model refresh internals while GM/dev traces preserve alignment diagnostics.

No exploration or dialogue runtime behavior was broadly rewired in 6C.6. No frontend files, Greyvale story content, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.7 Implementation Status

Stage 6C.7 has been implemented as shared GM/dev resolution trace and provenance inspection scaffolding, not a persistent trace storage migration and not a full GM Campaign Inspector UI.

Added:

- Trace storage strategy, lifecycle checkpoint, and inspection vocabulary in `backend/src/services/interactionCore/resolutionPipeline.js`
- Formal trace envelope fields for schema version, storage strategy, collection points, authorization result, active state summary, preview diagnostics, transaction boundary, action-window lifecycle, and read-model refresh target
- Trace lifecycle summary helper
- Trace access decision helper matching the existing `can_advance_beats` GM/dev convention
- GM/dev trace serialization with secret redaction
- Player trace projection that intentionally returns `null`
- Player-vs-GM projection comparison helper
- Shared provenance inspector helper
- Focused deterministic tests in `backend/test/interaction-core-resolution-trace.test.js`
- Greyvale vertical-slice acceptance fixture trace/provenance metadata
- Implementation notes in `docs/runtime/STAGE_6C_7_GM_DEV_RESOLUTION_TRACE_AND_PROVENANCE_INSPECTOR.md`

The 6C.7 helpers make generated/attached GM-dev traces inspectable for request, validation, idempotency, selected outcome, output bundle, mutation plan/result, transition decision, next-beat decision, read-model refresh, recovery, and projection stripping. Player projections continue to omit traces and GM/dev diagnostics.

No exploration or dialogue runtime behavior was broadly rewired in 6C.7. No frontend files, Greyvale story content, combat, navigation, AI narration, SMS, rules transparency, database schema, or major output behavior changed.

## Stage 6C.8 Implementation Status

Stage 6C.8 has been implemented as the capstone regression-suite and final-status pass for Stage 6C.

Added:

- Official Stage 6C regression command: `npm run test:stage:6c`
- Backend Stage 6C regression command: `npm --prefix backend run test:stage:6c`
- Capstone regression test: `backend/test/stage6c-beat-resolution-regression.test.js`
- Stage 6C path harness fixture: `content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json`
- Stage 6C regression documentation: `docs/runtime/STAGE_6C_8_BEAT_RESOLUTION_REGRESSION_SUITE.md`
- Final Stage 6C status: `docs/runtime/STAGE_6C_FINAL_STATUS.md`

The Stage 6C command composes the shared interaction-core regression suite with the Greyvale vertical-slice acceptance suite. It proves the 6C hardening layers for contracts, previews, outcome quality, mutation safety, transition/next-beat selection, result/read-model alignment, GM/dev traces, player-vs-GM visibility, and the real Greyvale route.

No combat, open-world navigation, AI narration, player-facing rules transparency expansion, SMS requirement, major Greyvale content, player UI redesign, full GM Campaign Inspector, or database/schema migration was added.

## 1. Stage Purpose

Stage 6C is the Beat Resolution Quality and Runtime Orchestration Hardening stage.

It should strengthen the reusable runtime loop for committed beats:

```text
preview
-> commit
-> resolution
-> output bundle
-> ordered state mutation
-> transition / next beat
-> player result bundle
-> read model refresh
-> GM/dev resolution trace
-> safe recovery if malformed, stale, partial, duplicate, or interrupted
```

Locked scope:

- Stage 6C remains deterministic and authored/content-driven.
- No AI narration or dynamic prose generation.
- Define one shared beat-resolution pipeline for exploration and dialogue.
- Preserve domain-specific adapters for exploration and dialogue.
- Preserve existing lightweight check behavior.
- Defer expanded rules/check transparency to Stage 6H.
- Use Greyvale as the primary acceptance target without making shared runtime Greyvale-specific.
- Stay mostly backend/runtime.
- Allow only minimal player UI alignment for standardized result bundles, safe recovery messages, and hidden-data safety.
- Do not implement combat.
- Do not implement open-world navigation.
- Do not add major Greyvale content.
- Do not add SMS requirements.
- Do not redesign the player UI.
- Avoid database/schema changes unless a later implementation sub-build proves they are necessary and the repo owner approves them.

Stage 6C should not replace the Stage 6B.15 vertical slice. It should harden the runtime underneath the slice so future content and domains can rely on the same preview, commit, resolution, output, transition, trace, and recovery rules.

## 2. Current Runtime Inventory

### A. Exploration Runtime

Relevant files:

- `backend/src/services/characterSceneViewService.js`
- `backend/src/services/sceneNarrationComposer.js`
- `backend/src/services/sceneContentOverlayService.js`
- `backend/src/services/actionComposerService.js`
- `backend/src/services/webActionSubmissionService.js`
- `backend/src/services/beatAdvanceService.js`
- `backend/src/services/adventureRuntimeService.js`
- `backend/src/services/freeFocusService.js`
- `backend/src/services/playerBeatResultService.js`
- `backend/src/services/worldStateMutationService.js`
- `backend/src/services/adventureProgressionService.js`
- `backend/src/services/playtestDiagnosticsService.js`
- `backend/src/db/queries/adventureRuntime.js`
- `backend/src/routes/play.js`
- `backend/src/routes/devBeat.js`

Current behavior:

- Surface / Focus / Commit scene display is assembled through `characterSceneViewService`, narration composition, content overlays, current action windows, available actions, current objective, latest development, and scene feed.
- Free Focus runs through `freeFocusService.resolveFreeFocusForAccount`. It is non-committing, can persist results, can apply knowledge/state effects, and keeps player-facing check details limited.
- Beat Action preview runs through `actionComposerService.previewWebAction`. It resolves selected or natural-language action intent, validates action-window context, returns a player-safe preview, and blocks endpoint actions.
- Beat Action submit runs through `actionComposerService.submitWebAction` and `webActionSubmissionService.storeWebActionSubmission`. The submitted action is stored against the current action window with uniqueness enforced by `(action_window_id, character_id)`.
- GM/dev beat advancement runs through `beatAdvanceService.advanceBeatForDevAccount`. It locks the current action window as `resolving`, converts the submitted action into a runtime action, resolves it, marks the window resolved, records a player beat result, and returns the refreshed scene.
- Exploration runtime resolution still uses `adventureRuntimeService.actThroughPlayState` for core action execution. It supports scene entry, scene movement, legacy NPC dialogue, scene interactions, Free Focus follow-up, event options, waits, and older combat hooks.
- Transition handling for scene movement is adapter/domain-specific in `adventureRuntimeService.resolveMoveTargetFromScene` and `moveCharacterScene`.
- Next action window selection is handled by `adventureRuntimeService.syncActionWindow` and its desired-window builder, not by a shared resolution pipeline.
- Player result feed and latest beat result read model are written through `playerBeatResultService.recordPlayerBeatResult`.
- GM/dev diagnostics exist through exploration mechanics debug read models, dev beat routes, playtest diagnostics, and GM/dev slice inspector coverage.

Shared vs domain-specific:

- Shared-looking: preview/submit validation, stale errors, output bundle shape, visibility filtering, duplicate submit handling, result feed, GM/dev diagnostics.
- Domain-specific: scene surfaces, exploration affordances, Free Focus persistence, environment modifiers, scene transitions, action-window opening rules.

Known duplication:

- Preview/submit lifecycle overlaps with dialogue CSM preview/submit.
- Output writes overlap with dialogue output effects but are not assembled through one mutation plan.
- Recovery/error messages are safe in many places but not generated from one recovery taxonomy.
- GM/dev debug data exists but not as one formal committed-beat trace.

Known fragility:

- `actThroughPlayState` resolves the action before the campaign-log transaction and runs dynamic content hooks after that transaction. Exploration resolution is therefore partially atomic at best.
- Action-window closing, runtime action resolution, dynamic hook execution, player result recording, and next-window selection are split across services.
- Some recovery is repair-oriented (`playtestDiagnosticsService`) rather than part of the committed resolution contract.
- Preview can be useful but is not formally tied to the final result bundle.

Test coverage:

- `backend/test/stage6b5-action-composer-unit.test.js`
- `backend/test/stage6b9-surface-focus-commit-unit.test.js`
- `backend/test/stage6b15-exploration-playability.test.js`
- `backend/test/full-loop-action-lifecycle-regression.test.js`
- `backend/test/full-loop-output-consistency-regression.test.js`
- `backend/test/exploration-greyvale-mechanics-regression.test.js`
- `backend/test/exploration-mechanics-visibility-boundary.test.js`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`

Missing coverage:

- Formal preview-to-resolution equivalence assertions.
- Mutation ordering assertions across objective, knowledge, history, latest development, state writes, transitions, and next action window.
- Resolution trace assertions for every committed beat.
- Failure injection tests for partial write/recovery-needed states.

Recommended 6C sub-builds:

- 6C.1 for shared pipeline contracts and mutation-plan/trace concepts.
- 6C.2 for preview-to-resolution consistency.
- 6C.4 for mutation ordering, dedupe, and transaction safety.
- 6C.5 for transition and next-beat orchestration.
- 6C.6 for player result bundles and read-model refresh.
- 6C.7 for GM/dev trace.

### B. Dialogue Runtime

Relevant files:

- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitSchema.js`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitTypes.js`
- `backend/src/services/dialogueFocusCommit/dialogueRelationshipStateService.js`
- `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`
- `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`
- `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js`
- `backend/src/services/dialogueFocusCommit/dialogueAnnotationCorrectionService.js`
- `backend/src/db/queries/dialogueFocusCommit.js`
- `backend/src/routes/play.js`

Current behavior:

- Conversation Surface is loaded through `getDialogueFocusCommitStateForAccount` and `prepareDialogueRuntime`.
- Clarifying Questions run through `resolveClarifyingQuestionForAccount`. They are non-committing, transactional, can resolve checks, apply knowledge/canonical outputs/relationship writes, append transcript turns, update runtime state, and return current dialogue.
- Committed Social Move preview runs through `previewCommittedSocialMoveForAccount`. It validates active dialogue lifecycle context, detects Clarifying Question overlap, checks relationship availability, returns authored move or fallback preview, and does not mutate intended committed state.
- Committed Social Move submit runs through `submitCommittedSocialMoveForAccount`. It runs in a transaction, chooses authored move or fallback, resolves check/outcome, applies knowledge/canonical outputs/relationship writes, writes social move record and transcript turns, updates runtime latest development, locks questions, applies unlocks/locks, and returns the refreshed dialogue.
- Dialogue exits run through `resolveDialogueExitForAccount`. Exits are free relative to exploration beat cost, update runtime state to `exited`, append transcript turn, finalize archive/completed record, and return player-safe exit/current dialogue.
- Relationship/social state is handled by `dialogueRelationshipStateService`, including reads, writes, player-facing summaries, and audit records.
- Completed records, transcripts, archive, search, and summaries are handled by `dialogueArchiveService`.
- GM/dev debug is available through `dialogueDebugWorkspaceService`, GM/dev inspector services, path harness outputs, and visibility tests.

Shared vs domain-specific:

- Shared-looking: lifecycle validation, preview/commit split, stale context errors, output bundle/provenance, visibility projection, safe errors, GM/dev diagnostics.
- Domain-specific: CQ rules, CSM labels, fallback/exhaustion, relationship/social state, transcript/completed record behavior, dialogue exits.

Known duplication:

- Preview/submit lifecycle duplicates exploration patterns.
- Output effects duplicate exploration objective/knowledge/history/latest-development concerns.
- Dialogue has richer transaction boundaries than exploration, but there is no shared mutation-plan contract.

Known fragility:

- Preview overlap can tell a player to use a CQ, but the committed path is still separate from the preview result shape.
- CSM submit returns branch/check/result fields directly rather than a standardized player result bundle.
- Completed record/archive/search writes are dialogue-specific and need explicit ordering in a shared plan.
- Same-beat reentry and scene-to-dialogue handoff behavior now crosses exploration action windows and dialogue runtime state.

Test coverage:

- `backend/test/dialogue-focus-commit-runtime.test.js`
- `backend/test/dialogue-relationship-state-runtime.test.js`
- `backend/test/dialogue-archive-runtime.test.js`
- `backend/test/dialogue-debug-workspace.test.js`
- `backend/test/dialogue-path-test-harness.test.js`
- `backend/test/dialogue-greyvale-*.test.js`
- `backend/test/stage6b15-dialogue-playability.test.js`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`

Missing coverage:

- Formal result bundle shape for CQs, CSMs, and exits.
- Cross-domain transition/next-beat assertions after dialogue exits and dialogue-entering beat actions.
- Failure injection for archive/search or transcript write failures.
- Formal trace record/projection for each committed social move and exit.

Recommended 6C sub-builds:

- 6C.1 for shared contracts with dialogue adapter boundaries.
- 6C.2 for CQ/CSM preview-result consistency.
- 6C.3 for consequence framing and failure handling.
- 6C.4 for transactional mutation plans.
- 6C.7 for trace/provenance.

### C. Shared Interaction Core

Relevant files:

- `backend/src/services/interactionCore/contracts.js`
- `backend/src/services/interactionCore/lifecycle.js`
- `backend/src/services/interactionCore/visibilityBoundary.js`
- `backend/src/services/interactionCore/outputPipeline.js`
- `backend/src/services/interactionCore/transitionOutput.js`
- `backend/src/services/interactionCore/debugEnvelope.js`
- `backend/src/services/interactionCore/errors.js`
- `backend/src/services/interactionCore/pathExpectations.js`
- `backend/src/services/interactionCore/explorationAdapter.js`
- `backend/src/services/interactionCore/explorationVisibilityAdapter.js`
- `backend/src/services/interactionCore/explorationOutputAdapter.js`
- `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`
- `backend/src/services/interactionCore/dialogueVisibilityAdapter.js`
- `backend/src/services/interactionCore/dialogueOutputAdapter.js`
- `backend/test/interaction-core/sharedPathHarness.js`

Current behavior:

- Shared contracts define domains, contexts, options, preview/submission/resolution primitives, output bundles, visibility scopes, debug envelopes, and path expectations.
- Lifecycle helpers normalize context validation, non-committing inquiry rules, committed action checks, stale/duplicate/idempotency diagnostics, preview no-effect assertions, safe lifecycle errors, and GM/dev diagnostics.
- Visibility helpers define shared player/GM/dev projection and denylist helpers.
- Output helpers define output bundle building, normalization, dedupe, validation, provenance, player projection, and GM/dev projection.
- Path harness helpers provide shared content loading, context, lifecycle, output, visibility, next-state, and stale/duplicate assertions.

Boundary:

- Shared helpers are mostly pure/test-facing or adapter-facing.
- Exploration and dialogue runtime services have not been migrated into one orchestrator.
- Output writers still execute inside domain services.
- No shared committed-beat mutation plan exists yet.
- No formal committed-beat trace exists yet.

Test coverage:

- `npm run test:interaction-core`
- `backend/test/interaction-core-contracts.test.js`
- `backend/test/interaction-core-lifecycle.test.js`
- `backend/test/interaction-core-visibility-boundary.test.js`
- `backend/test/interaction-core-output-pipeline.test.js`
- `backend/test/interaction-core-path-harness.test.js`

Recommended 6C sub-build:

- 6C.1 should build on these modules, not replace them.

### D. Greyvale Acceptance Path

Relevant files:

- `docs/greyvale/STAGE_6B_15_FINAL_STATUS.md`
- `docs/greyvale/STAGE_6B_15_8_END_TO_END_VERTICAL_SLICE_ACCEPTANCE_SUITE.md`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`

Canonical route:

- Start/resume Greyvale.
- Broken Caravan Free Focus.
- Broken Caravan investigation.
- Grey Road Inn transition.
- Tomas dialogue.
- Elin dialogue.
- Dunmere transition.
- Mara dialogue.
- Lysa dialogue.
- Garren route knowledge.
- Old forest path transition and tracking.
- Shrine ruins transition.
- Rusk confrontation.
- Player-safe endpoint review/resume.

Current endpoint behavior:

- Rusk resolves to a player-safe endpoint state.
- GM/dev inspector can expose internal combat/future-supported handoff details.
- Player projections hide internal endpoint labels.

Current acceptance command:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```

Known weak points for Stage 6C:

- Acceptance proves route playability, not formal mutation ordering.
- Browser E2E remains manual.
- Atomicity/recovery-needed paths are not deeply failure-injected.
- GM/dev trace exists as inspector/debug/provenance fragments, not one formal trace per committed beat.

## 3. Shared Beat-Resolution Pipeline Proposal

Proposed pipeline:

1. Receive preview or commit request.
2. Resolve actor, user, character, campaign, and active interaction scope.
3. Load current action window or active interaction state.
4. Validate request against current state and visibility scope.
5. For preview:
   - Build a preview bundle from the same authored source used by commit where practical.
   - Assert no state mutation.
   - Return safe player projection.
   - Return GM/dev preview diagnostics where authorized.
6. For commit:
   - Validate idempotency, stale state, duplicate submission, and availability.
   - Select deterministic authored outcome.
   - Build canonical output bundle.
   - Build player-facing result bundle.
   - Build mutation plan in canonical order.
   - Apply writes transactionally where supported.
   - Select transition and next beat.
   - Close consumed window or consume dialogue beat.
   - Open next window, keep active dialogue, or mark endpoint/recovery-needed.
   - Refresh player read model.
   - Record GM/dev resolution trace.
   - Return player-safe response.
7. For failure/recovery:
   - Do not strand the player on a broken action.
   - Mark recovery-needed where partial writes may have happened.
   - Return safe player recovery message.
   - Preserve GM/dev trace and diagnostics.

Shared responsibilities:

- Lifecycle validation.
- Preview/commit split.
- Idempotency and dedupe envelope.
- Output bundle shape.
- Mutation ordering.
- Transition orchestration shell.
- Player result bundle shape.
- Read-model refresh hook.
- GM/dev trace shape.
- Visibility projection.
- Recovery-needed envelope.

Exploration adapter responsibilities:

- Free Focus specifics.
- Beat Action labels and authored affordance mapping.
- Scene/location affordances.
- Environment modifiers.
- Exploration scene transitions.
- Exploration-specific next action window rules.

Dialogue adapter responsibilities:

- Clarifying Question specifics.
- Committed Social Move labels and authored move matching.
- Relationship/social state.
- Generic fallback/exhaustion.
- Dialogue exits.
- Completed records, transcripts, summaries, archive/search.

## 4. Preview-To-Resolution Consistency Audit

Current exploration preview sources:

- `actionComposerService.previewWebAction`
- `resolveActionIntent`
- scene view action status and available actions
- selected affordance/action metadata
- endpoint guards

Current exploration commit sources:

- `actionComposerService.submitWebAction`
- `webActionSubmissionService.storeWebActionSubmission`
- `beatAdvanceService.actionInputFromSubmission`
- `adventureRuntimeService.actThroughPlayState`

Current dialogue preview sources:

- `previewCommittedSocialMoveForAccount`
- authored CSMs
- relationship availability
- fallback availability
- CQ overlap detection

Current dialogue commit sources:

- `submitCommittedSocialMoveForAccount`
- `resolveAndPersistMove`
- `outcomeFor`
- relationship/canonical output writers

Findings:

- Preview and commit generally read the same authored entities, but there is no shared preview-result contract proving they stayed aligned.
- Exploration previews can describe an action intent, while final resolution may enter a different code path through action input conversion and dynamic hooks.
- Dialogue preview can return CQ overlap or fallback preview; submit repeats the same matching logic but does not reuse a serialized preview decision.
- Locked/unavailable states are player-safe but not uniformly represented as a shared preview/commit status.
- Hidden-data filtering exists but is not tied to one result bundle assertion for every preview/result pair.

6C.2 implementation work:

- Implemented shared preview alignment markers with source scene/dialogue id, action window id, option id, context version, content version, availability snapshot id, and stable preview token.
- Implemented semantic expectation/result mapping through preview expectation markers and resolution outcome markers.
- Implemented tests proving preview validation, non-mutation, stale recovery, unavailable/locked handling, duplicate preview stability, player-safe projection, and GM/dev diagnostics.
- Preserved non-mutating preview assertions and current runtime behavior; exploration/dialogue services are not yet migrated to enforce these helpers directly.
- Add stale preview submit tests across exploration and dialogue.
- Add GM/dev preview diagnostics that show authored source and why the final outcome was compatible.

## 5. Outcome Quality And Consequence Framing Audit

Committed results should communicate:

- What the player attempted.
- What happened.
- What changed immediately.
- What was learned.
- What progressed.
- What became possible.
- What became worse.
- What remains unresolved.
- What the next practical step is.

Current findings:

- Exploration results often rely on `narrative_text`, `result_summary`, Latest Development, and scene refresh. These are useful but spread across result/feed/read-model surfaces.
- Dialogue results return `result_text`, latest development, knowledge grants, relationship updates, and current dialogue. These are useful but not grouped into a consistent player result bundle.
- Endpoint results are player-safe, but endpoint status is a special-case read-model field rather than a general result status.
- Some result text can feel flat when outputs are only listed as technical links or current state changes.
- Next-step hints often depend on refreshed scene/dialogue UI rather than an explicit `next` section.

6C.3 implementation:

- Defined deterministic authored result bundle sections: attempted action, result, consequences, discoveries, progress, complications, next, recovery, and status.
- Added shared helpers that can derive safe discovery/progress/consequence/next-step sections from normalized output bundles without exposing raw writes.
- Added GM/dev diagnostics for missing recommended sections, no player-visible change, and recovery results without a next step.
- Added authoring guidance that every committed action/move should have result text, consequence/progress text, and next-step framing where possible.
- Keep mechanics/check transparency at current lightweight level.
- Do not generate new prose dynamically.

## 6. State Mutation Ordering Audit

Current exploration ordering:

- Action execution happens in `actThroughPlayState`.
- It may mutate scene, event, interaction, combat, or dialogue state before the later campaign-log transaction.
- Dynamic content hooks run after the campaign log transaction.
- Beat result read models are recorded by `beatAdvanceService.finalizeAdvance` after action resolution.
- Next action window state is synchronized inside adventure runtime/load state paths.

Current dialogue ordering:

- CQ/CSM/exit flows run inside `withTransaction`.
- They resolve outcome, apply knowledge/canonical outputs/relationship writes, write records/transcript turns, update runtime state, and return refreshed dialogue.
- Archive finalization occurs inside dialogue exit transaction.

6C.4 implemented canonical ordering:

1. Validate current interaction/action window.
2. Detect stale, duplicate, or idempotency status.
3. Select deterministic outcome.
4. Build normalized output bundle.
5. Build player result bundle.
6. Build mutation plan.
7. Apply objective writes.
8. Apply knowledge writes.
9. Apply history and latest development writes.
10. Apply relationship/social or scene/dialogue state writes.
11. Apply completed record/transcript/archive/search writes.
12. Apply transition/endpoint writes.
13. Close consumed action window and open the next permitted state.
14. Commit transaction where supported.
15. Refresh read model.
16. Attach GM/dev trace/provenance scaffolding.
17. Apply visibility projection.
18. Return player-safe response.

Adjustment notes:

- Some existing writes require scene/dialogue state before archive/transcript output. The mutation plan should allow dependency ordering while preserving a single declarative ordering policy.
- If player beat result must be written inside the same transaction as action-window resolution, Stage 6C should move that write into the shared commit phase or explicitly mark it post-commit read-model output.
- The shared helper layer now enforces canonical group ordering and read-model refresh ordering for new mutation plans. Full adapter/runtime application remains incremental.

## 7. Atomicity And Transaction Safety Audit

Current classification:

- Dialogue committed moves, CQs, and exits are mostly atomic because they use `withTransaction` around outcome selection, output writes, transcript/archive writes, and runtime state update.
- Exploration beat advancement is partially atomic. `beginAdvance` and `finalizeAdvance` are transactional, but `actThroughPlayState` resolves before the finalization transaction, and dynamic hooks execute outside that transaction.
- Content hooks and archive/search indexing can fail independently depending on the path.
- Read-model refresh is post-write and can fail independently.

Risks:

- A failed dynamic hook can leave the core action resolved but not all outputs applied.
- A failure between action execution and beat-result recording can leave player read model lacking a latest result.
- A failure opening the next action window can strand the player.
- A failure in archive/search indexing can leave completed dialogue visible but not searchable.

Transaction opportunities:

- Use existing `withTransaction` patterns for shared mutation plans.
- Keep outcome selection and mutation staging pure before transaction where possible.
- Execute all DB writes through the transaction executor.
- Defer non-critical read-model refresh to after commit but record recovery diagnostics if refresh fails.

Possible schema pressure:

- Persistent resolution trace.
- Recovery-needed beat state.
- Idempotency keys or committed beat transaction ids.
- Mutation batch ids.
- Output bundle persistence.

No schema changes should be made in 6C.0. Stage 6C.1/6C.4 should prove whether these are necessary.

## 8. Dedupe And Idempotency Audit

Current protections:

- `webActionSubmissionService.storeWebActionSubmission` uses one submission per action window/character.
- `beatAdvanceService.beginAdvance` locks the active window with `FOR UPDATE` and handles recent advance suppression.
- `interactionCore/lifecycle.js` has helper-level duplicate/idempotency semantics.
- Knowledge/objective writers upsert or dedupe in their own services.
- Completed dialogue records avoid duplication through runtime state and archive finalization checks.
- Vertical-slice acceptance tests cover duplicate submit and endpoint resume.

Gaps:

- There is no universal committed-beat idempotency key.
- Preview idempotency is implicit rather than recorded.
- Duplicate submit safe responses are not standardized across exploration and dialogue.
- Repeated dynamic hooks and archive/search indexing are not covered by one mutation batch id.
- GM/dev duplicate diagnostics are fragmented.

6C behavior:

- Preview should be repeatable and non-mutating.
- Commit should accept one idempotency key per current interaction context.
- Duplicate commit should return either idempotent replay or already resolved, with player-safe text.
- Stale submit should return refresh-current-state guidance.
- Output dedupe should happen in the output pipeline and in persistence writers.
- GM/dev trace should record duplicate/stale decisions.

## 9. Transition Orchestration And Next-Beat Selection Audit

Current transition mechanisms:

- Exploration scene movement uses `move_scene` through `adventureRuntimeService`.
- Dialogue entry can now be resolved through `beatAdvanceService.resolveFocusCommitDialogueEntry`.
- Dialogue exits can mark transition data and completed records.
- Rusk endpoint is represented in Greyvale slice read model/status, with player-safe endpoint and GM/dev inspectable handoff.
- Action windows are opened/closed through adventure runtime query helpers and `syncActionWindow`.

Risks:

- Scene transition, dialogue entry, dialogue exit, endpoint state, and next action window are orchestrated by different services.
- A transition can succeed while next-window creation or read-model refresh fails.
- Dialogue exits currently finalize dialogue but do not by themselves spend exploration beat cost; Stage 6C should preserve that product rule.
- Unsupported combat and future-supported states must not open unsupported player action windows.

6C.5 implementation:

- Defines shared transition decision helpers with adapter-owned inputs.
- Normalizes transition kinds: no transition, same scene, scene transition, dialogue entry/continuation/exit, endpoint, unavailable, recovery-needed, and future-supported handoff.
- Selects next beat through `selectNextBeatDecision(...)` after a transition decision is known.
- Supports next-beat decisions for exploration action windows, dialogue action windows, existing-window reuse, endpoint review, recovery-needed, unavailable no-state-change, and future-supported review-only handoff.
- Adds `assertTransitionResultAlignment(...)` so tests can catch impossible pairings such as dialogue entry followed by an exploration next beat.
- Adds GM/dev transition orchestration diagnostics to the trace envelope while keeping player projections free of internal routing, target ids, future-supported labels, and path metadata.
- Adds Greyvale acceptance fixture assertions for scene transitions, dialogue exits, and the Rusk endpoint review-only handoff.

## 10. Player-Facing Result Bundle Proposal

Recommended shape:

```js
{
  attempted_action: {
    label,
    text,
    option_id,
    option_kind
  },
  result: {
    title,
    text,
    summary
  },
  consequences: [
    { label, text, severity }
  ],
  discoveries: [
    { knowledge_id, title, summary }
  ],
  progress: [
    { kind, id, label, status, summary }
  ],
  complications: [
    { label, text, severity, status }
  ],
  next: {
    label,
    text,
    route,
    action_hint
  },
  recovery: {
    message,
    retryable,
    recovery_action
  },
  status: {
    state,
    label,
    is_endpoint,
    is_recovery_needed
  }
}
```

Rules:

- `result.text` should be required for committed beats.
- `attempted_action` should identify the authored action/move without exposing hidden option metadata.
- `consequences`, `discoveries`, and `progress` should default to empty arrays.
- `complications` should frame unresolved danger, pressure, blocked routes, or future-supported boundaries without exposing internals.
- `next` should be present when a next practical step is known.
- `recovery` should appear only for failed/stale/recovery-needed responses.
- `status.state` must be player-safe and avoid internal labels like `combat_pending` or `future_supported`.
- Exploration can label committed actions as Beat Actions.
- Dialogue can label committed actions as Committed Social Moves.
- Endpoint can use slice-completion/awaiting-support labels.

Frontend implications:

- Flutter can render sections if present and fall back to existing latest-result cards.
- UI should ignore unknown/internal fields.
- Hidden-data denylist tests must apply to rendered result bundles.

## 11. GM/Dev Resolution Trace Proposal

Recommended trace sections:

- `trace_id`
- actor/user/character/campaign scope
- interaction domain and request kind
- source action window or dialogue lifecycle context
- source scene/dialogue ids
- input option/move/action id
- validation result
- stale/duplicate/idempotency result
- selected authored outcome
- check metadata according to current GM/dev policy
- output bundle
- mutation plan
- mutation results
- transition decision
- next beat decision
- player result bundle
- player projection
- GM/dev projection
- visibility filtering notes
- recovery-needed state if any
- errors/warnings
- timestamps/durations if supported

Storage options:

- Generated on demand from existing logs/provenance for early 6C.
- Persisted as JSON in a new trace table only if 6C.4/6C.7 proves existing provenance is insufficient.
- Linked to action window id, dialogue state id, social move record id, completed record id, or campaign log id.

Player restrictions:

- Never expose trace payloads to player routes.
- Player-vs-GM comparison may include player projection but not internal trace details.
- Denylist must cover trace ids, branch ids, hidden requirements, raw relationship/social state, source file paths, internal transition labels, and stack traces.

## 12. Runtime Recovery Audit

Recovery cases:

- malformed request
- missing action window
- closed action window
- stale preview
- duplicate submit
- missing content id
- missing transition target
- outcome cannot be selected
- output bundle incomplete
- state write failure
- read model refresh failure
- next action window cannot open
- player resumes during unresolved beat
- player resumes after endpoint
- GM/dev inspector reads broken state

Recommended recovery classes:

| Class | Player behavior | GM/dev behavior | Mutation policy |
| --- | --- | --- | --- |
| safe_retry | Show try-again message. | Trace retryable cause. | No state mutation. |
| refresh_current_state | Ask player to refresh/current scene. | Trace stale context. | No new mutation. |
| action_unavailable | Explain action is no longer available. | Include hidden requirement/state detail. | No new mutation. |
| already_resolved | Show latest result/current state. | Include idempotency/duplicate info. | No duplicate writes. |
| recovery_needed | Show safe recovery message and review state. | Include partial write/mutation trace. | Mark state for repair if supported. |
| gm_dev_repair_required | Show safe blocked message. | Include repair action candidates. | No player mutation. |
| endpoint_review_only | Show endpoint/review state. | Include endpoint handoff details. | No further unsupported action. |

6C should define exact error codes, player-safe messages, retryability, recovery action, and GM/dev trace fields for each class.

## 13. Content-Authoring Guideline Proposal

Beat resolution content should provide:

- clear action label
- clear preview text
- clear committed result text
- immediate consequence text
- discovery/knowledge metadata
- objective/progress metadata
- history/latest development summary
- next-step hint
- failure or partial-success text
- unavailable/locked text
- transition target and player-safe transition label
- GM/dev provenance markers
- endpoint/future-supported text where relevant

Exploration Beat Actions:

- Provide preview and result text that align.
- Identify expected outputs and transition effects.
- Provide next-step hint after transitions or discoveries.

Free Focus:

- Keep non-committing behavior explicit.
- Avoid suggesting a committed action has been spent.
- Provide useful but bounded information.

Clarifying Questions:

- State that CQs do not spend the committed dialogue move.
- Provide reusable player-safe answer summaries.
- Keep hidden relationship/check details GM/dev-only.

Committed Social Moves:

- Provide preview, success/partial/failure result, consequence framing, and relationship perception summary where appropriate.
- Avoid requiring player-visible raw mechanics.

Endpoint/future-supported beats:

- Provide player-safe endpoint wording.
- Do not expose internal `combat_pending`, `future_supported`, encounter ids, or final mystery truth.

Recovery/unavailable cases:

- Provide concise player-safe guidance.
- Provide GM/dev diagnostics separately.

## 14. Frontend Alignment Audit

Likely frontend files if result bundles change:

- `apps/player_app/lib/api/models.dart`
- `apps/player_app/lib/api/api_client.dart`
- `apps/player_app/lib/campaign/campaign_scene_page.dart`
- `apps/player_app/lib/campaign/dialogue_scene_page.dart`
- `apps/player_app/test/player_ui_recovery_test.dart`
- `apps/player_app/test/dialogue_ui_test.dart`

Current UI can render:

- Latest Beat Result / Latest Exchange.
- action preview and submit states.
- dialogue CQ/CSM preview and results.
- objectives, knowledge, history, recap-like surfaces.
- endpoint/completion status.
- safe error banners.

Needed in 6C.6:

- Parse optional standardized result bundle.
- Render result/consequence/discovery/progress/next/recovery/status sections when present.
- Fall back to existing fields during migration.
- Keep preview visibly non-final and submit visibly final.
- Keep hidden-data rendered-output denylist tests.
- Avoid redesigning the page layout.

Fields UI should ignore:

- GM/dev trace.
- mutation plan.
- hidden requirements.
- raw checks/rolls/DCs.
- branch ids.
- internal transition labels.
- source file paths.

## 15. Test Strategy And Acceptance Plan

### A. Greyvale Acceptance Extensions

Extend `npm run test:greyvale-vertical-slice` or add a Stage 6C-specific command with:

- preview/result consistency for Broken Caravan, Tomas/Elin/Garren/Rusk, and shrine endpoint.
- commit atomicity or recovery-needed assertions where failure can be simulated.
- output ordering assertions for objective, knowledge, history, latest development, completed records, archive/search.
- duplicate submit and stale submit recovery.
- transition/next-beat selection after scene move, dialogue entry, dialogue exit, and endpoint.
- standardized player result bundle shape.
- GM/dev resolution trace presence and permission boundary.
- player-vs-GM visibility split.

### B. Shared Runtime Tests

Add focused unit/integration tests for:

- shared resolution pipeline contract.
- adapter input/output conformance.
- mutation plan generation.
- output bundle ordering.
- idempotency/dedupe.
- transition decision shell.
- result bundle projection.
- recovery-needed envelope.
- trace generation/projection.
- visibility filtering.

Suggested command inventory:

- `npm run test:interaction-core`
- `npm run test:greyvale-vertical-slice`
- `npm run test:greyvale-full-loop`
- `npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale`
- targeted Node tests:
  - `backend/test/full-loop-action-lifecycle-regression.test.js`
  - `backend/test/full-loop-output-consistency-regression.test.js`
  - `backend/test/full-loop-gm-dev-visibility-regression.test.js`
  - `backend/test/dialogue-focus-commit-runtime.test.js`
  - `backend/test/greyvale-vertical-slice-acceptance.test.js`

Use unit tests for pure contracts/helpers, DB integration tests for mutation/order/recovery, path harness tests for route assertions, and acceptance tests for Greyvale product behavior.

## 16. Proposed Stage 6C Sub-Build Plan

### Stage 6C.1 - Resolution Pipeline Contract And Orchestration Map

Goal:

- Define shared pipeline contract, adapter boundaries, lifecycle states, request/response shapes, mutation plan concept, trace concept, and tests scaffolding.

Likely files:

- `backend/src/services/interactionCore/*`
- new `backend/src/services/beatResolution/*` or adjacent runtime module
- `backend/test/interaction-core-*`
- this docs folder

Tests:

- pure contract tests
- adapter conformance tests
- no DB migration

Acceptance:

- Shared contract exists.
- Exploration/dialogue adapters remain separate.
- No runtime behavior changes.

### Stage 6C.2 - Preview-To-Resolution Consistency Pass

Goal:

- Align preview and committed resolution semantics.

Likely files:

- `actionComposerService.js`
- `dialogueFocusCommitRuntimeService.js`
- `interactionCore/lifecycle.js`
- new preview decision helpers

Tests:

- preview no mutation
- preview/result compatibility
- stale preview rejection
- hidden-data preview/result safety

Acceptance:

- Preview does not promise unsupported outcomes.
- Resolution remains compatible with preview.

### Stage 6C.3 - Outcome Quality, Consequence Framing, And Failure Handling

Goal:

- Standardize deterministic result assembly and player-safe consequence/progress/next-step framing.

Likely files:

- result bundle helpers
- Greyvale authoring docs
- minimal adapters for current exploration/dialogue result fields

Tests:

- result bundle sections present where expected
- failure/partial/unavailable text safe
- no AI-generated prose

Acceptance:

- Player result bundle is useful and authored/content-driven.
- Outcome-quality diagnostics identify missing recommended sections without blocking current runtime migration.

### Stage 6C.4 - State Mutation Ordering, Dedupe, And Transaction Safety

Goal:

- Define and implement canonical mutation ordering and transaction/recovery behavior.

Likely files:

- adventure runtime resolution path
- dialogue runtime submit/exit path
- output/progression/knowledge/history/archive services
- action-window queries

Tests:

- mutation order
- duplicate output prevention
- transaction rollback or recovery-needed behavior
- partial failure injection

Acceptance:

- Writes are ordered consistently.
- Unsafe partial failures produce recovery-needed diagnostics.
- Duplicate/stale submit decisions are explicit no-mutation decisions.
- Player projections hide mutation plans, dedupe keys, and transaction internals.

### Stage 6C.5 - Transition Orchestration And Next-Beat Selection

Goal:

- Shared transition decision shell and next-beat selection.

Implemented files:

- `backend/src/services/interactionCore/resolutionPipeline.js`
- `backend/test/interaction-core-transition-orchestration.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- `docs/runtime/STAGE_6C_5_TRANSITION_ORCHESTRATION_AND_NEXT_BEAT_SELECTION.md`

Tests:

- same scene
- scene transition
- enter dialogue
- exit dialogue
- endpoint
- unavailable transition
- recovery-needed transition
- player-vs-GM transition projection safety

Acceptance:

- No dead ends after supported transitions.
- Unsupported combat/navigation remain safely blocked.
- Greyvale acceptance fixture records expected transition and next-beat decisions for canonical route steps.

### Stage 6C.6 - Player Result Bundle And Read Model Refresh Hardening

Goal:

- Standardize player result response and refresh timing with minimal UI alignment.

Implemented files:

- `backend/src/services/interactionCore/resolutionPipeline.js`
- `backend/test/interaction-core-read-model-refresh.test.js`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- `docs/runtime/STAGE_6C_6_PLAYER_RESULT_BUNDLE_AND_READ_MODEL_REFRESH_HARDENING.md`

Tests:

- player result bundle projection
- result/read-model alignment
- read model refresh timing diagnostics
- active state summary projection
- exploration scene read-model alignment
- dialogue read-model alignment
- endpoint review-only read model
- stale/recovery read model safety
- hidden-data denylist

Acceptance:

- Shared helpers verify result bundles and refreshed read models agree after committed beats.
- GM/dev traces include read-model refresh and alignment diagnostics.
- Player projections hide read-model refresh internals.
- No frontend change was required for this scaffold pass.

### Stage 6C.7 - GM/Dev Resolution Trace And Provenance Inspector

Goal:

- Formal trace for every committed beat and GM/dev projection.

Implemented files:

- `backend/src/services/interactionCore/resolutionPipeline.js`
- `backend/test/interaction-core-resolution-trace.test.js`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`
- `docs/runtime/STAGE_6C_7_GM_DEV_RESOLUTION_TRACE_AND_PROVENANCE_INSPECTOR.md`

Tests:

- trace envelope fields
- lifecycle checkpoint summaries
- trace storage strategy
- provenance inspector helper
- authorized GM/dev trace access
- player projection clean and trace-free
- endpoint/future-supported traceability
- recovery/stale traceability
- trace redaction and safe serialization
- trace includes validation, outcome, mutation, transition, next-beat, read-model, and recovery details

Acceptance:

- GM/dev can diagnose why a beat resolved the way it did through generated/attached trace helpers.
- Persistent trace storage remains deferred pending schema approval.

### Stage 6C.8 - Beat Resolution Regression Suite

Goal:

- Final 6C regression suite and status.

Implemented files:

- `backend/test/stage6c-beat-resolution-regression.test.js`
- `content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json`
- `docs/runtime/STAGE_6C_8_BEAT_RESOLUTION_REGRESSION_SUITE.md`
- `docs/runtime/STAGE_6C_FINAL_STATUS.md`
- root/backend `test:stage:6c` package scripts

Acceptance:

- `npm run test:stage:6c` composes shared runtime coverage and Greyvale vertical-slice acceptance.
- Shared runtime contract, preview, outcome quality, mutation safety, transition, read-model, trace, and visibility regressions are covered.
- Greyvale acceptance route remains the real DB-backed product gate.
- Full browser E2E remains documented as deferred; existing Flutter/manual UI checks remain the rendered-output layer.
- 6C beat-resolution hardening is covered and ready for later navigation/combat stages.

## 17. Risk Register

| Risk | Severity | Likelihood | Detection | Mitigation | Target |
| --- | --- | --- | --- | --- | --- |
| Shared pipeline overgeneralizes and breaks domain behavior | Critical | Medium | Greyvale acceptance and adapter tests | Keep adapters separate and migrate one seam at a time | 6C.1 |
| Exploration/dialogue adapters become too thin or too complex | High | Medium | Code review and test readability | Keep domain-specific output and transition rules in adapters | 6C.1-6C.5 |
| Result bundle too rigid for future combat | Medium | Medium | Contract review | Reserve status/transition fields but do not implement combat | 6C.1/6C.6 |
| Mutation ordering changes existing behavior | Critical | Medium | Full-loop and output consistency tests | Add golden ordering tests before rewiring | 6C.4 |
| True atomicity impossible without schema changes | High | Medium | Failure injection tests | Add recovery-needed strategy; request owner approval before migrations | 6C.4 |
| Recovery-needed state under-specified | High | Medium | Stale/recovery tests | Define recovery taxonomy and player/GM behavior first | 6C.1/6C.4 |
| GM/dev trace leaks to player payloads | Critical | Medium | Denylist tests | Default trace to GM/dev scope and project player bundle separately | 6C.7 |
| Player result bundle loses authored nuance | High | Low/medium | Manual checklist and UI tests | Preserve authored text and use optional sections | 6C.3/6C.6 |
| Transition orchestration creates dead ends | Critical | Medium | Route/path tests | Add next-beat assertions after every transition | 6C.5 |
| Existing Greyvale acceptance suite becomes brittle | High | Medium | CI/local test churn | Use semantic IDs/statuses rather than full prose | 6C.8 |
| Frontend changes grow beyond scope | Medium | Medium | Diff review | Parse optional result bundle and keep existing fallback UI | 6C.6 |
| Authoring guidelines stay theoretical | Medium | Medium | Content validation gap | Convert guidance into lightweight validation in later sub-builds | 6C.3 |
| Database changes needed but postponed | High | Low/medium | Trace/recovery tests fail without persistence | Document owner decision and migration scope | 6C.4/6C.7 |
| Refactor bypasses existing tests | Critical | Medium | Command checklist | Require 6B.15 acceptance plus shared core tests each sub-build | All |
| Shared runtime becomes Greyvale-specific | High | Medium | Non-Greyvale fixture tests | Keep Greyvale acceptance separate from shared helper unit tests | 6C.1/6C.8 |

## 18. Schema/Database Assessment

Default assessment: avoid schema changes unless implementation proves they are necessary.

| Possible need | Current support | Sufficiency | Minimal addition if needed | Defer? | Owner decision stage |
| --- | --- | --- | --- | --- | --- |
| Resolution trace persistence | Campaign logs, beat results, dialogue records, GM/dev inspector fragments | May be sufficient for generated traces; insufficient for durable per-beat trace replay | `dnd5e_beat_resolution_trace` JSON table keyed by campaign/character/action window/dialogue state | Defer until 6C.7 proves need | 6C.7 |
| Recovery-needed beat state | Action window statuses and diagnostics repairs | Partially sufficient; no formal recovery-needed state | action window status or separate recovery table | Defer until failure tests | 6C.4 |
| Idempotency keys | action window submission uniqueness; dialogue record uniqueness patterns | Partially sufficient | committed beat idempotency key column/table | Defer unless duplicate retry cannot be solved | 6C.4 |
| Mutation batch ids | None formal; provenance links vary | Insufficient for formal mutation trace | mutation batch id in trace/provenance JSON | Defer | 6C.4/6C.7 |
| Committed beat transaction ids | None formal | Not needed if trace generated from existing ids | transaction id field in trace table | Defer | 6C.7 |
| Output bundle persistence | Player beat result, history, knowledge, objectives, dialogue records | Sufficient for player read models; not a single bundle | persisted output bundle JSON on trace/result record | Defer | 6C.6/6C.7 |
| Transition decision records | Scene history, dialogue transition refs, endpoint state | Fragmented | transition decision JSON in trace | Defer | 6C.5/6C.7 |
| Next-beat decision records | action window rows and logs | Partially sufficient | next-beat decision JSON in trace | Defer | 6C.5/6C.7 |

Any schema change must be preceded by:

- failing or inadequate tests demonstrating need
- owner approval
- migration plan
- rollback/read-model compatibility plan

## 19. Manual Inspection Checklist

Checklist location: this section.

- Choose a Greyvale exploration beat at Broken Caravan.
- Preview it.
- Confirm no objective/knowledge/history/latest-development mutation occurred.
- Commit it.
- Confirm result, consequences, discoveries, progress, and next-step sections.
- Confirm objective, knowledge, history, and latest development update once.
- Confirm next beat or transition is selected.
- Confirm player read model refreshes without manual repair.
- Confirm GM/dev trace/provenance explains selected outcome.
- Confirm player payload contains no hidden/debug/internal data.
- Repeat for a dialogue beat with Tomas or Elin.
- Ask a Clarifying Question and confirm it is non-committing.
- Preview and submit a Committed Social Move and confirm it consumes dialogue beat.
- Exit dialogue and confirm exit remains free according to current product rule.
- Repeat for a transition beat from inn to Dunmere or old path to shrine.
- Repeat for the Rusk endpoint beat.
- Test duplicate submit.
- Test stale submit.
- Test missing/unavailable target if a test helper supports it.
- Confirm recovery class, player message, and GM/dev diagnostic match policy.

## 20. Validation For This Docs-First Build

Lightweight validation expectations:

- Confirm repo instructions: no `AGENTS.md` found under `C:\Users\Joshu\CodexProjects`.
- Inventory runtime files with `rg`.
- Confirm command inventory from `package.json` and `backend/package.json`.
- Run docs/hosting check if available: `npm run build`.
- Run interaction-core deterministic tests if practical: `npm run test:interaction-core`.
- Run Greyvale content validation if DB is available.
- Do not run DB-backed full-loop/vertical-slice acceptance unless the local DB is configured.

This build should not change runtime/player-facing behavior.
