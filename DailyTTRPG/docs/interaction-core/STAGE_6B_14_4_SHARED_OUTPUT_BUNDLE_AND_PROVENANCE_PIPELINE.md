# Stage 6B.14.4 Shared Output Bundle And Provenance Pipeline

Stage 6B.14.4 adds shared internal helpers for constructing, normalizing, validating, deduplicating, projecting, and tracing interaction output bundles.

This is not a runtime rewrite. Exploration and dialogue continue to own their current output persistence, ordering, content semantics, and player-facing text.

## Module Locations

Shared output pipeline:

- `backend/src/services/interactionCore/outputPipeline.js`

Thin domain output adapters:

- `backend/src/services/interactionCore/explorationOutputAdapter.js`
- `backend/src/services/interactionCore/dialogueOutputAdapter.js`

The helpers are exported through:

- `backend/src/services/interactionCore/index.js`

## Output Bundle Builder

The shared builder layer adds:

- `createOutputBundle`
- `createEmptyOutputBundle`
- `normalizeOutputBundle`
- `mergeOutputBundles`
- `assertOutputBundleValid`
- `hasPlayerVisibleOutputs`
- `hasStateChangingOutputs`
- `hasTransitionOutputs`
- `hasCompletedRecordOutputs`
- `hasDebugOutputs`
- `attachOutputBundleProvenance`

The builder preserves the Stage 6B.14.1 output bundle slots:

- `player_result`
- `knowledge_outputs`
- `objective_outputs`
- `history_outputs`
- `latest_development_output`
- `state_writes`
- `relationship_or_social_writes`
- `transition_outputs`
- `completed_record_outputs`
- `transcript_outputs`
- `archive_search_outputs`
- `debug_outputs`

Future combat/navigation-compatible slots remain on the base `createEmptyOutputBundle` contract, but Stage 6B.14.4 does not implement combat or navigation behavior.

## Provenance Design

`createOutputProvenance` normalizes provenance for exploration and dialogue outputs.

Current fields include:

- `interaction_domain`
- `source_content_id`
- `source_content_type`
- `source_content_path`
- `source_scene_id`
- `source_dialogue_id`
- `source_option_id`
- `source_option_kind`
- `source_branch_id`
- `resolution_id`
- `committed_action_id`
- `committed_move_id`
- `request_id`
- `correlation_id`
- `actor_id`
- `character_id`
- `campaign_id`
- `generated_at`
- `output_kind`
- `output_id`
- `dedupe_key`
- `visibility_scope`
- `gm_dev_notes`

Branch IDs, file paths, GM/dev notes, and other internal provenance remain GM/dev-only. Player projections strip provenance rather than exposing source internals.

## Normalization Helpers

The shared pipeline adds normalizers for:

- `normalizeKnowledgeOutput`
- `normalizeObjectiveOutput`
- `normalizeHistoryOutput`
- `normalizeLatestDevelopmentOutput`
- `normalizeStateWriteOutput`
- `normalizeRelationshipOrSocialWriteOutput`
- `normalizeTransitionOutput`
- `normalizeCompletedRecordOutput`
- `normalizeTranscriptOutput`
- `normalizeArchiveSearchOutput`
- `normalizeDebugOutput`

These helpers normalize common IDs, player-safe titles/summaries, visibility metadata, GM/dev details, provenance, and dedupe keys.

They do not write to persistence stores. Existing services still own knowledge grants, objective updates, history events, latest development, completed records, transcripts, archive/search indexing, and state mutations.

## Dedupe And Idempotency Helpers

The shared pipeline adds:

- `buildOutputDedupeKey`
- `dedupeOutputsByKey`
- `detectDuplicateKnowledgeGrant`
- `detectDuplicateObjectiveProgress`
- `detectDuplicateHistoryEvent`
- `detectDuplicateCompletedRecord`
- `detectDuplicateTranscriptEntry`
- `detectDuplicateArchiveSearchEntry`
- `summarizeDedupeDecisionForGmDev`

These helpers support conservative dedupe decisions and GM/dev diagnostics.

Important preservation rule:

- The helpers do not force dedupe globally.
- Callers can preserve intentionally repeated history/latest-development entries.
- Existing persistence/idempotency behavior remains unchanged until a future migration wires these helpers into runtime output writers.

## Validation Helpers

`validateOutputBundle` and `assertOutputBundleValid` detect:

- missing output IDs
- invalid transition target types
- missing state write keys
- missing relationship/social participant IDs
- completed record, transcript, archive/search ID gaps
- player-visible outputs carrying GM/dev details
- player-visible outputs carrying hidden provenance
- debug outputs in player-scoped bundles

Validation supports strict error mode and permissive warning mode.

## Player-Safe Projection

`projectOutputBundleForPlayer` uses the shared Stage 6B.14.3 visibility boundary.

Player projection preserves:

- safe player result text
- safe knowledge title/summary/status
- safe objective title/status/progress/summary
- safe history text
- safe latest development text
- safe transition label/summary
- safe completed record summary
- safe transcript lines/summaries
- safe archive/search title/summary/tags
- optional safe state and relationship perception summaries

Player projection strips:

- debug outputs
- provenance
- source branch IDs
- source file paths
- GM/dev details
- raw state writes
- raw relationship/social meter details
- transition target IDs and routing internals
- future-supported/combat internals
- validation/debug metadata
- hidden clue metadata

## GM/Dev Projection

`projectOutputBundleForGmDev` preserves normalized bundles, provenance, debug outputs, state writes, relationship/social writes, transition routing details, and dedupe diagnostics.

Projection is not authorization. Existing routes/services must continue to enforce GM/dev permissions and campaign/character scoping before returning GM/dev data.

## Domain Output Adapters

Exploration adapter:

- `createExplorationOutputBundle`
- `projectExplorationOutputBundleForPlayer`
- `projectExplorationOutputBundleForGmDev`
- `explorationOutputAdapter`

Dialogue adapter:

- `createDialogueOutputBundle`
- `projectDialogueOutputBundleForPlayer`
- `projectDialogueOutputBundleForGmDev`
- `dialogueOutputAdapter`

The adapters attach domain provenance defaults and call the shared projection helpers. They do not import or call exploration/dialogue runtime services.

## Current Integration Points

Stage 6B.14.4 integrates the new helpers through exports and focused tests only.

Runtime services are intentionally not rewired in this build:

- exploration output persistence remains in existing exploration/progression services
- dialogue output persistence remains in Dialogue Focus/Commit services
- archive/search indexing remains owned by current archive/search services
- path harness execution remains unchanged
- frontend payload shape remains unchanged

## Behavior Preservation

This build should not change:

- player-facing exploration UI
- player-facing dialogue UI
- authored JSON behavior
- Greyvale content behavior
- output text
- output ordering
- knowledge/objective/history persistence
- completed dialogue records
- transcripts
- archive/search indexing
- GM/dev inspector behavior

No player-facing behavior change was intended for Stage 6B.14.4.

## Tests

Focused coverage lives in:

- `backend/test/interaction-core-output-pipeline.test.js`

The test covers:

- output bundle construction and merge behavior
- provenance attachment and player-safe stripping
- normalization helpers for all current output categories
- dedupe helpers and GM/dev dedupe summaries
- strict and warning-mode validation
- player-safe and GM/dev output projection
- exploration and dialogue output adapters
- Rusk-style `future_supported` / `combat_pending` internals remaining player-hidden

## Migration Plan

Recommended next steps:

- Start using output bundle builders in low-risk resolution-result construction.
- Add provenance at GM/dev debug boundaries before migrating persistence writers.
- Use projection assertions in output consistency tests.
- Gradually route knowledge/objective/history writers through normalization helpers only after regression tests prove behavior unchanged.
- Keep completed dialogue records and transcripts dialogue-owned until a later stage proves a shared completed-interaction abstraction is worth it.
- Keep path harness expected files domain-specific in Stage 6B.14.5.

## No Database Migration

No database or schema migration was added.

## Follow-Up For 6B.14.5

Stage 6B.14.5 should use these helpers in shared path harness assertions for:

- expected knowledge outputs
- expected objective updates
- expected transitions/handoffs
- expected completed records/transcripts
- expected player visibility cleanliness
- expected GM/dev provenance visibility
