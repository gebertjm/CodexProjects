# Stage 6D.12 - Persistence, Idempotency, Replay, And Recovery

Status: implemented as a serializable service/domain persistence boundary  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)
- [Stage 6D.8 Reactions And Interrupt Orchestration](STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)
- [Stage 6D.9 Automatic Turns And Deterministic Tactical Profiles](STAGE_6D_9_AUTOMATIC_TURNS_AND_DETERMINISTIC_TACTICAL_PROFILES.md)
- [Stage 6D.10 Multi-Target, Area, Visibility, And Faction Dynamics](STAGE_6D_10_MULTI_TARGET_AREA_VISIBILITY_FACTION_DYNAMICS.md)
- [Stage 6D.11 Combat Focus](STAGE_6D_11_COMBAT_FOCUS.md)

## Executive Result

Stage 6D.12 adds the combat persistence/replay/recovery runtime at:

```text
backend/src/engine/combat/combatPersistenceRuntime.js
```

The focused tests live at:

```text
backend/test/stage6d12-combat-persistence-runtime.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

This stage hardens stable operation identities, idempotency records, checkpointed replay, stale rejection, recovery-needed state, GM/dev recovery inspection, invariant checks, and the migration evidence gate. It does not add a database migration, activate Rusk combat, implement encounter aftermath, add Flutter combat UI, change Greyvale objectives/knowledge/history, or continue into Stage 6D.13.

## Architecture

The runtime stores a serializable combat ledger on the authoritative combat state object under `combat_persistence`.

The ledger contains:

- `current_state_version`
- monotonic state and event counters
- operation records keyed by stable operation id
- operation ordering
- idempotency records
- authoritative event records
- recovery incidents
- GM/dev repair audit entries
- migration evidence records

The design intentionally works with the current service-bound Stage 6D modules. A caller may persist the serialized aggregate in existing combat storage. No table or column is required by this stage without a reproduced persistence deficiency.

## Operation Identity

Each durable combat operation receives:

- operation id
- operation type
- combat id
- encounter id where present
- parent turn id
- parent operation id when nested
- sub-resolution id
- actor participant id
- operation fingerprint
- idempotency scope and key
- source and expected state version
- resulting state version after commit
- checkpoints
- committed costs, rolls, and mutations
- result bundle
- GM/dev trace placeholder
- last confirmed state snapshot

Supported operation types cover player actions, movement, reactions, reaction declines, automatic operations, multi-target actions, participant entry/exit/re-entry, faction changes, Combat Focus answers, encounter completion handoff, End Turn, and scheduler timeout.

## Idempotency

`beginDurableCombatOperation` first checks idempotency before rejecting stale source versions, so a duplicate submit with the same key and same operation can safely return the original result even after the first submit advanced the combat state version.

Exact duplicates:

- return the original resolved result
- preserve the original operation id
- do not reroll
- do not spend costs twice
- do not repeat mutations

Conflicting reuse:

- same idempotency key with a materially different operation fingerprint is rejected
- no mutation is applied
- a GM/dev conflict trace is recorded

Failed-before-authority operations release the idempotency claim so the same player intent can be retried safely.

## Checkpoints And Replay

Operations can record ordered checkpoints for:

- intent persistence
- committed costs
- persisted rolls
- completed effect steps
- committed movement segments
- reaction queues
- reaction windows
- continuation points
- automatic decisions
- target locks
- per-target results
- participant events
- faction events
- Combat Focus answers
- completion handoffs
- generic mutations
- final result persistence

Confirmed checkpoints update ordered result data and the operation's last confirmed state snapshot. If execution is interrupted after confirmed checkpoints and the operation is not ambiguous, it is classified as resumable from checkpoint. Resume completes through `resumeDurableCombatOperation` without repeating confirmed rolls or costs.

## Recovery

The recovery classifier distinguishes:

- failed before authority
- resumable from checkpoint
- ambiguous commit
- invariant violation
- manual repair required

`enterCombatRecoveryNeeded` marks the combat and parent turn recovery-needed, creates a recovery incident, returns a player-safe recovery read model, and removes ordinary controls.

Player recovery output may say that combat needs review and whether refresh/retry is safe. It does not include operation fingerprints, checkpoints, idempotency keys, state-version internals, mutation plans, traces, or repair audit data.

Authorized GM/dev repair is handled through `applyCombatRecoveryRepair`, which is permission-gated and audited.

## Event Log And Reconstruction

`appendCombatEvent` provides monotonic authoritative event records with player-safe summaries and GM/dev detail. The event log is used by:

- latest event display
- aggregate reconstruction
- invariant validation
- recovery diagnostics

`reconstructCombatAggregate` rebuilds a GM/dev aggregate including participants, spatial state, reaction state, automatic state, target locks, participant events, Combat Focus answers, completion handoff, operation records, and state version.

`rebuildCombatPersistenceReadModels` returns both:

- a player-safe read model or recovery read model
- a GM/dev projection with aggregate, operations, idempotency records, and recovery incidents

## Invariants

`validateCombatPersistenceInvariants` checks for:

- duplicate active parent turns
- duplicate initiative positions
- duplicate or non-monotonic event sequences
- conflicting roll records
- double reaction spend in one operation
- malformed multi-target ordering markers
- duplicate completion handoffs
- missing continuation parents
- multiple active concentration entries for one participant
- invalid death-save counts

When requested, invariant violations enter recovery-needed instead of attempting unsafe automatic repair.

## Operation-Specific Durability

The Stage 6D.12 tests characterize durability for:

- movement segment checkpoints
- reaction window checkpoints
- automatic decision checkpoints
- multi-target per-target checkpoints
- participant event checkpoints
- faction event checkpoints
- Combat Focus answer checkpoints
- encounter completion handoff checkpoints

This does not implement new combat behavior. It proves the persistence boundary can represent and replay the outputs produced by earlier 6D modules.

## Migration Evidence Gate

No migration was added.

`evaluateCombatMigrationEvidence` returns no migration needed unless a deficiency includes:

- a reproduced failure
- a named failing test
- a concrete schema gap
- alternatives considered
- the smallest compatible schema change

If a proven deficiency exists but the owner has not approved it, the decision is `migration_requires_owner_approval`. Even with approval, this stage does not add a migration unless the caller explicitly marks one as added.

## Legacy Active Combats

The runtime is additive over existing combat state. Legacy active combats can be wrapped by `ensureCombatPersistenceState` without altering live player behavior. Existing combat, participant, parent-turn, action-window, reaction, target, participant-dynamics, and Combat Focus state remains in its current shape.

Unproven risks for legacy active combats:

- existing DB storage must persist the serialized aggregate for cross-process durability
- route/service integration must choose when to attach the persistence ledger
- partial database transaction uncertainty remains outside this pure runtime layer

These are Stage 6D.13 integration concerns unless a focused failing test proves a schema deficiency.

## Stage 6D.13 Readiness

Stage 6D.13 can consume:

- stable durable operation identities
- operation fingerprints
- idempotency records
- checkpoint/replay records
- recovery incidents
- invariant diagnostics
- player-safe recovery read model
- GM/dev aggregate and repair audit projection
- migration evidence-gate result

Stage 6D.13 should integrate this boundary with combat service/database routes and preserve the same no-leak player projection rules.

## Tests

`backend/test/stage6d12-combat-persistence-runtime.test.js` covers:

- serializable ledger initialization and aggregate reconstruction
- duplicate submit replay after state-version advancement
- conflicting idempotency-key rejection
- stale source-state rejection for new operations
- failed-before-authority safe retry
- checkpoint resume after reload
- ambiguous commit recovery-needed
- operation-specific durability checkpoints
- last-confirmed state and read-model rebuild
- invariant violation detection and recovery marking
- permission-gated GM/dev repair
- migration evidence gate

