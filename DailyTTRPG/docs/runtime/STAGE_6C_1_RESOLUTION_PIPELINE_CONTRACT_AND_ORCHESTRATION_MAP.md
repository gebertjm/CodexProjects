# Stage 6C.1 - Resolution Pipeline Contract And Orchestration Map

Status: implemented as shared contract, docs, and focused tests  
Created: Stage 6C.1  
Primary predecessor: Stage 6C.0 Beat Resolution Runtime Audit And Hardening Plan  
Primary implementation module: `backend/src/services/interactionCore/resolutionPipeline.js`  
Primary tests: `backend/test/interaction-core-resolution-pipeline.test.js`

## 1. Purpose

Stage 6C.1 defines the shared beat-resolution contract that later Stage 6C builds will migrate exploration and dialogue toward.

This build does not rewire the exploration runtime, dialogue runtime, database writes, player UI, Greyvale content, combat, navigation, SMS, or rules transparency. It creates a stable shared shape for:

```text
preview
-> commit
-> validation
-> deterministic outcome selection
-> output bundle creation
-> mutation plan
-> transition / next-beat decision
-> player result bundle
-> read model refresh hook
-> GM/dev trace envelope
-> recovery-needed envelope
```

The contract is intentionally adapter-based. Exploration and dialogue remain separate domains with their own authored semantics.

## 2. Shared Vocabulary

The vocabulary is encoded in `BEAT_RESOLUTION_VOCABULARY`.

- `beat`: One player-facing opportunity to inspect, choose, resolve, and continue inside an active interaction state.
- `interaction`: A domain-owned playable unit such as an exploration scene or dialogue conversation.
- `interaction_domain`: The neutral shared domain key. Current supported domains are `exploration` and `dialogue`.
- `interaction_adapter`: A domain-specific boundary that supplies authored option, outcome, output, transition, and trace details.
- `preview_request`: A non-mutating request that asks what a selected option would mean before commitment.
- `commit_request`: A mutating request that commits a selected authored option for deterministic resolution.
- `action_window`: The currently valid commitment window for the active beat or interaction.
- `active_interaction_state`: The current runtime scene, dialogue, action-window, and version context used to validate a request.
- `deterministic_authored_outcome`: The selected outcome from authored content and deterministic checks or policy. It is not AI narration.
- `output_bundle`: The normalized collection of knowledge, objective, history, latest development, state, transition, record, transcript, archive/search, and debug outputs.
- `mutation_plan`: The ordered pre-application plan for state writes, dedupe/idempotency markers, transition writes, action-window writes, and refresh hooks.
- `transition_decision`: The normalized decision to stay, move, enter or exit dialogue, reach endpoint, mark recovery, or hold a future-supported handoff.
- `next_beat_decision`: The normalized decision for the next player-playable action window, review-only state, endpoint state, or recovery state.
- `player_result_bundle`: The deterministic player-safe summary sections returned after resolution.
- `player_projection`: The visibility-filtered player-safe response.
- `gm_dev_projection`: The authorized internal response with trace, routing, checks, and provenance.
- `resolution_trace`: The GM/dev envelope describing request, validation, outcome, outputs, mutation plan, transition, next beat, and recovery details.
- `recovery_needed_envelope`: The structured recovery classification and safe player/GM-dev diagnostic payload.
- `idempotency_key`: The client or runtime key used to reject or replay duplicate commit attempts safely.
- `stale_request`: A request whose context no longer matches the active interaction state.
- `duplicate_request`: A repeated request that must not duplicate state writes or outputs.
- `endpoint_state`: A review-only or awaiting-support state reached at the current end of supported play.

## 3. Interaction Domains

`RESOLUTION_INTERACTION_DOMAINS` defines:

- `exploration`: supported now.
- `dialogue`: supported now.
- `combat`: reserved placeholder only.
- `navigation`: reserved placeholder only.

No combat or open-world navigation behavior was added. Future domains are acknowledged only so contracts do not need to be renamed later.

## 4. Resolution Request Contract

Use:

- `createResolutionRequest`
- `createPreviewResolutionRequest`
- `createCommitResolutionRequest`

Required normalized fields:

- `request_kind`: `preview` or `commit`.
- `interaction_domain`: `exploration` or `dialogue`.
- `context`: shared interaction context from Stage 6B.14.
- `user_id`, `character_id`, `campaign_id`, `adventure_id`.
- `action_window_id`.
- `source_scene_id`, `source_location_id`, `source_dialogue_id`.
- `selected_option_id`.
- `selected_option_kind`: shared option kind such as `non_committing_inquiry`, `committed_action`, or `exit_or_transition`.
- `domain_option_kind`: product/domain term such as `free_focus`, `beat_action`, `clarifying_question`, `committed_social_move`, or `dialogue_exit`.
- `client_preview_token`.
- `context_version`.
- `idempotency_key`.
- `request_id`, `correlation_id`.
- `authorization_context`.
- `gm_dev_context_requested`.
- `request_metadata`.
- `domain_payload`.
- `visibility_scope`.

The same base request can represent:

- exploration Free Focus
- exploration Beat Action
- dialogue Clarifying Question
- dialogue Committed Social Move
- dialogue exit
- endpoint or awaiting-support handoff metadata

## 5. Resolution Response Contract

Use:

- `createResolutionResponse`
- `createPreviewResolutionResponse`
- `createCommittedResolutionResponse`
- `createRecoveryResolutionResponse`
- `createUnavailableResolutionResponse`
- `createEndpointResolutionResponse`

Response categories:

- `preview_response`
- `committed_resolution`
- `recovery_response`
- `unavailable_response`
- `endpoint_response`

Shared response fields:

- `response_kind`
- `interaction_domain`
- `status`
- `resolution_id`
- `request_id`
- `correlation_id`
- `request`
- `preview`
- `availability`
- `player_result_bundle`
- `output_bundle`
- `mutation_plan`
- `transition_decision`
- `next_beat_decision`
- `read_model_refresh_hook`
- `recovery_envelope`
- `gm_dev_trace`
- `errors`
- `visibility_scope`

Player projection is produced by `projectResolutionResponseForPlayer`. It keeps only safe result, preview, output, transition label, next label, read-model refresh hint, recovery, and safe errors.

GM/dev projection is produced by `projectResolutionResponseForGmDev`. It preserves trace, mutation, routing, checks, and provenance for authorized tools.

## 6. Adapter Interface

Use:

- `createResolutionAdapterContract`
- `assertResolutionAdapterContract`

Required adapter methods:

- `loadActiveState(context)`
- `validateRequest(request, activeState)`
- `buildPreview(request, activeState)`
- `selectOutcome(request, activeState)`
- `buildDomainOutputs(outcome, activeState)`
- `buildDomainResultSections(outcome, outputs, activeState)`
- `buildMutationPlanParts(outcome, outputs, activeState)`
- `proposeTransition(outcome, outputs, activeState)`
- `proposeNextBeat(outcome, transition, activeState)`
- `buildDomainTraceParts(outcome, outputs, activeState)`
- `buildRecoveryProjection(error, activeState)`

Exploration adapter owns:

- Free Focus semantics.
- Beat Action labels and authored affordance mapping.
- Scene/location affordances.
- Environment modifiers.
- Exploration transitions.
- Surface/current scene context.

Dialogue adapter owns:

- Clarifying Question semantics.
- Committed Social Move labels and authored move matching.
- Relationship/social state.
- Fallback/exhaustion.
- Dialogue exits.
- Completed records, transcripts, summaries, archive/search.

Shared pipeline owns:

- request orchestration shell
- preview/commit lifecycle
- idempotency/dedupe shell
- output bundle normalization
- mutation plan envelope
- transition orchestration shell
- next-beat decision shell
- player result bundle normalization
- visibility projection
- GM/dev trace envelope
- recovery-needed envelope

## 7. Preview Lifecycle Map

Encoded as `PREVIEW_LIFECYCLE_MAP`.

1. Receive request.
2. Resolve scope and auth.
3. Load active state.
4. Validate request.
5. Ask adapter to build preview.
6. Normalize preview response.
7. Apply visibility filtering.
8. Return player-safe preview.
9. Include GM/dev preview diagnostics only if authorized.

Preview must not mutate state.

## 8. Commit Lifecycle Map

Encoded as `COMMIT_LIFECYCLE_MAP`.

1. Receive request.
2. Resolve scope and auth.
3. Load active state.
4. Validate request.
5. Check stale, duplicate, and idempotency state.
6. Ask adapter to select deterministic authored outcome.
7. Ask adapter to build domain outputs.
8. Normalize output bundle.
9. Build player result bundle.
10. Build mutation plan.
11. Decide transition.
12. Decide next beat.
13. Apply mutations in controlled order, transactionally where supported.
14. Close consumed action window.
15. Open next action window or endpoint/recovery state.
16. Refresh player read model.
17. Record GM/dev resolution trace.
18. Apply visibility projection.
19. Return player-safe response.

6C.1 documents and encodes this map. Later 6C builds will migrate runtime services into this flow.

## 9. Recovery Lifecycle Map

Encoded as `RECOVERY_LIFECYCLE_MAP`.

1. Detect malformed, stale, partial, or interrupted state.
2. Classify recovery kind.
3. Avoid unsafe mutation unless explicitly safe.
4. Mark recovery-needed if required.
5. Return safe player message and current playable state if available.
6. Record GM/dev trace or diagnostic.
7. Avoid exposing internal details to player.

## 10. Output Bundle Contract

The resolution pipeline uses the existing Stage 6B.14 output pipeline:

- `normalizeOutputBundle`
- `projectOutputBundleForPlayer`
- `projectOutputBundleForGmDev`
- `validateOutputBundle`

Output bundle categories include:

- objective updates
- knowledge/clue updates
- history events
- Latest Development updates
- relationship/social writes
- scene/location state writes
- dialogue state writes
- completed records
- transcripts
- summaries
- archive/search indexing outputs
- transition outputs
- endpoint/status outputs
- recovery/debug outputs
- GM/dev provenance markers

Player projection strips debug outputs, raw writes, hidden routing, hidden provenance, and unsupported internal handoff labels.

## 11. Mutation Plan Contract

Use:

- `createMutationPlan`
- `createMutationWriteGroup`
- `createCommittedBeatMutationPlan`
- `createMutationIdempotencyDecision`
- `createMutationApplicationResult`
- `createMutationSafetyDiagnostics`

Mutation plan fields:

- `plan_id`
- `request_id`
- `interaction_domain`
- `source_request`
- `source_active_state`
- `selected_outcome`
- `normalized_output_bundle`
- `player_result_bundle_reference`
- `canonical_order`
- `write_groups`
- `idempotency_key`
- `dedupe_markers`
- `transition_intent`
- `next_beat_intent`
- `read_model_refresh_target`
- `status`
- `transaction_boundary_hint`
- `recovery_on_failure`
- `expected_read_model_refresh_targets`
- `gm_dev_trace_metadata`

Canonical write order is encoded as `ORDERED_MUTATION_WRITE_GROUPS`:

1. `objective_writes`
2. `knowledge_writes`
3. `history_latest_development_writes`
4. `relationship_social_scene_dialogue_state_writes`
5. `completed_record_transcript_archive_search_writes`
6. `transition_endpoint_writes`
7. `action_window_close_open_writes`
8. `read_model_refresh_hook`
9. `trace_provenance_writes`

6C.1 does not apply these writes at runtime. It defines the plan shape for 6C.4.

## 12. Transition Decision Contract

Use `createTransitionDecision`.

Transition decision kinds:

- `stay_in_current_scene`
- `scene_transition`
- `enter_dialogue`
- `exit_dialogue`
- `return_to_exploration`
- `endpoint`
- `recovery_needed`
- `unavailable`
- `future_supported`

Transition fields:

- `kind`
- `status`
- `target_type`
- `target_id`
- `player_label`
- `player_summary`
- `safe_status_label`
- `gm_dev_routing`
- `internal_routing_status`
- `future_supported_internal`
- `visibility_metadata`

Player projection keeps only safe label/summary/status label. GM/dev projection may preserve target ids, branch ids, routing, and future-supported details.

## 13. Next-Beat Decision Contract

Use `createNextBeatDecision`.

Next-beat decision kinds:

- `open_exploration_action_window`
- `open_dialogue_action_window`
- `endpoint_review_only`
- `recovery_needed`
- `no_action_window`
- `future_supported_handoff`

Next-beat fields:

- `kind`
- `action_window_id`
- `action_window_kind`
- `scene_id`
- `dialogue_id`
- `endpoint_status`
- `player_label`
- `player_summary`
- `review_only`
- `gm_dev_details`

Player projection keeps safe label/summary/review state. Internal handoff details remain GM/dev-only.

## 14. Player Result Bundle Contract

Use `createPlayerResultBundle`.

Player-facing sections:

- `attempted_action`
- `result`
- `consequences`
- `discoveries`
- `progress`
- `complications`
- `next`
- `recovery`
- `status`

Rules:

- Sections may be omitted safely.
- Arrays default to empty arrays.
- `result` may be null when no committed result text exists yet.
- `attempted_action` identifies the authored action or move in player-safe terms.
- `complications` frames unresolved danger, pressure, blocked routes, or future-supported boundaries without internal labels.
- `status.state` sanitizes unsupported internal values such as `combat_pending` and `future_supported` to `awaiting_support`.
- The bundle is checked with the shared hidden-data denylist.
- The bundle is deterministic and authored/content-driven.

## 15. GM/Dev Resolution Trace Envelope

Use `createResolutionTraceEnvelope`.

Trace fields:

- `trace_id`
- `request_id`
- `correlation_id`
- `interaction_domain`
- `request_kind`
- `scope`
- `source_action_window_id`
- `source_scene_id`
- `source_location_id`
- `source_dialogue_id`
- `selected_option_id`
- `selected_option_kind`
- `validation_result`
- `stale_duplicate_idempotency_result`
- `selected_outcome`
- `authored_source`
- `check_metadata`
- `output_bundle`
- `output_bundle_validation`
- `mutation_plan`
- `mutation_result`
- `transition_decision`
- `next_beat_decision`
- `player_result_bundle`
- `outcome_quality_diagnostics`
- `player_projection_summary`
- `gm_dev_projection`
- `visibility_filtering_notes`
- `recovery_needed`
- `errors`
- `warnings`
- `timestamps`
- `durations_ms`
- `visibility_scope`

Trace projection is GM/dev-only. Player response projection intentionally omits the entire `gm_dev_trace` envelope.

## 16. Recovery-Needed Envelope

Use `createRecoveryNeededEnvelope`.

Recovery kinds:

- `malformed_request`
- `unauthorized`
- `missing_action_window`
- `closed_action_window`
- `stale_request`
- `duplicate_request`
- `unavailable_option`
- `missing_content`
- `missing_transition_target`
- `outcome_selection_failed`
- `output_bundle_incomplete`
- `mutation_failed`
- `read_model_refresh_failed`
- `next_beat_failed`
- `endpoint_review_only`
- `recovery_required`

Envelope fields:

- `recovery_kind`
- `code`
- `player_safe_message`
- `retryable`
- `recovery_action`
- `current_safe_state`
- `gm_dev_repair_required`
- `failed_lifecycle_step`
- `partial_writes_known`
- `recommended_gm_dev_repair_action`
- `trace_id`
- `diagnostics`
- `visibility_scope`

Player projection keeps only safe recovery kind, code, player-safe message, retryability, recovery action, and current safe state.

## 17. Player And GM/Dev Projection Rules

Use:

- `projectResolutionResponseForPlayer`
- `projectResolutionResponseForGmDev`
- `assertResolutionResponsePlayerSafe`

Player projection excludes:

- GM/dev trace
- mutation plan internals
- hidden DCs
- raw rolls
- branch ids
- hidden requirements
- raw relationship/social state
- raw state writes
- combat/future-supported internal labels
- source file paths
- path harness metadata
- stack traces and database constraint details

GM/dev projection preserves:

- request scope
- validation results
- stale/duplicate/idempotency diagnostics
- authored outcome
- check metadata
- output bundle and validation warnings
- mutation plan
- transition and next-beat internals
- recovery details

Projection is not a substitute for route authorization. GM/dev routes must still enforce permissions.

## 18. Current Integration Points

6C.1 adds the contract to `interactionCore/index.js` so future adapters can import it through the same shared module path as Stage 6B.14 helpers.

Runtime services are not rewired yet.

Existing runtime owners remain:

- Exploration preview/submit/resolution: `actionComposerService`, `webActionSubmissionService`, `beatAdvanceService`, `adventureRuntimeService`.
- Dialogue preview/submit/exit: `dialogueFocusCommitRuntimeService`.
- Output normalization/provenance: Stage 6B.14 output pipeline helpers.
- Visibility safety: Stage 6B.14 visibility boundary helpers.
- GM/dev diagnostics: existing inspectors/debug services until 6C.7.

## 19. Migration Strategy For 6C.2-6C.8

Avoid a big-bang rewrite.

6C.2:

- Add shared preview decision compatibility helpers.
- Prove preview and committed result read the same authored source where practical.
- Keep preview non-mutating.

6C.3:

- Build deterministic consequence/result framing through `player_result_bundle`.
- Add authoring guidance and validation expectations for result text, consequences, discoveries, progress, and next step.

6C.4:

- Introduce mutation plan generation at safe runtime boundaries.
- Add mutation ordering tests.
- Add failure-injection and recovery-needed tests.
- Only request schema changes if existing persistence cannot represent safe recovery.

6C.5:

- Route transition and next-beat decisions through shared shells.
- Preserve domain-specific target validation.
- Add dead-end prevention tests.

6C.6:

- Align player read models and minimal UI parsing with standardized result bundles.
- Keep existing Flutter fallback rendering during migration.

6C.7:

- Persist or generate formal GM/dev traces for committed beats.
- Add permission-gated inspector coverage.

6C.8:

- Extend Greyvale acceptance with beat-resolution-specific regression:
  preview/result consistency, mutation ordering, stale/duplicate recovery, transition/next-beat decisions, result bundles, and trace visibility.

## 20. Tests Added

`backend/test/interaction-core-resolution-pipeline.test.js` covers:

- exploration Free Focus and Beat Action request shapes
- dialogue Clarifying Question, Committed Social Move, and exit request shapes
- preview response without mutation plan or output bundle
- committed response with output bundle, mutation plan, transition, next beat, read-model refresh hook, and GM/dev trace
- recovery response player-safety and GM/dev diagnostics
- adapter boundary conformance for exploration and dialogue mocks
- transition and next-beat decision variants
- player result bundle omitted sections and endpoint status sanitization
- Rusk-style endpoint handoff player-hidden and GM/dev-visible behavior
- orchestration map export

`npm run test:interaction-core` now includes the new resolution pipeline tests.

## 20A. Stage 6C.2 Preview Consistency Addendum

Stage 6C.2 extends the shared contract layer with preview-to-resolution consistency helpers in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `createPreviewAlignmentMarkers`
- `createPreviewExpectationMarker`
- `createResolutionOutcomeMarker`
- `assertPreviewResponseNonMutating`
- `validatePreviewRequestConsistency`
- `validateCommitAgainstPreviewContext`
- `comparePreviewExpectationsToResolution`
- `createPreviewConsistencyDiagnostics`
- `createPreviewConsistencyTrace`

These helpers do not change the core 6C.1 request/response contract. They layer preview validation and diagnostics onto the existing shared response, recovery, player projection, and GM/dev trace shapes.

Preview alignment checks compare:

- interaction domain
- action window id
- source scene/dialogue id
- selected option id
- selected option kind
- context version

Semantic preview/result checks compare categories such as discovery, progress, transition, social consequence, endpoint, recovery, availability, and no-commit against normalized output outcome markers such as knowledge, objective, history, latest development, state write, relationship/social write, transition, completed record, endpoint, recovery, and no-output.

Runtime migration remains deferred. Exploration and dialogue services can adopt these helpers at their own adapter boundaries in later 6C builds without collapsing the domains into one runtime.

## 20B. Stage 6C.3 Outcome Quality Addendum

Stage 6C.3 extends the shared contract layer with outcome-quality and consequence-framing helpers in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `createOutcomeQualityResultBundle`
- `createOutcomeQualityDiagnostics`

Added result bundle sections:

- `attempted_action`
- `complications`

Outcome-quality helpers assemble deterministic player-safe sections from authored outcome pieces and normalized output bundles. They may derive:

- discoveries from player-safe knowledge outputs
- progress from objective outputs
- consequences from player-safe state or relationship/social write summaries
- complications from authored complication markers or blocked transition outputs
- next-step hints from explicit authored next text, next-beat decisions, transition decisions, or player-safe transition labels

GM/dev traces now include `outcome_quality_diagnostics`. These diagnostics report present sections, missing recommended sections, weak result-bundle warnings, selected outcome metadata, output reference counts, complication markers, and next-step markers. Player projection continues to omit the GM/dev trace and diagnostics envelope.

Runtime migration remains deferred. Exploration and dialogue services can adopt the outcome-quality assembler at their adapter boundaries without changing domain terminology, authored content shape, or player-facing behavior.

## 20C. Stage 6C.4 Mutation Safety Addendum

Stage 6C.4 extends the shared contract layer with mutation ordering, dedupe, idempotency, and recovery-needed scaffolding in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `buildCommittedBeatDedupeKey`
- `createMutationDedupeMarker`
- `createCommittedBeatMutationPlan`
- `assertMutationPlanOrdering`
- `createMutationIdempotencyDecision`
- `createMutationApplicationResult`
- `createMutationSafetyDiagnostics`

Added exported constants:

- `COMMITTED_BEAT_MUTATION_ORDER`
- `MUTATION_PLAN_STATUSES`
- `MUTATION_IDEMPOTENCY_STATUSES`
- `MUTATION_APPLICATION_STATUSES`

The committed beat mutation plan builder can derive ordered write groups from a normalized output bundle:

- objectives
- knowledge/clues
- history and Latest Development
- state and relationship/social writes
- completed records, transcripts, archive, and search
- transition and endpoint writes
- action-window close/open operations
- read-model refresh hooks
- trace/provenance writes

Duplicate operations are deduped by stable best-effort keys and reported as GM/dev-only markers. Duplicate, stale, endpoint-review, and recovery-needed submit states are represented as no-mutation idempotency decisions with player-safe recovery envelopes.

`createResolutionTraceEnvelope` now includes `mutation_safety_diagnostics`. Player projection continues to omit mutation plans, write groups, dedupe keys, transaction internals, and GM/dev diagnostics.

Runtime migration remains incremental. Current exploration and dialogue services are not fully routed through shared mutation-plan application yet.

## 20D. Stage 6C.5 Transition Orchestration Addendum

Stage 6C.5 extends the shared contract layer with transition orchestration and next-beat selection helpers in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `createTransitionOrchestrationDecision`
- `selectNextBeatDecision`
- `assertTransitionResultAlignment`
- `createTransitionOrchestrationDiagnostics`

Extended helper APIs:

- `createTransitionDecision`
- `createNextBeatDecision`
- `createResolutionTraceEnvelope`
- `createResolutionOrchestrationMap`

The shared transition decision normalizes adapter proposals and output transition records for exploration, dialogue, endpoint, unavailable, recovery-needed, and future-supported handoff outcomes. The next-beat selector chooses one safe post-resolution state:

- exploration action window
- dialogue action window
- existing valid window
- endpoint review
- future-supported review
- recovery-needed
- unavailable no-state-change

`createResolutionTraceEnvelope` now includes `transition_orchestration_diagnostics`. Player projection continues to omit target ids, internal routing, future-supported labels, GM/dev routing, and transition diagnostics.

Runtime migration remains incremental. Exploration and dialogue adapters still own their transition proposals and action-window persistence.

## 20E. Stage 6C.6 Result/Read Model Refresh Addendum

Stage 6C.6 extends the shared contract layer with player read-model normalization, active state summary, read-model refresh diagnostics, and result/read-model alignment helpers in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `normalizePlayerReadModel`
- `createActiveStateSummary`
- `createReadModelRefreshDiagnostics`
- `createResultReadModelAlignmentDiagnostics`
- `assertResultReadModelAligned`
- `createPlayerResolutionView`

Added shared vocabulary:

- `READ_MODEL_REFRESH_TIMING`
- `PLAYER_READ_MODEL_STATES`
- `RESULT_READ_MODEL_ALIGNMENT_STATUSES`

The helpers verify that player result bundles agree with refreshed player read models for discoveries, objective progress, scene transitions, dialogue next beats, endpoint review-only state, and recovery/unavailable safety. GM/dev traces can inspect refresh timing and mismatches. Player projections continue to hide read-model refresh internals and GM/dev diagnostics.

Runtime migration remains incremental. Current exploration and dialogue services still own their concrete read-model assembly.

## 20F. Stage 6C.7 Trace And Provenance Inspection Addendum

Stage 6C.7 extends the shared contract layer with formal GM/dev trace and provenance inspection helpers in `backend/src/services/interactionCore/resolutionPipeline.js`.

Added helper APIs:

- `createResolutionTraceStorageStrategy`
- `createResolutionTraceAccessDecision`
- `createResolutionTraceLifecycle`
- `serializeResolutionTraceForGmDev`
- `projectResolutionTraceForPlayer`
- `compareResolutionPlayerGmDevProjections`
- `createResolutionProvenanceInspector`

Added shared vocabulary:

- `RESOLUTION_TRACE_STORAGE_STRATEGIES`
- `RESOLUTION_TRACE_CHECKPOINTS`
- `RESOLUTION_TRACE_INSPECTION_STATUSES`

The trace envelope now carries schema/version metadata, storage strategy, lifecycle collection points, authorization result, active state summary, preview consistency diagnostics, transaction boundary, action-window lifecycle decision, and read-model refresh target. GM/dev serialization redacts tokens, passwords, credentials, auth headers, cookies, private keys, and API keys. Player trace projection intentionally returns `null`.

Runtime migration remains incremental. No persistent trace table or schema migration was added.

## 21. Known Limitations

- No runtime service is migrated into the shared pipeline yet.
- Shared mutation-plan generation and failure modeling exist, but full runtime application remains incremental.
- Shared transition/next-beat decisions exist, but full runtime service adoption remains incremental.
- Shared read-model alignment helpers exist, but full runtime service adoption remains incremental.
- Shared trace/provenance inspection helpers exist, but no trace persistence is added.
- Exploration atomicity remains a known weak point from 6C.0.
- Dialogue transactional behavior remains domain-owned.
- Frontend result-bundle rendering remains incremental; 6C.6 did not require a UI file change.
- Greyvale acceptance now has 6C.2 preview-consistency metadata, 6C.3 outcome-quality metadata, 6C.4 mutation-safety metadata, 6C.5 transition-orchestration metadata, 6C.6 read-model refresh metadata, and 6C.7 trace/provenance metadata, but DB-backed full-route enforcement remains part of later 6C acceptance work.

## 22. Behavior Preservation

No player-facing Greyvale behavior changed in 6C.1.

No content, UI, combat, navigation, AI narration, SMS, rules transparency, or schema migration was added.

The new module is contract/test scaffolding and projection safety only.
