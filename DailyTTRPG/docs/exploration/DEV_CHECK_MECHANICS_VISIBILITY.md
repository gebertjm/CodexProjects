# Stage 6B.11.0: Exploration Dev Check Mechanics Visibility

Status: planning and audit only.

This document plans Stage 6B.11, an authorized GM/dev mechanics inspector for exploration Surface / Focus / Commit scenes. No runtime code, migrations, UI, player-facing behavior, or Greyvale content behavior is changed by this document.

## 1. Purpose

Stage 6B.11 should make exploration checks explainable to authorized GM/dev users without changing the clean player experience.

Players should continue to see:

- Rich scene narration.
- Passive discoveries only when player-safe and visible.
- Closer Looks / Free Focus cards with authored visible mechanics only when visibility allows.
- One meaningful beat action preview and submission.
- Latest Development, history, and knowledge entries only from player-safe read models.

GM/dev users should be able to inspect:

- What checks existed.
- Why they were available, hidden, locked, or expired.
- What DC, roll mode, modifiers, result band, state writes, knowledge grants, history entries, and transitions were involved.
- What was player-facing versus hidden/debug-only.

The recommended implementation mirrors the dialogue debug workspace pattern: add a dedicated authorized read model and inspector UI rather than expanding normal player scene payloads.

## 2. Current Exploration Architecture Audit

### Core interaction and shared primitives

- `backend/src/services/interactionCore/primitiveTypes.js` defines shared domains and primitives, including `surface_focus_commit`, `dialogue_focus_commit`, `surface`, `passive_context`, `free_focus`, `committed_action`, `preview`, `resolution`, `state_changes`, `outputs`, and `transitions`.
- `backend/src/services/interactionCore/explorationAdapter.js` maps exploration content fields to shared primitives:
  - `automatic_observations` -> `surface`.
  - `passive_discoveries` -> `passive_context`.
  - `free_focus` -> `free_focus`.
  - `beat_actions` -> `committed_action`.
  - `transitions`, `exits`, `scene_transitions` -> `transitions`.
- `backend/src/services/freeFocusService.js` also provides `getExplorationInteractionDefinitions()`, which normalizes authored Surface / Focus / Commit fields from scene overlays or scene metadata.

### Scene Surface and narration

- `backend/src/services/characterSceneViewService.js` assembles the player scene view through `getCharacterSceneView()`.
- `backend/src/services/sceneNarrationComposer.js` composes the visible scene narration through `composeSceneNarration()`.
- `freeFocusService.resolveSurfaceInteractionsForNarration()` resolves automatic observations and passive discoveries before narration composition.
- `sceneNarrationComposer.composeSceneNarration()` receives:
  - `automaticObservations`.
  - `passiveDiscoveries`.
  - `environment`.
  - `visibleNpcs`.
  - `visibleAffordances`.
  - `objective`.
  - `sceneResultFeed`.
- `docs/web-exploration-surface-focus-commit.md` documents that exploration narration should include automatic observations, visible passive discoveries, and subtle cues without becoming menu-like.

Current visibility note:

- Normal `GET /api/play/current-scene` output is player-safe by default.
- `include_debug=true` is honored only outside production and only for accounts with `account.can_advance_beats = TRUE` in `backend/src/routes/play.js`.
- `include_mechanics=true` can include safe mechanics such as environment modifiers and action-window context, but it is not a full GM/dev mechanics inspector.

### Automatic Observation

- Authored in scene JSON under `automatic_observations`.
- Validated in `backend/src/content/contentValidation.js` by `validateSurfaceFocusCommit()`.
- Composed by `freeFocusService.resolveSurfaceInteractionsForNarration()`.
- Persisted only when authored `knowledge_grants` or `state_changes` exist, via `dnd5e_character_exploration_interaction_result`.
- Canonical events/history are created only when knowledge/state changes apply.

### Passive Discovery

- Authored in scene JSON under `passive_discoveries`.
- Defaults check visibility to `success_only` in `freeFocusService.checkDefinition()` and validation.
- Resolved during `getCharacterSceneView()` via `resolveSurfaceInteractionsForNarration()`.
- Persisted with `resolution_mode = 'passive_discovery'` in `dnd5e_character_exploration_interaction_result`.
- Failed success-only results are stored but omitted from player-facing narration.

Current limitation:

- Passive discovery check results are persisted, including raw check JSON, but there is no dedicated GM/dev endpoint to explain why a passive discovery was hidden, failed silently, or became visible.

### Free Focus / Closer Look

- Authored in scene JSON under `free_focus`.
- Backend service: `backend/src/services/freeFocusService.js`.
- Dedicated player endpoint: `POST /api/play/free-focus/resolve` in `backend/src/routes/play.js`.
- Persistence table: `dnd5e_character_exploration_interaction_result` from `db/init/032-stage-6b9-exploration-interactions.sql`.
- Player read model field: `scene_reference.closer_looks`.
- Flutter models:
  - `SceneReferenceCloserLook`.
  - `FreeFocusCheckPreview`.
  - `FreeFocusResult`.
  - `FreeFocusResolveResponse`.
- Flutter UI:
  - `_SceneReferenceSection`.
  - `_CloserLooksList`.
  - `_CloserLookTile`.

Current behavior:

- First open resolves and persists the result.
- Reopening returns the same result.
- Results include player-safe `mechanics_label`, narration, summary, public check fields, knowledge grants applied, state changes applied, and canonical event id when allowed.
- Check visibility supports `visible`, `hidden`, `success_only`, and `narrative_only`.
- Unopened cards are disabled after a submitted action; viewed cards remain reopenable.
- Stale/expired states are present at the card/read-model level.

Current limitation:

- The player result intentionally omits hidden DCs, hidden failures, raw modifiers, and deeper audit data.
- The backend stores enough for current Free Focus explainability in `check_result_json`, but there is no linked GM/dev UI to inspect the authored definition, check resolution, result branch, knowledge/state outputs, and visibility filtering together.

### Beat Action, preview, and submission

- Backend preview and submit service: `backend/src/services/actionComposerService.js`.
- Player endpoints:
  - `POST /api/play/action/preview`.
  - `POST /api/play/action/submit`.
- Submission persistence: `backend/src/services/webActionSubmissionService.js`.
- Submission table is created by `db/init/029-stage-6b5-action-composer.sql`.
- Action-window model is created by `db/init/030-stage-6b5-beat-window-model.sql`.
- Flutter UI:
  - `_ActionComposer`.
  - `_ActionPreviewPanel`.
  - target chips from `SceneActionComposer` / `ActionTargetChip`.

Current behavior:

- Preview maps typed text and selected target chips to visible affordances.
- Preview detects shallow overlap with available Closer Looks through `freeFocusService.findFreeFocusOverlap()`.
- Overlap returns `status: 'free_focus_overlap'` with options:
  - `open_closer_look`.
  - `continue_as_beat_action`.
  - `edit_action`.
- Continuing as beat action passes `continue_free_focus_interaction_id`.
- Submitted action payload can include `committed_followup` metadata.

Current limitation:

- Preview mapping exposes only player-safe interpretation. Debug fields such as token match source, alias source, all candidate candidates, rejected candidates, confidence, or hidden requirements are not aggregated in a dev read model.

### Action window lifecycle and beat resolution

- Action window timing: `backend/src/services/beatWindowTimingService.js`.
- Dev/GM advance endpoint: `POST /api/dev/advance-beat` in `backend/src/routes/devBeat.js`.
- Advance service: `backend/src/services/beatAdvanceService.js`.
- Runtime action facade: `backend/src/services/adventureRuntimeService.js`.
- Action-window to runtime input mapping: `beatAdvanceService.actionInputFromSubmission()`.
- Committed Free Focus follow-up handling:
  - `beatAdvanceService.withCommittedFollowup()`.
  - `adventureRuntimeService.resolveFreeFocusFollowup()`.
  - `adventureRuntimeService.attachCommittedFollowupResult()`.

Current behavior:

- Dev/GM advance is guarded by `account.can_advance_beats`.
- Submitted web actions are resolved through the real runtime when the action window advances.
- Free Focus follow-ups can resolve even when there is no matching runtime `action_key`.
- Player beat results are recorded after beat resolution.

Current limitation:

- Beat resolution can explain safe mechanics to the player in a compact way, but it does not persist a full check-debug trace for every committed exploration action.

### Checks and result bands

- Shared skill check engine: `backend/src/engine/narrative/narrativeEngine.js`.
- Free Focus check resolution: `freeFocusService.resolveCheck()`.
- Result band service: `backend/src/services/resultBandService.js`.
- Interaction result mutation service: `backend/src/services/worldStateMutationService.js`.
- Authored beat-action interactions: `content/campaigns/shadows_grey_road/interactions/greyvale-interactions.json`.

Currently available check fields from `resolveNarrativeSkillCheck()`:

- `skill`.
- `difficulty_class`.
- `roll_value`.
- `ability_key`.
- `ability_modifier`.
- `proficiency_bonus`.
- `proficiency_type`.
- `skill_modifier`.
- `total_value`.
- `was_success`.

Currently available Free Focus additions:

- `check_mode`.
- `check_visibility`.
- `roll_options` for advantage.

Currently available result-band fields from `resolveResultBand()`:

- `band`.
- `text`.
- `check_total`.
- `base_check_total`.
- `knowledge_grants`.
- `state_changes`.
- `objective_updates`.
- `mechanical_details.environment_modifiers`.
- `metadata`.
- `raw`.

Current limitation:

- Result bands are authored and validated, but the current beat path does not expose a unified inspector linking action preview, raw roll, final total, modifiers, selected band, state writes, knowledge grants, and output history in one place.

### Result feed / Latest Development

- Beat result service: `backend/src/services/playerBeatResultService.js`.
- Persistence schema: `ensurePlayerBeatResultSchema()`.
- Scene feed: `listSceneResultFeed()`.
- Campaign history: `getCampaignHistoryForAccount()`.
- Knowledge journal: `getCampaignKnowledgeForAccount()`.
- Flutter UI:
  - `_LatestSceneResult`.
  - `_LatestBeatResult`.
  - `_PreviousSceneResults`.
  - `_CollapsedRecentDevelopments`.

Current behavior:

- Beat actions remain primary timeline units.
- Free Focus / passive / automatic entries appear in campaign history only when canonical events exist.
- Player-facing beat mechanics are intentionally safe and compact.

### Character knowledge

- Backend service: `backend/src/services/characterKnowledgeService.js`.
- Scene view reads known facts in `characterSceneViewService.getCharacterSceneView()`.
- Knowledge grants are applied by:
  - `freeFocusService.applyKnowledgeGrants()`.
  - `worldStateMutationService.applyInteractionResultMutation()`.
- Player journal uses `playerBeatResultService.getCampaignKnowledgeForAccount()`.

Current limitation:

- There is no mechanics inspector showing which knowledge reads affected visibility, which grants were available per result band, and which grants were applied.

### State reads and writes

- Living world service: `backend/src/services/worldStateService.js`.
- Mutation service: `backend/src/services/worldStateMutationService.js`.
- State tables documented in `docs/living-world-state.md`:
  - `dnd5e_world_entity_state`.
  - `dnd5e_world_location_state`.
  - `dnd5e_world_scene_state`.
  - `dnd5e_world_scene_affordance_state`.
- Free Focus currently supports safe scene-state patches through `freeFocusService.applyStateChanges()`.
- Beat-action result bands support state changes through `worldStateMutationService.applyInteractionResultMutation()`.

Current limitation:

- State writes are applied and world events are recorded, but there is no exploration-specific GM/dev read model grouping reads/writes by source interaction, result band, or visibility decision.

### Environment overlays and modifiers

- Environment description service: `backend/src/services/environmentDescriptionService.js`.
- Environment modifier service: `backend/src/services/environmentModifierService.js`.
- Environment state service: `backend/src/services/environmentStateService.js`.
- Environment flavor selector: `backend/src/services/environmentFlavorSelector.js`.
- Content:
  - `content/campaigns/shadows_grey_road/environment_flavors/greyvale-environment-flavors.json`.
  - `content/campaigns/shadows_grey_road/environment_modifiers/greyvale-environment-modifiers.json`.
- Flutter safe mechanics panel: `_MechanicalDetails`.
- Flutter model: `SceneMechanicalDetails` / `SceneMechanicalEffect`.

Current behavior:

- `GET /api/play/current-scene?include_mechanics=true` can return safe environment modifiers and action-window context.
- `include_debug=true`, outside production only and only for `can_advance_beats` accounts, can expose source breakdown and selected flavor components.

Current limitation:

- Environment modifiers are not yet tied into a persistent per-check debug explanation for all exploration check outcomes.

### NPC presence and schedules

- NPC presence service: `backend/src/services/npcPresenceService.js`.
- NPC identity filtering: `backend/src/services/npcIdentityService.js`.
- Content:
  - `content/entities/greyvale/npcs/greyvale-npcs.json`.
  - `content/entities/greyvale/world_entities/greyvale-world-entities.json`.
- `npcPresenceToAffordance()` turns visible present NPCs into action targets.

Current behavior:

- NPC presence considers schedule, environment, state overrides, identity visibility, and known facts.
- Player output gets visible NPCs and player-safe NPC affordances.
- Debug mode can include presence debug, but production player output does not include hidden schedule internals.

Current limitation:

- Exploration lacks a GM/dev panel showing authored schedule, resolved presence, hidden/absence reason, state override, NPC-derived affordances, and NPC influence on checks/actions together.

### Greyvale exploration content sources

Primary Greyvale exploration content audited:

- `content/scenes/greyvale/scenes.json`
  - `broken-caravan-site`.
  - `grey-road-inn`.
  - `elin-memory-fragments`.
  - `dunmere-village`.
  - `old-forest-path`.
  - `shrine-ruins`.
  - `subterranean-hollow`.
- `content/campaigns/shadows_grey_road/affordances/greyvale-exploration-affordances.json`.
- `content/campaigns/shadows_grey_road/interactions/greyvale-interactions.json`.
- `content/scenes/greyvale/transitions/greyvale-transitions.json`.
- `content/campaigns/shadows_grey_road/campaign_overlays/scenes/greyvale-scene-overlays.json`.
- `content/campaigns/shadows_grey_road/environment_modifiers/greyvale-environment-modifiers.json`.
- `content/campaigns/shadows_grey_road/environment_flavors/greyvale-environment-flavors.json`.
- `content/entities/greyvale/npcs/greyvale-npcs.json`.

Good regression candidates:

- Broken Caravan:
  - `broken-caravan-site`.
  - Free Focus: `focus_broken_axle`, `focus_scattered_cargo`, `focus_roadside_mud`, `focus_missing_travelers_signs`.
  - Beat actions: `inspect-broken-caravan`, `examine-roadside-tracks`, `check-for-survivors`.
- Grey Road Inn:
  - `grey-road-inn`.
  - Free Focus: `focus_inn_common_room`, `focus_woman_near_hearth`, `focus_innkeeper_habits`, `focus_low_voiced_travelers`.
  - Beat actions: `speak-with-elin`, `question-the-innkeeper`, `listen-to-travelers`.
- Old Forest Path:
  - `old-forest-path`.
  - Free Focus: `focus_layered_tracks`, `focus_broken_undergrowth`, `focus_watcher_signs`.
  - Beat actions: `track-the-old-path`, `follow-the-tracks-to-the-shrine`, `search-for-watchers`.
- Shrine / Hollow:
  - `shrine-ruins`.
  - `subterranean-hollow`.
  - Free Focus: `focus_shrine_markings`, `focus_hidden_descent_signs`, `focus_anchor_stone`, `focus_mental_pressure`, `focus_exit_airflow`.
  - Beat actions: `inspect-shrine-markings`, `sense-the-presence`, `trace-the-anchor`, `steady-the-mind`.

## 3. Current Dialogue Debug Architecture Audit

Dialogue now has the pattern exploration should mirror.

### Dialogue services and routes

- `backend/src/services/dialogueFocusCommit/dialogueDebugWorkspaceService.js` builds the GM/dev aggregate read model.
- `backend/src/routes/devBeat.js` exposes `GET /api/dev/dialogue-debug`.
- The endpoint is Firebase-authenticated and guarded by `account.can_advance_beats`.
- `backend/src/services/dialogueFocusCommit/dialoguePathTestHarnessService.js` exposes simulation support through `POST /api/dev/dialogue-path-test/run`.
- `backend/src/services/dialogueFocusCommit/dialogueFocusCommitRuntimeService.js` handles player runtime, clarifying questions, social move preview/submit, checks, and exits.
- `backend/src/services/dialogueFocusCommit/dialogueRelationshipStateService.js` provides relationship/social read/write/audit behavior.
- `backend/src/services/dialogueFocusCommit/dialogueArchiveService.js` provides transcript/completed-record/archive behavior.
- `backend/src/services/dialogueFocusCommit/dialogueAnnotationCorrectionService.js` provides lifecycle chain behavior.

### Dialogue frontend debug workspace

- Flutter route: `/play/dev/dialogue-debug`.
- Route registration: `apps/player_app/lib/main.dart`.
- API client: `PlayerDashboardApi.getDialogueDebugWorkspace()`.
- Models: `DialogueDebugWorkspace` and related debug models in `apps/player_app/lib/api/models.dart`.
- Page/component: `apps/player_app/lib/campaign/dialogue_debug_workspace_page.dart`.
- Panels:
  - `SceneStatePanel`.
  - `AvailabilityPanel`.
  - `PreviewMappingPanel`.
  - `RelationshipStatePanel`.
  - `TranscriptPanel`.
  - `AnnotationCorrectionChainPanel`.
  - `AuditTimelinePanel`.
  - `ValidationPanel`.
  - `TestPathsPanel`.

### Dialogue read-model shape

The dialogue debug read model returns:

- `scene_state`.
- `availability`.
- `preview_mapping`.
- `relationship_state`.
- `transcript`.
- `completed_record`.
- `annotation_correction_chains`.
- `audit_timeline`.
- `validation`.
- `test_paths`.

This is the best current precedent for exploration.

### Dialogue visibility boundaries

Dialogue separates:

- Player endpoints under `/api/play/dialogue/...`.
- GM/dev endpoints under `/api/dev/...`.
- Player-safe archive/search.
- GM/dev-only debug read models and audit details.

The debug workspace may expose raw relationship state, hidden DCs, preview mapping internals, validation, and audit links. Player-facing endpoints must not.

### Dialogue pieces that are useful but not directly reusable

- Relationship/social state panels are dialogue-specific, but the linked-panel and audit grouping pattern is useful.
- Transcript/completed record panels are dialogue-specific, but exploration can use result feed, campaign history, world events, gameplay history, and action windows instead.
- Path harness patterns are dialogue-specific today; exploration may add a later mechanics regression harness, but 6B.11 should first focus on read-model inspection.

## 4. Recommended Stage 6B.11 Architecture

Recommended feature name:

`Exploration Mechanics Inspector`

Recommended backend service name:

`explorationMechanicsDebugReadModel`

Recommended service file:

`backend/src/services/explorationMechanicsDebugReadModel.js`

Recommended route:

`GET /api/dev/exploration-mechanics`

Recommended frontend page:

`apps/player_app/lib/campaign/exploration_mechanics_inspector_page.dart`

Recommended player app route:

`/play/dev/exploration-mechanics`

Recommended permission:

- Reuse `account.can_advance_beats` for 6B.11.
- This matches dev/GM Advance Beat and dialogue debug.
- If a more precise capability is added later, use `can_inspect_mechanics` or `can_view_gm_debug`.

Recommended architecture:

- Build an authorized GM/dev read model, not a player payload expansion.
- Aggregate existing persisted and authored data first.
- Avoid new tables in 6B.11.1 unless a concrete backend build proves they are needed.
- Reuse existing services for loading scene view, content overlays, interaction definitions, action windows, submissions, beat results, world events, knowledge, environment details, and NPC presence.
- Preserve shared-compatible shapes so dialogue and exploration can later share a `check_debug` contract.

6B.11.1 implementation status:

- Implemented backend service: `backend/src/services/explorationMechanicsDebugReadModel.js`.
- Implemented GM/dev route: `GET /api/dev/exploration-mechanics`.
- Permission boundary: `account.can_advance_beats`, matching `/api/dev/advance-beat` and `/api/dev/dialogue-debug`.
- No migrations were added; the first read model aggregates current scene view data, content overlays, persisted exploration interaction results, web action submissions, player beat results, scene interactions, scene transitions, environment details, and NPC presence where available.
- The response is wrapped under `exploration_mechanics_debug` and includes all planned top-level sections. Missing instrumentation is marked with `partial`, `not_recorded`, `not_available`, `not_applicable`, or `future_supported` rather than reconstructed.
- Player-facing `/api/play/current-scene` was not modified and does not return the exploration mechanics debug payload.

## 5. Proposed GM/Dev Read Model Shape

```json
{
  "status": "ok",
  "checked_at": "2026-05-23T00:00:00.000Z",
  "context": {
    "account_id": "1",
    "character_id": "10",
    "campaign_id": "20",
    "world_instance_id": "30",
    "scene_id": "40",
    "scene_key": "broken-caravan-site"
  },
  "scene_state": {},
  "surface_context": {},
  "passive_discoveries": [],
  "free_focus_items": [],
  "beat_action_options": [],
  "submitted_action": null,
  "preview_mapping": null,
  "check_details": [],
  "result_bands": [],
  "environment_modifiers": [],
  "npc_presence": [],
  "state_reads": [],
  "state_writes": [],
  "knowledge_outputs": [],
  "history_outputs": [],
  "transitions": [],
  "audit_timeline": [],
  "validation": {
    "hard_errors": [],
    "warnings": [],
    "debug_notices": []
  },
  "visibility_boundaries": {}
}
```

Section notes:

- `scene_state`: current scene, action window, submitted action status, scene state version, target state versions when available.
- `surface_context`: automatic observations, authored surface cues, narration components, environment text components.
- `passive_discoveries`: authored definitions plus persisted first result where available.
- `free_focus_items`: authored Closer Looks plus card status, persisted result, expiration/stale state, check visibility, outputs.
- `beat_action_options`: authored beat actions, visible action targets, scene interactions, transitions, NPC-derived affordances.
- `submitted_action`: current web action submission and runtime payload.
- `preview_mapping`: latest preview if stored, or reconstructed deterministic candidate information where safe.
- `check_details`: normalized checks from passive, Free Focus, and beat actions.
- `result_bands`: authored and selected result-band information when available.
- `environment_modifiers`: active environment and applicable mechanical modifiers.
- `npc_presence`: visible and GM/dev presence data.
- `state_reads`: knowledge/scene/affordance/NPC/environment reads that affected availability or output.
- `state_writes`: applied writes from Free Focus, result bands, world events, and beat results.
- `knowledge_outputs`: available and applied knowledge grants.
- `history_outputs`: gameplay history, campaign log, player beat result, world event links.
- `transitions`: scene transitions and result-band transition rewards/outputs.
- `audit_timeline`: chronological view combining action window, preview, submit, focus, check, state, history, knowledge, and beat events.
- `validation`: hard errors, warnings, and debug notices.
- `visibility_boundaries`: explicit proof of what normal player endpoints omit.

6B.11.3 implementation status:

- Implemented in `backend/src/services/explorationMechanicsDebugReadModel.js`; no migrations, Flutter panels, player endpoint changes, or Greyvale content changes were added.
- `environment_modifiers` now includes active environment context, mechanical modifiers, affected checks/actions/affordances/surface sections, selected flavor references, flavor seed/cooldown instrumentation, and hidden-vs-player-visible environment debug where available.
- `npc_presence` now includes canonical and player-visible labels, identity visibility, present/absent/known/relevant flags, schedule/presence debug fields, NPC-derived affordances, affected action hooks, and hidden-vs-player-visible identity details where authorized data exists.
- `state_reads` now distinguishes authored dependencies from runtime reads and includes scope, key/path, expected condition, actual value when available, affected mechanic areas, related Free Focus / Beat Action / transition ids, and instrumentation status.
- `state_writes`, `knowledge_outputs`, and `history_outputs` now expose source interaction/result links, player-facing vs hidden/debug flags, provenance where available, result-feed/history/journal emission flags, and honest partial/not-recorded instrumentation.
- `transitions` now includes availability, explicit target status, requirement/dependency summaries, selected-by hooks, player-facing/debug flags, and validation-ready target status.
- `audit_timeline` now normalizes exploration result rows, submitted actions, beat results, action windows, environment context, NPC presence, state dependencies/writes, knowledge/history outputs, and transitions into linked GM/dev events for the future inspector UI.
- `validation` now adds environment/NPC/state/output/transition/audit checks and debug notices. It reports missing targets/references when detectable and marks missing old values, provenance, flavor seeds, schedule internals, and exact runtime state reads as partial/not recorded instead of reconstructing them.
- `visibility_boundaries` now explicitly flags environment debug, hidden environment details, NPC schedule debug, hidden NPC identity, state dependencies, hidden knowledge outputs, history output internals, hidden transition requirements, and the audit timeline as GM/dev-only.

Known 6B.11.3 limitations:

- Exact runtime state read rows are not generally persisted, so many reads are represented as `authored_dependency`.
- Old state values are only shown when already recorded by the source event; the read model does not reconstruct them from current state.
- Environment flavor seed/cooldown and NPC schedule internals are partial when the current scene view did not record them.
- Beat-action check/result provenance remains partial until a future runtime/audit build stores a compact per-resolution mechanics trace.

## 6. Proposed Frontend Panels

Recommended panels:

- Scene State.
- Surface / Passive Discovery.
- Free Focus Mechanics.
- Beat Action Mechanics.
- Preview Mapping.
- Check Breakdown.
- Result Bands.
- Environment Modifiers.
- NPC Presence.
- State Reads / Writes.
- Knowledge / History Outputs.
- Audit Timeline.
- Validation.

Recommended placement:

- Add a GM/dev page reachable from Campaign Diagnostics, parallel to Dialogue Debug.
- Add an optional small link/drawer from the scene page only when `capabilities.canAdvanceBeats` is true.
- Do not put GM/dev internals into the normal Scene Reference or Action Composer.

Linked-panel behavior:

- Selecting a Free Focus item highlights related check, state, output, and audit records.
- Selecting a Beat Action highlights preview, check, result-band, output, and transition records.
- Selecting a state field shows reads and writes.
- Selecting a validation issue highlights the source item.
- Selecting an audit event updates related panels.

Keep first UI implementation simple:

- Shared selected ID state is enough.
- Full graph visualization is unnecessary.
- Tables/lists should be readable on desktop and usable on web mobile, but the primary audience is GM/dev.

## 7. Proposed Check Debug Structure

Future-compatible shape:

```json
{
  "check_id": "free_focus:focus_roadside_mud",
  "source_type": "free_focus",
  "source_id": "focus_roadside_mud",
  "requires_check": true,
  "check_kind": "skill",
  "ability": "wisdom",
  "skill": "survival",
  "tool": null,
  "dc": 13,
  "dc_visibility": "visible",
  "roll_mode": "standard",
  "passive_score_used": null,
  "base_modifier": 2,
  "proficiency_bonus": 2,
  "feature_bonus": 0,
  "environment_modifiers": [],
  "state_modifiers": [],
  "item_modifiers": [],
  "advantage_sources": [],
  "disadvantage_sources": [],
  "assistance_sources": [],
  "final_modifier": 4,
  "raw_roll": 11,
  "total_result": 15,
  "result_band": "success",
  "branch_id": "on_success",
  "player_visible_summary": "Survival check: success",
  "gm_debug_summary": "Survival DC 13, roll 11 + 4 = 15."
}
```

Currently available:

- Source type and source ID for Automatic Observation, Passive Discovery, Free Focus, and some submitted actions.
- Requires-check inference for Free Focus and passive definitions.
- Skill, ability, DC, raw roll, ability modifier, proficiency bonus, proficiency type, skill modifier, total, and success from `resolveNarrativeSkillCheck()`.
- Free Focus roll mode and visibility in stored `check_result_json`.
- Advantage roll options for Free Focus when mode is advantage.
- Environment modifier definitions from `environmentModifierService`.
- Result band definitions and selected result band when `resolveResultBand()` is used.

Not consistently recorded today:

- Preview mapping candidate list for exploration.
- Explicit check ID for every beat action resolution.
- Beat-action raw roll and final selected result band in a unified debug record.
- Per-check environment modifiers actually applied at roll time for all beat actions.
- State modifier, item modifier, assistance, advantage/disadvantage source breakdown.
- Branch ID beyond Free Focus `on_success` / `on_failure` inference and result-band `band`.
- A single durable audit record that links preview, roll, result band, state writes, knowledge grants, and player output.

Do not fake missing fields. The inspector should mark unavailable fields as `not_recorded`, `not_applicable`, or `not_supported_yet`.

## 8. Proposed Result Band Inspector

GM/dev should be able to inspect:

- All authored result bands for a beat action.
- The selected result band when a result has been resolved.
- Thresholds or DC ranges: `min_total`, `max_total`.
- Success classification: `failure`, `partial_success`, `success`, `great_success`, `critical_success`.
- Fallback/default band behavior.
- State mutations per band.
- Knowledge grants per band.
- Objective updates per band.
- Transition or reward rules per band.
- Player-facing text per band.
- GM/dev metadata per band.
- Environment modifiers included in band resolution.

Recommended backend source:

- Authored bands from `dnd5e_scene_interaction.result_bands_json` or content files.
- Selected result from runtime result, player beat result provenance, world event payload, or a new future debug/audit record.

Important limitation:

- If a past beat did not persist selected band details, the inspector should show authored bands and player beat result text, but mark selected band as `not_recorded`.

## 9. Environment, NPC, State, and Output Audit Plan

### Environment

Surface:

- Effective weather.
- Time of day.
- Season.
- Visibility/light.
- Temperature.
- Wind.
- Precipitation.
- Mood/tone.
- Active modifier records.
- Mechanical effects.
- Narrative flavor selected.
- Hidden versus player-visible environmental details.

Sources:

- `environmentDescriptionService`.
- `environmentModifierService`.
- `environmentStateService`.
- `environmentFlavorSelector`.
- Greyvale environment flavor/modifier JSON.

### NPC presence

Surface:

- Authored schedule.
- Current resolved presence.
- Routine block.
- Absence reason.
- Event/state override.
- Identity visibility.
- NPC-derived affordances.
- NPC influence on checks/actions/surface.

Sources:

- `npcPresenceService`.
- `npcIdentityService`.
- Greyvale NPC and world entity JSON.

### State

Surface:

- World state reads.
- Location state reads.
- Scene state reads.
- Entity/NPC state reads.
- Affordance state reads.
- Character knowledge reads.
- State writes.
- Old value.
- New value.
- Scope.
- Source action/focus/result band.
- Audit record link.
- Player-facing status.

Sources:

- `worldStateService`.
- `worldStateMutationService`.
- `characterSceneViewService`.
- `freeFocusService`.
- `dnd5e_world_event`.
- `dnd5e_campaign_log`.
- `dnd5e_gameplay_history`.

### Outputs

Surface:

- Knowledge grants.
- Clues/facts learned.
- Rumors versus confirmed facts.
- Campaign history events.
- Character journal entries.
- Objective updates.
- Player-facing timeline entries.
- Hidden GM/dev-only events.

Sources:

- `characterKnowledgeService`.
- `gameplayHistoryService`.
- `playerBeatResultService`.
- `worldStateMutationService`.
- `narrativeStateService.recordCampaignLog()`.

## 10. Permission and Visibility Boundary Plan

Recommended guard:

- Use the same capability as Dev/GM Advance Beat and Dialogue Debug: `account.can_advance_beats`.
- Route under `/api/dev/...`.
- Link UI only when `CurrentSceneView.capabilities.canAdvanceBeats` is true.

Normal player scene endpoints must not return:

- Hidden DCs.
- Debug confidence.
- Hidden requirements.
- Raw state reads/writes.
- Hidden NPC schedule data.
- Audit records.
- Result-band internals.
- Hidden failed checks.
- Hidden NPC identity, true name, or secret role.
- GM notes/debug fields.

GM/dev endpoints may return these fields when authorized.

Production note:

- `include_debug=true` is disabled in production for `/api/play/current-scene`.
- Stage 6B.11 should not rely on `include_debug=true` for production GM/dev tooling.
- Use a dedicated `/api/dev/exploration-mechanics` endpoint guarded server-side.

## 11. Persistence Recommendation

Current persistence is enough for a useful first inspector:

- Free Focus, Passive Discovery, and Automatic Observation results: `dnd5e_character_exploration_interaction_result`.
- Submitted actions: `dnd5e_web_action_submission`.
- Action windows: `dnd5e_action_window`.
- Beat results: `dnd5e_player_beat_result`.
- Campaign logs: `dnd5e_campaign_log`.
- Gameplay history: `dnd5e_gameplay_history`.
- World events: `dnd5e_world_event`.
- World scene/location/entity/affordance state tables.
- Character knowledge tables.

Recommended approach:

- 6B.11.1 should aggregate existing records first.
- 6B.11.2 should identify exact missing fields for historical explanations.
- Do not add tables in 6B.11.0.
- Avoid adding new tables until the concrete backend build proves they are required.
- If new persistence is needed later, prefer extending existing event/audit/session records before creating a standalone table.
- Persist enough to explain future outcomes at resolution time; do not rely only on reconstructing later from changed authored content.

Likely future persistence addition:

- A compact `exploration_check_debug_json` payload on a suitable existing result/audit record, or a dedicated exploration mechanics audit table if the existing rows cannot safely hold it.

## 12. Validation Plan

Validation should return:

- `hard_errors`.
- `warnings`.
- `debug_notices`.

Proposed hard errors:

- Free Focus check has invalid visibility enum.
- Beat Action check has invalid visibility enum.
- Hidden DC marked player-facing accidentally.
- State write references an invalid target type or missing target ID.
- Knowledge grant references an unknown knowledge ID.
- History output references an invalid event/log type.
- Environment modifier references an invalid check type.
- NPC schedule references invalid NPC/location/scene IDs.
- Overlap warning metadata cannot resolve to a real Free Focus item.
- Transition target does not exist.
- Result band emits unsafe player-facing output.

Proposed warnings:

- Free Focus check has no clear failure baseline.
- Beat Action check has no failure band.
- Result band ranges have gaps.
- Result band ranges are very broad or overlap.
- Environment modifiers exist but are not used in a check context.
- NPC presence affects affordances but no debug metadata exists.
- Repeat/retry policies are omitted on repeatable checks.
- State-changing Free Focus does not provide a summary.

Proposed debug notices:

- Unused authored Free Focus item.
- Unreachable Beat Action.
- Unused environment modifier.
- Passive Discovery persisted silently.
- Result band selected but exact past check details were not recorded.
- History/knowledge output is canonical but not linked to a source interaction.

Existing validation to extend:

- `backend/src/content/contentValidation.js`.
- `backend/src/services/resultBandService.js`.
- `backend/test/stage6b9-surface-focus-commit-unit.test.js`.

## 13. Greyvale Regression Plan

Later 6B.11.6 regression should use existing Greyvale content, not a broad new content pack.

Recommended coverage:

- Broken Caravan:
  - `broken-caravan-site`.
  - Checked Free Focus and knowledge grants around `focus_broken_axle`, `focus_roadside_mud`, and `focus_missing_travelers_signs`.
  - Checked Beat Actions and result bands around `inspect-broken-caravan`, `examine-roadside-tracks`, and `check-for-survivors`.
  - Overlap warning with muddy tracks / roadside mud.
- Grey Road Inn:
  - `grey-road-inn`.
  - Free Focus around `focus_woman_near_hearth`, `focus_innkeeper_habits`, and `focus_low_voiced_travelers`.
  - NPC presence and identity-safe affordances for Elin Harrow, Tomas Rell, and Grey Road Travelers.
- Old Forest Path:
  - `old-forest-path`.
  - Environment-influenced tracking with `old_forest_path_survival_layered_tracks`.
  - Passive watcher signs and hidden/locked affordance behavior.
- Shrine Ruins:
  - `shrine-ruins`.
  - Hidden/locked scene access from `greyvale-scene-overlays.json`.
  - `focus_hidden_descent_signs` and `inspect-shrine-markings`.
  - Transition to `subterranean-hollow`.
- Subterranean Hollow:
  - `subterranean-hollow`.
  - `focus_mental_pressure`, `focus_anchor_stone`, `sense-the-presence`, `trace-the-anchor`, and `steady-the-mind`.
  - Environment modifier `hollow_presence_insight_pressure`.

Exact IDs should be reverified in 6B.11.6 against the imported database state, because content file slugs and database numeric IDs can diverge.

## 14. Sub-build Breakdown

### 6B.11.1 - GM/Dev Exploration Mechanics Read Model

Goal:

- Add the authorized backend aggregate read model for current exploration mechanics.

Files likely to change:

- `backend/src/services/explorationMechanicsDebugReadModel.js`.
- `backend/src/routes/devBeat.js`.
- `backend/test/exploration-mechanics-debug-read-model.test.js`.
- `backend/src/app.js`.

Implementation notes:

- Reuse `account.can_advance_beats`.
- Aggregate scene state, current scene view, Surface / Focus / Commit definitions, action window, submitted action, Free Focus results, passive results, environment details, NPC presence, history, knowledge, and validation.
- Do not add frontend panels or Flutter API models in this backend-only build.
- Implemented sections now: `scene_state`, `surface_context`, `passive_discoveries`, `free_focus_items`, `beat_action_options`, `submitted_action`, `preview_mapping`, `check_details`, `result_bands`, `environment_modifiers`, `npc_presence`, `state_reads`, `state_writes`, `knowledge_outputs`, `history_outputs`, `transitions`, `audit_timeline`, `validation`, and `visibility_boundaries`.
- Partial/future-supported areas: exact beat-action raw roll linkage, per-check environment/state/item modifier breakdowns, selected historical beat-action result bands, hidden NPC schedule internals beyond current presence debug, and full mechanics validation.

Tests expected:

- Authorized GM/dev can fetch read model.
- Normal player is rejected.
- Unauthenticated requests are rejected.
- Player scene endpoint does not include debug read-model fields.
- Read model includes scene, Free Focus, passive, submitted action, environment, NPC, history, and validation sections.

Acceptance criteria:

- A dedicated GM/dev exploration mechanics read model exists.
- It is not returned by normal player endpoints.
- It uses actual persisted/authored data and marks missing fields as not recorded.

### 6B.11.2 - Check Breakdown + Result Band Inspector Backend

Goal:

- Normalize `check_debug` and `result_bands` sections for Passive Discovery, Free Focus, and Beat Actions.

6B.11.2 implementation status:

- Implemented in `backend/src/services/explorationMechanicsDebugReadModel.js` without adding a new route, migration, or Flutter UI.
- Exported shared-compatible field lists: `explorationCheckDebugFields` and `explorationResultBandDebugFields`.
- Check debug entries now include `source_label`, `dc_player_visible`, `outcome_classification`, no-check handling, selected branch inference, and explicit instrumentation status.
- Result band entries now include `band_label`, `dc_range`, `selection_reason`, `player_facing_text`, `gm_notes`, direct output collections, `validation_status`, and `instrumentation_status`.
- Persisted Free Focus / Passive Discovery rows can mark selected result bands with `selection_reason = persisted_exploration_interaction_result`.
- Beat-action raw roll and selected historical beat-action band linkage remain partial because the existing beat result records do not consistently persist a normalized check-debug payload yet.

Files likely to change:

- `backend/src/services/explorationMechanicsDebugReadModel.js`.
- `backend/test/exploration-mechanics-debug-read-model.test.js`.

Implementation notes:

- Reuse `resolveNarrativeSkillCheck()` output shape.
- Do not reveal hidden check data through player APIs.
- Show authored bands even if selected band is not recorded.
- Mark unavailable raw rolls/modifiers as `not_recorded`.
- No-check entries use `check_kind = no_check`, `requires_check = false`, no DC, no roll fields, and `instrumentation_status = not_applicable`.
- Missing roll/modifier data is represented as `partial`, `not_recorded`, or `future_supported`; it is not guessed.
- `visibility_boundaries` now explicitly includes check debug breakdowns, modifier breakdowns, raw state outputs, and player DC/roll/result-band policies.

Validation added:

- Hard error when authored checked exploration content requires a check but no DC/threshold is inspectable.
- Warning when checked Free Focus, Passive Discovery, Beat Action, or scene interaction content has no success/failure band.
- Warning when no-check content lacks deterministic authored result behavior.
- Warning when no-check content conflicts with check/DC metadata.
- Warning when result-band knowledge output lacks an id/key where detectable.
- Debug notices for missing raw rolls, partial modifier breakdowns, authored-dependency-only state reads, and partial selected-result-band instrumentation.

Tests expected:

- Free Focus visible check shows full GM/dev details.
- Hidden/success-only failed checks are GM/dev-visible only.
- Result bands list all authored bands.
- Selected band is shown when recorded.
- Missing selected band is marked `not_recorded`.
- Player current-scene endpoint does not include check-debug fields, instrumentation status, GM summaries, GM notes, hidden DCs, or result-band internals.

Acceptance criteria:

- GM/dev can inspect check breakdowns and result bands without player leakage.

### 6B.11.3 - Environment, NPC, State, and Output Audit Aggregation

Goal:

- Add environment, NPC presence, state read/write, knowledge output, history output, and transition audit sections.

6B.11.3 implementation status:

- Implemented by extending `backend/src/services/explorationMechanicsDebugReadModel.js`.
- Tests live in `backend/test/exploration-mechanics-debug-read-model.test.js`.
- No separate `environmentModifierService` or `npcPresenceService` helper extraction was needed.
- No database migrations or Flutter UI files were added.

Files likely to change:

- `backend/src/services/explorationMechanicsDebugReadModel.js`.
- `backend/src/services/environmentModifierService.js` if filter helpers are needed.
- `backend/src/services/npcPresenceService.js` only if safe debug helper extraction is needed.
- `backend/test/exploration-mechanics-audit-aggregation.test.js`.

Implementation notes:

- Prefer existing services and records.
- Keep hidden NPC details behind GM/dev endpoint only.
- Link outputs back to source interaction/action/result where possible.
- Missing runtime instrumentation is represented with `partial`, `not_recorded`, `not_applicable`, or `future_supported`; the read model does not fabricate hidden state reads, old values, flavor seeds, raw schedule traces, or transition outcomes.
- The normalized audit timeline is suitable for linked UI selection in 6B.11.4, but it is still an aggregate of available records and authored dependencies rather than a complete execution trace.

Tests expected:

- Environment modifiers are listed with reason and affected checks.
- NPC presence includes GM/dev schedule/presence metadata for authorized users.
- State writes and knowledge grants link to source records where available.
- Player endpoint remains clean.
- Validation reports environment/NPC/state/output/transition issues where detectable.
- Player-facing boundary tests confirm environment debug, hidden NPC identity, raw state/output internals, hidden transition requirements, audit timeline, instrumentation status, and GM/debug summaries do not appear in `/api/play/current-scene`.

Acceptance criteria:

- Inspector can explain environment/NPC/state/output influences from current records.

### 6B.11.4 - GM/Dev Exploration Mechanics Inspector UI

Goal:

- Add the Flutter GM/dev inspector page and panels.

6B.11.4 implementation status:

- Implemented Flutter page: `apps/player_app/lib/campaign/exploration_mechanics_inspector_page.dart`.
- Implemented route: `/play/dev/exploration-mechanics`.
- Implemented API client method: `PlayerDashboardApi.getExplorationMechanicsDebug()`.
- Implemented model: `ExplorationMechanicsDebugWorkspace`, with tolerant map/list sections for partial/future-supported payloads.
- Added GM/dev navigation from the scene Dev Diagnostics panel and Campaign Diagnostics page. Normal players do not see the scene entry point because it remains gated by `CurrentSceneView.capabilities.canAdvanceBeats`.
- The debug endpoint is lazy-loaded only when the inspector page is opened; normal scene loading does not depend on it.
- Implemented panels:
  - Scene State.
  - Surface / Passive Discovery.
  - Free Focus Mechanics.
  - Beat Action Mechanics.
  - Preview Mapping.
  - Check Breakdown.
  - Result Bands.
  - Environment Modifiers.
  - NPC Presence.
  - State Reads / Writes.
  - Knowledge / History Outputs.
  - Transitions.
  - Audit Timeline.
  - Validation.
  - Visibility Boundaries.
- Linked selection is intentionally simple: selecting Free Focus, Beat Action, check/result/state/output/transition/audit/validation rows stores a selected source id and highlights matching rows across panels when ids or linked payload fields match.
- The inspector renders `not_recorded`, `future_supported`, `not_applicable`, and `partial` states explicitly rather than implying missing rolls, modifiers, old state values, or runtime traces exist.
- Greyvale frontend smoke coverage uses a representative Broken Caravan-style mock payload; full live Greyvale UI regression remains scheduled for 6B.11.6.

Files likely to change:

- `apps/player_app/lib/campaign/exploration_mechanics_inspector_page.dart`.
- `apps/player_app/lib/api/api_client.dart`.
- `apps/player_app/lib/api/models.dart`.
- `apps/player_app/lib/main.dart`.
- `apps/player_app/lib/campaign/campaign_diagnostics_page.dart`.
- `apps/player_app/test/exploration_mechanics_inspector_test.dart`.

Implementation notes:

- Mirror dialogue debug workspace page structure.
- Add linked-panel selected context, but keep it simple.
- Do not redesign the player scene page.
- Keep the inspector separate from normal player scene widgets; debug payload failure should show an inspector-only error card and must not break gameplay.

Tests expected:

- Page renders all planned panels.
- Permission-denied state renders safely.
- Selecting Free Focus / Beat Action / state field highlights related sections where implemented.
- No debug data appears in player scene widgets.
- API payload parsing tolerates partial and unknown future fields.
- Flutter widget tests cover all panel labels, Free Focus linked selection, not-recorded instrumentation labels, and visibility boundary flags.

Acceptance criteria:

- GM/dev users have a usable exploration mechanics inspector.

### 6B.11.5 - Player-Facing Visibility Boundary Tests

Goal:

- Lock in tests that hidden mechanics never leak through player-facing exploration APIs or Flutter UI.

6B.11.5 implementation status:

- Added backend boundary suite: `backend/test/exploration-mechanics-visibility-boundary.test.js`.
- Added Flutter boundary suite: `apps/player_app/test/exploration_mechanics_visibility_boundary_test.dart`.
- Player-facing backend surfaces covered:
  - `/api/play/dashboard`.
  - `/api/play/current-adventure`.
  - `/api/play/current-scene`, including the existing player-safe `include_mechanics=true` path.
  - `/api/play/action/preview`.
  - `/api/play/action/submit`.
  - `/api/play/free-focus/resolve`.
  - `/api/play/campaign/history`.
  - `/api/play/campaign/knowledge`.
  - `/api/play/characters/:character_id`.
- GM/dev positive-control coverage verifies `/api/dev/exploration-mechanics` still returns `visibility_boundaries`, `check_details`, `result_bands`, `state_reads`, `state_writes`, `audit_timeline`, and related inspector sections for accounts with `can_advance_beats`.
- Permission coverage verifies unauthenticated and normal player access to `/api/dev/exploration-mechanics` is rejected, including attempts with alternate `character_id` / `campaign_instance_id` parameters.
- Flutter coverage verifies:
  - normal player inspector entry point renders nothing.
  - authorized GM/dev entry point renders and opens.
  - player action preview model ignores backend debug confidence/mapping fields.
  - GM/dev inspector can render hidden mechanics inside the inspector boundary.
- Dedicated forbidden player-facing key coverage includes hidden/raw check fields, result band internals, GM notes/summaries, instrumentation status, hidden requirements, raw state reads/writes, hidden environment/NPC/knowledge/history/transition internals, audit timeline, validation debug notices, and visibility boundary sections.
- Boundary fixes made:
  - `previewWebAction()` now strips resolver `candidate.confidence` from the normal player preview response while preserving it internally for resolution/submission.
  - Free Focus player-facing result mapping no longer returns raw `state_changes_applied`; state writes remain inspectable through the GM/dev debug read model.
- Greyvale smoke coverage uses the existing imported Greyvale start scene and verifies player-vs-GM/dev separation across current scene, Closer Look, action preview/submit, history, knowledge, character sheet, and debug read model access.

Files likely to change:

- `backend/test/exploration-mechanics-visibility-boundary.test.js`.
- `apps/player_app/test/campaign_scene_visibility_test.dart`.
- Existing Stage 6B.9 tests if helper coverage belongs there.

Implementation notes:

- Test both backend JSON payloads and Flutter rendering.
- Include hidden DC, failed hidden passive, hidden NPC schedule, raw state reads, audit timeline, result band internals, and preview confidence.

Tests expected:

- Normal player cannot call dev endpoint.
- `/api/play/current-scene` omits debug-only sections.
- `/api/play/action/preview` omits debug mapping internals.
- Flutter scene page does not render GM/dev fields.

Acceptance criteria:

- Player-facing visibility boundaries are regression-tested.

### 6B.11.6 - Greyvale Exploration Regression Coverage

Goal:

- Prove the inspector works on active Greyvale exploration content.

6B.11.6 implementation status:

- Added Greyvale coverage document: `docs/exploration/GREYVALE_REGRESSION_COVERAGE.md`.
- Added backend regression suite: `backend/test/exploration-greyvale-mechanics-regression.test.js`.
- Added Flutter regression suite: `apps/player_app/test/exploration_mechanics_greyvale_regression_test.dart`.
- Live backend coverage imports `content/worlds/greyvale` and exercises the active `broken-caravan-site` start scene from Shadows on the Grey Road.
- Backend regression verifies GM/dev richness for:
  - Scene state and surface context.
  - Passive discoveries `notice_deep_tracks` and `notice_attack_not_looting`.
  - Free Focus / Closer Look entries `focus_broken_axle`, `focus_scattered_cargo`, and `focus_roadside_mud`.
  - Beat Actions `inspect-broken-caravan`, `examine-roadside-tracks`, and `check-for-survivors`.
  - Checked and no-check check debug entries.
  - Authored result-band state mutation and knowledge grant summaries.
  - Environment modifier/debug context.
  - Transitions, audit timeline, validation groups, and visibility boundaries.
- Backend regression also drives player-safe overlap preview, committed follow-up preview, Free Focus resolution, action submission, and `/api/dev/advance-beat`.
- Player-facing boundary regression confirms Greyvale current scene, preview, Free Focus result, submit, history, knowledge, and character sheet payloads do not include GM/dev debug fields.
- Permission regression confirms `/api/dev/exploration-mechanics` rejects unauthenticated and normal player accounts, including alternate `character_id` / `campaign_instance_id` attempts, and allows authorized `can_advance_beats` users.
- Flutter regression uses a deterministic Broken Caravan-style payload to verify all inspector panels render, normal player entry point remains hidden, and Free Focus linked selection works.
- No production Greyvale content or runtime behavior was changed.
- Remaining gaps are documented in `GREYVALE_REGRESSION_COVERAGE.md`: live backend regression currently centers on Broken Caravan; Grey Road Inn, Old Forest Path, Shrine Ruins, Subterranean Hollow, richer live NPC schedule inspection, and multi-scene path regression remain future expansion targets.

Files likely to change:

- `backend/test/exploration-greyvale-mechanics-regression.test.js`.
- `apps/player_app/test/exploration_mechanics_greyvale_regression_test.dart`.
- `docs/exploration/GREYVALE_REGRESSION_COVERAGE.md`.
- `docs/exploration/DEV_CHECK_MECHANICS_VISIBILITY.md`.

Implementation notes:

- Use existing Greyvale content listed in this document.
- Do not create a broad new content pack.
- Small fixture setup is fine if tests need deterministic state.

Tests expected:

- Broken Caravan, Grey Road Inn, Old Forest Path, Shrine Ruins, and Subterranean Hollow each produce useful inspector data where available.
- Free Focus, passive discovery, beat action, overlap warning, environment modifier, NPC presence, state write, knowledge grant, history output, and transition coverage exist.
- No hard validation errors for target Greyvale mechanics.

Acceptance criteria:

- Greyvale regression coverage demonstrates the inspector end-to-end.

## 15. Risks and Open Questions

- Exploration checks are mixed: Free Focus and passive checks use `resolveNarrativeSkillCheck()` directly; beat actions often route through scene interactions and result bands. The exact beat-action raw roll persistence path needs more focused audit in 6B.11.2.
- Raw rolls are persisted for Free Focus and Passive Discovery in `dnd5e_character_exploration_interaction_result.check_result_json`, but not consistently exposed or linked for beat actions.
- Result bands are fully authored for many Greyvale beat interactions, but selected historical result bands may not be reliably reconstructable from old beat results.
- Environment modifiers are authored and can appear in safe `mechanical_details`, but their mechanical application to every check outcome is not fully unified.
- NPC presence has debug data in `includeDebug`, but production GM/dev inspection needs a dedicated authorized endpoint because `/api/play/current-scene?include_debug=true` is disabled in production and capability-gated outside production.
- The Flutter inspector should probably live beside Campaign Diagnostics and Dialogue Debug rather than inside the normal Scene Reference.
- The current permission should be `can_advance_beats` for consistency, but a future `can_view_gm_debug` capability would be cleaner.
- Existing audit/event data is enough for a first read model, but future exact outcome explanations may need a new persisted check-debug payload.
- Dialogue and exploration should share a `check_debug` shape eventually, but 6B.11 can start with exploration-specific helpers and keep the shape compatible.
- Greyvale has enough authored mechanics for useful tests, but database import IDs need verification in the regression build.

## 16. Documentation Updates

This document creates the exploration planning index for Stage 6B.11. It intentionally does not update runtime source files, migrations, player UI, or Greyvale content.

## 17. Stage 6B.13 Follow-Up

The post-dialogue full-loop stabilization plan is tracked in `docs/full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md`.

Stage 6B.13 should reuse the exploration mechanics inspector and visibility-boundary coverage here as part of the combined Greyvale full-loop audit. The key follow-up is not more inspector surface area by default; it is proving that exploration debug, dialogue debug, player read models, history/knowledge/objective outputs, stale-state recovery, and permissions all remain coherent in one playable loop.
