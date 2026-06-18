# Dialogue Focus/Commit Architecture Plan

This document proposes runtime architecture for Dialogue Focus/Commit. It is a plan only.

## Current Repo Architecture To Reuse

Existing reusable pieces:

- `freeFocusService.js`: Surface / Focus / Commit definitions, check visibility, persisted focus/passive results, overlap helper.
- `actionComposerService.js`: backend-authoritative preview/submit flow and overlap blocking pattern.
- `dialogueService.js`: current graph/session runtime for dialogue nodes, options, outcomes, sessions, visits, choices, and effects.
- `dialogueEngine.js`: dialogue condition evaluation and option skill-check resolution.
- `narrativeStateService.js`: membership assertions, narrative context, condition context, effects, campaign logs.
- `characterKnowledgeService.js`: safe knowledge grants and reads.
- `gameplayHistoryService.js`: compact history entries.
- `playerBeatResultService.js`: stable player-facing read models and history integration.
- `contentValidation.js`: tiered validation target for new dialogue content.
- `contentRepository.js` and `contentImporter.js`: JSON import paths.
- `adventureRuntimeService.js`: playable action facade and dynamic content hooks.
- Flutter `api_client.dart`, `models.dart`, and campaign scene UI patterns.

Existing dialogue limitations to account for:

- Current dialogue is graph/session oriented, with options and outcomes.
- Current dialogue does not yet model Clarifying Questions as non-beat focus actions.
- Current dialogue does not yet produce completed dialogue records or robust transcripts.
- Relationship/social state exists mostly as effects/flags/disposition-like data, not a typed dialogue state system.
- Existing graph flow should not be broken during early adapter work.

## Shared Primitive Boundary

Create or formalize shared interaction primitives in a module such as:

```text
backend/src/services/interactionCore/
  primitiveTypes.js
  visibility.js
  checks.js
  availability.js
  persistenceContracts.js
  previewContracts.js
  stateChangeContracts.js
```

Shared primitive concepts:

- `surface`: automatic player-facing intake.
- `passive_context`: conditional automatic context, usually persisted to prevent rerolls.
- `free_focus`: immediate optional focus, persisted and non-beat-consuming.
- `committed_action`: beat/window-consuming action.
- `preview`: server-authoritative interpretation and warning phase.
- `resolution`: deterministic outcome application.
- `state_changes`: explicit writes with provenance.
- `outputs`: player-facing narration, mechanics, summaries, read-model fragments.
- `transitions`: movement to another domain/state.

The core should not know dialogue labels. It should accept adapter-provided names, content definitions, visibility context, check context, state scopes, and persistence hooks.

## Dialogue Adapter Boundary

Create dialogue adapter modules such as:

```text
backend/src/services/dialogueFocusCommit/
  dialogueAdapter.js
  dialogueSceneLoader.js
  conversationSurfaceService.js
  passiveSocialInsightService.js
  clarifyingQuestionService.js
  socialMovePreviewService.js
  socialMoveResolutionService.js
  dialogueExitService.js
  dialogueRecordService.js
  relationshipStateService.js
  dialogueValidationAdapter.js
```

Dialogue adapter responsibilities:

- Normalize dialogue JSON into shared primitives.
- Map `conversation_surface` to `surface`.
- Map `passive_social_insight` to `passive_context`.
- Map `clarifying_questions` to `free_focus`.
- Map `committed_social_moves` to `committed_action`.
- Map `dialogue_exit` to shared transitions.
- Own dialogue-specific labels, UI hints, transcript records, relationship state, summary shape, annotation/correction lifecycle.
- Reuse shared check visibility and persistence patterns.

## Avoiding Engine Duplication

Exploration and dialogue should share:

- Check normalization.
- Check visibility enum.
- First-result persistence policy.
- Preview-before-submit posture.
- Overlap warning pattern.
- Canonical event creation rules.
- Knowledge grant application.
- State-change provenance.
- Hidden-truth filtering.

Exploration and dialogue should differ in:

- Content field names.
- UI section labels.
- State scopes and registered state fields.
- Transcript/completed record creation.
- Relationship/social state semantics.
- GM/dev tooling panels.

Do not copy `freeFocusService.js` into a `dialogueFreeFocusService.js` with divergent behavior. Instead, extract shared mechanics gradually and add adapter-specific wrappers.

## Runtime Flow

### Load Dialogue Scene

1. Authenticate account.
2. Resolve active character/campaign/session or explicit dialogue scene.
3. Load current dialogue graph/session state.
4. Load character knowledge, relationship/social state, NPC identity, current scene context.
5. Filter content before composition.
6. Compose conversation surface and visible passive social insight.
7. Return Clarifying Questions, committed moves, exits, and safe transcript summary.

### Resolve Clarifying Question

1. Authenticate and revalidate current dialogue state.
2. Verify question exists, is visible, is available, and does not consume beat.
3. Return persisted result if already resolved for the same state version.
4. Resolve check if needed.
5. Apply authored knowledge/state changes only if allowed.
6. Persist clarifying question record.
7. Append transcript turn or local transcript annotation according to schema.

### Preview Committed Social Move

1. Accept natural text plus optional target/move metadata.
2. Resolve against visible committed moves and generic fallback rules.
3. Detect overlap with unresolved Clarifying Questions.
4. Validate relationship reads/writes and check requirements.
5. Return resolved preview, clarification, overlap warning, or invalid response.

### Submit/Resolve Committed Social Move

1. Revalidate preview server-side.
2. Lock/consume current dialogue action window or equivalent state.
3. Run authored move resolution and checks.
4. Apply state changes and effects.
5. Persist transcript turn, social move record, relationship audit, and safe output.
6. Update completed record if dialogue ends.
7. Open next beat/window or transition as authored.

## Proposed Module Layout

Backend:

```text
backend/src/services/interactionCore/
  availability.js
  checkVisibility.js
  interactionNormalizer.js
  interactionPersistence.js
  previewOverlap.js
  stateChangeValidator.js

backend/src/services/dialogueFocusCommit/
  dialogueFocusCommitSchema.js
  dialogueFocusCommitLoader.js
  dialogueFocusCommitService.js
  clarifyingQuestionService.js
  socialMovePreviewService.js
  socialMoveResolutionService.js
  relationshipStateService.js
  dialogueTranscriptService.js
  dialogueSummaryService.js
  annotationCorrectionService.js
  dialogueDiagnosticsService.js

backend/src/routes/
  playDialogueRoutes.js
  devDialogueRoutes.js

backend/src/content/
  dialogueFocusCommitValidation.js
```

Build 1 implementation note:

- Shared primitive constants and the generic adapter factory now live in `backend/src/services/interactionCore/primitiveTypes.js` and `backend/src/services/interactionCore/domainAdapter.js`.
- The exploration compatibility adapter now lives in `backend/src/services/interactionCore/explorationAdapter.js`; it mirrors existing Stage 6B.9 fields and is not wired into runtime behavior yet.
- The dialogue adapter skeleton now lives in `backend/src/services/dialogueFocusCommit/dialogueFocusCommitTypes.js` and `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`.
- This layer is intentionally pure normalization/mapping code. It does not add routes, migrations, persistence, schema validation, runtime resolution, or UI behavior.

Build 3 implementation note:

- Dialogue persistence now lives behind `db/init/033-stage-dialogue-focus-commit-persistence.sql`.
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitPersistenceSchema.js` follows the existing ensure-helper convention and depends on the Stage 6B.9 exploration schema so shared action-window, result, and free-focus tables exist first.
- `backend/src/db/queries/dialogueFocusCommit.js` exports table names and read-only query constants for compact completed dialogue records and player-facing transcript turns.
- This build still does not wire runtime services, endpoints, scene loading, relationship logic, transcript writes, annotation review, or UI behavior.

Build 4 implementation note:

- The MVP runtime service now lives in `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js`.
- It uses Build 3 persistence tables for active dialogue scene state, Clarifying Question records, Committed Social Move records, and generic fallback usage.
- It exposes authenticated player routes through the existing `backend/src/routes/play.js` router rather than a new route framework.
- The service currently loads authored dialogue scenes from a server-side in-memory registry used by tests and future content-import wiring. This is intentional for the MVP runtime slice: clients cannot submit arbitrary dialogue JSON to drive behavior.
- Player-facing runtime responses are composed from validated authored content plus persisted state; debug-only preview mapping and hidden check details stay out of API responses.

Build 5 implementation note:

- Dialogue relationship/social state runtime now lives in `backend/src/services/dialogueFocusCommit/dialogueRelationshipStateService.js`.
- The service is wired into `dialogueFocusCommitRuntimeService.js` for dialogue entry/load initialization, availability reads, Clarifying Question writes, Committed Social Move writes, and exit writes.
- Persistent NPC state is stored in `dnd5e_dialogue_npc_relationship_state`; dialogue scene-local posture/state remains in `dnd5e_dialogue_scene_state`.
- The service resolves authored targets such as `npc:elin_harrow` to canonical `dnd5e_npc` rows where possible, including underscore/hyphen key variants.
- Reads, shorthand resolution, availability checks, and writes create `dnd5e_dialogue_relationship_audit_record` rows. Player-facing API responses receive only authored/perceived summaries, not raw state values or audit payloads.
- Core reusable defaults currently include persistent `trust`, `respect`, and `hostility`, plus scene-local `openness`, `fear`, `pressure`, and `stability`; authored scene/database definitions override these defaults.

Build 6 implementation note:

- Dialogue transcript, archive, summary, and search services now live in `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`.
- Player-facing archive routes expose compact completed records and transcript turns while keeping GM/dev transcript metadata behind backend-only service methods.
- Search indexing stores player-facing text only.

Build 8 implementation note:

- Authorized GM/dev diagnostics now live in `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js` and `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`.
- The debug workspace reads scene state, availability, preview mapping, relationship/social state, transcript data, audit records, validation output, annotation/correction chain references, and a Build 10 test-path shell.
- It is capability-gated through the existing dev route and must not be reused as a player-facing read model.

Build 9 implementation note:

- Annotation/correction lifecycle runtime now lives in `backend/src/services/dialogueFocusCommit/dialogueAnnotationCorrectionService.js`.
- Lifecycle records remain linked records attached to target surfaces; completed dialogue summaries and transcript turns are not rewritten.
- The service enforces source safety before generated/suggested or player-facing records can be created or approved.
- Player-facing archive detail responses receive only active approved player-facing records.
- GM/dev debug responses receive full chain history, including pending, rejected, suppressed, superseded, and retracted records.
- Active player-facing lifecycle changes refresh the player dialogue search index so approved corrections/annotations are discoverable without exposing hidden sources.

Build 10 implementation note:

- Dialogue path testing now lives in `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js`.
- The harness is exposed through `POST /api/dev/dialogue-path-test/run` and requires the existing GM/dev `can_advance_beats` capability.
- It drives real runtime services for entry, Clarifying Questions, previews, submissions, fallback use, exits, archive finalization, and lifecycle probes.
- Forced check outcomes are passed through the existing runtime `forced_outcome` hooks rather than a parallel dice/check engine.
- Every runtime step captures player-facing and GM/dev snapshots, relationship/social state diffs, transcript turn effects, completed-record effects, validation, and reachability/stuck-state findings.
- Non-validation modes require explicit active-context mutation acknowledgement. Build 11 fixtures can add a more isolated content-regression context if needed.
- The Flutter GM/dev Test Paths panel now runs harness modes and displays ordered steps, findings, relationship diff counts, transcript effects, final status, and exportable JSON.

- Dialogue transcript/completed-record/search behavior now lives in `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js`.
- The existing dialogue runtime appends transcript turns for conversation surface, Clarifying Questions, Committed Social Moves, exits, and final system summaries.
- Finalization creates compact `dnd5e_completed_dialogue_record` rows that link to the transcript and aggregate knowledge, canonical output, and relationship audit links without embedding debug/audit chains.
- Summary selection prefers authored compact summaries, then falls back to deterministic conservative summaries assembled only from player-facing runtime records.
- Player archive/search endpoints live under the existing play router and return player-safe read models only. GM/dev archive access remains backend-only through an explicit service boundary.
- NPC/profile recap support is a backend hook stored in player-facing completed-record metadata when authored; no UI is implemented yet.

Build 8 implementation note:

- GM/dev dialogue debugging now lives in `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js`.
- The authorized route is `GET /api/dev/dialogue-debug` in the existing `backend/src/routes/devBeat.js` dev router.
- Authorization reuses the established `can_advance_beats` capability used by campaign diagnostics and dev beat advance.
- The debug read model is intentionally DB-backed and separate from player-facing dialogue routes. It aggregates runtime scene state, authored availability when the scene is registered, preview mapping internals, relationship/social state rows, relationship audit rows, transcript turns, completed record links, validation groups, annotation/correction placeholders, and test-path shell checks.
- Flutter renders the workspace at `/play/dev/dialogue-debug` in `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`.
- Player-facing `DialogueSceneView` remains separate and does not receive the debug payload.

Frontend:

```text
apps/player_app/lib/dialogue/
  dialogue_scene_page.dart
  conversation_surface_card.dart
  passive_social_insight_card.dart
  clarifying_question_cards.dart
  social_move_composer.dart
  dialogue_exit_list.dart
  transcript_reference.dart
  dialogue_dev_workspace.dart

apps/player_app/lib/api/
  dialogue_models.dart
  dialogue_api.dart
```

Tests:

```text
backend/test/dialogue-focus-commit-validation.test.js
backend/test/dialogue-focus-commit-runtime.test.js
backend/test/dialogue-relationship-state.test.js
backend/test/dialogue-transcript-records.test.js
apps/player_app/test/dialogue_models_test.dart
apps/player_app/test/dialogue_ui_test.dart
```

## Compatibility Strategy

- Existing dialogue graphs continue to work.
- New dialogue scene documents can opt into `dialogue_focus_commit`.
- Existing graph nodes/options can be referenced from new adapter content where useful.
- Content importer can initially store new JSON in metadata or future tables after migration.
- Runtime should support read-only load/validation before write behavior is enabled.
