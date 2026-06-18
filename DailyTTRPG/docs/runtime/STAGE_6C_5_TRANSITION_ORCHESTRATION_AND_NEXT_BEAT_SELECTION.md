# Stage 6C.5 - Transition Orchestration And Next-Beat Selection

## Stage Summary

Stage 6C.5 adds shared transition orchestration and next-beat selection helpers for committed beat resolution. The helpers normalize adapter-owned exploration/dialogue transition proposals and output-bundle transition records into a single internal transition decision, then select the next safe beat state.

This is a shared runtime scaffold, not a runtime rewrite. Exploration and dialogue adapters still own domain-specific transition proposals, action-window creation, persistence, and read-model refresh behavior.

No combat, open-world navigation, AI narration, SMS requirement, major content change, player UI redesign, or database/schema migration was added.

## Runtime Module Location

Shared helpers live in:

- `backend/src/services/interactionCore/resolutionPipeline.js`

The implementation is exported through:

- `backend/src/services/interactionCore/index.js`

## Transition Orchestration Rules

Committed beat resolution now has shared decision vocabulary for:

- `no_transition`
- `stay_in_current_scene`
- `scene_transition`
- `move_to_scene`
- `enter_dialogue`
- `continue_dialogue`
- `exit_dialogue`
- `return_to_exploration`
- `endpoint`
- `recovery_needed`
- `unavailable`
- `unavailable_locked`
- `future_supported`
- `future_supported_handoff`

Aliases such as `move_scene`, `dialogue_exit`, `awaiting_support`, `combat_pending`, and `future_supported_internal` normalize to the closest shared decision kind.

The shared decision does not expose internal routing to players. GM/dev projections can inspect target ids, adapter proposals, output transition records, internal routing status, and future-supported metadata.

## Next-Beat Selection Rules

Next-beat decisions now include:

- `open_exploration_action_window`
- `open_dialogue_action_window`
- `keep_existing_window_if_valid`
- `endpoint_review_only`
- `recovery_needed`
- `no_action_window`
- `close_without_new_window`
- `unavailable_locked_no_state_change`
- `future_supported_handoff`
- `future_supported_review_only`

Selection rules:

- Exploration same-scene and scene transitions open an exploration action window, unless an adapter explicitly keeps a valid existing window.
- Dialogue entry and dialogue continuation open a dialogue action window.
- Dialogue exit or return-to-exploration opens an exploration action window.
- Endpoint and future-supported handoffs are review-only for players and do not open unsupported combat/navigation windows.
- Recovery-needed beats do not open normal action windows.
- Unavailable or locked choices preserve state and do not open unsafe next windows.

## Shared Helper API

Added or hardened helpers:

- `createTransitionOrchestrationDecision(...)`
- `selectNextBeatDecision(...)`
- `assertTransitionResultAlignment(...)`
- `createTransitionOrchestrationDiagnostics(...)`

Existing helpers were extended:

- `createTransitionDecision(...)`
- `createNextBeatDecision(...)`
- `createResolutionTraceEnvelope(...)`
- `createResolutionOrchestrationMap(...)`

## Exploration Behavior

Exploration committed beats can now normalize:

- no transition or same-scene continuation
- movement to another scene/location
- dialogue entry from an exploration scene
- unavailable or locked transition attempts
- endpoint/future-supported handoffs where exploration reaches an unsupported boundary later

The shared next-beat selector chooses an exploration action window for same-scene and scene movement decisions. Player projections only carry safe labels/summaries.

## Dialogue Behavior

Dialogue committed beats can now normalize:

- dialogue continuation after a committed social move
- dialogue entry handoff
- dialogue exit back to exploration
- future-supported endpoint handoff from Rusk-style confrontation outcomes
- unavailable/recovery states

The selector opens dialogue windows for continued conversations and exploration windows for exits. Exits remain modeled as transition decisions, not unsupported combat/navigation steps.

## Endpoint And Future-Supported Handoff

Rusk-style `combat_pending` or `future_supported` outputs normalize to an internal future-supported transition decision and a player-safe review-only next beat.

Player projections hide:

- `combat_pending`
- `future_supported`
- target encounter ids
- GM/dev routing
- branch ids
- internal future-supported metadata

GM/dev projections preserve these details for inspection.

## Result Alignment

`assertTransitionResultAlignment(...)` verifies that transition and next-beat decisions do not contradict each other.

Examples:

- `enter_dialogue` must select a dialogue next beat.
- `scene_transition` must select an exploration next beat.
- `future_supported` must select review-only next beat behavior.
- `recovery_needed` must not open a normal action window.
- `unavailable_locked` must not mutate state or open unsafe windows.

This is a shared test/diagnostic helper. It does not yet enforce production runtime behavior at every adapter boundary.

## GM/Dev Diagnostics

Resolution traces now include `transition_orchestration_diagnostics` with:

- normalized transition decision
- selected next-beat decision
- action-window lifecycle decision, when supplied
- adapter transition proposal
- adapter next-beat proposal
- player-safe transition projection
- player-safe next-beat projection
- alignment status and warnings

The diagnostics are GM/dev scoped and omitted from player projections.

## Greyvale Acceptance Coverage

The Greyvale vertical-slice acceptance fixture now includes transition orchestration assertions:

- committed beats select one post-resolution state
- scene transitions open exploration action windows
- dialogue exits return to exploration action windows
- endpoint/future-supported handoffs are review-only
- recovery/unavailable transitions do not open unsafe windows
- transition/result/next-step markers align
- GM/dev diagnostics include transition and next-beat decisions
- player payloads hide internal transition and next-beat routing

Canonical route steps now carry expected transition and next-beat markers for the Broken Caravan, inn, Dunmere, old-path, shrine, dialogue exits, and Rusk endpoint steps.

## Tests

Added:

- `backend/test/interaction-core-transition-orchestration.test.js`

Updated:

- `backend/package.json`
- `backend/test/greyvale-vertical-slice-acceptance.test.js`
- `content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json`

Coverage includes:

- scene transition to exploration next beat
- dialogue entry/continuation to dialogue next beat
- dialogue exit to exploration next beat
- Rusk future-supported handoff as player review-only
- recovery/unavailable no-window safety
- GM/dev diagnostics with player-safe projections
- impossible transition/next-beat alignment rejection

## 6C.6 Follow-Up

Stage 6C.6 added shared player result bundle/read-model refresh alignment helpers on top of these transition and next-beat decisions. Full runtime service adoption remains incremental, and no frontend file change was required.

Still deferred beyond 6C.6:

- durable trace persistence and inspector expansion
- full runtime migration of every adapter to the shared read-model alignment helper
- frontend result-bundle rendering changes, if a later UI pass needs them

Deferred to 6C.7:

- durable GM/dev trace persistence and inspector expansion

Deferred to 6C.8:

- final Stage 6C regression suite consolidation

Deferred to later stages:

- combat execution
- open-world navigation
- expanded rules/check transparency
- database/schema changes, unless later tests prove they are necessary and owner approval is given
