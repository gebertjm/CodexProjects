# Stage 6D.5 - Conditions, Concentration, And Zero-Hit-Point Rules

Status: implemented as a pure combat-state lifecycle foundation  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)
- [Stage 6D.3 Authoritative Roll And Rules Resolution Foundation](STAGE_6D_3_AUTHORITATIVE_ROLL_AND_RULES_RESOLUTION_FOUNDATION.md)
- [Stage 6D.4 Action Effect And Resource Framework](STAGE_6D_4_ACTION_EFFECT_RESOURCE_FRAMEWORK.md)

## Executive Result

Stage 6D.5 adds a reusable, ruleset-aware condition, concentration, and zero-hit-point lifecycle module.

The implementation is isolated to:

```text
backend/src/engine/combat/conditionStateLifecycle.js
```

The focused tests live at:

```text
backend/test/stage6d5-condition-concentration-zero-hp.test.js
```

The Stage 6D command now includes 6D.5:

```text
npm run test:stage:6d
```

No live player combat behavior was activated. No Rusk-specific combat resolution was implemented. No Flutter combat UI was added. No database migration was added.

## Repository Evidence Used

Existing combat persistence already includes:

- `dnd5e_combat_participant` with current HP, max HP, temporary HP, active state, and defeated state
- `dnd5e_combat_condition` with participant, condition type, source, duration type/value, notes, and created time
- combat action logs with mechanical detail JSON
- existing combat service reload of participants, logs, and conditions
- Stage 6D.3 authoritative roll and damage helpers
- Stage 6D.4 structural condition/concentration effect instructions

Stage 6D.2 classified defeat handling and condition mechanics as refactor targets for this stage.

## Architecture Implemented

Stage 6D.5 adds a pure service boundary:

```text
combat adapter / turn orchestration
-> action/effect/resource framework
-> conditionStateLifecycle.js
-> rulesResolution.js for saving throws
-> mutation-ready state changes and traces
```

The module provides:

- condition definitions
- condition instances
- condition application, stacking, replacement, duplicate detection, removal, and expiration
- condition effect evaluation for attacks, saves, checks, movement, actions, reactions, capabilities, targeting, and proximity-dependent hooks
- concentration start, replacement, end, damage save, incapacitation/unconscious end, and carry-forward helpers
- zero-hit-point policy selection
- death saving throws
- damage at zero HP
- stabilization and natural recovery metadata
- healing from zero HP
- nonlethal defeat
- combat-end persistence evaluation
- player-safe projections
- GM/dev traces

The module does not advance turns, spend movement, calculate zones/reach geometry, open reaction windows, determine encounter victory, or mutate database rows.

## Condition Definitions And Instances

Definitions are explicit for:

- stable condition id
- player-safe name
- internal name
- ruleset and version
- support status
- movement effects
- action, bonus-action, and reaction restrictions
- attack and attacks-against-target modifiers
- saving throw and ability check effects
- visibility, awareness, and speech effects
- stacking policy
- persistence policy
- player-safe description
- GM/dev provenance

Instances include:

- condition instance id
- condition type
- ruleset and version
- source participant
- target participant
- duration and expiration data
- stacking key
- persistence policy
- concentration linkage
- committed resolution id
- active/expired state
- player text
- GM/dev trace metadata

Executable condition authoring fields such as `handler`, `script`, `code`, or functions are rejected.

## Fully Supported Conditions

The following D&D 5e 2014 conditions are fully supported for Stage 6D-relevant mechanics.

### Prone

Implemented:

- own attacks have disadvantage
- attacks against the Prone target gain advantage within five feet
- attacks against the Prone target have disadvantage beyond five feet
- missing proximity context returns insufficient context
- standing cost is half current speed
- cannot stand with insufficient movement
- cannot stand at speed zero
- standing removes Prone through a mutation-ready instruction
- crawling preserves Prone

Stage 6D.6 will spend movement and provide distance/reach context.

### Grappled

Implemented:

- speed zero
- speed bonuses do not restore movement
- no automatic attack disadvantage
- source relationship metadata
- expiration when the grappler becomes Incapacitated
- expiration on explicit release
- expiration on supplied relationship-invalid event

Stage 6D.6 will implement the Grapple action, dragging/carrying, reach validation, and movement separation checks.

### Restrained

Implemented:

- speed zero
- no speed bonuses
- own attacks have disadvantage
- attacks against the target have advantage
- Dexterity saving throws have disadvantage
- unrelated saves are unaffected

### Poisoned

Implemented:

- attack rolls have disadvantage
- ability checks have disadvantage
- saving throws are unaffected unless another effect applies

### Frightened

Implemented:

- attacks have disadvantage while the fear source is visible
- ability checks have disadvantage while the fear source is visible
- no disadvantage when source visibility is explicitly false
- willingly moving closer to the source is illegal when visible
- forced movement is allowed
- missing visibility or proximity context returns insufficient context

Stage 6D.6 will provide visibility and proximity context.

### Blinded

Implemented:

- cannot see capability flag
- sight-required ability checks automatically fail
- non-sight checks may proceed
- own attacks have disadvantage
- attacks against the target have advantage

### Stunned

Implemented:

- composed Incapacitated behavior
- cannot move
- speed zero
- speech is faltering
- Strength and Dexterity saving throws automatically fail
- other saves proceed normally
- attacks against the target have advantage

### Incapacitated

Implemented:

- cannot take actions
- cannot take bonus actions
- cannot take reactions
- action-like object interactions are blocked through the same capability result
- movement is not automatically set to zero
- attacks against the target do not automatically gain advantage
- saving throws do not automatically fail

### Unconscious

Implemented:

- composed Incapacitated and Prone behavior
- cannot move
- cannot speak
- unaware
- Strength and Dexterity saving throws automatically fail
- attacks against the target have advantage
- a hit within five feet is flagged as critical
- no automatic critical is flagged without close context
- held-item drop instruction is produced
- concentration can be ended through participant event helpers

## Deferred Conditions

The following conditions are structurally supported but behavior-deferred:

- Charmed
- Deafened
- Invisible
- Paralyzed
- Petrified
- Exhaustion

They may be applied, projected, persisted, and traced safely. Their mechanics are not silently approximated. Evaluators return support warnings instead of pretending full behavior is active.

## Concentration Lifecycle

Implemented:

- start concentration when participant is capable
- reject starting concentration when Incapacitated
- replace an existing concentration effect
- remove prior linked effects on replacement
- voluntary concentration end with no action cost
- idempotent repeated end
- end concentration when participant becomes Incapacitated or Unconscious
- damage-triggered concentration saves
- save DC `max(10, floor(damage / 2))`
- damage one through twenty-one uses DC 10
- damage twenty-two uses DC 11
- temporary hit points do not suppress the save because the caller passes final damage taken
- one damage instance produces one save
- separate hits call the helper separately
- success preserves concentration
- failure ends concentration and returns linked effects to remove
- deterministic roll overrides and reused roll records through Stage 6D.3
- combat-end carry-forward for valid concentration
- round duration conversion to seconds
- no background scheduler requirement

## Zero-Hit-Point Lifecycle

Implemented:

- ordinary enemy defeat
- death-save-eligible participant transition to Unconscious, Incapacitated, and Prone
- important NPCs can use the death-save-eligible policy
- protected zero-HP state
- concentration end instruction on zero HP
- massive damage death when overkill equals or exceeds maximum HP
- protected policy override for massive damage
- death saving throws
- natural 1 adds two failures
- natural 20 restores 1 HP and resets counters
- 10 or higher succeeds
- 9 or lower fails
- three successes stabilize
- three failures cause death
- damage at zero HP adds failures
- critical damage at zero HP adds two failures
- Stable is removed by damage
- stabilization resets counters and records natural recovery metadata
- natural Stable recovery can be advanced by authoritative time
- healing from zero HP resets death saves, removes zero-HP Unconscious/Incapacitated/Stable, and preserves Prone
- ordinary healing does not revive Dead
- nonlethal melee defeat requires intent declared before damage
- default nonlethal is limited to melee weapon attacks unless an authored exception exists

## Persistence Boundary

No migration was added.

Current storage mapping:

| Concept | Current support | Stage 6D.5 posture |
| --- | --- | --- |
| Combat participant HP/temp HP | Directly supported | Reused by later mutation application |
| Active/defeated flags | Directly supported | Reused for ordinary enemy defeat |
| Combat conditions | Directly supported as simple rows | Sufficient for condition type/source/duration; richer metadata remains service-level until persistence is proven deficient |
| Action logs | JSON mechanical detail | Candidate location for roll/death-save/concentration trace references |
| Persistent character conditions | Existing character condition table | Not mutated in this stage |
| Concentration | No first-class verified table | Service/domain state only in this stage |
| Death-save state | No first-class verified table | Service/domain state only in this stage |

Potential Stage 6D.12 risks:

- durable concentration identity may need first-class persistence once live combat routing is activated
- death-save state may need first-class persistence if action logs/result JSON are insufficient
- richer condition metadata may need persistence if existing `notes`/duration fields are insufficient

No reproducible persistence deficiency was proven here.

## Stage 6D.6 Readiness

Stage 6D.6 can consume these hooks:

- Prone standing cost and standing-removes-Prone instruction
- Prone close/far attack context
- Grappled source-incapacitation, release, and relationship-invalid expiration
- Frightened visibility/proximity movement decision
- Unconscious close-hit critical flag
- condition capability flags for movement and targeting
- deferred-condition support warnings

The movement, zone, cover, reach, size, Grapple, and Shove systems should provide explicit context to these helpers rather than redesign condition behavior.

## Tests Added

`backend/test/stage6d5-condition-concentration-zero-hp.test.js` covers:

- definition validation
- deferred support status
- executable authoring rejection
- application, stacking, duplicate, and removal behavior
- Prone hooks
- Grappled, Restrained, Poisoned, Frightened, Blinded, Stunned, Incapacitated, and Unconscious hooks
- lifecycle event expiration
- concentration start, replacement, end, incapacitation, damage save, and carry-forward
- zero-hit-point policy selection
- death saves
- stabilization and natural recovery
- healing from zero HP
- nonlethal defeat
- combat-end persistence
- player-safe projections and GM/dev trace separation

## Deferred Work

Deferred to later Stage 6D work:

- movement pathing and movement spending
- zones, reach, cover, and size
- Grapple and Shove actions
- reaction windows
- turn and round orchestration
- encounter resolution
- Rusk combat resolution
- Flutter combat UI
- database persistence changes
- resurrection and broad inventory/equipment handling

