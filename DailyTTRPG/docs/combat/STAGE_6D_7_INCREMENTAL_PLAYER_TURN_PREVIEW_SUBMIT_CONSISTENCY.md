# Stage 6D.7 - Incremental Player Turn And Preview/Submit Consistency

Status: implemented as a service-bound player-turn runtime  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)
- [Stage 6D.3 Authoritative Roll And Rules Resolution Foundation](STAGE_6D_3_AUTHORITATIVE_ROLL_AND_RULES_RESOLUTION_FOUNDATION.md)
- [Stage 6D.4 Action Effect And Resource Framework](STAGE_6D_4_ACTION_EFFECT_RESOURCE_FRAMEWORK.md)
- [Stage 6D.5 Conditions Concentration And Zero-Hit-Point Rules](STAGE_6D_5_CONDITIONS_CONCENTRATION_ZERO_HP_RULES.md)
- [Stage 6D.6 Positioning Movement Zones Cover Reach And Size](STAGE_6D_6_POSITIONING_MOVEMENT_ZONES_COVER_REACH_SIZE.md)

## Executive Result

Stage 6D.7 adds the first authoritative incremental player-turn runtime for combat.

The implementation is isolated to:

```text
backend/src/engine/combat/playerTurnRuntime.js
```

The focused tests live at:

```text
backend/test/stage6d7-player-turn-runtime.test.js
```

The Stage 6D command now includes 6D.7:

```text
npm run test:stage:6d
```

No live Flutter combat interface, Rusk combat handoff, encounter-resolution loop, reaction window, automatic enemy turn, or database migration was added.

## Parent-Turn Model

One parent player turn is opened for the supplied authoritative current participant. Stage 6D.7 does not advance initiative to create that turn; it consumes current-participant state supplied by later orchestration.

The parent turn tracks:

- combat id, actor participant id, round, initiative position, ruleset, and rules version
- opened and current state version
- action, bonus-action, free/object-interaction, reaction, and movement availability
- base movement, Dash-added movement, movement spent, and movement remaining
- committed sub-resolution ids in order
- current action-window id
- timeout/default metadata
- open, closed, stale, superseded, paused-for-reaction, and recovery-needed status contracts

Each committed operation creates a stable sub-resolution linked to the parent turn. This supports multiple movement segments, action, bonus action, object interaction, Wait, End Turn, and future reaction continuation metadata without redesign.

## Preview And Submit Lifecycle

Previews are non-mutating. They carry source-state version, preview identity, operation category, visible costs, visible risks, current legality, and safe unavailable reasons. Previews do not spend movement, spend resources, roll dice, reserve targets, close/open action windows, or mutate conditions.

Submits revalidate against the authoritative current turn:

- parent turn is open
- source-state version still matches
- action window still matches when supplied
- action economy and movement remain available
- actor conditions still allow the operation
- authored action timing and resources are legal
- movement route, standing, crawling, and destination are still legal

Material stale changes reject safely before any cost, roll, or mutation is applied. Duplicate submits with the same idempotency key and operation fingerprint return the original result boundary without rerolling or reapplying costs. Conflicting reuse of an idempotency key is rejected.

## Incremental Turn Behavior

The runtime supports movement before, between, and after actions while the parent turn remains open.

Implemented operations:

- normal movement through Stage 6D.6 route and movement-budget helpers
- standing from Prone by spending half speed and removing Prone
- crawling with doubled movement cost while Prone remains
- authored action submit through Stage 6D.4 and Stage 6D.3
- authored bonus action submit through the same action framework with bonus timing
- free/object interaction submit, plus action-cost object use routed through the action lifecycle
- Dash as an authored action or authored bonus action that adds movement without moving automatically
- Disengage as an authored action that suppresses ordinary opportunity candidates for protected movement
- Dodge as the actual 2014 rules action, not a separate Defend mechanic
- Wait as an irreversible action choice that consumes action, preserves movement/bonus/object/reaction, and does not create Ready
- End Turn as the operation that closes the parent turn

Using an action does not automatically end the turn. Movement, bonus action, and object interaction can remain legal after action resolution.

## End Turn Policy

End Turn closes the parent turn, closes the current action window, forfeits unused normal-turn action, bonus action, movement, and object interaction, preserves reaction according to current state, processes end-of-turn condition lifecycle hooks, and returns an automatic-continuation handoff for later initiative orchestration.

End Turn preview reports meaningful forfeitures only. Confirmation is required only when an actually legal and meaningful action, bonus action, movement choice, or object interaction remains. A slot or tiny movement remainder that cannot produce a legal option should not trigger a warning.

Duplicate End Turn is handled through the same idempotency boundary. Further normal submits after a closed turn are rejected as unavailable.

## Missed-Turn Default

The timeout default is:

```text
Dodge -> End Turn
```

If Dodge is illegal because the actor cannot act, the fallback takes no action and then ends the turn. The default does not move the actor, use an offensive action, spend limited resources, use a bonus action, use an object, or require End Turn confirmation.

The default records timeout provenance and remains duplicate-safe at the current service boundary. Player-configured defaults remain deferred.

## Reaction Boundary

Stage 6D.7 detects opportunity-attack candidates from voluntary movement and returns a structured `reaction_required` next decision with continuation metadata. Disengage suppresses ordinary opportunity candidates.

Stage 6D.7 does not open a player reaction window, resolve opportunity attacks, order multiple reactions, or consume reaction resources. Stage 6D.8 will consume the handoff and continuation data.

## Automatic-Turn Boundary

Stage 6D.7 returns an automatic-continuation or turn-closed handoff after End Turn or automatic closure. It does not run enemy or allied turns, advance initiative through the full combat loop, or apply tactical profiles. Stage 6D.9 owns that orchestration.

## Read Model And Result Bundle

After every committed sub-resolution, the runtime advances the current state version and refreshes a player-safe current-turn read model.

The read model includes:

- encounter title, combat status, round, current actor, visible participants, and visible conditions
- player hit points, temporary hit points, resources, concentration, and movement
- action, bonus action, reaction, object-interaction, and parent-turn status
- current zone, proximity, engagement, cover, visible movement destinations, and authored actions
- legal decision categories
- latest result bundle
- End Turn confirmation requirements
- safe next-step, stale, duplicate, unavailable, or recovery-needed messages

The player projection strips or rejects hidden and internal fields such as exact enemy AC/HP, hidden DCs, raw action-window state, idempotency keys, source-state internals, mutation plans, and GM/dev traces.

GM/dev traces retain validation, idempotency, mutation ordering, transition/next-beat decisions, continuation ids, action-window state, and sub-resolution counts.

## Automatic Closure And Recovery

The parent turn closes automatically when the actor cannot continue and no meaningful legal decision remains, such as Unconscious, Stunned/Incapacitated with no legal decision, defeated/inactive actor, or recovery-needed supersession. Automatic closure does not apply the missed-turn Dodge default.

Recovery-needed marks the parent turn as unsafe for ordinary input, removes ordinary controls from the read model, preserves completed facts and diagnostics, and returns a player-safe recovery message. Durable partial-failure recovery remains Stage 6D.12 work.

## Persistence Boundary

No migration was added.

Stage 6D.7 is a stable serializable service/domain boundary over existing verified combat contracts. It preserves parent turn, sub-resolution, idempotency, result bundle, read model, trace, continuation, and action-window concepts in response/domain state. Full durable reload, cross-request duplicate guarantees, and partial-failure repair remain Stage 6D.12 unless existing storage proves sufficient in later integration tests.

## Stage 6D.8 Readiness

Stage 6D.8 can consume:

- `reaction_required` next-decision outputs
- continuation ids on movement sub-resolutions
- opportunity-attack candidate payloads
- parent turn status and action-window id
- source/result state versions
- actor reaction availability from the parent turn
- current player read model after movement interruption

Stage 6D.8 should pause and resume committed parent resolutions using these contracts rather than redesigning the player-turn runtime.

## Tests

`backend/test/stage6d7-player-turn-runtime.test.js` covers:

- parent turn opening/resume, ruleset validation, active combat, player-controlled actor, and scope checks
- action, bonus action, object, movement, Wait, and End Turn decision categories
- non-mutating previews for movement, action, bonus action, object interaction, standing, crawling, and End Turn
- stale submit rejection before rolls, costs, movement, or resource spending
- duplicate submit and conflicting idempotency behavior
- movement before and after action
- action, bonus action, object interaction, action-cost object use, Wait, Dash, Disengage, Dodge, standing, and crawling
- meaningful End Turn confirmation and closed-turn rejection
- missed-turn Dodge then End Turn and illegal-Dodge fallback
- automatic closure and recovery-needed state
- player-safe read models/projections and GM/dev context retention
