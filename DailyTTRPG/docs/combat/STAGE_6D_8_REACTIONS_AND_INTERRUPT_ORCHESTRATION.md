# Stage 6D.8 - Reactions And Interrupt Orchestration

Status: implemented as a service-bound reaction interrupt runtime  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.6 Positioning Movement Zones Cover Reach And Size](STAGE_6D_6_POSITIONING_MOVEMENT_ZONES_COVER_REACH_SIZE.md)
- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)

## Executive Result

Stage 6D.8 adds the first combat reaction and interrupt orchestration runtime.

The implementation is isolated to:

```text
backend/src/engine/combat/reactionInterruptRuntime.js
```

The focused tests live at:

```text
backend/test/stage6d8-reaction-interrupt-runtime.test.js
```

The Stage 6D command includes 6D.8:

```text
npm run test:stage:6d
```

No automatic enemy/allied turn orchestration, Rusk combat activation, encounter resolution, Flutter combat UI, Combat Focus, broad multi-target targeting, or database migration was added.

## Architecture

The reaction runtime sits beside the Stage 6D.7 player-turn runtime and uses the Stage 6D.1 combat adapter contracts for reaction interrupts, transition decisions, next-beat decisions, ruleset identity, player projections, and GM/dev diagnostics.

Implemented concepts:

- reaction definitions with trigger type, timing point, reaction resource cost, authored priority, nesting policy, and ruleset/version identity
- reaction resources with availability, spent sub-resolution, and turn-start refresh metadata
- reaction triggers with source state version, timing point, parent sub-resolution, continuation id, and player-safe summary
- continuation points that pause the parent resolution and later resume, cancel, terminate, or enter recovery-needed
- reaction queues ordered as mandatory effects, player reactions, deterministic allied/enemy/scripted reactions, then parent resume
- a single player reaction window with legal options and an explicit decline option
- non-mutating reaction previews
- committed reaction submit, decline, timeout-decline, stale, duplicate, conflicting-idempotency, unavailable, and recovery-needed responses
- player-safe read models and projections
- GM/dev projections and trace envelopes

The runtime remains service/domain scoped. Durable cross-request persistence hardening remains Stage 6D.12 unless later integration tests prove existing storage already covers the full contract.

## Definitions And Triggers

Supported reaction trigger contract values include:

- opportunity attack
- attack-hit-before-damage
- after damage
- before effect
- after effect
- scripted

Stage 6D.8 directly exercises opportunity attacks. Other trigger kinds are contract values for later stages and authored reactions.

Reaction definitions reject executable authoring such as function predicates or handler-like effect steps. Reactions remain deterministic and authored through the Stage 6D.4 action/effect/resource framework.

## Opportunity Attacks

Voluntary movement leaving threatened reach creates an opportunity-attack trigger and pauses the parent turn before the movement continuation completes.

The runtime suppresses ordinary opportunity candidates for:

- forced movement
- Disengage-protected movement
- entering reach only
- movement that does not leave reach

When a candidate exists, the parent turn enters `paused_for_reaction`, a continuation point is created, and the next step is a reaction decision or deterministic reaction resolution. Stage 6D.8 does not resolve opportunity attacks from inside Stage 6D.7 movement; it consumes the 6D.7 handoff.

## Preference Behavior

The supported preference values are:

- ask
- automatically use when legal
- automatically decline

Missing or invalid preferences default to ask. Automatic decline spends no reaction and resumes the parent continuation. Automatic use resolves only when the deterministic selection is unambiguous. If multiple materially different legal reactions share priority, the runtime falls back to ask.

The current implementation stores preferences in the service state shape used by tests. A player-facing preference editor is intentionally not included.

## Player Reaction Window

The player reaction window exposes:

- the trigger summary
- legal player-visible reaction options
- visible reaction cost
- additional visible resource costs
- reaction resource status
- timeout behavior
- decline option

Only one unresolved player reaction window can be open. A second overlapping window returns recovery-needed diagnostics rather than opening another prompt.

Decline and timeout-decline do not spend the reaction resource.

## Queue Ordering

Reaction queues are deterministic:

```text
mandatory effects -> player reaction window -> allied/enemy/scripted reactions -> resume parent
```

Within a phase, reactions are ordered by authored priority, initiative position where supplied, and reaction id. Deterministic non-player reactions revalidate immediately before resolution and record skipped reactions with reasons when state changes invalidate them.

Stage 6D.8 does not implement full automatic tactical turns. Deterministic reactions here are scoped to resolving queued reaction responses only.

## Submit, Stale, Duplicate, And Recovery

Reaction submit revalidates:

- the reaction window is open
- source state version matches the window
- the selected reaction option exists
- the reactor still has a reaction resource
- conditions still allow reactions
- the target remains valid
- opportunity-attack reach, hostility, perception, and authored prerequisites still hold
- additional resource costs remain available

Stale submit mutates nothing, spends no reaction, rolls no dice, and returns the current safe reaction read model. Duplicate submit with the same idempotency key and same operation returns the prior result. Conflicting idempotency key reuse is rejected without mutation.

Recovery-needed freezes ordinary reaction controls, preserves completed facts in GM/dev diagnostics, and returns a player-safe recovery message.

## Parent Continuation

Reaction resolution, decline, timeout-decline, or deterministic reaction completion resumes the parent continuation without replaying prior parent work. If the parent actor is defeated or inactive before resume, the parent turn is closed and the next decision reports parent termination.

Continuation data is GM/dev/internal. The player read model shows only a safe interrupted-parent summary.

## Nested Reactions

Nested reactions are rejected by default. The runtime provides an explicit exception registry for later narrow rules support. Registered exceptions can be allowed up to a configured depth, but Stage 6D.8 does not create an unbounded reaction stack and does not open nested player windows.

## Read Models And Visibility

Player reaction read models include:

- reaction state
- trigger summary
- legal reaction options
- decline option
- reaction resource status
- applied preference
- timeout behavior
- latest safe reaction event
- recovery-needed message when applicable

Player projections strip state, queues, continuation points, idempotency records, action-window internals, source-state versions, mutation plans, GM/dev traces, exact hidden stats, source paths, and test metadata.

GM/dev projections retain exact state, queue ordering, validation reasons, idempotency diagnostics, continuation ids, mutation evidence, and trace payloads.

## Persistence Boundary

No migration was added.

The current implementation is a stable serializable runtime boundary over existing combat domain objects and Stage 6C/6D contracts. It stores reaction windows, triggers, queues, resources, continuations, idempotency records, and latest reaction results in the service state passed through the runtime. Durable persistence, reload reconstruction, cross-request idempotency, and partial-failure repair remain Stage 6D.12 work unless later tests prove existing tables are sufficient.

## Legacy Reuse

Reused systems:

- Stage 6D.1 combat adapter contract for reaction sub-resolutions, transitions, next-beat decisions, and ruleset identity
- Stage 6D.3 authoritative roll resolution through Stage 6D.4 action resolution
- Stage 6D.4 action/effect/resource framework for reaction previews and committed reaction effects
- Stage 6D.5 condition legality for reaction availability
- Stage 6D.6 opportunity-attack candidate detection
- Stage 6D.7 parent-turn statuses and continuation boundary

No legacy player-unsafe combat route was exposed to the player app.

## Stage 6D.9 Readiness

Stage 6D.9 can consume:

- resolved or skipped deterministic reaction diagnostics
- parent-resume and parent-terminated next decisions
- reaction queue phase ordering
- reaction resource state
- continuation status
- recovery-needed status
- GM/dev trace payloads

Remaining Stage 6D.9 work:

- automatic enemy/allied turn orchestration
- initiative advancement through the full combat loop
- tactical profiles and scripted automatic participant turns
- encounter-resolution routing after combat concludes

## Tests

`backend/test/stage6d8-reaction-interrupt-runtime.test.js` covers:

- reaction definitions, ruleset/version identity, resources, preferences, and executable-authoring rejection
- opportunity-attack trigger creation and invalid-trigger suppression
- reaction eligibility, rejected reasons, player/deterministic separation, and GM/dev diagnostics
- deterministic queue ordering and single-window enforcement
- non-mutating previews
- committed submit, resource spend, parent resume, read-model refresh, and result bundles
- duplicate submit, conflicting idempotency, stale submit, unavailable submit, decline, and timeout-decline
- automatic use, automatic decline, and ambiguous fallback-to-ask preferences
- deterministic non-player reactions and skipped revalidation diagnostics
- parent continuation resume and termination
- nested reaction default rejection and exception policy
- recovery-needed behavior
- player-vs-GM projection safety
