# Stage 6D.10 - Multi-Target, Area, Visibility, And Faction Dynamics

Status: implemented as a service-bound targeting and participant-dynamics runtime  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.8 Reactions And Interrupt Orchestration](STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)
- [Stage 6D.9 Automatic Turns And Deterministic Tactical Profiles](STAGE_6D_9_AUTOMATIC_TURNS_AND_DETERMINISTIC_TACTICAL_PROFILES.md)

## Executive Result

Stage 6D.10 adds the reusable combat targeting and participant-dynamics boundary at:

```text
backend/src/engine/combat/targetingParticipantDynamics.js
```

The focused tests live at:

```text
backend/test/stage6d10-targeting-participant-dynamics.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

No Combat Focus, Rusk combat activation, encounter aftermath, rewards, Greyvale objective/knowledge/history updates, Flutter combat UI, exact geometric area system, tactical grid, broad party-control system, or database migration was added.

## Target-Inclusion Policies

Every Stage 6D.10 action entering this layer must define an explicit `target_inclusion_policy`.

Supported policy identifiers are:

- `enemies_only`
- `allies_only`
- `self_only`
- `self_and_allies`
- `all_creatures_in_target_group`
- `selected_creatures_up_to_limit`
- `all_creatures_except_actor`
- `authored_faction_or_filter_rule`

The policy contract includes D&D 5e 2014 rules identity, target count limits, actor inclusion, faction/relationship filters, target group constraints, visibility requirements, duplicate-target policy, hidden-participant policy, ally-confirmation policy, target-set lock behavior, safe player description, and GM/dev provenance.

Actions that omit the explicit policy fail validation in the Stage 6D.10 layer. Legacy `target_policy` values are not treated as sufficient by themselves.

## Target Sets

The runtime builds two target sets:

- Authoritative target set: includes every mechanically valid participant, including concealed participants when the authored policy and target group allow it.
- Player-visible target set: includes only participants currently visible/perceptible to the actor and strips internal filter details.

Hidden participants can be mechanically included in area or target-group effects without appearing in player previews, visible target counts, or confirmation prompts.

Target sets may be locked at commit. The lock records participant and faction revisions so later participant entry, exit, re-entry, or faction changes can invalidate stale previews.

## Multiattack And Multi-Target Resolution

The multi-target resolver locks the target set once for the committed action and then resolves targets in deterministic participant-id order unless an authored operation supplies ordered multiattack steps.

Attack-based multi-target behavior:

- one committed action boundary
- separate attack roll per target by default
- separate damage roll per target by default
- each target resolves hit/miss/critical, defense profile, temporary hit points, concentration, zero-hit-point transition, and defeat independently
- authored shared-roll overrides are explicit

Multiattack behavior:

- ordered attack steps
- each step resolves independently
- target order is stable
- the action is modeled as one authored multiattack, not separate player choices

## Area Effects

Save-based area behavior:

- separate saving throw per target
- one shared damage roll by default
- per-target resistance, vulnerability, immunity, temporary hit points, concentration, zero-hit-point transition, and defeat resolution
- player output includes only visible target outcomes plus observable consequences for concealed participants when appropriate

The runtime uses abstract authored target groups such as zones or participant-id groups. It does not implement cones, lines, cubes, spheres, coordinates, or a tactical grid.

## Ally Confirmation

The ally-confirmation helper detects visible allies and visible non-hostile participants included in the committed target set.

Confirmation does not reveal hidden participants. Hidden ally or non-hostile inclusion is tracked in GM/dev trace only until the consequence becomes observable.

Commit-time confirmation can be revalidated by rebuilding the authoritative target set and target lock after participant or faction changes.

## Visibility

Player previews and result projections remove:

- concealed participant identities
- exact hidden hit points and Armor Class
- hidden Difficulty Classes
- roll records
- source-state versions
- mutation plans
- target filters
- GM/dev traces
- control modes
- test metadata

GM/dev traces retain authoritative target ids, concealed target ids, exact target outcomes, roll/save/damage details, zero-hit-point transitions, concentration results, completion reevaluation, and visibility-filtering notes.

## Factions

Faction relationships are authoritative for legal targeting and tactical context.

The runtime supports several factions, neutral relationships, hostile relationships, allied relationships, and authored faction changes. Faction changes advance the faction revision, rebuild target legality, rebuild tactical context, invalidate stale target locks, and trigger encounter-completion reevaluation.

## Participant Dynamics

Participant entry:

- validates placement
- rolls or accepts deterministic initiative
- inserts by initiative total, Dexterity modifier, then deterministic tiebreaker
- determines whether the participant acts this round or next round based on current initiative position
- records a player-safe event only if visible

Participant exit:

- marks the participant inactive/exited
- closes the current parent turn if the exiting participant was acting
- triggers target and completion reevaluation

Participant re-entry:

- requires authored permission
- preserves hit points, temporary hit points, resources, conditions, concentration, faction, control mode, and combat history
- reuses prior initiative by default

## Completion Reevaluation

The reevaluator returns an encounter-resolution handoff when no active hostile remains or an authored completion condition is satisfied.

Stage 6D.10 does not apply aftermath, rewards, Greyvale objective updates, history, Latest Development, experience points, capture state, surrender aftermath, or retreat aftermath. Those remain later-stage work.

Mandatory effects from one committed multi-target action complete before completion is reevaluated.

## Persistence Boundary

No migration was added.

Current Stage 6D.10 state is service/domain scoped over existing serializable combat state:

- target policies
- target locks
- participant/faction revisions
- multi-target resolution records
- participant event idempotency records
- initiative order
- player-safe result bundles
- GM/dev traces

Durable reload of partial multi-target actions, shared damage rolls, target order, hidden target results, participant dynamics, and faction changes remains a Stage 6D.12 characterization/hardening risk unless later integration proves existing storage sufficient.

## Stage 6D.11 Readiness

Stage 6D.11 can consume:

- explicit target-inclusion policies
- visible target candidates
- authoritative target candidates
- ally/non-hostile confirmation results
- visible initiative insertion events
- faction relationship state
- target-set stale/revision checks
- player-safe target previews
- player-safe per-target outcomes
- GM/dev target traces
- rebuilt tactical contexts

Deferred Stage 6D.11 work:

- Combat Focus question UI/contract
- player-authored free-text combat intent matching
- broader player-facing target explanation UX

Deferred later-stage work:

- Rusk combat activation
- final encounter resolution and aftermath
- durable partial-failure/reload hardening
- Flutter combat interface

## Tests

`backend/test/stage6d10-targeting-participant-dynamics.test.js` covers:

- explicit policy validation and ruleset identity
- authoritative versus visible target sets
- hidden participant inclusion without preview disclosure
- selected-target limits, uniqueness, and legality
- ally/non-hostile confirmation without hidden disclosure
- attack-based multi-target separate attack and damage rolls
- save-based area separate saves and shared damage
- per-target defenses, temporary hit points, concentration, zero-hit-point handling, and defeat
- Multiattack ordered steps
- deterministic participant entry, initiative insertion, exit, and re-entry
- authored faction changes, target refresh, tactical refresh, and stale target locks
- encounter-completion handoff without aftermath
- player projection safety and GM/dev trace retention
