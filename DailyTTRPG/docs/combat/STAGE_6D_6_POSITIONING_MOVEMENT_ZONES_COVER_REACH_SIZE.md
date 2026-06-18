# Stage 6D.6 - Positioning, Movement, Zones, Cover, Reach, And Size

Status: implemented as a pure abstract-combat spatial foundation  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)
- [Stage 6D.3 Authoritative Roll And Rules Resolution Foundation](STAGE_6D_3_AUTHORITATIVE_ROLL_AND_RULES_RESOLUTION_FOUNDATION.md)
- [Stage 6D.4 Action Effect And Resource Framework](STAGE_6D_4_ACTION_EFFECT_RESOURCE_FRAMEWORK.md)
- [Stage 6D.5 Conditions Concentration And Zero-Hit-Point Rules](STAGE_6D_5_CONDITIONS_CONCENTRATION_ZERO_HP_RULES.md)

## Executive Result

Stage 6D.6 adds a deterministic, abstract spatial and movement layer for future combat adapter integration.

The implementation is isolated to:

```text
backend/src/engine/combat/spatialMovement.js
```

The focused tests live at:

```text
backend/test/stage6d6-spatial-movement.test.js
```

The Stage 6D command now includes 6D.6:

```text
npm run test:stage:6d
```

No live player combat behavior was activated. No Rusk combat handoff was changed. No grid, coordinates, Flutter combat UI, or database migration was added.

## Spatial Model

Stage 6D.6 uses abstract, authored combat space rather than geometric positioning.

Supported proximity states:

- `engaged`
- `nearby`
- `distant`
- `out_of_reach`

Proximity is pairwise between participants. Sharing a zone does not imply engagement, threatening, or valid targeting unless an authored relationship says so.

Optional named zones support:

- player-safe and internal names
- terrain and elevation labels
- cover and concealment defaults
- authored hazards
- capacity/crowding metadata
- escape route identifiers
- authored fallback placement metadata

Zone transitions are directed, explicit, and deterministic. The movement layer does not infer paths, shortest routes, or alternate traversal through unauthored space.

## Movement Model

Movement uses an abstract budget compatible with Dungeons & Dragons Fifth Edition 2014:

- base movement budget
- temporary bonuses
- temporary penalties
- Dash-compatible extra budget
- movement already spent
- remaining movement

Movement transitions support:

- normal cost
- difficult terrain cost
- blocked routes
- special authored cost
- crawling cost
- dragging cost

Difficult terrain is applied once even if multiple difficult sources are present. Crawling and dragging apply separately. Standing from Prone spends half of current speed and does not create an opportunity-attack candidate.

Stage 6D.6 does not implement full turn orchestration. It returns mutation-ready participant state changes and movement segments for the later adapter/turn engine.

## Condition Integration

Stage 6D.6 consumes Stage 6D.5 condition hooks:

- Grappled, Restrained, Stunned, Paralyzed, Petrified, and Unconscious set speed to zero through the shared condition evaluator.
- Frightened can prevent voluntary movement closer to a visible fear source when proximity context is supplied.
- Prone standing and crawling behavior use Stage 6D.5 Prone hooks.
- Incapacitated alone does not set speed to zero, preserving the 2014 rules distinction.

The spatial layer does not create a separate condition system.

## Cover And Visibility

Cover is attacker-relative and distinct from concealment.

Supported cover categories:

- `none`
- `half`, granting +2 AC and +2 Dexterity saving throws
- `three_quarters`, granting +5 AC and +5 Dexterity saving throws
- `total`, blocking direct targeting unless an authored action bypasses total cover

Concealment/visibility is separate:

- `none`
- `light`
- `heavy`
- `total_visual_obstruction`

Concealment does not grant cover AC by itself. Heavy concealment and total visual obstruction can create hiding context, and total visual obstruction blocks sight-required targeting.

## Reach, Threats, And Opportunity-Attack Candidates

Reach is derived from proximity and authored reach sources.

- Normal melee reach is valid at `engaged`.
- Extended reach can reach `nearby` when an action or reach source says so.
- Threatened reach requires hostility, reaction capability, and reach.
- Voluntarily leaving reach can create an opportunity-attack candidate.
- Forced movement, Disengage-protected movement, and entering reach do not create ordinary opportunity-attack candidates.

Stage 6D.6 only detects candidates. It does not open reaction windows, resolve opportunity attacks, or implement Stage 6D.7 turn orchestration.

## Size And Occupied Space

Supported sizes:

- `tiny`
- `small`
- `medium`
- `large`
- `huge`
- `gargantuan`

Size affects:

- Grapple target eligibility
- Shove target eligibility
- hostile occupied-space passage
- dragging movement cost

Hostile occupied-space passage is legal only when an authored exception exists or the creatures differ by at least two sizes. Ending in another creature's occupied space requires authored permission. Stage 6D.6 does not use grid squares or coordinate math.

## Forced Movement

Forced movement:

- spends no movement budget
- does not trigger ordinary opportunity-attack candidates
- can refresh zone, proximity, hazard, cover, concealment, and grapple relationship metadata
- can end a grapple relationship if authored spatial separation says it is no longer valid

It remains response/library scoped. No database row is mutated by this module.

## Grapple And Shove

Grapple support includes:

- attack-replacement requirement
- normal reach requirement
- target no more than one size larger than the grappler
- contested Athletics versus Athletics or Acrobatics
- tie/status-quo failure for the initiator
- Grappled condition application through Stage 6D.5
- release without action cost
- escape using an action permission gate
- dragging both grappler and target along an authored route

Shove support includes:

- attack-replacement requirement
- reach and size validation
- contested Athletics versus Athletics or Acrobatics
- Prone outcome through Stage 6D.5
- pushed-position outcome as forced movement with no movement spend and no ordinary opportunity attack
- ambiguous push destination handling when authored destination context is missing

## Retreat Routes

Retreat routes are modeled as authored spatial completion routes, not as encounter resolution.

A retreat evaluation can report:

- route validity
- movement requirement
- object/special-action requirement
- known opportunity-attack candidates
- whether the spatial completion condition is satisfied

It does not end combat or apply encounter outcomes. Later stages must decide when a completed retreat route becomes a combat outcome.

## Player Projection

`projectSpatialForPlayer` removes GM/dev-only and hidden spatial fields before asserting the player-safe denylist.

Player-safe projections may include:

- visible zones
- visible proximity
- visible movement cost
- visible risks
- available route status
- cover/concealment categories when known
- safe unavailable or blocked messages

Player projections must not expose:

- hidden hazards
- hidden reasons
- GM/dev traces
- provenance
- internal names
- mutation plans
- source paths
- concealed participants
- reaction secrets

## GM/Dev Trace

`buildSpatialGmDevTrace` preserves the full spatial payload for authorized inspection.

GM/dev traces may include:

- exact route and transition metadata
- hidden hazards and hidden reasons
- cover/concealment source data
- threat and opportunity-attack candidate inputs
- condition-driven movement restriction sources
- mutation-ready participant state changes
- forced-movement/grapple/shove diagnostics

This trace is not player-facing.

## Persistence Boundary

Existing persistence evidence:

- stat blocks already store size and movement speeds
- legacy combat participants store HP, AC, state, and conditions
- combat logs can carry mechanical detail JSON
- action windows and result bundles can carry future adapter-scoped movement results

Stage 6D.6 does not add migrations. Spatial state is currently response/library scoped and mutation-ready.

Persistence posture:

| Contract concept | Current posture |
| --- | --- |
| Creature size | Directly supported by stat blocks |
| Movement speed | Directly supported by stat blocks |
| Pairwise proximity | Temporarily response-scoped |
| Named zones | Temporarily response-scoped/authored fixture scoped |
| Movement segments | Derivable from future combat logs/action-window result data |
| Cover/concealment | Response-scoped until live encounter authoring requires persistence |
| Grapple/Shove condition outputs | Uses existing condition lifecycle helpers; persistence depends on condition writes |
| Retreat route completion | Response-scoped until encounter outcome orchestration is implemented |

No proven persistence deficiency requires a schema change yet. Durable spatial-state persistence remains a Stage 6D.12 risk to validate only after live combat adapter tests demonstrate a reproducible gap.

## Tests Added

`backend/test/stage6d6-spatial-movement.test.js` covers:

- pairwise proximity and no inferred engagement
- explicit authored zone transitions and ambiguous route handling
- movement budgets, Dash-compatible budget, difficult terrain, blocked routes, special cost, crawling, and dragging
- Prone standing and crawling hooks
- cover/concealment distinction
- reach, range, target legality, threatened reach, and opportunity-attack candidate detection
- size and occupied-space rules
- forced movement
- Grapple, release, escape, dragging, and Shove
- retreat route evaluation
- player projection filtering and GM/dev trace preservation

## Known Limitations

- No grid or coordinate model exists.
- No line-of-sight geometry or area templates exist.
- No live combat adapter route consumes this module yet.
- Opportunity attacks are detected but not resolved.
- Reaction windows are deferred to Stage 6D.7.
- Retreat route completion does not end combat.
- Spatial persistence is not proven necessary yet and remains intentionally migration-free.

## Stage 6D.7 Readiness

Stage 6D.7 can build turn orchestration and reaction timing on top of:

- explicit proximity and route contracts
- movement budgets and segments
- opportunity-attack candidate detection
- forced-movement and grapple/shove outputs
- player-safe projection and GM/dev traces

Stage 6D.7 should not need to invent abstract spatial rules from scratch, but it must still decide how to open/resolve reaction prompts and sequence player-turn sub-resolutions.

