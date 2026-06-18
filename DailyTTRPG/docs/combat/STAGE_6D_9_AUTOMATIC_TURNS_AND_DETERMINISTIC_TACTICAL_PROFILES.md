# Stage 6D.9 - Automatic Turns And Deterministic Tactical Profiles

Status: implemented as a service-bound automatic turn runtime  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)
- [Stage 6D.8 Reactions And Interrupt Orchestration](STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)

## Executive Result

Stage 6D.9 adds deterministic automatic combat orchestration for non-player participants.

The implementation is isolated to:

```text
backend/src/engine/combat/automaticTurnRuntime.js
```

The focused tests live at:

```text
backend/test/stage6d9-automatic-turn-runtime.test.js
```

The Stage 6D command includes 6D.9:

```text
npm run test:stage:6d
```

No Rusk combat activation, encounter aftermath, rewards, Flutter combat UI, Combat Focus, broad multi-target/area targeting, participant entry/exit/re-entry, faction-change mutation, AI/LLM tactics, hidden random selection, or database migration was added.

## Tactical-Profile Architecture

The automatic runtime defines declarative tactical profiles with:

- stable profile id and version
- explicit D&D 5e 2014 ruleset identity
- profile scope and applicability
- ordered action-priority rules
- declarative use conditions
- faction-aware target selectors
- positioning preferences
- retreat and surrender thresholds
- resource-conservation rules
- scripted overrides
- safe fallback behavior
- tie-break and information-access policy fields
- GM/dev provenance

Executable authoring is rejected. Profiles cannot carry function predicates, arbitrary handlers, opaque scorers, or generated tactical logic.

## Profile Precedence

The implemented precedence order is:

```text
encounter scripted override
participant profile
encounter-role profile
stat-block profile
faction profile
conservative default profile
```

The runtime chooses each effective profile field from the highest applicable profile that supplies that field and records field provenance for GM/dev traces. It does not silently merge contradictory rule lists.

## Deterministic Selection Algorithm

The runtime builds an actor-observable tactical context, then evaluates:

1. surrender thresholds
2. retreat thresholds
3. active scripted overrides
4. ordered action-priority rules
5. safe fallback

Rules are evaluated in declared order. Target and movement ties are broken by stable ids only after authored selectors are exhausted. There is no random action choice, no hidden randomness, no LLM decision-making, and no opaque utility scoring.

After every committed operation, the automatic orchestration loop rebuilds tactical context from the current state before selecting the next operation.

## Information Policy

Automatic participants can use:

- their own exact state
- visible participants
- visible participant conditions and health bands
- perceived position/proximity/cover fields supplied by the spatial runtime
- current faction relationships
- authored encounter flags and scripted phase
- their own resources and action availability

They cannot use hidden participants, secret player resources, hidden reactions, source paths, GM/dev metadata, future random outcomes, or private narrative information that is not present in the tactical context.

GM/dev traces retain rejected targets, profile provenance, resource decisions, and selector reasoning. Player-safe events do not expose those internals.

## Automatic-Turn Lifecycle

The automatic lifecycle is:

```text
current initiative participant
-> validate control mode
-> open automatic parent turn
-> process start-of-turn condition and reaction refresh hooks
-> resolve effective tactical profile
-> select deterministic operation
-> execute via Stage 6D.7 operation submit
-> pause through Stage 6D.8 if a player reaction is required
-> rebuild context after each commit
-> use fallback when no preferred operation remains legal
-> End Turn without confirmation
-> advance initiative
-> continue until a real player decision or terminal handoff
```

The runtime stops at:

- player-controlled turn
- GM/dev-controlled turn
- player reaction window
- encounter-resolution handoff
- unavailable or recovery-needed state
- deterministic loop guard

No meaningless Continue click is introduced between automatic turns.

## Allied Behavior

Friendly non-player allies use deterministic authored behavior by default. They do not become player-controlled merely because they are friendly to the active character.

The tests cover an allied participant acting automatically, targeting hostile factions, and using an authored protection-style selector. Player-safe output records what the ally did but does not offer player controls for the ally turn.

## Enemy And Scripted Behavior

Enemy participants use deterministic tactical profiles rather than the legacy first-legal-attack selector. The legacy selector remains unchanged as verified historical behavior, but Stage 6D.9 routes new automatic-turn contracts through `automaticTurnRuntime.js`.

Scripted participants can use encounter-specific scripted overrides. Overrides must still pass normal legality validation and resolve through Stage 6D.7 operation submits. Illegal overrides fall through to normal profile/fallback behavior.

## Retreat And Surrender Boundary

Retreat is an intent/positioning decision. The runtime can select movement toward an authored visible retreat route when the configured hit-point threshold is met. It does not end combat or apply rewards/aftermath.

Surrender requires both:

- a qualifying combat threshold
- an authored narrative permission flag

Low hit points alone do not cause surrender. Surrender records intent only; final encounter outcome and aftermath remain deferred.

## Reaction Integration

Automatic movement can produce an opportunity-attack handoff. Stage 6D.9 calls the Stage 6D.8 reaction runtime, opens a player reaction window where needed, and stops orchestration at `player_reaction_required`.

If deterministic reactions resolve or decline automatically, orchestration can continue without replaying the parent operation and without requiring a Continue click.

## Player-Safe Event Output

The runtime creates ordered automatic events containing:

- actor
- operation category
- action label when visible
- destination when visible
- target health band when visible
- safe summary
- turn grouping and event order

Player-safe events omit tactical-profile internals, rejected actions, hidden participants, exact hidden stats, mutation plans, source state versions, idempotency keys, and GM/dev traces.

Presentation/playback timing is explicitly outside this stage. State commits are authoritative before event presentation.

## Persistence Boundary

No migration was added.

Current Stage 6D.9 state remains service/domain scoped over existing combat state objects:

- tactical profiles
- automatic events
- automatic traces
- automatic parent turns
- idempotency records
- loop-guard state

The runtime uses existing serializable parent-turn, sub-resolution, action result, reaction continuation, and initiative fields. Durable reload reconstruction, cross-request orchestration resume, and partial-failure repair remain Stage 6D.12 risks unless later integration tests prove current storage sufficient.

## Stage 6D.10 Readiness

Stage 6D.10 can consume:

- actor-observable tactical context
- faction-aware target candidate filtering
- target selector contracts
- positioning selector contracts
- scripted override contracts
- player-safe automatic event output
- GM/dev trace shape
- automatic chain stop conditions

Deferred Stage 6D.10 work:

- broad multi-target and area-effect target inclusion
- visible ally area confirmation
- hidden participant area inclusion
- participant entry, exit, and re-entry
- faction-change mutation
- richer encounter-completion reevaluation after participant dynamics

## Tests

`backend/test/stage6d9-automatic-turn-runtime.test.js` covers:

- declarative tactical profile validation and ruleset identity
- profile precedence and field provenance
- faction-aware target selection and hidden participant exclusion
- resource-conservation rules
- ordered action priorities, scripted overrides, and fallback behavior
- retreat and surrender thresholds
- automatic enemy, ally, and scripted turn opening
- player turn stop behavior
- movement, action, bonus action, object interaction, Wait, and End Turn execution
- stale and duplicate automatic operation handling
- player reaction interruption and no-Continue resumption boundary
- automatic chaining through enemy and ally turns until player turn
- loop guards and recovery-needed state
- player-safe event/read-model projection and GM/dev traces
