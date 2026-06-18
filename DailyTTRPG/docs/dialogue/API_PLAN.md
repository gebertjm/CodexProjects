# Dialogue API Plan

This document proposes backend service and API boundaries. Do not implement endpoints during the planning-only task.

## Service Boundary Overview

Potential services:

- `DialogueFocusCommitSceneService`
- `ConversationSurfaceService`
- `PassiveSocialInsightService`
- `ClarifyingQuestionService`
- `CommittedSocialMovePreviewService`
- `CommittedSocialMoveResolutionService`
- `DialogueExitService`
- `RelationshipStateService`
- `DialogueTranscriptService`
- `CompletedDialogueRecordService`
- `DialogueSummaryService`
- `AnnotationCorrectionService`
- `DialogueSearchService`

Routes can be grouped under:

- Player: `/api/play/dialogue/...`
- Dev/GM: `/api/dev/dialogue/...`

All player routes require Firebase auth and active character/campaign access. Dev/GM routes require server-side capabilities.

## Loading Dialogue Scenes

`GET /api/play/dialogue/current`

Purpose: load the active dialogue scene for the active character/campaign.

Response sketch:

```json
{
  "state": "active",
  "campaign": {},
  "active_character": {},
  "dialogue_scene": {
    "dialogue_scene_id": "elin-memory-dialogue",
    "title": "Elin's Broken Account",
    "scene_type": "dialogue",
    "status": "active"
  },
  "conversation_surface": {
    "paragraphs": []
  },
  "latest_development": null,
  "passive_social_insight": [],
  "clarifying_questions": [],
  "committed_social_moves": [],
  "dialogue_exits": [],
  "transcript_reference": {},
  "action_status": {}
}
```

Behavior:

- Resolve active dialogue session or active dialogue scene.
- Filter all content server-side.
- Persist passive insight first results where needed.
- Do not expose hidden failed checks.
- Include safe current relationship cues only if authored/perceived.

## Resolving Clarifying Questions

`POST /api/play/dialogue/clarifying-question/resolve`

Request:

```json
{
  "dialogue_scene_id": "elin-memory-dialogue",
  "question_id": "ask_what_she_remembers_first"
}
```

Response:

```json
{
  "clarifying_question_result": {
    "question_id": "ask_what_she_remembers_first",
    "status": "current_viewed",
    "mechanics_label": null,
    "text": "She remembers the sound first...",
    "knowledge_grants_applied": [],
    "canonical_event_id": null
  },
  "transcript_delta": {},
  "knowledge_delta": null,
  "relationship_delta": null,
  "dialogue_state_version": 4
}
```

Behavior:

- Return persisted result if already resolved.
- Resolve checks through shared check engine.
- Apply authored knowledge/state changes only.
- Do not consume the dialogue beat/window.
- Do not create completed dialogue record.

## Previewing Committed Social Moves

`POST /api/play/dialogue/social-move/preview`

Request:

```json
{
  "dialogue_scene_id": "elin-memory-dialogue",
  "raw_text": "I gently press her about the shrine bell.",
  "selected_move_id": "press_for_shrine_detail",
  "selected_target_id": "elin-harrow",
  "continue_clarifying_question_id": null
}
```

Resolved response:

```json
{
  "status": "resolved",
  "raw_text": "I gently press her about the shrine bell.",
  "candidate": {
    "move_id": "press_for_shrine_detail",
    "label": "Press gently about the shrine",
    "target_label": "Elin",
    "social_move_type": "press",
    "check_preview": {
      "has_check": true,
      "label": "Persuasion check",
      "visibility": "visible"
    }
  },
  "validation": {
    "can_submit": true
  }
}
```

Overlap response:

```json
{
  "status": "clarifying_question_overlap",
  "message": "This has a clarifying question available...",
  "overlap": {
    "question_id": "ask_what_she_remembers_first",
    "label": "What do you remember first?",
    "check_resolution": "advantage"
  },
  "options": [
    "ask_clarifying_question",
    "continue_as_committed_social_move",
    "edit"
  ],
  "validation": {
    "can_submit": false
  }
}
```

Behavior:

- Revalidate visibility and availability.
- Support natural text, selected move, selected target, or hybrid.
- Return clarification when ambiguous.
- Return hard invalid when unsafe or unavailable.
- Include no hidden state or GM notes.

## Submitting/Resolving Committed Social Moves

`POST /api/play/dialogue/social-move/submit`

Request:

```json
{
  "dialogue_scene_id": "elin-memory-dialogue",
  "raw_text": "I gently press her about the shrine bell.",
  "selected_move_id": "press_for_shrine_detail",
  "continue_clarifying_question_id": null,
  "preview_confirmation_token": "optional-future"
}
```

Response:

```json
{
  "status": "submitted",
  "social_move_record": {},
  "action_status": {},
  "current_dialogue": {}
}
```

MVP options:

- Submit then wait for existing beat resolution.
- Or submit/resolve immediately only if dialogue config explicitly supports immediate dialogue resolution later.

For current planning, keep async beat model consistent with web actions.

## Exits And Transitions

`POST /api/play/dialogue/exit`

Request:

```json
{
  "dialogue_scene_id": "elin-memory-dialogue",
  "exit_id": "return_to_inn_common_room"
}
```

## Annotation / Correction Lifecycle

Build 9 adds a GM/dev-only lifecycle API under the existing dev router:

- `POST /api/dev/dialogue-lifecycle/chain`
- `POST /api/dev/dialogue-lifecycle/annotation`
- `POST /api/dev/dialogue-lifecycle/correction`
- `POST /api/dev/dialogue-lifecycle/review`

All lifecycle write routes require Firebase auth plus the existing `can_advance_beats` dev capability. Normal player APIs cannot create, review, suppress, retract, or inspect hidden lifecycle records.

Lifecycle write behavior:

- Chains attach to explicit target surfaces such as `completed_dialogue_record`, `npc`, `knowledge_entry`, `campaign_recap`, or `affected_surface`.
- Annotation and correction records preserve original text, approved/active text, review status, lifecycle status, reviewer, reasons, source links, affected surfaces, and player-facing flags.
- Review actions currently support approve, approve-with-edits, reject, suppress, retract, and replace/supersede.
- Suppression requires an explicit `suppression_scope`.
- Retraction requires a `retraction_reason`.
- Replacement creates a linked follow-up record and marks the older visible record superseded rather than deleting or rewriting it.

Source safety:

- Generated/suggested or player-facing records may use only player-safe source types such as completed summaries, player-facing transcript turns, committed social move results, canonical Clarifying Questions, knowledge entries, campaign history, relationship summaries, and active player-facing lifecycle records.
- Hidden relationship state, raw audit logs, debug route checks, secret requirements, preview confidence, hidden availability checks, GM/dev transcript metadata, and non-player-facing flags are rejected for generated/player-facing lifecycle text.

Archive/read behavior:

- `GET /api/play/dialogue/archive/:record_id` includes only active approved player-facing annotation/correction chains.
- Pending, rejected, suppressed, retracted, inactive, and GM/dev-only records are omitted from player-facing archive responses.
- `GET /api/dev/dialogue-debug` includes full lifecycle chain history for authorized GM/dev users.
- Completed dialogue summaries are preserved as originally stored; lifecycle records attach as linked records and refresh player-facing search text when active player-facing understanding changes.

## Dialogue Path Test Harness

Build 10 adds a GM/dev-only simulation endpoint:

`POST /api/dev/dialogue-path-test/run`

Request sketch:

```json
{
  "dialogue_scene_id": "dialogue_elin_memory_focus_commit",
  "mode": "happy_path",
  "allow_active_runtime_mutation": true,
  "steps": [
    { "id": "enter", "type": "enter_dialogue" },
    {
      "id": "ask",
      "type": "ask_clarifying_question",
      "question_id": "clarify_first_memory",
      "forced_outcome": "success"
    },
    {
      "id": "submit",
      "type": "submit_committed_social_move",
      "move_id": "move_press_shrine_gently",
      "submitted_text": "I press gently about the shrine.",
      "forced_outcome": "success"
    }
  ]
}
```

Supported step types:

- `enter_dialogue`
- `validation_only`
- `ask_clarifying_question`
- `ask_all_clarifying_questions`
- `preview_committed_social_move`
- `preview_all_committed_social_moves`
- `submit_committed_social_move`
- `use_generic_fallback`
- `resolve_exit`
- `simulate_lifecycle_probe`
- Assertion/marker shell steps: `assert_state`, `assert_availability`, `assert_visibility`, `assert_transition`, `finalize_dialogue`, `force_check_outcome`, `apply_tone_variant`

Built-in modes:

- `happy_path`
- `failure_path`
- `fallback_path`
- `minimal_interaction_path`
- `max_clarifying_question_path`
- `relationship_state_edge_case`
- `exit_transition_path`
- `validation_only`
- `all_authored_branches_smoke`

Response includes:

- `test_run_id`
- path mode/name
- validation result
- ordered step results
- player-facing snapshots after each step
- GM/dev debug snapshots after each step
- relationship/social state diffs
- transcript/completed-record effects
- lifecycle probe effects when requested
- final status/transition
- hard errors, warnings, and debug notices

The harness calls real runtime services instead of a fake dialogue engine. Runtime modes intentionally require `allow_active_runtime_mutation=true`; `validation_only` does not. This keeps active test-context mutation explicit and prevents silent alteration of real play state.

Response:

```json
{
  "status": "exited",
  "route": "/play/campaign/scene",
  "current_scene": {}
}
```

Behavior:

- Revalidate exit availability.
- Apply authored exit effects.
- Complete transcript/record if the exit ends dialogue.
- Do not reveal unavailable exits.

## Relationship State Reads/Writes

Player read:

`GET /api/play/dialogue/relationship-state?dialogue_scene_id=...`

Returns only safe perceived cues.

Dev/GM read:

`GET /api/dev/dialogue/relationship-state?campaign_instance_id=...&character_id=...`

Returns full authorized state and audit references.

Runtime write should not be a public player endpoint. Writes happen through social move resolution, clarifying question authored effects, or dev/GM tools.

## Transcript And Completed Record Creation

Player:

- `GET /api/play/dialogue/transcript/current`
- `GET /api/play/dialogue/completed-records`
- `GET /api/play/dialogue/completed-records/:id`

Dev/GM:

- `GET /api/dev/dialogue/transcripts/:id`
- `GET /api/dev/dialogue/completed-records/:id/audit`

Behavior:

- Player views safe transcript turns only.
- Completed records are stable player-facing read models.
- GM/dev audit can link to hidden/debug source records by capability.

## Summary Creation

Initial summary service should be deterministic.

Input sources:

- Committed social move result summaries.
- Safe NPC responses.
- Authored knowledge grants.
- Visible relationship changes.
- Dialogue exit summaries.

Do not create an endpoint that asks a model to invent summaries in MVP.

## Annotation/Correction Lifecycle

Dev/GM only:

- `POST /api/dev/dialogue/annotations`
- `PATCH /api/dev/dialogue/annotations/:id`
- `POST /api/dev/dialogue/corrections`
- `PATCH /api/dev/dialogue/corrections/:id`
- `POST /api/dev/dialogue/corrections/:id/publish`

Behavior:

- Server-side capability required.
- Preserve chain provenance.
- Publishing a correction must not silently rewrite historical player records.

## Search/Reference

Player:

- `GET /api/play/dialogue/search?q=...`

Dev/GM:

- `GET /api/dev/dialogue/search?q=...&visibility=gm`

Behavior:

- Player search only sees player-safe completed records and transcript summaries.
- GM/dev search may include annotations/corrections by capability.

## Build 4 MVP Runtime Routes

Build 4 adds the first authenticated player-facing backend slice in the existing play router:

- `GET /api/play/dialogue/current`
- `POST /api/play/dialogue/clarifying-question/resolve`
- `POST /api/play/dialogue/social-move/preview`
- `POST /api/play/dialogue/social-move/submit`
- `POST /api/play/dialogue/exit`

Current constraints:

- Routes load server-registered authored dialogue scenes by `dialogue_scene_id`, `slug`, or equivalent key.
- Routes do not accept client-authored scene JSON.
- Player responses omit exact DCs, preview debug payloads, matched confidence, and GM/dev-only fields.
- Clarifying Questions persist asked/attempted/succeeded/failed records and do not spend the dialogue beat.
- Committed Social Moves persist result records and increment the committed move count.
- Generic fallback is only available when authored and constrained, with usage tracked separately.
- Exits resolve only through authored exit IDs and explicit transition targets.

Deferred:

- Content importer backed dialogue scene registry.
- Transcript archive writes and completed record finalization.
- Summary/search APIs.
- GM/dev diagnostics and annotation/correction workflow.

## Build 5 Relationship/Social State Runtime

Build 5 wires relationship/social state into the Build 4 player dialogue routes without adding new public endpoints.

Runtime behavior now supported:

- Dialogue scene load initializes persistent NPC relationship state and dialogue scene-local posture/state separately.
- Clarifying Question availability and Committed Social Move availability can read authored relationship/social state conditions.
- Clarifying Question results, Committed Social Move branches, and dialogue exits can apply authored relationship/social state writes.
- Writes support explicit scopes, direct sets, ladder/numeric deltas, clamping for ladder values, and audit records.
- Player responses can include authored/perceived `relationship_updates`, but they do not expose raw field values, old/new audit JSON, debug rows, or hidden state.

Deferred:

- Dedicated GM/dev relationship inspector endpoints.
- NPC profile recap/player relationship summary UI.
- Completed record relationship summary finalization.
- Importer-backed registration of reusable relationship definitions.

## Build 6 Transcript, Archive, Summary, And Search Runtime

Build 6 adds durable recordkeeping around the existing player dialogue routes.

New player-facing routes:

- `GET /api/play/dialogue/archive`
- `GET /api/play/dialogue/archive/:record_id`
- `GET /api/play/dialogue/search?q=...`

Runtime behavior now supported:

- Dialogue scene load creates or reuses a transcript and records the initial `npc_surface` turn once.
- Clarifying Question resolution records `clarifying_question` and `clarifying_answer` turns, even when the question is non-canonical and should not enter campaign history.
- Committed Social Move submission records `committed_social_move` and `social_move_result` turns.
- Dialogue exit records an `exit` turn, finalizes a compact completed dialogue record, records a `system_summary` turn, and indexes player-facing search text.
- Authored compact summaries are preferred. If no authored summary exists, `dialogueArchiveService` assembles a conservative deterministic summary from player-facing transcript/result/exit text only.
- Player archive and search routes return only player-facing records and transcript turns.

Backend-only boundary:

- `getGmDevDialogueArchiveRecord(recordId)` exists as an explicit service method for future authorized GM/dev routes.
- No GM/dev archive route or UI is exposed in this build.

Deferred:

- Player archive UI.
- GM/dev transcript/debug workspace.
- Annotation/correction lifecycle runtime.
- Rich transcript search ranking or full-text search tuning.
- Importer-backed profile recap publishing.

## Build 7 Player UI API Usage

Build 7 primarily consumes the existing Build 4-6 routes through `DialogueApi` in `apps/player_app/lib/api/api_client.dart`. It also adds one small player-safe current transcript read endpoint so the active dialogue transcript can expand before completion.

Used routes:

- `GET /api/play/dialogue/current`
- `POST /api/play/dialogue/clarifying-question/resolve`
- `POST /api/play/dialogue/social-move/preview`
- `POST /api/play/dialogue/social-move/submit`
- `POST /api/play/dialogue/exit`
- `GET /api/play/dialogue/transcript/current`
- `GET /api/play/dialogue/archive/:record_id`

Player UI route:

- `/play/campaign/dialogue`

Deferred API work:

- GM/dev dialogue archive/debug endpoints.
- Annotation/correction endpoints.

## Build 8 GM/Dev Debug Workspace API

Build 8 adds one authorized GM/dev endpoint under the existing Firebase-authenticated dev router:

- `GET /api/dev/dialogue-debug`

Optional query parameters:

- `dialogue_scene_id`
- `campaign_instance_id`
- `completed_dialogue_record_id`

The endpoint is implemented by `getDialogueDebugWorkspaceForAccount` in `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js` and uses the existing `can_advance_beats` capability as the GM/dev guard. Normal player accounts receive `403`.

Returned panels include:

- `scene_state`
- `availability`
- `preview_mapping`
- `relationship_state`
- `transcript`
- `completed_record`
- `annotation_correction_chains`
- `audit_timeline`
- `validation`
- `test_paths`

The payload intentionally includes GM/dev-only fields such as preview confidence, hidden DCs, raw runtime state, relationship state values, and audit rows. Player-facing `/api/play/dialogue/*` routes continue to exclude this debug payload.
