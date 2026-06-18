# Stage 6D.15 - GM/Dev Trace And Visibility Inspector

Status: implemented as a read-only engine-level inspection boundary  
Date: 2026-06-18  
Primary predecessors:

- [Stage 6D.12 Persistence, Idempotency, Replay, And Recovery](STAGE_6D_12_PERSISTENCE_IDEMPOTENCY_REPLAY_RECOVERY.md)
- [Stage 6D.13 Canonical Rusk Encounter Integration](STAGE_6D_13_CANONICAL_RUSK_ENCOUNTER_INTEGRATION.md)
- [Stage 6D.14 Encounter Resolution, Aftermath, And Rewards](STAGE_6D_14_ENCOUNTER_RESOLUTION_AFTERMATH_REWARDS.md)

## Executive Result

Stage 6D.15 adds the internal combat trace and visibility inspector at:

```text
backend/src/engine/combat/combatTraceVisibilityInspector.js
```

The focused tests live at:

```text
backend/test/stage6d15-combat-trace-visibility-inspector.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

The inspector is read-only by default. It clones supplied combat state, validates an authorized developer/admin or campaign-scoped GM requester, validates an explicit selected viewer, rebuilds the production player-safe projection, builds a GM/dev projection, compares those projections, explains visibility decisions, exposes trace/navigation/search diagnostics, and emits an internal access-audit record through an optional audit sink.

No player route, Flutter combat UI, combat mutation, repair operation, new mechanic, Rusk outcome change, reward change, tactical rerun, historical reroll, second player projector, or database migration was added.

## Inspector Architecture

The inspector uses existing production/runtime boundaries:

- `ensureCombatPersistenceState`, `reconstructCombatAggregate`, `reconstructLastConfirmedCombatState`, `rebuildCombatPersistenceReadModels`, `inspectCombatRecoveryState`, and `validateCombatPersistenceInvariants` from Stage 6D.12.
- `projectCanonicalRuskForPlayer` and `buildCanonicalRuskGmDevTrace` from Stage 6D.13.
- `projectEncounterResolutionForPlayer` and `buildEncounterResolutionGmDevTrace` from Stage 6D.14.
- `scanForPlayerHiddenData` and `assertNoCombatPlayerHiddenData` from the shared visibility boundary.

The player-safe side is built by `buildProductionCombatPlayerProjection`. It selects the current production projector:

- encounter aftermath/review states use `projectEncounterResolutionForPlayer`;
- canonical active Rusk combat states use `projectCanonicalRuskForPlayer`;
- generic/recovery persistence states use `rebuildCombatPersistenceReadModels(...).player`.

The inspector does not create an alternate player projection service.

## Authorization And Security

`authorizeCombatInspectorRequest` accepts only:

- developer/admin/internal diagnostic access, including existing `can_advance_beats` or `can_inspect_combat` style flags;
- campaign-scoped GM access when the requester role is GM-like and the requested combat campaign/scope matches an authorized campaign id.

If a secure campaign GM model is unavailable for a caller, the inspector remains developer/internal only. Ordinary players receive only a safe unavailable response through `projectCombatInspectorForPlayer`.

Viewer selection is explicit through `selectCombatInspectorViewer`. The selected viewer must be a participant in the combat. View-as-player mode does not impersonate a session and does not allow action submission.

Internal deep links and export-like use are documented as authorization-required. No HTTP route was added in this stage.

## Access Audit

`recordCombatInspectionAccess` creates an audit record containing:

- inspector identity and role;
- combat, campaign, encounter, and selected viewer;
- inspection type;
- hidden-state access classification;
- historical point;
- route/tool source;
- export action marker when requested.

The helper can call an optional `audit_sink` supplied by a service/route. It does not write to combat state or create combat events.

## Visibility Decisions

The inspector exposes stable reason codes:

- `viewer_own_fact`
- `directly_observed`
- `authored_reveal`
- `rule_knowable`
- `narrative_approximation`
- `hidden_statistic`
- `hidden_participant`
- `unobservable_event`
- `gm_dev_only`
- `irrelevant_to_player_model`
- `historical_data_unavailable`

`buildCombatVisibilityDecisionReport` currently explains participant existence, exact HP versus health-band transformation, armor class redaction, control-mode withholding, player-safe event summaries, event detail withholding, operation-record withholding, and reward visibility.

## Trace Inspection

`buildCombatTraceInspection` groups and exposes:

- operation lineage and parent/child relationships;
- chronological events grouped by round and parent turn;
- calculation evidence from durable rolls and latest recorded result bundles;
- movement checkpoints and spatial state;
- reaction queues, reaction windows, continuation checkpoints;
- automatic tactical state and tactical-profile checkpoints;
- target locks, faction relationships, participant/faction checkpoints;
- Combat Focus answers and answer checkpoints;
- idempotency records, persistence operations, recovery incidents, and invariant results;
- encounter handoff, resolution, rewards, post-combat review, and adventure state.

`searchCombatTraceInspection` provides bounded internal search/filtering over operations, events, calculations, movement, reactions, Combat Focus, and encounter-resolution data.

## Historical Reconstruction

Historical inspection uses durable evidence only:

- current state is classified as `current_exact`;
- operation `last_confirmed_state_snapshot` is classified as `historical_exact`;
- event-sequence lookup is classified as `event_only`;
- missing historical data is classified as `unavailable`.

The inspector does not reroll dice, rerun tactical decisions, reapply current rules to older records, or claim unavailable snapshots are exact.

## Projection Parity And Validation

`validateCombatInspectorProjectionSafety` checks:

- shared hidden/internal denylist violations;
- exact non-viewer hit-point leaks;
- hidden enemy HP object leaks;
- missing selected-viewer facts;
- missing observed participant summaries or health bands.

Irrelevant omissions such as operation fingerprints, idempotency records, checkpoints, mutation plans, and GM/dev traces are not treated as player-view errors.

The tests assert semantic parity by proving the inspector uses the production Rusk and aftermath projectors and that player projections remain safe while GM/dev projections retain exact state.

## Recovery Boundary

Recovery inspection uses Stage 6D.12 data:

- current recovery incident;
- affected operation;
- last confirmed state/read model;
- refresh and retry safety;
- invariant results;
- repair links.

Repair remains a separate Stage 6D.12 workflow. The inspector only links to repair availability and records that repair requires its own authorization.

## Canonical Rusk Coverage

The focused suite inspects all five canonical Rusk aftermath outcomes:

- lethal Rusk defeat;
- nonlethal Rusk subdual;
- Rusk surrender;
- player retreat;
- player fail-forward defeat.

For each outcome, the inspector verifies the handoff, aftermath, rewards, post-combat projection, and player-safe visibility boundary. Hidden Rusk hit points, armor class, surrender threshold, tactical priorities, operation fingerprints, checkpoints, and GM/dev traces remain absent from player projection.

## Persistence Posture

No schema change was added.

Durable inspection uses service-state structures already introduced by Stage 6D.12:

- operation records;
- operation ordering;
- idempotency records;
- checkpoints;
- event records;
- recovery incidents;
- last-confirmed snapshots where available.

Data derived at inspection time includes projection comparison, visibility decisions, leak/over-redaction validation, grouped navigation, and search results.

Known limitation: current service-state tests do not persist every action roll as a durable operation checkpoint. The inspector exposes latest result-bundle roll evidence when available and classifies missing exact history honestly.

## Stage 6D.16 Readiness

Stage 6D.16 can rely on existing player-safe contracts for:

- active combat read models;
- visible initiative/participants;
- turn resources and latest result;
- action and movement previews/results;
- reaction windows;
- automatic event playback summaries;
- Combat Focus answers;
- encounter-resolution review;
- rewards and pending advancement;
- recovery state.

Stage 6D.15 provides internal verification helpers to confirm that the Stage 6D.16 Flutter combat interface receives only production player-safe projections and never inspector data.

