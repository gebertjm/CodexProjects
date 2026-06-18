# Stage 6B.14 Shared Interaction Core Consolidation Plan

Stage 6B.14 is an internal consolidation stage. It asks:

Can exploration and dialogue share the same underlying interaction contracts, lifecycle helpers, output pipeline, visibility filtering, GM/dev debug structures, and path harness utilities while preserving their domain-specific behavior?

The answer should be proven incrementally. Stage 6B.14 should not change player-facing concepts, add Greyvale content, implement combat, implement open-world navigation, or replace exploration/dialogue adapters with one universal runtime. Every sub-build must keep the Stage 6B.13 Greyvale full-loop regression suite passing.

## 1. Stage Purpose

Stage 6B.14 should reduce duplicated internals between:

- Exploration Surface / Focus / Commit from Stage 6B.9.
- Dialogue Focus / Commit from Stage 6B.10 and the Stage 6B.12 Greyvale conversion.
- Exploration mechanics visibility from Stage 6B.11.
- Full-loop handoff, lifecycle, output, UI, and GM/dev visibility hardening from Stage 6B.13.

Hard boundaries:

- No player-facing feature expansion.
- No new Greyvale content.
- No combat implementation.
- No open-world navigation implementation.
- No shared universal runtime yet.
- No database/schema changes unless an audit finding proves one is required.
- No removal of exploration or dialogue domain language from content schemas, authored JSON, UI labels, player text, or design docs.

Internal direction:

- Keep exploration and dialogue adapters separate.
- Use neutral shared names only for internal contracts/helpers.
- Design contracts with future combat and navigation in mind, but implement only against exploration and dialogue for now.
- Consolidate the shared output bundle shape before migrating processing.
- Create a shared visibility filtering core with domain adapters.
- Consolidate shared path harness utilities while keeping expected path files domain-specific.

## 2. Current Interaction-System Inventory

### Exploration

| Area | Current implementation | Domain-specific behavior | Shared-looking logic | Test coverage | Consolidation risk | Migration stage |
| --- | --- | --- | --- | --- | --- | --- |
| Interaction surface | `backend/src/services/characterSceneViewService.js`, `backend/src/services/sceneNarrationComposer.js`, `backend/src/services/sceneContentOverlayService.js` | Builds player-safe scene surface, current aim, NPC/affordance narration, latest result feed, and current action state. | Surface assembly, player/debug filtering, source provenance. | `stage6b4-rich-scene-view.test.js`, `stage6b8-scene-narration-unit.test.js`, `exploration-greyvale-mechanics-regression.test.js` | Medium. Scene narration is product-sensitive and should stay adapter-owned. | 6B.14.1 contracts only; adapter remains owner. |
| Primitive adapter | `backend/src/services/interactionCore/explorationAdapter.js` | Maps automatic observations, passive discoveries, Free Focus, Beat Actions, and transitions onto shared primitives. | Already uses `createInteractionDomainAdapter`. | Covered indirectly by exploration docs/tests. | Low. Existing seed should be preserved. | 6B.14.1. |
| Free Focus | `backend/src/services/freeFocusService.js` | Non-committing Closer Look behavior, check visibility, result persistence, state patches, knowledge grants. | Non-committing inquiry rules, checks, availability, result output shape, visibility filtering. | `stage6b9-surface-focus-commit-unit.test.js`, `exploration-greyvale-mechanics-regression.test.js`, full-loop suite. | Medium. Free Focus persistence and scene-state versions are exploration-specific. | 6B.14.2 helpers; 6B.14.4 output shape. |
| Beat Action preview/submit | `backend/src/services/actionComposerService.js`, `backend/src/services/webActionSubmissionService.js` | Freeform action intent mapping, selected affordance verbs, active dialogue conflict handling, action window tokens. | Preview contract, current-context validation, stale-state errors, submit-once behavior, player-safe errors. | `stage6b5-action-composer-unit.test.js`, `full-loop-action-lifecycle-regression.test.js`. | High. Action-window behavior is fragile and must preserve 6B.13.2. | 6B.14.2. |
| Beat resolution | `backend/src/services/beatAdvanceService.js`, `backend/src/services/adventureRuntimeService.js`, `backend/src/services/playerBeatResultService.js` | Resolves through play state, updates latest development/feed, opens next action window. | Resolution result shape, output bundle, history/knowledge/objective summary. | `stage6b6-player-beat-result-unit.test.js`, full-loop suite. | High. Stage 6C owns deeper orchestration. | 6B.14.4 shape only; deeper resolver stays for 6C. |
| Action-window lifecycle | `backend/src/services/adventureRuntimeService.js`, `backend/src/services/webActionSubmissionService.js`, `backend/src/db/queries/adventureRuntime.js` | Open/closing/resolving windows, submitted actions, current mode, next-window derivation. | Context versioning, duplicate submit detection, stale action rejection, active character/campaign scoping. | `full-loop-action-lifecycle-regression.test.js`. | High. Avoid large state-machine rewrite. | 6B.14.2 helper extraction. |
| Latest development and result feed | `backend/src/services/playerBeatResultService.js` | Exploration result feed and current-scene latest exchange card. | Player result summary, output listing, archive/history link shape. | `greyvale-full-loop-regression.test.js`, `full-loop-output-consistency-regression.test.js`. | Medium. Dialogue summaries are related but not identical. | 6B.14.4 output bundle mapping. |
| Knowledge/history/objective outputs | `backend/src/services/characterKnowledgeService.js`, `backend/src/services/gameplayHistoryService.js`, `backend/src/services/adventureProgressionService.js`, `backend/src/services/worldStateMutationService.js` | Exploration result bands, interaction result mutation, objective sync. | Dedupe, provenance, player-safe journal/history/objective output. | `full-loop-output-consistency-regression.test.js`, Greyvale full-loop suite. | Medium. Output processing can drift if changed broadly. | 6B.14.4 gradual helpers. |
| State writes and transitions | `freeFocusService.applyStateChanges`, `worldStateMutationService.applyInteractionResultMutation`, `adventureRuntimeService.actThroughPlayState` | Scene-state patches, transition keys, current scene updates, future navigation gaps. | Transition output shape, state-write provenance, visibility filtering. | Exploration mechanics regression and full-loop suite. | High. Navigation remains future 6G. | Shape in 6B.14.4, behavior stays adapter/runtime-specific. |
| Player read model | `backend/src/routes/play.js`, `characterSceneViewService.getCharacterSceneView`, Flutter `campaign_scene_page.dart`, `api/models.dart` | Scene surface, focus cards, action composer, Conversations card, Latest Exchange. | Visibility filtering, safe error mapping, output result shape. | `player_ui_recovery_test.dart`, exploration Flutter tests. | Medium. UI terminology must not change. | 6B.14.3 with adapters. |
| GM/dev mechanics read model | `backend/src/services/explorationMechanicsDebugReadModel.js`, `backend/src/routes/devBeat.js`, Flutter `exploration_mechanics_inspector_page.dart` | Check breakdowns, result bands, environment/NPC schedule details, audit timeline. | Debug envelope shape, validation issues, state/output provenance. | `exploration-mechanics-debug-read-model.test.js`, `full-loop-gm-dev-visibility-regression.test.js`, Flutter inspector tests. | Medium. Rich debug data must stay GM/dev-only. | 6B.14.3 debug envelope. |
| Path/regression harness | `backend/test/exploration-greyvale-mechanics-regression.test.js`, `backend/test/greyvale-full-loop-regression.test.js` | Exploration cluster smoke and mechanics assertions. | Shared content setup, player denylist, GM/dev assertions, output assertions. | `npm run test:greyvale-full-loop`. | Low/medium. Avoid false positives. | 6B.14.5. |

### Dialogue

| Area | Current implementation | Domain-specific behavior | Shared-looking logic | Test coverage | Consolidation risk | Migration stage |
| --- | --- | --- | --- | --- | --- | --- |
| Conversation surface | `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`, `dialogueFocusCommitSchema.js`, Flutter `dialogue_scene_page.dart` | Conversation Surface, participants, passive social insight, player-safe dialogue context. | Surface primitive, visibility filtering, debug source metadata. | `dialogue-focus-commit-runtime.test.js`, `dialogue-greyvale-stage6b12-regression.test.js`, Flutter dialogue tests. | Medium. Dialogue wording and UI terms must remain domain-specific. | 6B.14.1 mapping only. |
| Primitive adapter | `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`, `dialogueFocusCommitTypes.js` | Maps Conversation Surface, Passive Social Insight, CQs, CSMs, and exits onto shared primitives. | Already uses `createInteractionDomainAdapter`. | Stage 6B.12 schema/runtime tests. | Low. Keep as adapter boundary. | 6B.14.1. |
| Clarifying Questions | `dialogueFocusCommitRuntimeService.resolveClarifyingQuestionForAccount` | Non-committing CQ behavior, checked CQ retry policy, asked/reopened answers, transcript turns. | Non-committing inquiry rules, availability, checks, output bundle, stale context. | `dialogue-focus-commit-runtime.test.js`, Greyvale path harness, full-loop suite. | Medium. Transcript and CQ persistence are dialogue-specific. | 6B.14.2 helper extraction. |
| Committed Social Moves | `previewCommittedSocialMoveForAccount`, `submitCommittedSocialMoveForAccount`, `resolveAndPersistMove` | Authored move matching, fallback, relationship gates, consumes dialogue beat, output branches. | Preview/submit/result lifecycle, availability, checks, duplicate/stale errors, output application. | `full-loop-action-lifecycle-regression.test.js`, Greyvale fixture/path tests. | High. Relationship gates and transcript hooks are delicate. | 6B.14.2 with adapter semantics. |
| Dialogue exits/finalization | `resolveDialogueExitForAccount`, `dialogueArchiveService.finalizeDialogueArchive` | Exits, finalization, completed records, transcript summary, active state clearing. | Transition output, completed-interaction record shape, lifecycle status, safe ended errors. | `dialogue-archive-runtime.test.js`, handoff/full-loop tests. | High. Do not generalize completed records prematurely. | 6B.14.1 contract; 6B.14.4 output hooks. |
| Relationship/social state | `dialogueRelationshipStateService.js`, persistence schema tables | Relationship reads/writes, player-perceived summaries, raw GM/dev meters. | State read/write shape, audit/provenance, visibility scopes. | `dialogue-relationship-state-runtime.test.js`, Greyvale path tests. | Medium/high. Exploration does not have a direct equivalent. | Keep dialogue-specific, expose shared state-write envelope. |
| Knowledge/history/objective/reward outputs | `dialogueFocusCommitRuntimeService.applyCanonicalOutputs`, `adventureProgressionService.applyAdventureOutcome` | CQs/CSMs/exits can grant knowledge, objectives, flags, rewards, transitions. | Shared output bundle, provenance, idempotency, player-safe summaries. | `full-loop-output-consistency-regression.test.js`. | Medium. Output applying now uses shared progression service but shape is not unified. | 6B.14.4. |
| Completed records/transcripts/archive/search | `dialogueArchiveService.js`, `dialogueAnnotationCorrectionService.js`, play archive/search routes | Dialogue transcript, completed dialogue record, summary, archive/search index, annotation/correction lifecycle. | Completed interaction record concept, archive/search visibility, provenance. | `dialogue-archive-runtime.test.js`, `dialogue-annotation-correction-runtime.test.js`, full-loop suite. | Medium. Completed dialogue remains domain-specific. | Shared contract only; processing stays dialogue-owned. |
| Player read model | `getDialogueFocusCommitStateForAccount`, play dialogue routes, Flutter `dialogue_scene_page.dart` | CQs, CSMs, exits, completion card, transcript/archive controls. | Visibility filtering, safe lifecycle errors, shared option shape. | `dialogue_ui_test.dart`, `player_ui_recovery_test.dart`. | Medium. Do not rename UI concepts. | 6B.14.3 if payload filtering changes. |
| GM/dev dialogue debug | `dialogueDebugWorkspaceService.js`, `backend/src/routes/devBeat.js`, Flutter `dialogue_debug_workspace_page.dart` | Availability/routing, hidden DCs, relationship state, move/exits outputs, transcript hooks, path harness data. | Debug envelope, validation grouping, stale/duplicate diagnostics, output provenance. | `dialogue-debug-workspace.test.js`, `full-loop-gm-dev-visibility-regression.test.js`. | Medium. Must remain permission-gated. | 6B.14.3. |
| Path harness | `dialoguePathTestHarnessService.js`, `content/dialogue_focus_commit/greyvale/*.expected-paths.json` | Dialogue-specific path files, CQ/CSM/exit execution, transcript/completed-record checks. | Shared setup, action execution, output assertions, player denylist, GM/dev debug assertions. | `dialogue-path-test-harness.test.js`, Greyvale fixture regression. | Low/medium. Keep expected files domain-specific. | 6B.14.5. |

## 3. Shared Concept Mapping

| Exploration term | Dialogue term | Neutral internal concept | Preserve domain terms where? |
| --- | --- | --- | --- |
| Surface | Conversation Surface | `interaction_surface` | Content schemas, UI, authored JSON, product/docs. |
| Passive discovery/context | Passive Social Insight | `passive_context` | Player UI and design docs. |
| Free Focus / Closer Look | Clarifying Question | `non_committing_inquiry` | UI labels and content fields. |
| Beat Action | Committed Social Move | `committed_action` | UI labels and content fields. |
| Focus result | CQ result | `inquiry_resolution` | Player result copy stays domain-specific. |
| Beat result | CSM/dialogue result | `interaction_resolution` | Player result copy stays domain-specific. |
| Latest Development | Dialogue summary/result | `player_result_summary` | Latest Development remains exploration/full-loop UI term. |
| Exploration action window | Dialogue lifecycle context | `interaction_context_version` | Runtime internals only. |
| Exploration mechanics inspector | Dialogue GM/dev debug | `debug_envelope` | GM/dev UI may keep domain labels. |
| Scene transition/path | Dialogue exit/transition | `transition_output` | Player labels stay domain-specific. |
| Free Focus/Beat output | CQ/CSM/output branch | `output_bundle` | Internal helper only. |
| Exploration path regression | Dialogue expected path | `path_expectation` | Expected path files remain domain-specific. |
| None yet | Completed Dialogue Record | `completed_interaction_record` | Use internally only; player-facing remains completed dialogue. |

Use neutral names only in shared internal contracts, shared helper functions, shared test utilities, and internal debug envelope fields where it improves consistency. Do not change authored JSON names, UI labels, player-facing text, creative briefs, or content docs.

## 4. Duplication Audit

| Area | Duplication found | Classification | Rationale |
| --- | --- | --- | --- |
| Primitive/domain mapping | `interactionCore` already maps exploration and dialogue into shared primitives. | Consolidate now in 6B.14.1 | Low-risk existing seed. |
| Preview request handling | Exploration preview and CSM preview both validate context, map options/freeform, return player-safe preview plus hidden debug. | Consolidate in 6B.14.2 | Keep adapter-specific option mapping. |
| Submit request handling | Exploration and dialogue both enforce current context, submit once, reject stale/ended/unavailable states. | Consolidate in 6B.14.2 | Strong 6B.13 tests protect behavior. |
| Non-committing inquiries | Free Focus and CQs both must not consume a commit slot and can persist/reopen results. | Consolidate helper rules in 6B.14.2 | Persistence remains adapter-specific. |
| Check metadata | Free Focus, Beat Actions, CQs, and CSMs share mode/DC/visibility/result-band concepts. | Partial now, revisit in 6H | Internal contract can normalize metadata; player transparency expansion is out of scope. |
| Availability/requirements | Exploration visibility/requirements and dialogue relationship gates both return available/locked/player-safe reason/debug reason. | Partial in 6B.14.2/6B.14.3 | Requirement languages differ. |
| Output writing | Exploration and dialogue both emit knowledge/objective/history/state/transition outputs, but dialogue also emits transcripts/completed records. | Consolidate output bundle shape in 6B.14.4 | Processing migration must be gradual. |
| History/latest development | Both need player-safe summaries and ordering. | Partial in 6B.14.4, revisit in 6C | Deeper orchestration belongs to 6C. |
| Knowledge/objective grants | Both use or should use `adventureProgressionService` and `characterKnowledgeService`. | Consolidate helpers in 6B.14.4 | Keep content-specific output semantics. |
| State writes | Free Focus scene state, relationship/social state, flags, and future combat state all need provenance. | Shared envelope in 6B.14.4 | Actual state stores remain domain-specific. |
| Transition handling | Exploration scene paths, dialogue exits, Rusk combat_pending/future-supported handoffs share shape but not execution. | Shared shape now, execution later | Live navigation is 6G and combat is 6I. |
| Visibility filtering | Exploration and dialogue each maintain denylist/player-vs-GM boundaries. | Consolidate in 6B.14.3 | Highest leverage, high safety value. |
| GM/dev debug envelope | Exploration and dialogue debug payloads are rich but differently shaped. | Consolidate debug envelope skeleton in 6B.14.3 | UI panels may stay separate. |
| Path harness helpers | Dialogue harness and full-loop tests duplicate setup, output, visibility, and debug assertions. | Consolidate in 6B.14.5 | Expected files stay domain-specific. |
| Player read-model assembly | Scene and dialogue pages have distinct needs but repeat safe error/visibility mappings. | Partial in 6B.14.3, frontend only if needed | Avoid UI redesign. |
| Combat/navigation assumptions | Rusk combat_pending and future_supported transitions hint at future domains. | Revisit in 6G/6I | Do not implement future runtime now. |

## 5. Proposed Shared Contracts

These are proposed internal shapes for 6B.14.1. They should be plain JS object contracts or lightweight helpers first, not database schemas.

### Shared interaction domain

Recommended values:

- `surface_focus_commit`
- `dialogue_focus_commit`
- `navigation` as a future reserved value only.
- `combat` as a future reserved value only.

### Shared interaction context

Recommended fields:

- `interaction_domain`
- `campaign_id`
- `adventure_id`
- `character_id`
- `actor_id`
- `current_scene_id`
- `location_id`
- `active_dialogue_id`
- `interaction_state_version`
- `source_content_id`
- `source_content_type`
- `visibility_scope`
- `request_id`
- `correlation_id`

Exploration adapters should populate scene/window fields. Dialogue adapters should populate dialogue scene state and runtime counts. Future navigation/combat should be able to populate the same context without forcing current code to implement them.

### Shared interaction option

Recommended fields:

- `option_id`
- `option_kind`
- `domain_kind`
- `title`
- `label`
- `player_summary`
- `availability`
- `requirements`
- `check_metadata`
- `consumes_commit_slot`
- `output_preview`
- `visibility_metadata`
- `debug_metadata`

Use `option_kind` for neutral internals such as `non_committing_inquiry`, `committed_action`, `exit`, and `transition`. Use `domain_kind` for `free_focus`, `clarifying_question`, `beat_action`, `committed_social_move`, or `dialogue_exit`.

### Shared preview request/result

Recommended request fields:

- `interaction_context`
- `option_id`
- `freeform_text`
- `preview_id`
- `context_version`

Recommended result fields:

- `status`
- `availability`
- `player_preview`
- `check_summary`
- `risk_summary`
- `lifecycle_context`
- `debug_envelope`
- `visibility_metadata`
- `stale_state`

### Shared submit request/result

Recommended request fields:

- `interaction_context`
- `option_id`
- `freeform_text`
- `preview_id`
- `context_version`
- `idempotency_key`
- `request_id`

Recommended result fields:

- `status`
- `commit_status`
- `player_status`
- `gm_dev_lifecycle_status`
- `resolution_status`
- `resolution`
- `next_state`
- `debug_envelope`

### Shared resolution result

Recommended fields:

- `interaction_domain`
- `resolution_id`
- `player_result`
- `output_bundle`
- `next_state`
- `visibility_scope`
- `debug_envelope`
- `error_status`
- `transcript_hooks`
- `completed_record_hooks`

### Shared output bundle

Recommended fields:

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
- `visibility_metadata`

The bundle shape should be shared before processing is migrated. Exploration and dialogue can keep building their current outputs and wrap them with shared helpers until later sub-builds prove behavior is unchanged.

### Shared visibility scope

Recommended scopes:

- `player`
- `gm_dev`
- `test_harness`
- `system_internal`

### Shared debug envelope

Recommended fields:

- `interaction_domain`
- `source_content_id`
- `source_content_path`
- `actor_context`
- `availability`
- `requirements`
- `checks`
- `modifiers`
- `result_bands`
- `selected_branch`
- `state_reads`
- `state_writes`
- `output_provenance`
- `transition_routing`
- `stale_state_diagnostics`
- `duplicate_submit_diagnostics`
- `idempotency_diagnostics`
- `validation`
- `visibility_filtering`

## 6. Adapter Boundary Plan

Exploration adapter remains responsible for:

- Scene surface composition.
- Free Focus domain behavior.
- Beat Action domain behavior.
- Environment modifiers.
- NPC presence and schedules.
- Exploration action-window rules.
- Exploration Latest Development semantics.
- Exploration scene transitions.
- Exploration GM/dev mechanics details.

Dialogue adapter remains responsible for:

- Conversation Surface composition.
- Passive Social Insight.
- Clarifying Question domain behavior.
- Committed Social Move domain behavior.
- Relationship/social state.
- Dialogue exit/finalization.
- Transcripts.
- Completed Dialogue Records.
- Dialogue summaries.
- Dialogue archive/search hooks.
- Dialogue GM/dev details.

Shared core should handle:

- Shared contract types.
- Preview/submit/resolution lifecycle helpers.
- Stale-state and duplicate-submit helpers.
- Player-safe error helpers.
- Visibility filtering framework.
- Output bundle shape/helpers.
- Debug envelope shape/helpers.
- Path harness shared utilities.

## 7. Visibility Consolidation Plan

Current exploration visibility:

- `explorationMechanicsDebugReadModel.js` exposes rich GM/dev mechanics through `/api/dev/exploration-mechanics`.
- `characterSceneViewService.js`, `actionComposerService.js`, and `freeFocusService.js` build player-facing scene/focus/preview/result payloads.
- `exploration-mechanics-visibility-boundary.test.js` and Flutter exploration visibility tests assert player payloads do not leak debug data.

Current dialogue visibility:

- `dialogueFocusCommitRuntimeService.js` builds player state, CQ/CSM previews/results, and exit results.
- `dialogueDebugWorkspaceService.js` exposes GM/dev routing/check/state/output details through `/api/dev/dialogue-debug`.
- `dialogueArchiveService.js` filters transcript/completed record/archive/search data for player surfaces.
- Dialogue path harness and full-loop visibility tests assert player-safe payloads.

Shared visibility layer responsibilities:

- Apply `visibility_scope`.
- Strip debug-only metadata from player payloads.
- Enforce the hidden-data denylist.
- Map internal errors to player-safe errors.
- Preserve GM/dev details for authorized debug.
- Hide future_supported, combat, and navigation internals from players.
- Support test-harness assertions.

Domain adapter responsibilities:

- Exploration-specific hidden fields such as environment debug, NPC schedules, result bands, and state reads/writes.
- Dialogue-specific hidden fields such as raw relationship/social state, hidden gate requirements, transcript source visibility, and completed-record internals.
- Future combat-specific fields such as damage/resource/condition routing.
- Future navigation-specific fields such as pathfinding/open-world route internals.

The shared denylist should include hidden DCs, raw rolls, total result, modifier breakdown, result band internals, branch ids, hidden requirements, exact failed requirements, GM notes, debug summaries, state read/write internals, raw relationship/social meters, environment modifier internals, NPC schedule internals, preview/routing confidence, path harness metadata, validation debug notices, future_supported internals, combat routing internals, database constraints, stack traces, hidden clue metadata, final mystery notes, GM-only truth labels, and annotation/correction internals not player-facing.

## 8. Output Pipeline Consolidation Plan

Current exploration output handling:

- Free Focus applies state changes, canonical events, and knowledge grants in `freeFocusService.js`.
- Beat/result outputs are summarized through `playerBeatResultService.js`.
- Interaction result mutations use `worldStateMutationService.applyInteractionResultMutation`.
- Quest/objective/reward progression flows through `adventureProgressionService.js`.

Current dialogue output handling:

- CQs/CSMs/exits collect authored outputs in `dialogueFocusCommitRuntimeService.js`.
- Canonical dialogue outputs call `adventureProgressionService.applyAdventureOutcome`.
- Relationship/social writes are handled by `dialogueRelationshipStateService.js`.
- Completed records, transcripts, summaries, archive, and search are handled by `dialogueArchiveService.js`.

Gradual migration:

- 6B.14.1 defines `output_bundle` contract.
- 6B.14.4 introduces shared output bundle helpers.
- Exploration and dialogue adapters continue domain-specific assembly.
- The 6B.13 output consistency regression proves behavior is unchanged after each migration.

Output handling that should remain domain-specific:

- Dialogue transcript/completed-record details.
- Exploration Latest Development nuance.
- Relationship/social state writes.
- Future combat damage/resources/conditions.
- Future navigation route/open-world movement outputs.

## 9. Lifecycle Helper Consolidation Plan

Current lifecycle invariants from 6B.13:

- Preview does not commit.
- Submit commits exactly once.
- Stale preview/action/dialogue context is rejected safely.
- Duplicate submit is rejected or idempotent without duplicate outputs.
- Free Focus and CQs do not consume the committed action slot.
- Beat Actions and CSMs consume their commit slot.
- Dialogue exits finalize once.
- Active character/campaign scoping prevents state leaks.
- Player-facing errors are safe and actionable.
- GM/dev debug can inspect the raw reason.

Shared helpers to extract:

- Validate current interaction context.
- Validate active character/campaign scope.
- Validate current state version.
- Validate option availability.
- Create preview result.
- Commit submission exactly once.
- Map stale/ended/unavailable errors.
- Attach lifecycle debug envelope.
- Enforce non-committing inquiry rules.

Adapter-specific behavior to preserve:

- What "next state" means.
- How dialogue exit finalizes.
- How exploration resolution opens the next action window.
- How transcripts/completed records are created.
- How future combat turns work.

## 10. Path Harness Consolidation Plan

Current path/test utilities:

- Dialogue path harness: `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js`.
- Dialogue expected paths: `content/dialogue_focus_commit/greyvale/*.expected-paths.json`.
- Full-loop clustered smoke: `backend/test/greyvale-full-loop-regression.test.js`.
- Exploration mechanics regression: `backend/test/exploration-greyvale-mechanics-regression.test.js`.
- Visibility/output/lifecycle assertions: `backend/test/full-loop-*.test.js`.

Proposed shared test utilities:

- Load content package.
- Create test campaign/character.
- Load interaction context.
- Run non-committing inquiry.
- Preview committed action.
- Submit committed action.
- Force check success/failure.
- Assert output bundle.
- Assert player visibility boundary.
- Assert GM/dev debug visibility.
- Assert next state.
- Assert completed record/archive/search.
- Assert stale/duplicate behavior.

Expected path files should remain domain-specific:

- Exploration expected paths.
- Dialogue expected paths.
- Future navigation expected paths.
- Future combat expected paths.

## 11. Database/Schema Audit

Default result: no database/schema migration is required for 6B.14.0 or for the first consolidation pass.

Existing persistence support:

- Interaction domain or equivalent exists in content via `interaction_domain` and in shared primitives via `INTERACTION_DOMAINS`.
- Active scene/adventure state exists in adventure runtime tables and services.
- Active dialogue state exists in the Dialogue Focus/Commit persistence schema.
- Action windows and submitted actions exist through adventure runtime queries and `webActionSubmissionService.js`.
- Dialogue CSM/CQ records and runtime state support lifecycle counts.
- Output provenance exists across beat results, gameplay history, knowledge, dialogue records, and debug read models.
- Completed dialogue records, transcripts, archive, and search are supported by Dialogue Focus/Commit persistence.
- Visibility/debug metadata exists at service/read-model level rather than needing a new table.

Possible schema pressure to monitor, but not implement in 6B.14.0:

- A truly universal `completed_interaction_record` table would be premature. Dialogue completed records should remain dialogue-specific until exploration has a comparable product concept.
- A universal interaction submission table would overlap with existing action-window submissions and dialogue records. Helper-level consolidation is safer.
- A universal debug timeline could be useful later, but Stage 6F.1 or 6C is a better owner than 6B.14.
- Future combat and navigation may require persistence that should not be guessed now.

## 12. Frontend Impact Audit

Default frontend target: no visible player UI change.

Likely frontend files affected only if read-model wrapper fields change:

- `apps/player_app/lib/api/models.dart`
- `apps/player_app/lib/api/api_client.dart`
- `apps/player_app/lib/campaign/campaign_scene_page.dart`
- `apps/player_app/lib/campaign/dialogue_scene_page.dart`
- `apps/player_app/lib/campaign/exploration_mechanics_inspector_page.dart`
- `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`

Frontend tests to run when touched:

- `apps/player_app/test/models_test.dart`
- `apps/player_app/test/player_ui_recovery_test.dart`
- `apps/player_app/test/dialogue_ui_test.dart`
- `apps/player_app/test/dialogue_debug_workspace_test.dart`
- `apps/player_app/test/exploration_mechanics_*_test.dart`
- `flutter analyze`

Risks:

- Shared internal names could accidentally leak into UI labels.
- GM/dev payload model changes could break inspector pages.
- Player-safe error mapping could regress if backend error shapes change.

Mitigation:

- Preserve existing player/GM route payloads during 6B.14.1 and 6B.14.2.
- Add wrapper/adapters rather than renaming frontend fields.
- Run rendered hidden-data tests if frontend code changes.

## 13. Proposed 6B.14 Sub-Build Plan

### 6B.14.1 - Shared Interaction Contract and Type Layer

Goal:

- Define shared internal contracts for domains, contexts, options, previews, submissions, resolutions, output bundles, visibility scopes, and debug envelopes.

Scope:

- Extend `backend/src/services/interactionCore/primitiveTypes.js` or add adjacent contract modules.
- Preserve `explorationAdapter.js` and `dialogueAdapter.js`.
- Add unit tests for contract normalization and domain mapping.

Likely files/code areas:

- `backend/src/services/interactionCore/*`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitTypes.js`
- `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`
- `backend/src/services/interactionCore/explorationAdapter.js`
- `backend/test/*interaction*` or a new focused unit test.

Non-goals:

- No runtime service refactor.
- No player payload shape change.
- No DB migration.

Acceptance criteria:

- Shared contracts exist and normalize exploration/dialogue primitives.
- Domain adapters remain separate.
- Existing 6B.13 full-loop regression passes.

Required checks:

- Contract unit tests.
- `npm run test:greyvale-full-loop`.

Implementation status:

- Stage 6B.14.1 adds the shared contract modules in `backend/src/services/interactionCore/`: `contracts.js`, `visibility.js`, `outputBundle.js`, `transitionOutput.js`, `debugEnvelope.js`, `errors.js`, `pathExpectations.js`, and the barrel export in `index.js`.
- Focused coverage lives in `backend/test/interaction-core-contracts.test.js`.
- The detailed implementation note is `docs/interaction-core/STAGE_6B_14_1_SHARED_INTERACTION_CONTRACTS.md`.
- `explorationAdapter.js` and `dialogueFocusCommit/dialogueAdapter.js` remain separate adapter boundaries; no runtime service migration is included in 6B.14.1.

### 6B.14.2 - Shared Preview / Submit / Resolution Lifecycle Helpers

Goal:

- Extract lifecycle helpers for current-context validation, stale-state handling, duplicate-submit/idempotency, non-committing inquiry rules, safe errors, and GM/dev lifecycle reasons.

Scope:

- Adapter-safe helpers used by `actionComposerService.js`, `freeFocusService.js`, and `dialogueFocusCommitRuntimeService.js`.
- Preserve exploration and dialogue resolution semantics.

Likely files/code areas:

- `backend/src/services/interactionCore/*Lifecycle*.js`
- `backend/src/services/actionComposerService.js`
- `backend/src/services/freeFocusService.js`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- `backend/test/full-loop-action-lifecycle-regression.test.js`

Non-goals:

- No action-window state-machine redesign.
- No universal runtime executor.

Acceptance criteria:

- Preview still does not commit.
- Submit still commits once.
- Free Focus/CQs remain non-committing.
- Stale/duplicate errors remain player-safe.
- 6B.13 lifecycle regressions pass.

Required checks:

- `backend/test/full-loop-action-lifecycle-regression.test.js`
- `npm run test:greyvale-full-loop`

Implementation status:

- Stage 6B.14.2 adds pure lifecycle helpers in `backend/src/services/interactionCore/lifecycle.js` and exports them through `backend/src/services/interactionCore/index.js`.
- Focused helper coverage lives in `backend/test/interaction-core-lifecycle.test.js`.
- The detailed implementation note is `docs/interaction-core/STAGE_6B_14_2_SHARED_LIFECYCLE_HELPERS.md`.
- No exploration or dialogue runtime services were rewired in this pass; `actionComposerService.js`, `webActionSubmissionService.js`, `freeFocusService.js`, and `dialogueFocusCommitRuntimeService.js` remain domain-owned.

### 6B.14.3 - Shared Visibility Filtering and Error Boundary

Goal:

- Create a shared visibility filtering layer and safe error boundary with exploration/dialogue adapters.

Scope:

- Shared denylist helpers.
- Shared `visibility_scope` filtering primitives.
- GM/dev debug envelope safety.
- Safe player error mapping.

Likely files/code areas:

- `backend/src/services/interactionCore/*Visibility*.js`
- `backend/src/services/explorationMechanicsDebugReadModel.js`
- `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`
- `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`
- `backend/src/services/actionComposerService.js`
- Flutter model tests only if payload fields change.

Non-goals:

- No player-facing mechanics transparency expansion.
- No GM/dev UI redesign.

Acceptance criteria:

- Player payloads remain clean.
- Authorized GM/dev debug remains rich.
- Existing permission gates remain intact.

Required checks:

- `backend/test/full-loop-gm-dev-visibility-regression.test.js`
- `backend/test/exploration-mechanics-visibility-boundary.test.js`
- Dialogue debug tests.
- Relevant Flutter rendered denylist tests if frontend touched.

Implementation status:

- Stage 6B.14.3 adds the shared visibility boundary in `backend/src/services/interactionCore/visibilityBoundary.js`.
- Thin domain adapters live in `backend/src/services/interactionCore/explorationVisibilityAdapter.js` and `backend/src/services/interactionCore/dialogueVisibilityAdapter.js`.
- Focused coverage lives in `backend/test/interaction-core-visibility-boundary.test.js`.
- The detailed implementation note is `docs/interaction-core/STAGE_6B_14_3_SHARED_VISIBILITY_AND_ERROR_BOUNDARY.md`.
- No exploration/dialogue runtime read models or frontend UI were rewired in this pass; adoption should start with tests and low-risk projection boundaries.

### 6B.14.4 - Shared Output Bundle and Provenance Pipeline

Goal:

- Introduce shared output bundle helpers for knowledge, objectives, history, latest development, state writes, transitions, transcript/completed-record hooks, archive/search, and debug provenance.

Scope:

- Define and normalize output bundle shape.
- Wrap existing exploration/dialogue outputs with shared helpers.
- Migrate processing conservatively, one output class at a time.

Likely files/code areas:

- `backend/src/services/interactionCore/*Output*.js`
- `backend/src/services/adventureProgressionService.js`
- `backend/src/services/playerBeatResultService.js`
- `backend/src/services/freeFocusService.js`
- `backend/src/services/worldStateMutationService.js`
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`
- `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`

Non-goals:

- No event-sourcing rewrite.
- No universal completed-record table.
- No new content.

Acceptance criteria:

- Knowledge/objective/history/archive/search behavior is unchanged.
- Output provenance is more consistent for GM/dev.
- Player-facing summaries remain safe.

Required checks:

- `backend/test/full-loop-output-consistency-regression.test.js`
- Archive/search tests.
- `npm run test:greyvale-full-loop`

Implementation status:

- Stage 6B.14.4 adds the shared output pipeline in `backend/src/services/interactionCore/outputPipeline.js`.
- Thin domain output adapter entry points live in `backend/src/services/interactionCore/explorationOutputAdapter.js` and `backend/src/services/interactionCore/dialogueOutputAdapter.js`.
- Focused coverage lives in `backend/test/interaction-core-output-pipeline.test.js`.
- The detailed implementation note is `docs/interaction-core/STAGE_6B_14_4_SHARED_OUTPUT_BUNDLE_AND_PROVENANCE_PIPELINE.md`.
- No exploration/dialogue runtime output writers, persistence stores, archive/search indexing, path harness execution, or frontend payloads were rewired in this pass.

### 6B.14.5 - Shared Path Harness and Greyvale Regression Rewire

Goal:

- Extract shared path/regression utilities while keeping expected path files domain-specific.

Scope:

- Shared content/test setup.
- Shared interaction execution helpers.
- Shared output/visibility/GM-dev assertions.
- Greyvale full-loop regression command remains the capstone.

Likely files/code areas:

- `backend/src/services/interactionCore/*PathHarness*.js` or test helpers.
- `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js`
- `backend/test/fixtures/*`
- `backend/test/dialogue-greyvale-fixture-regression.test.js`
- `backend/test/greyvale-full-loop-regression.test.js`

Non-goals:

- Do not merge expected path JSON formats.
- Do not fake navigation/combat.

Acceptance criteria:

- Dialogue expected paths still run.
- Full-loop cluster smoke still runs.
- Shared assertions reduce duplication without weakening tests.

Required checks:

- `npm run test:greyvale-full-loop`
- Dialogue path harness tests.
- Exploration mechanics regression tests.

Implementation status:

- Stage 6B.14.5 adds shared test harness utilities in `backend/test/interaction-core/sharedPathHarness.js`.
- Focused coverage lives in `backend/test/interaction-core-path-harness.test.js`.
- Representative local rewires were applied to `backend/test/dialogue-focus-commit-adapter.test.js` and `backend/test/stage6b9-surface-focus-commit-unit.test.js`.
- Deterministic command alias: `npm run test:interaction-core`.
- Expected path files remain domain-specific under `content/dialogue_focus_commit/greyvale`.
- The detailed implementation note is `docs/interaction-core/STAGE_6B_14_5_SHARED_PATH_HARNESS_AND_REGRESSION_REWIRE.md`.
- Final Stage 6B.14 status is tracked in `docs/interaction-core/STAGE_6B_14_FINAL_STATUS.md`.

## 14. Risk Register

| Risk | Severity | Likelihood | Detection | Mitigation | Target sub-build |
| --- | --- | --- | --- | --- | --- |
| Over-abstracting exploration/dialogue into a vague universal runtime | Critical | Medium | Code review, large diff size, failing full-loop tests | Keep adapters separate and extract helpers only. | All, especially 6B.14.1/2 |
| Breaking Greyvale full-loop behavior | Critical | Medium | `npm run test:greyvale-full-loop` | Run after every sub-build; keep changes incremental. | All |
| Accidental player-facing terminology change | High | Medium | Flutter/widget tests, screenshot/manual smoke, text search | Preserve domain labels in UI/content. | 6B.14.1/3 |
| Hidden-data leak through shared debug/visibility shape | Critical | Medium | Player denylist tests and GM/dev positive controls | Shared visibility layer defaults to player-safe stripping. | 6B.14.3 |
| Output duplication or missing objective progress | Critical | Medium | Output consistency regression | Wrap outputs before migrating processing. | 6B.14.4 |
| Stale-state handling regression | Critical | Medium | Lifecycle regression tests | Reuse helpers with adapter-specific context checks. | 6B.14.2 |
| Path harness false positives | High | Medium | Intentional failure probes and existing path tests | Keep expected files domain-specific and assert outputs/visibility. | 6B.14.5 |
| Frontend model mismatch | High | Low/medium | Flutter model and UI tests | Preserve payloads; add adapters if internal names change. | 6B.14.3/4 |
| Database/schema pressure discovered late | Medium | Low | DB audit and persistence tests | Document but avoid migrations unless unavoidable. | All |
| Future combat/navigation assumptions pollute current code | High | Medium | Code review and scope checks | Reserve enum values only; no future behavior. | 6B.14.1/4 |
| Shared contracts become too broad/vague | Medium | Medium | Test readability and usage review | Keep contracts minimal and backed by exploration/dialogue cases. | 6B.14.1 |
| Migration too large for one sub-build | High | Medium | PR/diff size and failing regressions | Split by contracts, lifecycle, visibility, output, harness. | All |

## 15. Test and Validation Strategy

Every 6B.14 sub-build must preserve the 6B.13 Greyvale full-loop regression suite.

Required regression categories:

- Greyvale full-loop regression command/group.
- Content/schema/import/registry validation.
- Exploration regression tests.
- Dialogue path harness tests.
- Handoff tests.
- Action lifecycle tests.
- Output consistency tests.
- Player visibility boundary tests.
- GM/dev visibility/permission tests.
- Archive/search/completed-record tests.
- Frontend tests where affected.
- Syntax/lint/format checks available for touched packages.

Command inventory:

| Command | Purpose | Location | Required environment | Expected cost | Relevant sub-builds | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run test:greyvale-full-loop` | Capstone backend Greyvale full-loop regression | repo root | Local DB, `DATABASE_URL`, often `DB_HOST=localhost` outside Docker | A few minutes | All | Validates Greyvale content and runs 56 focused backend tests in current baseline. |
| `npm --prefix backend test` | Full backend Node test suite | repo root | Local DB for DB-backed tests | Several minutes | Final checks or broad refactors | No separate backend lint/typecheck script exists. |
| `npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale` | Read-only Greyvale content validation | repo root/backend prefix | Local DB connection if importer validates DB-backed refs | Fast | 6B.14.1/4/5 | Included in full-loop command. |
| `node --test --test-concurrency=1 backend/test/full-loop-action-lifecycle-regression.test.js` | Lifecycle regression | repo root | Local DB | Fast/moderate | 6B.14.2 | Use backend working directory or adjust paths as needed. |
| `node --test --test-concurrency=1 backend/test/full-loop-output-consistency-regression.test.js` | Output consistency regression | repo root | Local DB | Fast/moderate | 6B.14.4 | Covers knowledge/objective/archive/search behavior. |
| `node --test --test-concurrency=1 backend/test/full-loop-gm-dev-visibility-regression.test.js` | GM/dev and player denylist regression | repo root | Local DB | Fast/moderate | 6B.14.3 | Covers permission and visibility boundaries. |
| `node --test --test-concurrency=1 backend/test/dialogue-greyvale-fixture-regression.test.js backend/test/dialogue-path-test-harness.test.js` | Dialogue path harness regression | repo root | Local DB | Moderate | 6B.14.5 | Keeps expected paths domain-specific. |
| `npm run build` | Hosting/static page compliance check | repo root | Node/npm | Fast | Docs/UI-safe checks | Runs `check:hosting`. |
| `& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test ...` | Targeted Flutter widget/model regression | `apps/player_app` | Local Flutter SDK | Moderate | 6B.14.3 if frontend touched | Use documented test list from 6B.13 status. |
| `& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze` | Flutter static analysis | `apps/player_app` | Local Flutter SDK | Fast | Frontend-touched sub-builds | No root wrapper script currently. |
| `node --check <file>` | JS syntax check for changed JS | repo root | Node | Fast | Any JS-touched sub-build | Useful because no backend typecheck script exists. |
| `rg -n "<pattern>" docs backend apps content dialogue` | Audit/path sanity | repo root | ripgrep | Fast | 6B.14.0 | Used for docs/code inventory. |

Unavailable or not found:

- No Makefile.
- No justfile.
- No root/backend lint script.
- No root/backend typecheck script.
- No markdownlint configuration found.

## 16. Overall Stage 6B.14 Acceptance Criteria

By the end of Stage 6B.14:

- Shared interaction contracts exist.
- Exploration and dialogue adapters remain separate.
- Preview/submit/resolution lifecycle helpers are shared where safe.
- Visibility filtering has a shared core with domain adapters.
- Output bundle shape is shared.
- Output processing is migrated conservatively without behavior regression.
- GM/dev debug envelope is more consistent.
- Path harness utilities are shared.
- Expected path files remain domain-specific.
- No player-facing terminology regression occurs.
- No new Greyvale content is required.
- No combat/navigation implementation is required.
- No database migration is added unless explicitly justified.
- The 6B.13 Greyvale full-loop regression remains passing.

## 17. Out-Of-Scope Routing

- Greyvale playable vertical slice declaration -> Stage 6B.15.
- Beat resolution quality/orchestration overhaul -> Stage 6C.
- GM campaign-level inspector -> Stage 6F.1.
- Open-world movement/navigation -> Stage 6G.
- Player-facing rules/check transparency expansion -> Stage 6H.
- Combat encounter web MVP / combat overhaul -> Stage 6I.

## 18. Stage 6B.14.0 Lightweight Validation

This docs-first build should run lightweight validation only:

- Confirm no `AGENTS.md` or repo-local instructions apply.
- Use `rg`/file discovery to inventory actual exploration, dialogue, full-loop, route, Flutter, and command paths.
- Run root hosting/static docs check if available: `npm run build`.
- Run Greyvale content validation if local DB env is available.
- Run `npm run test:greyvale-full-loop` only if practical; otherwise document that it remains the required regression gate for 6B.14.1+.

No runtime or player-facing behavior should change in 6B.14.0.
