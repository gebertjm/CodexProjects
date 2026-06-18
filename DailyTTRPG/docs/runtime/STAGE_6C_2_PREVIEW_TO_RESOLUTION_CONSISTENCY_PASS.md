# Stage 6C.2 - Preview-To-Resolution Consistency Pass

Status: implemented as shared preview-consistency helpers, tests, docs, and Greyvale acceptance fixture metadata  
Created: Stage 6C.2  
Primary predecessor: Stage 6C.1 Resolution Pipeline Contract And Orchestration Map  
Primary module: `backend/src/services/interactionCore/resolutionPipeline.js`  
Primary tests: `backend/test/interaction-core-preview-consistency.test.js`

## 1. Purpose

Stage 6C.2 hardens the relationship between a player preview and the committed resolution that follows it.

This build does not rewire the exploration runtime or dialogue runtime. It adds shared consistency helpers that later adapters can call while preserving current behavior.

Core principle:

```text
A preview should be safe, non-mutating, and semantically aligned with the committed result if the player commits the same authored option before the state changes.
```

If the committed result differs, GM/dev diagnostics should be able to explain why:

- stale context
- duplicate submit
- option became unavailable
- authored check/failure/partial-success branch
- endpoint/recovery state
- current state changed after preview

## 2. Preview Consistency Rules

The shared rules are encoded as `PREVIEW_CONSISTENCY_RULES`.

### A. Preview Must Be Non-Mutating

Preview must not:

- write objectives
- grant knowledge
- write history
- update Latest Development
- update relationship/social state
- update scene/dialogue state
- close or open action windows
- create completed records, transcripts, summaries, archive entries, or search entries
- apply transitions
- mark endpoints
- consume the committed beat

`assertPreviewResponseNonMutating` enforces this for shared resolution responses.

### B. Preview And Commit Must Use The Same Authored Option

The shared alignment markers record:

- interaction domain
- action window id
- source scene/location/dialogue id
- selected option id
- selected option kind
- domain option kind
- context version
- content version if available
- availability snapshot id if available
- preview token

`createPreviewAlignmentMarkers` creates these markers.

### C. Preview Must Be Honest But Not Over-Specific

Player previews may communicate:

- likely consequence
- obvious risk
- whether an action is forceful, gentle, risky, investigative, or route-progressing
- whether it may reveal information
- whether it may advance or close an opportunity

Player previews must not reveal:

- hidden DCs
- raw rolls
- branch ids
- hidden requirements
- exact failed hidden requirements
- GM-only truth
- final mystery answers
- raw state writes
- raw relationship/social meters
- internal routing
- combat/future-supported internal labels

### D. Preview Must Handle Uncertainty

Preview expectation markers can include uncertainty such as:

- deterministic if state unchanged
- depends on current state
- check/failure/partial-success dependent

The player sees safe uncertainty. GM/dev diagnostics can see possible internal outcomes.

### E. Commit Must Not Contradict Preview Without A Reason

`comparePreviewExpectationsToResolution` compares preview expectation markers with resolution outcome markers by semantic category rather than exact prose.

## 3. Shared Preview Validation Behavior

`validatePreviewRequestConsistency` validates:

- request kind is `preview`
- action window matches current active state
- interaction domain matches
- scene/dialogue source matches
- context version matches when present
- action window is open/current when represented
- selected option exists
- selected option id matches
- endpoint/review state has not already been reached
- option availability is safe

Possible results:

- valid aligned preview
- stale/recovery response
- unavailable response

Player stale/unavailable responses are safe and actionable. GM/dev diagnostics preserve mismatch fields, hidden requirements, and availability state.

## 4. Preview/Commit Alignment Markers

`createPreviewAlignmentMarkers` is the shared non-persistent marker shape for 6C.2.

It uses available non-invasive fields:

- `action_window_id`
- `context_version`
- `interaction_domain`
- `source_scene_id`
- `source_dialogue_id`
- `selected_option_id`
- `selected_option_kind`
- `domain_option_kind`
- optional `content_version`
- optional `availability_snapshot_id`

No schema migration was added. Persistent preview tokens remain deferred unless later 6C.4/6C.7 work proves they are necessary.

## 5. Exploration Preview Behavior

Shared helper coverage represents:

- Free Focus as `non_committing_inquiry`
- Beat Action preview as `committed_action`
- unavailable/locked exploration actions
- stale exploration preview/commit markers
- transition and endpoint expectation markers

Current runtime behavior is preserved:

- Free Focus is not a committed Beat Action preview. It is a non-committed inquiry and may produce existing authored minor output according to current design.
- Beat Action preview remains non-mutating.
- Beat Action commit is the place where committed outputs happen.

## 6. Dialogue Preview Behavior

Shared helper coverage represents:

- Clarifying Question as `non_committing_inquiry`
- Committed Social Move preview as `committed_action`
- dialogue exit as `exit_or_transition`
- relationship/social-state-sensitive move diagnostics
- Rusk endpoint expectation markers

Current runtime behavior is preserved:

- Clarifying Question is not a Committed Social Move preview. It remains a free/non-committed interaction and may produce existing authored minor output if current content allows it.
- Clarifying Question must not consume the committed social move slot.
- Committed Social Move preview must be non-mutating.
- Relationship/social meters and hidden checks remain player-hidden.

## 7. Commit Validation Against Preview/Current State

`validateCommitAgainstPreviewContext` compares:

- preview markers
- commit request
- current active markers

It checks:

- interaction domain
- action window id
- source scene/dialogue id
- selected option id
- selected option kind
- context version

If anything changed, it returns a safe stale recovery response and GM/dev diagnostics with mismatch fields.

## 8. Preview-To-Result Expectation Mapping

`createPreviewExpectationMarker` defines what preview semantically promised.

Supported expectation kinds:

- `discovery`
- `progress`
- `transition`
- `social_consequence`
- `endpoint`
- `recovery`
- `availability`
- `no_commit`

`createResolutionOutcomeMarker` defines what commit produced.

Supported outcome marker kinds:

- `knowledge`
- `objective`
- `history`
- `latest_development`
- `state_write`
- `relationship_or_social_write`
- `transition`
- `completed_record`
- `endpoint`
- `recovery`
- `no_output`

`comparePreviewExpectationsToResolution` aligns semantic categories without requiring exact prose.

Examples:

- Preview says an action may reveal a clue -> resolution may grant knowledge.
- Preview says an action may advance a route -> resolution may transition or unlock a route.
- Preview says social pressure may affect an NPC -> resolution may include a safe social consequence.
- Preview says confrontation may escalate -> resolution may reach endpoint/awaiting support.

## 9. Unavailable And Locked Preview Behavior

Unavailable preview validation returns:

- safe player message
- no mutation fields
- no hidden requirements
- no raw failed requirements
- GM/dev diagnostics with hidden requirement details when supplied

Commit attempts against stale/locked preview markers use the same safe recovery pattern.

## 10. Stale Preview And Stale Commit Behavior

Covered cases in shared tests:

- preview request passed to the wrong active scene/window
- closed/resolved action window represented in active state
- commit selected option differs from preview option
- current context version changed after preview

Expected behavior:

- no mutation in preview
- safe player recovery response
- GM/dev mismatch diagnostics
- player payload passes hidden-data denylist

Runtime-specific stale handling remains in existing exploration/dialogue services until 6C.4/6C.5 migration work.

## 11. Duplicate Preview And Duplicate Commit Behavior

Duplicate preview:

- alignment markers are deterministic for the same request/context
- repeated previews remain non-mutating
- player projection hides diagnostic marker internals

Duplicate commit:

- full idempotency remains deferred to 6C.4
- 6C.2 adds shared stale/duplicate diagnostic shape so duplicate or old commits can be explained consistently

## 12. Player Projection Safety

`projectResolutionResponseForPlayer` now projects preview payloads through a safe preview allowlist.

Player preview/result payloads omit:

- preview alignment markers
- expectation markers
- hidden requirements
- check metadata internals
- GM/dev diagnostics
- branch ids
- raw state writes
- raw relationship/social state
- internal routing
- combat/future-supported internals
- source file paths
- path harness metadata
- stack traces/internal errors

`gm_dev_details` and `gmDevDetails` were added to the shared hidden-field denylist.

## 13. GM/Dev Diagnostics

`createPreviewConsistencyDiagnostics` captures:

- preview request
- preview validation result
- preview alignment markers
- preview expectation markers
- commit request
- commit validation result
- selected outcome
- resolution outcome markers
- preview/result alignment status
- stale/duplicate/idempotency result
- hidden requirements
- check metadata
- mismatch/recovery reason

`createPreviewConsistencyTrace` embeds this diagnostic shape into the 6C.1 trace envelope without adding persistence.

Full trace persistence remains deferred to 6C.7.

## 14. Greyvale Acceptance Extension

The Greyvale vertical slice fixture now includes `preview_consistency_assertions` and semantic preview markers for:

- Broken Caravan inspection: preview expects discovery, resolution marker is knowledge.
- Tomas dialogue move: preview expects discovery/social consequence, resolution markers include knowledge/social consequence.
- Rusk confrontation: preview expects social consequence/endpoint, resolution markers include social consequence/endpoint.

The DB-backed acceptance test fixture-shape assertion now checks those metadata fields when the local DB-backed acceptance suite can run.

## 15. Tests Added

`backend/test/interaction-core-preview-consistency.test.js` covers:

- preview request consistency validation
- commit-shaped preview rejection
- stale/closed/mismatched preview recovery
- preview response non-mutation enforcement
- commit validation against preview/current markers
- semantic expectation/result alignment
- unavailable/locked preview safety
- duplicate preview stability
- GM/dev diagnostics and player-hidden internal handoff data

`npm run test:interaction-core` now includes this suite.

## 16. Known Limitations

- Runtime services are not fully routed through these helpers yet.
- Existing DB-backed exploration/dialogue lifecycle tests continue to cover current runtime behavior.
- Persistent preview tokens are not added.
- Shared duplicate/stale no-mutation idempotency decision helpers were added in 6C.4, but full durable replay of prior committed results remains runtime-owned.
- Shared outcome-quality/consequence-framing helpers were added in 6C.3, but full runtime adapter migration remains incremental.
- Full transition orchestration belongs to 6C.5.
- Full result bundle/read-model/UI rendering belongs to 6C.6.
- Full GM/dev trace persistence/inspector belongs to 6C.7.

## 17. Behavior Preservation

No authored Greyvale outcomes were changed.

No major story content, combat, navigation, AI narration, SMS requirement, rules transparency expansion, major UI redesign, or database/schema migration was added.
