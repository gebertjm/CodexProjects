# Stage 6D.4 - Action, Effect, And Resource Framework

Status: implemented as a pure action/effect/resource framework  
Date: 2026-06-16  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)
- [Stage 6D.3 Authoritative Roll And Rules Resolution Foundation](STAGE_6D_3_AUTHORITATIVE_ROLL_AND_RULES_RESOLUTION_FOUNDATION.md)

## Executive Result

Stage 6D.4 adds a deterministic, ruleset-aware action/effect/resource framework for combat actions.

The implementation is isolated to the backend combat engine library:

```text
backend/src/engine/combat/actionEffectResourceFramework.js
```

The focused contract/runtime tests live at:

```text
backend/test/stage6d4-action-effect-resource-framework.test.js
```

The Stage 6D command now includes 6D.4:

```text
npm run test:stage:6d
```

No live player behavior was changed. No player combat route was exposed. No Rusk combat handoff was activated. No Flutter combat UI was added. No database migration was added.

## Architecture

The framework sits above the Stage 6D.3 rules-resolution foundation and below the future Stage 6C-compatible combat adapter implementation:

```text
authored combat action definition
-> action/effect/resource framework
-> Stage 6D.3 rules resolution for attack/save/check/damage math
-> ordered structural result, player projection, GM/dev trace
```

Stage 6D.4 does not rewrite combat math. Attack rolls, saving throws, ability checks, contested checks, damage, hit-point damage application, and saving-throw success policies delegate to:

```text
backend/src/engine/combat/rulesResolution.js
```

The legacy combat service remains unchanged and continues to serve existing behavior until later Stage 6D stages deliberately route combat through the adapter.

## Action Contract

Combat actions are represented with:

- explicit `dnd5e` / `2014` ruleset identity
- stable `action_id`
- player label and description
- timing category
- target policy
- optional action-level resource costs
- ordered effect steps
- optional duration, concentration, and authored metadata

The framework rejects executable authoring fields such as handlers, scripts, functions, or code-like payloads. Actions are deterministic data contracts, not arbitrary runtime scripts.

Supported timing categories include:

- action
- bonus action
- reaction
- free interaction
- object interaction
- end turn

Stage 6D.4 only exercises the structural/action framework. It does not implement full turn orchestration, movement, reactions, or end-turn behavior.

## Target Policies

Functional support in this stage covers:

- self
- no target
- one supplied target

The contract also reserves structural support for:

- one creature
- one ally
- one enemy
- one selected creature
- selected targets up to a limit
- authored target group
- authored faction filter

Multi-target resolution remains deferred.

## Effect-Step Registry

The effect-step registry supports these effect types:

- attack roll
- saving throw
- ability check
- contested ability check
- direct damage
- healing
- temporary hit points
- apply condition instruction
- remove condition instruction
- resource spend
- resource restore
- concentration start hook
- concentration end hook
- authored state marker

Condition, concentration, and state-marker effects are structural instructions in this stage. Full condition lifecycle, concentration checks, zero-hit-point behavior, and encounter completion are deferred.

## Ordered Resolution

Committed action resolution proceeds in authored step order.

Resolution rules:

- preview never rolls dice, spends resources, or emits mutation instructions
- action-level costs are validated and spent once at commit
- step-level costs are only spent when the step is reached
- dependent steps can skip when their prerequisite outcome is not met
- malformed authored data returns a player-safe recovery-needed result
- GM/dev trace data keeps the internal reason

The framework supports duplicate handling by accepting an existing committed result and returning `duplicate_handled` without re-running effects.

## Resource Framework

Stage 6D.4 adds a generic combat resource model with tested support for:

- per-combat use
- short-rest use
- long-rest use
- charges
- current/max pool
- tiered pool
- cooldown
- recharge

Resource helpers include:

- resource-state normalization
- cost validation
- idempotent spend by committed resolution identity
- refresh helpers for per-combat, short rest, long rest, explicit charge restore, cooldown tick, and recharge roll

This framework is response/library scoped in Stage 6D.4. It does not add persistence columns or mutate live combat records.

## Legacy Stat-Block Normalization

Existing stat-block actions can be normalized into the Stage 6D.4 action contract.

The normalizer maps supported legacy fields into authored effect steps, including:

- attack roll
- saving throw
- direct damage
- authored state-marker fallback for recognized legacy effects

Unsupported legacy actions fail explicitly instead of silently exposing the old service response shape to player clients.

## Player Projection

Player projections are intentionally narrow.

They may include:

- action id and label
- status
- actor and target display references
- ordered step ids, effect types, status, and player summaries
- result bundle
- safe recovery message

They must not include:

- exact hidden AC/DC data
- raw roll records
- roll overrides
- GM/dev traces
- mutation instructions or plans
- raw resource internals
- idempotency internals
- source paths
- executable authoring fields

Contract tests assert the player projection denylist.

## GM/Dev Trace

GM/dev trace output is available from the pure framework helper and may include:

- selected authored action
- selected ordered effect steps
- action-level costs
- resource spend diagnostics
- mutation instructions
- hidden target stats before resolution
- resources after resolution
- recovery error code and message when malformed data is encountered

This trace is not returned through player projection helpers.

## Test-Only Neutral Actions Covered

The Stage 6D.4 tests cover neutral actions equivalent to:

- Test Strike
- Save Burst
- Heal
- Ward
- Restrain
- Cleanse
- Focus
- Limited Ability
- Combined Aid
- Secondary Save

These are test fixtures only. They do not add Greyvale story content or live combat options.

## Persistence And Migration Status

No database migration was added.

Current posture:

- authored action definitions are pure data contracts
- committed sub-resolution identity is carried in the result object
- resource spends are tracked in normalized resource-state payloads by committed resolution id
- mutation instructions are structural outputs, not live database writes
- GM/dev traces are generated in-memory from framework results

Potential later risks:

- persistent resource-spend idempotency may need a durable store once live combat routing is activated
- persisted sub-resolution records may need verification in Stage 6D.5+ against existing combat logs/action-window structures
- condition and concentration lifecycle persistence remains deferred until those systems are implemented

No persistence deficiency has been proven in this stage.

## Tests Added

Focused tests cover:

- action contract validation and ruleset identity
- executable authoring rejection
- legacy stat-block action normalization
- non-mutating preview
- ordered attack and damage resolution
- saving-throw policy with damage
- healing, temporary hit points, condition instructions, concentration hooks, and markers
- action-level and step-level resource spend timing
- resource category refresh behavior
- wrong owner, wrong tier, cooldown, insufficient, and idempotent spend handling
- recovery-needed player safety for malformed authored data
- player projection hidden-data denylist
- GM/dev trace availability

## Deferred Work

Deferred to later Stage 6D work:

- full combat turn engine
- movement resolution
- reaction interrupts
- condition lifecycle
- concentration lifecycle
- zero-hit-point behavior
- tactical AI
- encounter completion
- Rusk combat activation
- Flutter combat UI
- database persistence changes

## Stage 6D.5 Readiness

The repository now has a tested action/effect/resource framework that can be used by the later combat adapter implementation. Stage 6D.5 can focus on transition/turn orchestration and live adapter integration without needing to invent action/effect/resource semantics from scratch.

