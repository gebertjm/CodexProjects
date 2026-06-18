# Stage 6D.3 - Authoritative Roll And Rules Resolution Foundation

Status: implemented as a pure rules-resolution foundation  
Date: 2026-06-16  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)

## Executive Result

Stage 6D.3 adds a reusable, ruleset-aware combat mathematics foundation for Dungeons & Dragons Fifth Edition 2014.

No live player combat behavior was activated. No Rusk handoff was changed. No player combat route was exposed. No Flutter combat UI was added. No database migration was added. No Stage 6D.4 action/effect/resource framework was started.

The foundation module lives at:

```text
backend/src/engine/combat/rulesResolution.js
```

The focused tests live at:

```text
backend/test/stage6d3-rules-resolution-foundation.test.js
```

The Stage 6D command now includes 6D.1, 6D.2, and 6D.3 coverage:

```text
npm run test:stage:6d
```

## Repository Evidence Used

Stage 6D.1 already established:

- explicit `dnd5e` / `2014` combat ruleset identity
- combat adapter contract and player/GM-dev projection boundaries
- parent-turn, sub-resolution, interrupt, transition, next-beat, and Rusk handoff contracts

Stage 6D.2 verified:

- legacy `calculateAbilityModifier` behavior
- legacy d20 and damage override seams for deterministic tests
- legacy attack hit/miss and natural 1/20 behavior
- current legacy critical hit gap: natural 20 marks critical but does not double damage dice
- current legacy typed damage gap: damage labels are preserved but resistance, vulnerability, and immunity are not applied
- current temporary-hit-point arithmetic

## Architecture Implemented

Stage 6D.3 adds pure calculation helpers under the existing combat engine folder instead of routing live combat through them immediately.

Dependency posture:

```text
future combat adapter/action framework
-> backend/src/engine/combat/rulesResolution.js
-> verified ability modifier helper from combatEngine.js
-> Stage 6D.1 ruleset identity constants
```

The legacy `combatEngine.js` remains unchanged. Existing player and internal combat routes continue using the legacy behavior until later Stage 6D adapter stages deliberately switch them.

## Rules Provider

The rules provider is explicit and versioned:

```js
resolveRulesProvider({
  system: 'dnd5e',
  rules_version: '2014',
})
```

Supported:

```text
system: dnd5e
rules_version: 2014
```

Unsupported or missing identities throw explicit safe errors. The resolver does not silently default to 2014 when a rules identity is required.

## Roll Source And Roll Record Contract

The foundation supports:

- live server random rolls
- deterministic automated test overrides
- authorized GM/developer override provenance values for later use
- stable roll records
- reuse of an existing finalized roll record without calling random again
- immutable finalized roll-record objects

Roll records include:

- `roll_id`
- `ruleset_id`
- `rules_version`
- `roll_category`
- `dice_expression`
- `dice_definition`
- `raw_die_results`
- `selected_die_results`
- `discarded_die_results`
- `advantage_sources`
- `disadvantage_sources`
- `effective_roll_mode`
- `roll_mode_canceled`
- modifier values and provenance
- `natural_die_result`
- `final_total`
- actor, target, source, effect-step, parent-resolution, and sequence references where supplied
- `generation_origin`
- reuse provenance
- `finalized`

Player-safe projections do not expose override controls, raw roll records, mutation plans, database details, hidden AC/DC values, or GM/dev traces.

## D20 Resolution

D20 behavior follows 2014 rules:

- normal rolls use one d20
- advantage rolls two d20s and selects the higher
- disadvantage rolls two d20s and selects the lower
- multiple advantage sources do not add extra dice
- multiple disadvantage sources do not add extra dice
- advantage and disadvantage cancel to a normal one-die roll
- source lists remain in the trace even when canceled
- modifiers apply after die selection

## Attack Resolution

Attack resolution supports:

- explicit modifier list with provenance
- explicit target Armor Class for internal calculation
- natural 1 automatic miss
- natural 20 automatic hit
- natural 20 critical-hit marker
- hit when total equals or exceeds AC
- cover or other caller-supplied modifiers
- roll-record reuse
- player-safe summary without exact hidden AC

Critical damage is handled by the damage resolver, not by the attack resolver alone.

## Saving Throws

Saving throw resolution supports:

- ability label
- explicit modifier list
- explicit Difficulty Class for internal calculation
- advantage and disadvantage
- success when total equals or exceeds DC
- natural 1 and natural 20 do not automatically decide ordinary saving throws
- player-safe summary without hidden DC

The success-policy helper supports:

- full effect on failure
- half damage on success, rounded down
- no damage/effect on success

## Ability Checks And Contested Checks

Ability checks support:

- ability label
- explicit modifiers
- advantage and disadvantage
- optional DC
- open checks with no invented success/failure
- no ordinary natural 1/20 automatic success or failure

Contested checks support:

- independent actor and opponent check inputs
- actor win
- opponent win
- tie/status quo

No Grappled, Prone, movement, condition, or state mutations are implemented in this stage.

## Damage Types

The foundation validates the standard 2014 damage types:

- acid
- bludgeoning
- cold
- fire
- force
- lightning
- necrotic
- piercing
- poison
- psychic
- radiant
- slashing
- thunder

Damage type normalization trims whitespace and lowercases known types. Unknown types fail safely. Healing is explicitly rejected as a damage type.

## Damage Components And Critical Dice

Damage is represented as ordered typed components. Each component can carry:

- component id and order
- damage type
- dice count and size
- raw dice rolls
- flat modifier
- additional numeric modifiers
- critical eligibility
- source/effect references
- pre-defense subtotal
- defense applications
- post-defense subtotal

2014 critical hit behavior is implemented:

- eligible attack-associated damage dice are doubled
- flat modifiers are added once
- non-critical-eligible components are not doubled
- components and damage types stay separate
- defenses apply after critical dice are rolled and subtotaled

## Damage Defenses

Resistance, vulnerability, and immunity are applied per typed component.

Order:

1. Immunity sets the matching component to zero.
2. Resistance halves the matching component and rounds down.
3. Vulnerability doubles the remaining matching component.

Multiple sources of the same defense type for the same damage type are recorded in provenance but do not stack.

Unrelated component damage types are not affected.

## Hit Point Application

The hit-point helper applies one resolved damage instance:

- summed post-defense damage applies to temporary hit points first
- remaining damage applies to current hit points
- current hit points floor at zero
- output includes before/after values
- output includes temporary-hit-point absorption
- output includes damage after temporary hit points
- output includes reached-zero and defeated flags

Separate hits should call the helper separately so temporary/current hit points update between hits.

## Calculation Traces

Rules results include structured traces sufficient for GM/dev reconstruction:

- ruleset/version
- operation type
- roll records
- raw and selected dice
- advantage/disadvantage sources
- modifier totals and provenance
- AC/DC internally where relevant
- hit/miss/success/failure/critical outcome
- damage components
- critical expansion
- defense applications and rounding
- temporary/current HP before and after
- reuse or override provenance

Trace data remains internal/GM-dev oriented. Player-safe projection is provided through `projectRulesResultForPlayer` and denylist checks.

## Legacy Reuse And Refactoring

| Component | Stage 6D.2 classification | Stage 6D.3 posture |
| --- | --- | --- |
| Ability modifier helper | Reuse | Reused from `combatEngine.js` via `abilityModifierFromScore`. |
| Legacy d20 override seam | Reuse/refactor | Replaced at foundation level with explicit roll-record/origin contract. Legacy helper unchanged. |
| Attack AC/nat 1/nat 20 behavior | Reuse/refactor | Reimplemented as pure resolver with roll records and player-safe projection. Legacy helper unchanged. |
| Critical hit damage | Refactor in 6D.3 | Implemented in `resolveDamage`; live legacy resolver unchanged. |
| Typed damage labels | Refactor in 6D.3/6D.4 | Validated in foundation and preserved per component. |
| Resistance/vulnerability/immunity | Missing | Implemented as pure per-component defense resolver. |
| Temporary HP arithmetic | Reuse/refactor | Implemented as pure `applyDamageToHitPoints`; legacy helper unchanged. |

## Persistence And Migration Status

No database migration was added.

Stage 6D.3 produces stable serializable roll and calculation records but does not persist them. Existing combat action logs may be able to store some calculation details in JSON, but durable first-class roll identity remains an unproven Stage 6D.12 persistence concern.

Current posture:

| Concept | Support now |
| --- | --- |
| Roll record shape | Directly supported in pure domain object |
| Roll reuse | Supported by supplying an existing finalized roll record |
| Durable roll storage | Not activated; potentially stored in existing log JSON later |
| Dedicated roll table/idempotency columns | Not added; migration not proven necessary |
| GM/dev trace persistence | Not added; trace remains response/test scoped |

## Tests Added

`backend/test/stage6d3-rules-resolution-foundation.test.js` covers:

- ruleset/provider selection and unsupported version failure
- authoritative live roll range
- deterministic test override provenance
- existing roll-record reuse without random calls
- immutable finalized roll records
- player input cannot directly override live rolls
- advantage, disadvantage, cancellation, and modifier timing
- attack hit/miss/natural 1/natural 20/critical marker/cover/reuse/player projection
- saving throw DC comparison and success policies
- ability checks and open checks
- contested checks and status quo ties
- standard damage type validation and healing rejection
- critical damage dice doubling and flat-modifier behavior
- resistance, vulnerability, immunity, stacking, rounding, and provenance
- multiple typed components
- temporary/current HP application
- internal trace reconstruction
- player-safe projection denylist

## Validation

Commands run during implementation:

```text
npm run test:stage:6d
node --check src\engine\combat\rulesResolution.js
node --check test\stage6d3-rules-resolution-foundation.test.js
node --test --test-concurrency=1 test\stage6d3-rules-resolution-foundation.test.js
```

The Stage 6D command passed with 37 tests after adding 6D.3.

## Known Limitations

- The live legacy combat engine still does not use this foundation.
- Roll records are serializable and reusable but not yet durably persisted as first-class records.
- Action/effect authoring, resource consumption, conditions, concentration, movement, reactions, multi-target orchestration, encounter completion, and Rusk combat activation remain future stages.
- Player-facing combat UI remains absent by design.

## Stage 6D.4 Readiness

The repository is ready for Stage 6D.4 - Action, Effect, and Resource Framework.

Stage 6D.4 can build authored combat actions and effects on this foundation without duplicating:

- ruleset/version resolution
- d20 advantage/disadvantage
- attack/save/check/contest math
- typed damage validation
- critical damage expansion
- resistance/vulnerability/immunity handling
- temporary/current HP damage application
- player-safe rules projection

No Stage 6D.4 blocker was introduced by this work.
