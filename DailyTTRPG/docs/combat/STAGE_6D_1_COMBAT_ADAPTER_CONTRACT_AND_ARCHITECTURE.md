# Stage 6D.1 - Combat Adapter Contract And Architecture

Status: implemented as a contract, architecture, and test-foundation stage  
Date: 2026-06-16  
Primary predecessor: [Stage 6D.0 Existing Combat System Audit And Combat MVP Specification](STAGE_6D_0_EXISTING_COMBAT_SYSTEM_AUDIT_AND_MVP_SPECIFICATION.md)

## Executive Result

Stage 6D.1 establishes the stable architectural boundary for bringing the existing combat domain into the Stage 6C interaction lifecycle.

No live player combat behavior was activated. No Rusk endpoint behavior changed. No database migration was added. No Stage 6D.2 legacy combat verification was started.

The contract module lives at:

```text
backend/src/services/interactionCore/combatAdapterContract.js
```

The focused contract tests live at:

```text
backend/test/interaction-core-combat-adapter-contract.test.js
```

The dedicated command is:

```text
npm run test:stage:6d
```

## Selected Module Boundary

The repository's Stage 6C shared interaction helpers live in:

```text
backend/src/services/interactionCore/
```

Stage 6D.1 follows that convention by adding a flat interaction-core contract module rather than creating a new parallel runtime tree.

The selected architecture is:

```text
Existing combat service, combat engine, stat blocks, encounter templates, logs
-> Stage 6C-compatible combat adapter contract
-> combat preview and committed sub-resolution lifecycle
-> player-safe combat read model
-> future Flutter combat interface
```

The adapter remains separate from exploration and dialogue. Combat is the shared interaction domain `combat`, not a collapsed universal runtime.

## Existing Components To Reuse

| Existing component | Stage 6D.1 posture | Evidence |
| --- | --- | --- |
| Combat engine helpers | Reuse after Stage 6D.2 direct verification | `backend/src/engine/combat/combatEngine.js` |
| Combat service | Wrap later through adapter | `backend/src/services/combatService.js` |
| Combat persistence | Map to contract; no migration now | `backend/src/db/queries/combat.js`, `db/init/014-stage-4c-combat-engine.sql` |
| Stat blocks/actions | Reuse | `backend/src/services/statBlockService.js`, `backend/src/db/queries/statBlocks.js` |
| Encounter scaling/rewards | Reuse for Rusk variant/reward logic | `backend/src/services/encounterService.js`, `backend/src/db/queries/encounters.js` |
| Rusk encounter content | Reuse as Stage 6D acceptance target | `content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json` |
| Shrine combat-end hook | Reuse after live combat exists | `content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json` |

## Components To Wrap Or Refactor Later

- `combatService.js` should be wrapped by the combat adapter before player exposure.
- `adventureRuntimeService.js` combat-turn and combat-wait action-window logic should be normalized into Stage 6C next-beat decisions.
- Existing generic `/api/dnd5e/combats/*` routes should remain internal/dev style until a player-safe `/api/play` combat route exists.
- Existing player combat summary shape should be replaced by the new combat player projection contract before Flutter consumes live combat.

## Components That Must Not Be Exposed Directly To Players

- legacy combat service response shape
- exact enemy hit points
- exact enemy Armor Class
- raw current-turn index
- raw control mode
- raw `result_json`
- mutation plans
- idempotency internals
- action-window internals
- GM/dev traces
- Rusk `combat_pending` and `future_supported` internals
- source paths and path harness metadata

## Existing-To-Stage-6C Mapping

| Existing combat concept | Stage 6C-compatible concept | Stage 6D adapter responsibility |
| --- | --- | --- |
| Existing combat participant | Interaction actor/target context | Translate and validate actor, ally, enemy, visibility, and target legality. |
| Legacy combat action | Previewable/committable interaction | Wrap without exposing legacy response or mutating during preview. |
| Combat action log | Committed sub-resolution evidence | Map to replay/idempotency contract where possible. |
| Combat turn | Parent player turn | Preserve incremental sub-resolutions within one scheduled beat. |
| Combat wait window | Automatic orchestration or player decision | Normalize into next-beat contract. |
| Combat current turn index | Internal state-version or turn locator | Do not expose raw value to player projection. |
| Combat participants table | Combat read model source | Project player-safe status and GM/dev exact fields separately. |
| Combat end hook | Ordered output/mutation source | Route through Stage 6C mutation/output/recovery expectations later. |
| Encounter template variant | Combat entry setup | Select variant before combat creation, with GM/dev handoff metadata. |

## Stage 6C Lifecycle Mapping

Combat contracts now map to Stage 6C concepts:

| Stage 6C concept | Combat contract |
| --- | --- |
| Interaction context | `createCombatInteractionContext` |
| Non-mutating preview | `createCombatPreviewContract`, `assertCombatPreviewIsNonMutating` |
| Committed submit | `createCombatSubmitEnvelope` |
| Mutation ordering | response-scoped contract through Stage 6C mutation plan fields |
| Idempotency | `idempotency_key` on submit and sub-resolution contracts |
| Stale handling | `source_state_version` and current action-window ids |
| Duplicate handling | submit outcome `duplicate_handled` |
| Result bundle | `buildCombatPlayerResultBundle` using Stage 6C `createPlayerResultBundle` |
| Player read-model refresh | `buildCombatPlayerReadModel` |
| Transition decision | `createCombatTransitionDecision` with Stage 6C transition mapping |
| Next-beat decision | `createCombatNextBeatDecision` with Stage 6C next-beat mapping |
| Visibility filtering | `projectCombatForPlayer`, `projectCombatForGmDev`, `assertNoCombatPlayerHiddenData` |
| Recovery-needed | submit outcome and transition/next-beat recovery states |
| GM/dev trace | `buildCombatGmDevTrace` / `createCombatGmDevTrace` |

## Ruleset And Version Strategy

The contract carries explicit ruleset identity:

```text
ruleset_id: dnd5e-2014
system: dnd5e
system_label: Dungeons & Dragons Fifth Edition
rules_version: 2014
```

The default supported baseline is Dungeons & Dragons Fifth Edition 2014.

Future rulesets or versions are represented as reserved/unsupported identities. This prevents a later 2024 rules implementation from silently changing existing campaign behavior.

Ruleset/version precedence for later implementation:

1. combat instance, once live combat creation stores or derives ruleset
2. encounter template, if authored
3. campaign/adventure default, if configured
4. stat block/action metadata, only as compatibility check
5. default `dnd5e-2014`

Stage 6D.1 defines this posture only. It does not implement 2024 rules.

## Parent Turn And Sub-Resolution Model

One scheduled combat beat represents one parent player turn window.

Contract identities:

- `combat_id`
- `parent_turn_id`
- `sub_resolution_id`
- `interrupt_parent_id`
- `continuation_id`
- `action_window_id`
- `idempotency_key`
- `source_state_version`
- `ruleset_id`
- `rules_version`
- `actor_participant_id`
- `timing_category`
- `resolution_status`
- `transition_decision`
- `next_beat_decision`

Supported timing categories:

- movement
- action
- bonus action
- object interaction
- end turn
- reaction
- interrupt
- automatic
- continuation

The contract supports multiple ordered sub-resolutions inside one parent turn. It does not implement movement, bonus actions, object interactions, or reaction mechanics yet.

## Nested Reaction Interrupt Relationship

Reactions are modeled as nested interrupts:

- a reaction sub-resolution references `interrupt_parent_id`
- a reaction carries a `continuation_id`
- a reaction consumes the reaction resource in future implementation
- a reaction does not consume or replace the normal parent turn
- next-beat decisions can open a reaction interrupt, then resume interrupted resolution

Stage 6D.1 defines the identity and relationship model only.

## Preview Contract

The preview contract can represent:

- selected action, movement, target, or destination
- action-economy cost
- movement cost
- visible resource cost
- legality and safe unavailable reason
- visible targets
- target-inclusion policy
- known ally or non-hostile exposure
- known range, proximity, cover, engagement, opportunity-attack risk
- known advantage or disadvantage
- roll type without final result
- known damage or effect types
- visible concentration consequences
- visible terrain or hazard effects
- source state version
- preview identity

The preview contract explicitly excludes:

- final random rolls
- mutation plans
- output bundles
- exact hidden enemy statistics
- hidden DCs
- secret reactions
- GM/dev trace data

Preview is non-mutating by contract.

## Submit Contract

The submit envelope supports:

- operation type
- combat id
- parent turn id
- preview/source-state reference
- selected action or movement
- selected target or destination
- selected resource tier
- ally-risk confirmation
- idempotency key
- actor and authorization context

Safe submit outcomes:

- committed
- duplicate handled
- stale
- unavailable
- reaction required
- next player decision
- automatic continuation
- encounter resolved
- recovery needed

Stage 6D.1 does not resolve combat through this envelope yet.

## Transition And Next-Beat Contract

Combat transition decisions can represent:

- remain in current player turn
- open another incremental player decision
- open reaction interrupt
- resume interrupted resolution
- begin automatic allied turn
- begin automatic enemy turn
- begin scripted orchestration
- open next player turn
- enter encounter resolution
- enter endpoint review
- enter unavailable
- enter recovery needed

Combat next-beat decisions can represent:

- keep parent turn open
- open movement/action/bonus-action/object-interaction decision
- open reaction interrupt
- resume interrupted resolution
- resolve automatic ally or enemy
- open next player turn
- endpoint review only
- unavailable no state change
- recovery needed

Each combat value maps to a Stage 6C transition or next-beat decision so existing shared helpers remain the orchestration vocabulary.

## Player Projection Boundary

The player projection may include:

- player-safe combat status
- encounter title
- round/turn label
- visible initiative order
- exact player hit points and temporary hit points
- visible player resources
- enemy names and health bands
- allies
- visible conditions
- named zones
- relative proximity
- visible cover
- movement remaining
- action economy availability
- available actions
- legal targets
- reaction prompt
- Combat Focus placeholder data
- latest player result
- stale/duplicate/unavailable/recovery messaging
- encounter outcome
- safe next-step message

The player projection strips or rejects:

- exact enemy hit points
- exact enemy Armor Class
- hidden saving-throw modifiers
- hidden DCs
- raw current-turn index
- raw control mode
- raw result data
- mutation plans
- idempotency internals
- action-window internals
- internal routing
- trace data
- source paths
- test metadata
- hidden participants
- unrevealed resources or abilities
- `combat_pending`
- `future_supported`

Projection uses Stage 6C visibility helpers plus combat-specific forbidden keys.

## GM/Dev Projection Boundary

The GM/dev projection can retain:

- exact combat state
- participants, factions, and control modes
- exact HP, AC, saving throws, and resources
- action-window state
- parent-turn and sub-resolution relationships
- roll inputs and results
- action/effect metadata
- validation results
- stale, duplicate, and idempotency results
- mutation plan and write results
- transition and next-beat decisions
- projection stripping notes
- recovery diagnostics
- Rusk handoff and outcome metadata

This contract does not build the full GM Campaign Inspector.

## Rusk Entry Boundary

The Rusk entry contract is inactive in Stage 6D.1.

It can carry:

- campaign id
- active character id
- source shrine scene
- source endpoint
- prior Rusk dialogue id
- prior narrative state
- encounter template id `shrine-rusk-confrontation`
- solo-safe selected variant id
- ruleset/version
- canonical combat-start setup reference
- idempotent create-or-resume behavior
- player-safe combat-start result
- GM/dev handoff metadata

The current player endpoint still does not begin combat or show combat actions.

## Rusk Exit Boundary

All supported Rusk outcomes route through one shared Shrine Ruins aftermath state:

```text
scene_id: shrine-ruins
state_id: shrine_ruins_aftermath
```

Supported outcome identifiers:

- player_victory
- rusk_defeat_lethal
- rusk_defeat_nonlethal
- rusk_unconscious
- rusk_captured
- rusk_surrender
- player_retreat
- player_surrender
- fail_forward_player_defeat
- unusual_authored_resolution

The exit contract can carry:

- participant states
- persistent conditions
- valid concentration
- remaining resources
- objective outputs
- knowledge outputs
- history outputs
- Latest Development
- experience points
- advancement readiness
- post-combat hook identity
- dedupe identity
- return scene or aftermath state
- player summary
- GM/dev provenance

No outcome mutation is implemented in Stage 6D.1.

## Persistence And Migration Posture

No database migration was added.

Contract-to-storage mapping:

| Contract concept | Current structure | Status |
| --- | --- | --- |
| `combat_id` | `dnd5e_combat.id` | Directly supported |
| participant state | `dnd5e_combat_participant` | Directly supported |
| committed sub-resolution evidence | `dnd5e_combat_action_log` | Derivable |
| parent turn id | combat id + round + turn index + participant | Derivable |
| sub-resolution id | combat action log id or response-scoped id | Derivable |
| reaction interrupt relation | no first-class relation yet | Temporarily response-scoped |
| idempotency key | action-window/request context plus logs | Potentially deficient but unproven |
| recovery-needed marker | result/read-model envelope plus logs | Potentially deficient but unproven |
| GM/dev trace | Stage 6C generated trace plus logs/provenance | Temporarily response-scoped |
| Rusk aftermath outputs | progression/history/objective tables and combat-end hook | Directly supported |

Migration rule: do not request schema changes until Stage 6D.2 or later produces a failing test or reproducible persistence deficiency.

## Contract Tests

Added tests cover:

- combat domain and adapter operation exports
- explicit ruleset/version identity
- combat interaction context fields
- parent turns owning multiple ordered sub-resolutions
- reaction interrupts and continuation points
- non-mutating preview contract
- submit envelope outcome states
- player projection stripping hidden combat fields
- GM/dev projection retaining exact fields
- transition and next-beat value coverage
- Rusk entry and exit contract outcomes
- unsupported operation safe failure
- no mutation of input state during contract construction
- Stage 6C result bundle, transition, next-beat, trace, and visibility compatibility

## Known Risks

- Existing combat engine/service behavior still needs direct tests in Stage 6D.2.
- Existing combat action logs may or may not be sufficient for durable idempotency across all sub-resolutions.
- Reaction interrupts are contract-modeled but not persisted as first-class relationships yet.
- Exact enemy health visibility is intentionally blocked for player projection, but owner may later choose health-band wording.
- The Rusk endpoint still points to future-supported combat until implementation stages activate the handoff.

## Stage 6D.2 Readiness

The repository is ready for Stage 6D.2 - Legacy Combat Engine Verification.

Recommended next focus:

- direct pure tests for `calculateAbilityModifier`, `buildInitiativeOrder`, `resolveAttackAction`, and `selectAiAction`
- direct combat service tests where DB access is available
- proof that existing logs/action windows can support idempotency and stale handling before requesting any migration
- no Flutter or Rusk behavior activation until adapter verification is complete
