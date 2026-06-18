# Stage 6D.2 - Legacy Combat Engine Verification

Status: implemented as direct verification and classification coverage, with DB-backed integration checks environment-blocked locally  
Date: 2026-06-16  
Primary predecessor: [Stage 6D.1 Combat Adapter Contract And Architecture](STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)

## Executive Result

Stage 6D.2 verifies the legacy combat engine at direct, deterministic boundaries and classifies the existing combat spine against the Stage 6D.1 adapter contract.

No live player combat behavior was activated. No Rusk handoff was changed. No player combat route was exposed. No database migration was added. No Stage 6D.3 authoritative-roll implementation was started.

The primary regression command is:

```powershell
npm run test:stage:6d
```

That command now runs:

- Stage 6D.1 combat adapter contract tests
- Stage 6D.2 direct combat engine tests
- Stage 6D.2 combat service persistence-contract tests with mock executors
- Stage 6D.2 encounter/Rusk asset verification tests

## Repository Map

Inspected modules and assets:

| Area | Path |
| --- | --- |
| Combat engine | `backend/src/engine/combat/combatEngine.js` |
| Combat service | `backend/src/services/combatService.js` |
| Combat queries | `backend/src/db/queries/combat.js` |
| Adventure-runtime combat integration | `backend/src/services/adventureRuntimeService.js` |
| Stat block service and queries | `backend/src/services/statBlockService.js`, `backend/src/db/queries/statBlocks.js` |
| Encounter service and queries | `backend/src/services/encounterService.js`, `backend/src/db/queries/encounters.js` |
| Legacy combat routes | `backend/src/routes/dnd5e.js` |
| CLI combat and encounter commands | `backend/src/cli/index.js` |
| Combat migrations | `db/init/013-stage-4b_5-combatant-stat-blocks-and-actions.sql`, `db/init/014-stage-4c-combat-engine.sql`, `db/init/022-stage-5i-encounter-scaling-and-balance.sql` |
| Stage 6D.1 adapter contract | `backend/src/services/interactionCore/combatAdapterContract.js` |
| Stage 6C shared lifecycle | `backend/src/services/interactionCore/*` |
| Rusk encounter content | `content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json` |
| Rusk combat-end hook | `content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json` |
| Rusk dialogue endpoint | `content/dialogue/greyvale/rusk-at-the-shrine.json` |
| New verification tests | `backend/test/stage6d2-*.test.js` |

## Baseline Test Status

Pre-change local status from Stage 6D.1 showed the new contract suite and Stage 6C interaction-core suite passing, while DB-backed Greyvale/content commands failed because this workstation cannot resolve the configured `db` hostname.

Current local environment checks:

- Docker API is unavailable: Docker Desktop Linux engine pipe not found.
- `localhost:5432` is refused.
- DNS lookup for `db` fails with `ENOTFOUND db`.

This means DB-backed tests cannot prove actual transaction/persistence behavior in this session. Stage 6D.2 therefore adds direct pure-engine coverage and mock-executor service mapping coverage, and records DB-backed persistence/completion/reward verification as blocked until the standard test DB is reachable.

## Tests Added

`backend/test/stage6d2-combat-engine-verification.test.js`

- ability modifier and roll override behavior
- damage dice override behavior
- initiative generation and tie ordering
- attack hit, miss, natural one, natural twenty
- current critical hit behavior
- damage application to temporary HP and HP
- defeat state at zero HP
- multiple damage components and damage types
- deterministic AI action/target selection
- direct turn advancement helper behavior

`backend/test/stage6d2-combat-service-persistence-contract.test.js`

- active-combat lookup through `findActiveCombatForCharacter`
- reload of combat row, participants, logs, conditions, and action hydration through mock executor
- combat persistence query coverage for creation, participant state, turn state, action logs, character HP, NPC HP, and resolved outcome state

`backend/test/stage6d2-encounter-rusk-verification.test.js`

- encounter preview selects the Rusk solo-safe variant deterministically through a mock executor
- Rusk encounter, hook, and dialogue endpoint assets exist
- Rusk dialogue currently reaches a terminal combat-ready node rather than activating combat

## Observed Legacy Behavior

### Combat Creation And Activation

The service creates `dnd5e_combat` rows with `pending` status and inserts participants with entity type, source id, stat block id, HP, temporary HP, AC, faction, control mode, active state, and defeated state.

Activation requires:

- pending combat
- at least two participants
- at least two active opposing factions

Activation computes initiative, writes `active`, round `1`, current turn index `0`, and current participant id. DB-backed create/start behavior could not be run locally because the test DB is unavailable.

Stage 6D.1 compatibility: this maps to combat interaction context, parent turn source state, transition decision, and initial next-beat selection. It still needs adapter wrapping and idempotent create/resume verification.

### Participant Persistence

Queries directly store combat participant identity, source entity, faction, control mode, HP, temporary HP, initiative, turn order, active/defeated state, and notes. Conditions are queryable through `dnd5e_combat_condition`.

Mock-executor tests verify current reload mapping for participants, logs, conditions, current participant, and hydrated available actions.

Stage 6D.1 compatibility: participants can feed actor/target context and GM/dev exact projection. Player projection must not expose exact enemy HP/AC/control mode.

### Initiative And Ordering

Direct tests verify:

```text
initiative total
-> Dexterity modifier
-> participant id
```

This matches the locked future policy except the final deterministic tiebreaker is currently participant id, not a named policy object.

Classification: reuse with contract documentation.

### Turn And Round Advancement

The internal helper filters inactive/defeated participants, orders by turn order then id, advances to the next active participant, and wraps to the next round. If the current participant is missing from the active ordered list, it selects the first active participant.

The service resolves combat before advancing if only one faction remains.

Stage 6D.1 compatibility: this can map to next-beat decisions, but the service currently mutates through legacy transaction flow and does not expose parent-turn/sub-resolution identities.

### Attack Resolution

Direct tests verify:

- static attack bonus plus ability/proficiency effect
- Armor Class comparison
- natural one automatic miss
- natural twenty automatic hit
- miss produces no damage
- invalid d20 overrides throw before resolution

Current calculation order:

```text
d20
+ static attack bonus
+ attack ability modifier, with proficiency if authored
compare to target AC
nat 20 overrides to hit
nat 1 overrides to miss
then roll and apply damage if hit
```

Stage 6D.1 compatibility: this is a reusable deterministic engine source for future committed sub-resolutions after Stage 6D.3 wraps authoritative roll identity.

### Critical Hits

Current verified behavior:

- natural 20 guarantees a hit
- `is_critical_hit` is set
- damage dice are not doubled
- flat modifiers are not doubled

Future target:

- double attack-associated damage dice
- apply flat modifiers once
- preserve component damage types

Classification: refactor in Stage 6D.3.

### Damage Resolution

Direct tests verify:

- damage dice plus static modifier
- dynamic damage ability modifier applies to the first damage entry only
- multiple damage entries preserve damage type labels
- each entry floors at zero
- total damage applies to temporary HP first
- remaining damage applies to current HP
- HP floors at zero
- zero HP marks participant defeated

Current engine does not apply resistance, vulnerability, immunity, saving throws, or typed-damage rules beyond preserving labels.

Classification: reuse the simple arithmetic and refactor/extend in Stage 6D.3 and 6D.4.

### Temporary Hit Points

Direct tests verify damage consumes temporary HP before actual HP and that temporary HP after damage is calculated correctly.

Unverified/missing:

- granting temporary HP
- replacement versus stacking policy
- combat-completion clearing policy
- DB-backed persistence across actual reload

Classification: refactor in Stage 6D.4/6D.12.

### Defeat Handling

Direct engine tests verify zero HP sets `is_defeated`. Turn helper tests verify inactive/defeated participants are skipped.

Service inspection shows persisted target updates set:

```text
is_defeated = target_state.is_defeated
is_active = !target_state.is_defeated
```

DB-backed confirmation is blocked locally.

### Artificial Combatant Behavior

Direct tests verify current AI selection:

- first active opposing participant in list order
- first `requires_attack_roll` action, else first available action
- `no_valid_target` when no active opposing target exists
- `no_valid_action` when no action exists

This is deterministic and usable for dev coverage, but too simple for final tactical behavior.

Classification: refactor in Stage 6D.9.

### Encounter Templates And Scaling

Mock-executor tests verify `previewEncounter` can select the authored Rusk solo-safe variant and preserve equivalent reward paths.

Inspection shows scaling can use:

- variant selection
- enemy-count adjustment
- bounded stat tweak if allowed
- solo-safety warnings
- async beat estimates

Stage 6D.1 compatibility: encounter preview output can feed Rusk entry variant selection. Combat creation from selected variants is not activated.

### Combat Action Logs

Queries directly store:

- combat id
- participant id
- action id
- command type
- round number
- turn index
- target metadata
- result summary
- narrative text
- mechanical detail JSON
- created timestamp

Logs can reconstruct ordered action evidence and mechanical details, but they do not directly store Stage 6D parent-turn ids, sub-resolution ids, interrupt relationships, authoritative roll ids, or idempotency keys.

Classification: refactor for Stage 6D.7/6D.8/6D.12.

### Reload, Refresh, And Resume

Mock-executor tests verify `findActiveCombatForCharacter` locates active combat by campaign/character scope, reloads the full combat row, participants, logs, conditions, current participant, and hydrated available actions.

Authoritative state is database state plus action hydration from stat block/action queries. Route-local or CLI process memory is not authoritative.

DB-backed refresh/retry behavior remains environment-blocked.

### Combat Completion

Service inspection shows completion occurs when remaining active non-defeated factions are one or zero. Completion:

- persists character HP and temporary HP
- persists NPC campaign HP state
- calculates defeated XP total from defeated participants' stat blocks
- applies XP to surviving characters on the winning faction
- writes combat status `resolved`
- clears current participant
- writes outcome faction, summary, result JSON, and resolved timestamp
- records campaign and gameplay history logs
- executes `combat_end` hooks unless skipped

DB-backed duplicate completion and reward dedupe behavior could not be run locally.

### Hooks, Rewards, And Deduplication

Combat completion calls `applyAdventureOutcome` for XP with source:

```text
sourceType: combat
sourceEntityId: combat.id
sourceKey: combat:<id>
```

The Rusk combat-end hook exists and sets `surface_threat_resolved`, source knowledge, and possible surface-resolution event trigger.

Deduplication appears to depend on `applyAdventureOutcome`/reward internals and content-hook once-per-character behavior. DB-backed proof is blocked locally.

### Legacy Routes And CLI

Legacy generic routes exist under `/api/dnd5e/combats/*`:

- create combat
- read combat
- start combat
- act
- end turn
- resolve AI turn

CLI commands exist:

- `start-combat`
- `show-combat`
- `list-combat-participants`
- `take-turn`
- `end-turn`
- `resolve-ai-turn`
- encounter preview/scaling/resolve commands

These are useful internal/dev surfaces. They must not be treated as player-safe Stage 6C adapter payloads.

### Rusk-Related Legacy Behavior

Existing assets:

- `shrine-rusk-confrontation` encounter template
- solo, small-party, and full-party variants
- equivalent rewards across combat/intimidation/negotiation/escape/fail-forward
- `grey-road-shrine-combat-resolution` combat-end hook
- Rusk dialogue terminal `rusk-fight` node that indicates combat is ready

No current player route starts Rusk combat. The Stage 6B/6C endpoint remains future-supported/review-only until Stage 6D.13 activates the handoff.

## Stage 6D.1 Contract Comparison

| Stage 6D.1 concept | Legacy source | Compatibility |
| --- | --- | --- |
| Interaction context | combat id, campaign id, character participant, scene/event ids | Refactor through adapter |
| Preview | no combat preview service | Missing; Stage 6D.3/6D.4 |
| Submit | `actInCombat`, `endCombatTurn`, `resolveCombatAiTurn` | Refactor through adapter |
| Parent turn | combat round/current turn/participant | Derivable |
| Sub-resolution | combat action log row | Derivable for simple actions; not enough for reactions |
| Result bundle | narrative text/result summary/mechanical detail | Refactor into Stage 6C bundle |
| Transition | turn advancement/resolution status | Refactor into transition decision |
| Next beat | current participant/action-window generation | Refactor into next-beat decision |
| Player projection | `summarizeCombatForPlayer` | Replace/projection-wrap because it exposes exact enemy HP/AC/control |
| GM/dev projection | legacy service payload and mechanical detail | Reuse behind permission gate |
| Trace | action logs/campaign logs | Refactor into Stage 6C trace envelope |
| Recovery | HTTP errors and transaction failures | Refactor into Stage 6C safe recovery states |

## Classification Matrix

| Component | Current module(s) | Evidence/tests | Current behavior | Classification | Later Stage |
| --- | --- | --- | --- | --- | --- |
| Combat creation | `combatService.js`, `combat.js` queries | query coverage, inspection; DB blocked | Creates pending combat and participants | Refactor | 6D.12 |
| Participant creation | `combatService.js`, `combat.js` queries | query coverage, mock reload | Persists source, faction, control, HP, temp HP, AC, status | Refactor | 6D.12 |
| Initiative | `combatEngine.js` | direct tests | total -> DEX mod -> id | Reuse | 6D.3 |
| Tie handling | `combatEngine.js` | direct tests | participant id deterministic tiebreaker | Reuse | 6D.3 |
| Turn advancement | `combatService.js` | direct helper tests, inspection | skips inactive/defeated, wraps rounds | Refactor | 6D.7 |
| Attack roll | `combatEngine.js` | direct tests | d20 + static/dynamic mods, AC compare, nat 1/20 | Reuse/refactor | 6D.3 |
| Critical hits | `combatEngine.js` | direct tests | nat 20 hit, no dice doubling | Refactor | 6D.3 |
| Damage | `combatEngine.js` | direct tests | dice + static + first-entry dynamic modifier; no R/V/I | Refactor | 6D.3/6D.4 |
| Temporary HP | `combatEngine.js`, `combat.js` queries | direct tests, query coverage | damage consumes temp HP first; grant policy absent | Refactor | 6D.4/6D.12 |
| Defeat handling | `combatEngine.js`, `combatService.js` | direct tests, inspection | zero HP defeated, inactive target persistence intended | Refactor | 6D.5 |
| Automated enemy action selection | `combatEngine.js`, `combatService.js` | direct tests | first valid enemy and first attack action | Refactor | 6D.9 |
| Encounter templates | `encounterService.js`, content | mock preview, content test | loads variants/rewards/paths | Reuse | 6D.13 |
| Encounter scaling | `encounterService.js` | mock Rusk preview; Stage 5I DB blocked | variant/count/stat tweak algorithm | Refactor | 6D.13 |
| Combat action logging | `combatService.js`, `combat.js` queries | query coverage | stores command/round/turn/result/mechanics | Refactor | 6D.7/6D.12 |
| Reload/resume | `combatService.js`, adventure runtime query | mock active lookup | DB is authoritative; hydrates actions | Refactor | 6D.12 |
| Combat completion | `combatService.js` | inspection; DB blocked | resolves by remaining factions, writes outcome, hooks | Refactor | 6D.14 |
| Hooks and rewards | `combatService.js`, dynamic hooks, progression | inspection, Rusk hook content test; DB blocked | XP and hooks applied on completion | Refactor | 6D.14 |
| Reward dedupe | `applyAdventureOutcome`, advancement service | inspection; DB blocked | source keys appear dedupe-oriented | Refactor | 6D.14 |
| Adventure-runtime handoff | `adventureRuntimeService.js` | inspection | legacy combat actions/windows and unsafe summary | Refactor/replace projection | 6D.7/6D.16 |
| Legacy routes | `routes/dnd5e.js` | inspection | internal generic combat routes | Refactor/wrap later | 6D.16 |
| Command-line tools | `cli/index.js` | inspection | dev combat and encounter commands | Reuse as dev-only | 6D.2+ |
| Rusk combat content | Greyvale encounter/hook/dialogue files | direct content test | assets exist, inactive terminal handoff | Reuse | 6D.13/6D.14 |

Summary counts:

- Reuse: 5
- Refactor: 15
- Replace/projection-wrap: 1
- Defer: 0 inspected components

## Persistence Assessment

| Stage 6D concept | Current support | Assessment |
| --- | --- | --- |
| combat id | `dnd5e_combat.id` | Directly stored |
| participant id/source | `dnd5e_combat_participant` | Directly stored |
| faction/control mode | participant row | Directly stored, player-unsafe as raw projection |
| HP/temp HP | participant row, character/NPC end persistence | Directly stored |
| initiative/turn order | participant row | Directly stored |
| round/current turn | combat row | Directly stored |
| action evidence | `dnd5e_combat_action_log` | Directly stored |
| parent turn id | combat id + round + current participant | Derivable |
| sub-resolution id | action log id | Derivable for simple actions |
| reaction interrupt | none | Absent, unproven migration risk |
| idempotency key | none explicit | Absent, unproven migration risk |
| authoritative roll identity | mechanical detail JSON only | Missing; Stage 6D.3/6D.12 |
| ordered effect steps | mechanical detail JSON | Partially derivable |
| player-safe projection | Stage 6D.1 contract only | Legacy summary must be replaced/wrapped |
| GM/dev trace | action/campaign/gameplay logs | Refactor into trace |

No demonstrated persistence gap currently justifies a migration. The missing idempotency/reaction/authoritative-roll fields are risks to be proven or disproven in later stages with DB-backed failing tests.

## Stage Assignment For Gaps

| Gap | Assigned stage |
| --- | --- |
| authoritative roll identity and critical hit dice policy | 6D.3 |
| damage typing beyond labels, saving throws, action/effect resources | 6D.4 |
| conditions, concentration, zero-HP stabilization/death semantics | 6D.5 |
| positioning, movement, opportunity-attack risk | 6D.6 |
| incremental player turns and sub-resolution persistence | 6D.7 |
| nested reactions/interrupts | 6D.8 |
| tactical profiles beyond first-valid AI | 6D.9 |
| multi-target/faction dynamics | 6D.10 |
| Combat Focus | 6D.11 |
| idempotency, recovery, authoritative persistence proof | 6D.12 |
| Rusk combat activation | 6D.13 |
| Shrine aftermath/rewards completion behavior | 6D.14 |
| player-vs-GM trace and combat visibility hardening | 6D.15 |
| Flutter combat interface | 6D.16 |

## Known Defects And Gaps

| Issue | Reproduction/evidence | Severity | Classification | Later stage |
| --- | --- | --- | --- | --- |
| Critical hits do not double damage dice | `stage6d2-combat-engine-verification.test.js` documents nat 20 damage remains normal | Medium for future combat | Refactor | 6D.3 |
| No explicit authoritative roll id | action logs store mechanical detail but no roll identity | High for replay/idempotency | Refactor/migration risk | 6D.3/6D.12 |
| No first-class idempotency key | query inspection | High for player submit safety | Refactor/migration risk | 6D.12 |
| No reaction interrupt persistence | query inspection | Medium until reactions are implemented | Refactor/migration risk | 6D.8/6D.12 |
| Legacy player combat summary exposes exact enemy HP/AC/control fields | `adventureRuntimeService.summarizeCombatForPlayer` inspection | High before player UI exposure | Replace projection | 6D.16 |
| AI is first-legal only | direct tests | Low for MVP, medium later | Refactor | 6D.9 |
| DB-backed creation/completion/reward dedupe not locally proven | local `db` hostname unavailable | Environment blocker | Refactor/verify | 6D.12/6D.14 |

## Validation Commands

Passing locally:

```powershell
node --check backend/src/services/combatService.js
node --check backend/test/stage6d2-combat-engine-verification.test.js
node --check backend/test/stage6d2-combat-service-persistence-contract.test.js
node --check backend/test/stage6d2-encounter-rusk-verification.test.js
npm run test:stage:6d
```

Environment-blocked locally:

```powershell
npm run test:stage:6c
npm run test:greyvale-vertical-slice
npm run test:greyvale-full-loop
npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale
node --test --test-concurrency=1 backend/test/stage5i-encounters.test.js
```

Failure reason:

```text
getaddrinfo ENOTFOUND db
```

Additional environment evidence:

```text
docker API unavailable
localhost:5432 ECONNREFUSED
db DNS ENOTFOUND
```

Unavailable scripts:

```powershell
npm run typecheck
npm --prefix backend run typecheck
npm run lint
npm --prefix backend run lint
```

These scripts are not defined in the current package files.

## Readiness Statement

Stage 6D.3 may begin for pure rules and roll-resolution foundation work.

Blockers to full Stage 6D.2 DB-backed acceptance:

- a reachable isolated test database is required to prove actual combat creation/start/act/end/completion/reward dedupe transaction behavior
- Stage 6D.3 should not depend on player-facing combat routes or Flutter UI
- no migration should be proposed until DB-backed tests prove existing logs/action windows cannot support the required identity/recovery model

Recommended next step for Stage 6D.3:

- wrap or extend `resolveAttackAction` with an authoritative roll contract
- characterize/fix critical-hit dice behavior under tests
- preserve the existing deterministic roll override seam for tests
- keep legacy service responses internal until the Stage 6D adapter can project player-safe combat results
