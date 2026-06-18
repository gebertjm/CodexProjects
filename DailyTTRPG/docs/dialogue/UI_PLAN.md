# Dialogue UI Plan

This document proposes player and GM/dev UI layout. It is planning only.

## Player UI Goals

The dialogue UI should feel like an active conversation, not a graph inspector.

It should:

- Lead with the current conversation surface.
- Show passive social insight only when visible.
- Let players ask compact clarifying questions without spending the beat.
- Keep one committed social move as the meaningful beat action.
- Keep transcript/reference/archive below the active conversation.
- Avoid exposing hidden state, raw IDs, debug payloads, or GM notes.

## Player Layout

Recommended order:

1. Current conversation surface.
2. Latest Development, when present.
3. Passive Social Insight, when visible.
4. Clarifying Questions.
5. Committed social move composer and authored move chips.
6. Exits.
7. Transcript/reference/archive collapsed below.

### Current Conversation Surface

Component idea: `ConversationSurfaceCard`

Shows:

- Conversation title.
- Participant labels filtered through character knowledge.
- Current NPC/player-facing narration.
- Current tension/context paragraphs.

Does not show:

- Hidden motives.
- True names before known.
- GM notes.
- Raw graph node IDs.

### Latest Development

Component idea: reuse/result-card pattern from scene Latest Development.

Shows:

- Latest committed social move result if it materially changed the conversation.
- Safe relationship/knowledge/objective changes.

Should not block the next action.

### Passive Social Insight

Component idea: `PassiveSocialInsightStrip`

Shows:

- Visible successful insights.
- Narrative-only insights as prose.
- Visible check labels only when visibility allows.

Does not show:

- Failed hidden checks.
- Failed success-only checks.
- Secret DCs under hidden/narrative-only visibility.

### Clarifying Questions

Component idea: `ClarifyingQuestionList`

Behavior:

- Compact expandable cards.
- Resolved on first open.
- Viewed marker after resolution.
- Reopen without reroll.
- Disabled if unresolved and a committed move has been submitted.
- Resolved questions remain reviewable.

Labels should be conversational:

- "What do you remember first?"
- "Watch how she reacts to the word bandits"
- "Ask what she means by the bell"

### Committed Social Move Composer

Component idea: `CommittedSocialMoveComposer`

Inputs:

- Natural text primary.
- Optional move chips.
- Optional target/participant chips.

Move chips are authored and domain-specific:

- Reassure her.
- Press gently.
- Confront the contradiction.
- Offer help.
- Reveal evidence.

Preview panel states:

- Resolved.
- Needs clarification.
- Clarifying Question overlap.
- Invalid.
- Multi-intent warning.

Overlap panel buttons:

- Ask Clarifying Question.
- Continue as Committed Social Move.
- Edit.

### Exits

Component idea: `DialogueExitList`

Shows available exits only:

- Return to the common room.
- End the conversation.
- Step outside.

Unavailable exits are omitted unless dev/GM diagnostics are visible.

### Transcript/Reference/Archive

Component idea: `DialogueTranscriptReference`

Collapsed by default.

Shows:

- Recent safe turns.
- Clarifying question results.
- Committed move summaries.
- Completed record link after dialogue ends.

Does not show full debug/audit by default.

## GM/Dev Debug Workspace

Implemented Build 8 route:

```text
/play/dev/dialogue-debug
```

Server-side capability required: the route calls `/api/dev/dialogue-debug`, which uses the existing `can_advance_beats` GM/dev capability. The campaign diagnostics page links to the dialogue debug workspace, but the player-facing dialogue UI remains separate.

### Scene State Panel

Shows:

- Dialogue scene key.
- Session ID.
- Current surface.
- Dialogue state version.
- Current graph node/session bridge data if applicable.

### Availability Panel

Shows:

- Visible/hidden Clarifying Questions.
- Visible/hidden Committed Social Moves.
- Exit availability.
- Unmet requirements.
- Relationship state dependencies.

### Preview Mapping Panel

Shows:

- Natural input.
- Candidate moves.
- Alias/intent matches.
- Overlap mapping.
- Rejection reasons.

### Relationship/Social State Panel

Shows:

- Registered relationship fields.
- Current values.
- Last write source.
- Visibility settings.
- Audit links.

### Transcript Panel

Shows:

- Current transcript.
- Turn types.
- Source records.
- Player-visible versus GM-only filters.

### Annotation/Correction Chains Panel

Shows:

- Open annotations.
- Linked corrections.
- Draft/review/published status.
- Affected content keys.

### Audit Timeline Panel

Shows:

- Social moves.
- Relationship writes.
- Knowledge grants.
- Dialogue exits.
- Completed records.
- Canonical event references.

### Validation Panel

Shows:

- Hard errors.
- Warnings.
- Debug notices.
- Content keys and file refs when available.

### Test Paths Panel

Shows:

- Deterministic test path through a dialogue fixture.
- Required knowledge setup.
- Expected relationship state changes.
- Expected completed record.

Build 8 implementation:

```text
apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart
```

Components currently exposed:

- `DialogueDebugWorkspacePage`
- `DialogueDebugWorkspaceView`
- `SceneStatePanel`
- `AvailabilityPanel`
- `PreviewMappingPanel`
- `RelationshipStatePanel`
- `TranscriptPanel`
- `AnnotationCorrectionChainPanel`
- `AuditTimelinePanel`
- `ValidationPanel`
- `TestPathsPanel`

Supported now:

- Active dialogue scene debug view from the authorized backend read model.
- Scene state, availability, preview mapping, relationship/social state, transcript, audit, validation, and test-path shell panels.
- Annotation/correction chain read-only panel connected to Build 9 lifecycle records, including full GM/dev statuses, reasons, current player-facing understanding, and replacement/retraction history.
- Simple linked selection across interactions, transcript turns, relationship fields, and audit records.

Deferred:

- Annotation/correction workflow action buttons in the Flutter GM/dev panel.
- GM/dev destructive repair tools.

Build 10 update:

- `TestPathsPanel` now shows available harness modes from the GM/dev debug read model.
- The panel can run `POST /api/dev/dialogue-path-test/run` through `PlayerDashboardApi.runDialoguePathTest`.
- Results show status, mode, final status, ordered steps, relationship diff counts, transcript turn effects, grouped finding counts, and expandable export JSON.
- Runtime simulations require explicit active-context mutation acknowledgement in the API client call.

## Build 7 Frontend Components

Implemented Flutter structure:

```text
apps/player_app/lib/campaign/dialogue_scene_page.dart
apps/player_app/lib/api/models.dart
apps/player_app/lib/api/api_client.dart
```

Route:

```text
/play/campaign/dialogue
```

Components currently exposed from `dialogue_scene_page.dart`:

- `DialogueScenePage`
- `DialogueSceneViewBody`
- `ConversationSurfaceCard`
- `LatestDialogueDevelopmentCard`
- `PassiveSocialInsightNote`
- `ClarifyingQuestionList`
- `ClarifyingQuestionCard`
- `CommittedSocialMoveComposer`
- `SocialMovePreviewPanel`
- `DialogueExitPanel`
- `DialogueTranscriptArchive`

Supported now:

- Narrative-first dialogue layout.
- Clarifying Questions that resolve immediately, show check type, hide DC by default, and keep viewed results reopenable.
- Committed Social Move composer with authored move chips, freeform text, preview, no-check display, assistance notes, overlap choices, and submit.
- Authored dialogue exits.
- Collapsed transcript/archive section with active transcript loading and completed-record expansion when available.

Deferred:

- GM/dev dialogue workspace.
- Annotation/correction UI.
- NPC profile recap UI.
