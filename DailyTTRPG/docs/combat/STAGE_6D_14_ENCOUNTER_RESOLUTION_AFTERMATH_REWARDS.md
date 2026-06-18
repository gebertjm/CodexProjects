# Stage 6D.14 - Encounter Resolution, Aftermath, And Rewards

Status: implemented as a reusable engine-level encounter-resolution boundary  
Date: 2026-06-18  
Primary predecessors:

- [Stage 6D.12 Persistence, Idempotency, Replay, And Recovery](STAGE_6D_12_PERSISTENCE_IDEMPOTENCY_REPLAY_RECOVERY.md)
- [Stage 6D.13 Canonical Rusk Encounter Integration](STAGE_6D_13_CANONICAL_RUSK_ENCOUNTER_INTEGRATION.md)

## Executive Result

Stage 6D.14 adds the encounter resolution and aftermath runtime at:

```text
backend/src/engine/combat/encounterResolutionRuntime.js
```

The focused tests live at:

```text
backend/test/stage6d14-encounter-resolution-aftermath.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

This stage consumes a completed combat handoff, freezes ordinary combat input, applies one authored aftermath outcome, finalizes participants, applies rewards exactly once, detects pending advancement without applying level choices, updates adventure-state outputs, builds a player-safe post-combat review, and returns a review-only next state. It does not add Flutter combat UI, route live players into combat, implement Stage 6D.15 polish, add database migrations, or alter existing Greyvale pre-combat behavior.

## Repository Evidence

The implementation uses current repository contracts:

- `canonicalRuskEncounter.js` provides `canonical_rusk_handoff`, Rusk outcome ids, combat state, participant ids, and the shared aftermath state id.
- `combatPersistenceRuntime.js` provides service-state durable operations, idempotency records, checkpoints, combat events, and state-version advancement.
- `conditionStateLifecycle.js` provides combat-end condition persistence and concentration carry-forward.
- `advancementRules.js` provides D&D 5e 2014 XP thresholds and pending-level calculation.
- `combatAdapterContract.js` provides combat result-bundle construction and player hidden-data assertions.
- Active Greyvale content provides the Rusk encounter reward policy, the combat-end hook identity, and the Shrine Ruins content boundary.

## Resolution Architecture

The new runtime follows this lifecycle:

```text
completion handoff
-> enter resolution phase
-> lock ordinary combat controls
-> verify mandatory interrupts are complete
-> select one supported outcome variant
-> finalize participant state
-> expire combat-scoped effects / carry persistent effects
-> apply exact-once rewards
-> update objectives, knowledge, history, latest development, archive/search, world/NPC state
-> build post-combat review
-> close combat
-> return aftermath review next beat
```

The selected module boundary is deliberately engine-level and serializable. It does not expose legacy combat service response shapes to the player app and does not add route behavior.

## Outcome And Aftermath Behavior

The Rusk encounter uses one shared aftermath state:

```text
shrine_ruins_aftermath
```

The canonical variants are:

- `rusk_defeat_lethal`
- `rusk_defeat_nonlethal`
- `rusk_surrender`
- `player_retreat`
- `player_defeat_fail_forward`

Each variant has deterministic authored summary text, a resolution path, objective/knowledge/history/latest-development/archive outputs, and the same active encounter XP value from `reward_value`.

The runtime rejects an outcome when the combat terminal state does not match the handoff. For example, a lethal Rusk defeat handoff while Rusk is still active enters recovery-needed rather than applying aftermath.

## Participant Finalization

Participant finalization is outcome-specific:

- Lethal Rusk defeat marks Rusk defeated, dead, inactive, and applies a persistent Dead condition.
- Nonlethal Rusk subdual marks Rusk defeated, alive, unconscious, stable, and inactive.
- Rusk surrender marks Rusk surrendered and removes him from ordinary hostile activity without marking him dead.
- Player retreat leaves Rusk unresolved and keeps the surface threat flag false.
- Player fail-forward defeat marks the player as protected fail-forward, stable, and unconscious for safe recovery.

Combat-scoped effects expire through `evaluateCombatEndPersistence`. Persistent conditions and valid concentration can carry forward into adventure state without requiring a scheduler or migration.

## Rewards

The active Rusk encounter declares:

```json
{
  "xp": 150,
  "grant_on_resolution": true,
  "equivalent_across_paths": true
}
```

Stage 6D.14 mirrors that authored rule in service-state tests. All five canonical variants receive 150 XP because the encounter explicitly marks rewards equivalent across paths. Fail-forward receives the authored encounter reward as continuation progress, not as a victory-specific reward label.

Rewards are deduped by a stable reward application id. Duplicate aftermath resolution does not grant XP, items, currency, objectives, knowledge, history, latest development, or archive entries twice.

## Pending Advancement

XP is applied immediately to the service-state character progression object where present. The runtime then detects pending advancement using the existing 5e XP thresholds.

The runtime does not:

- change character level;
- start a level-up session;
- apply HP, subclass, spell, feature, or class choices;
- claim a level-up is complete.

Those choices remain Stage 6J work. Stage 6D.14 only reports pending advancement availability and target level.

## Adventure-State Updates

The runtime updates service-state outputs for:

- objectives;
- knowledge;
- history;
- Latest Development;
- archive/search entries;
- world-state flags;
- NPC-state summaries;
- current aftermath state and variant.

The Rusk victory and surrender variants set `surface_threat_resolved` true. Retreat and fail-forward variants leave it false and keep `resolve-the-threat` active.

## Post-Combat Review

The post-combat review prioritizes a concise summary first, then groups chronological combat events by round and turn. Player review data includes only player-safe event summaries and does not expose checkpoints, operation fingerprints, idempotency keys, exact enemy AC/HP, raw rolls, GM/dev trace data, source paths, or hidden participants.

GM/dev trace retains the handoff, selected variant, operation order, reward diagnostics, outputs, participant finalization, and review data for inspection.

## Canonical Rusk Outcomes

The focused suite proves all five canonical outcomes:

- lethal Rusk defeat closes combat, marks Rusk dead, awards XP, completes the objective, and enters aftermath review;
- nonlethal Rusk subdual leaves Rusk alive, unconscious, and stable;
- Rusk surrender records surrender without a death state;
- player retreat reaches the shared aftermath while preserving unresolved-threat state;
- player fail-forward defeat protects the player and continues to a safe recovery aftermath.

All variants return through `shrine_ruins_aftermath`.

## Persistence And Idempotency

Stage 6D.14 uses the Stage 6D.12 service-state persistence ledger:

- durable operation type: `encounter_completion_handoff`;
- stable completion handoff id for resolution application;
- checkpoint records for resolution claim, participant finalization, effect finalization, reward application, adventure-state update, and review build;
- exact duplicate detection through existing idempotency records;
- reload-safe projection by serializing the aggregate.

No database migration was added. No table or column gap was proven by this stage.

## Legacy Reuse

| Existing Component | Stage 6D.14 Use |
| --- | --- |
| Legacy encounter reward policy | Mirrors authored `reward_value` and equivalent-across-path semantics |
| Advancement rules | Uses XP thresholds and pending-level calculation only |
| 6D.12 durable operations | Idempotency, checkpoints, event ledger, version advancement |
| 6D.5 condition lifecycle | Combat-end condition and concentration carry-forward |
| 6D.13 Rusk handoff | Source of canonical combat completion outcome |

The legacy DB-backed `resolveEncounter` service remains unchanged.

## Tests

The Stage 6D.14 tests cover:

- shared Rusk aftermath definition and reward policy;
- handoff validation and input lock;
- mandatory-reaction waiting state;
- lethal, nonlethal, surrender, retreat, and fail-forward aftermath;
- exact-once rewards and outputs;
- pending advancement detection without level application;
- combat-end condition and concentration handling;
- reload/review reconstruction;
- recovery-needed for mismatched terminal state;
- GM/dev trace versus player projection safety.

## Known Limitations

- The runtime is engine/service-state scoped and is not wired to live HTTP routes.
- It mirrors encounter reward behavior in serializable state; DB-backed reward application still lives in the existing encounter/advancement services.
- It does not build the final Flutter combat/aftermath UI.
- It does not add a full GM/dev inspector UI.
- It does not implement level-up choices or Stage 6J advancement application.

## Stage 6D.15 Status

Stage 6D.15 now consumes:

- `encounter_resolution.status`;
- `encounter_resolution.player_result_bundle`;
- `encounter_resolution.next_beat`;
- `adventure_state.current_state_id`;
- `post_combat_review`;
- player-safe rewards and pending advancement;
- GM/dev trace from `buildEncounterResolutionGmDevTrace`.

See [Stage 6D.15 GM/Dev Trace And Visibility Inspector](STAGE_6D_15_GM_DEV_TRACE_VISIBILITY_INSPECTOR.md) for the implemented read-only internal inspector, production projection parity checks, visibility reason codes, trace navigation, access audit helper, and canonical Rusk outcome inspection.
