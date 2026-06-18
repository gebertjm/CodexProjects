# Stage 6D.0 - Existing Combat System Audit And Combat MVP Specification

Status: audit and specification only  
Date: 2026-06-13  
Primary predecessors: Stage 6B.15 Greyvale playable vertical slice, Stage 6C beat-resolution runtime hardening

## 1. Executive Assessment

DailyRPG already has a real but older combat spine. It includes stat blocks, actions, persistent combats, participants, initiative, attack resolution, turn advancement, simple AI turns, combat logs, combat end hooks, encounter scaling, and CLI/API access.

That existing spine is useful, but it is not ready to be exposed directly as the Greyvale web combat MVP. It was built in Stage 4C/4E/5I style, before the Stage 6B/6C interaction model standardized preview/submit/resolution contracts, player-safe result bundles, read-model refresh alignment, visibility filtering, stale/duplicate recovery, and GM/dev traces.

Recommendation: retain the existing combat domain model, data tables, stat-block/action/encounter content, and low-level deterministic combat math where it tests cleanly. Add a Stage 6C-compatible combat adapter around it instead of rewriting exploration or dialogue and instead of exposing the old combat service shape directly to the Flutter player app.

## 2. Audit Scope And Evidence

This audit reviewed:

- existing combat runtime code
- combat persistence and database tables
- stat block, action, condition, and encounter content
- Greyvale Rusk/future-supported handoff content
- combat API, CLI, runtime action-window wiring, and player read-model seams
- Flutter player app combat-adjacent UI
- existing test coverage and command scripts
- Stage 6B.15 and Stage 6C docs/regression gates

No runtime behavior, database schema, player UI, or Greyvale content was changed in this audit.

## 3. Existing Combat Modules Discovered

| Area | Files | Current capability |
| --- | --- | --- |
| Combat engine helpers | `backend/src/engine/combat/combatEngine.js` | Ability modifiers, d20 rolls, damage rolls, initiative order, attack resolution, basic AI action selection. |
| Combat service | `backend/src/services/combatService.js` | Create/start/read combat, take actions, end turns, resolve AI turns, resolve combat, apply XP/world outcomes, execute combat hooks. |
| Combat persistence | `backend/src/db/queries/combat.js` | Combat rows, participants, initiative, action logs, conditions, character HP persistence, NPC state persistence. |
| Stat blocks/actions | `backend/src/services/statBlockService.js`, `backend/src/db/queries/statBlocks.js` | Reusable stat blocks, abilities, skills, senses, resistances, traits, actions, damage, requirements, effects. |
| Encounter scaling/rewards | `backend/src/services/encounterService.js`, `backend/src/db/queries/encounters.js` | Encounter templates, party strength, solo/party variant preview, bounded scaling, equivalent reward resolution and dedupe. |
| Legacy runtime integration | `backend/src/services/adventureRuntimeService.js` | Active combat detection, `combat_turn`/`combat_wait` action windows, `start_combat`, `combat_action`, `end_turn`, `resolve_ai_turn`, player runtime combat summary. |
| Routes | `backend/src/routes/dnd5e.js` | Stat-block, encounter, and combat CRUD/action endpoints. These are generic DND5E/dev-style routes, not Stage 6C player acceptance routes. |
| CLI | `backend/src/cli/index.js` | Commands for stat blocks, encounters, combat start/show/take-turn/end-turn/AI turn. |
| Database migrations | `db/init/013-stage-4b_5-combatant-stat-blocks-and-actions.sql`, `db/init/014-stage-4c-combat-engine.sql`, `db/init/022-stage-5i-encounter-scaling-and-balance.sql` | Existing tables appear sufficient for a narrow MVP if durable traces/idempotency can stay in existing action-window/log structures. |
| Greyvale combat content | `content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json`, `content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json`, Rusk dialogue fixtures | Rusk confrontation is authored as a combat/future-supported handoff with bounded encounter scaling and post-combat hook content. |
| Flutter app | `apps/player_app/lib/...` | Character sheet renders combat basics; scene UI has no dedicated combat encounter surface. Endpoint UI hides combat internals. |
| SMS simulator | `backend/src/sms/...`, `frontend/dev/sms-simulator/index.html` | SMS combat prompt/result templates exist, but SMS is explicitly out of Stage 6D MVP scope. |

## 4. Existing Combat Feature Assessment

### Supported Today

- persistent combat containers with status `pending`, `active`, `resolved`, `canceled`
- combat participants tied to characters, NPCs, or monsters
- initiative order with deterministic overrides
- turn advancement and AI turn resolution
- basic attack rolls against armor class
- simple damage and temporary HP absorption
- combat action logs
- HP persistence back to character/NPC state at combat end
- XP/outcome application through existing progression services
- `combat_start` and `combat_end` content hooks
- encounter template scaling and reward dedupe
- CLI/API paths for manual/dev combat exercising
- old runtime action windows for combat turns and waits

### Not Reliably Supported Or Not Yet Product-Ready

- Stage 6C shared preview/submit/resolution contract for combat
- non-mutating combat previews
- player result bundle sections for combat outcomes
- post-resolution player read-model alignment
- Stage 6C mutation plan/dedupe/idempotency semantics
- Stage 6C transition/next-beat decision semantics
- Stage 6C GM/dev resolution trace envelope
- player-vs-GM visibility split for combat read models
- direct Flutter combat UI
- direct Greyvale Rusk combat acceptance route
- direct tests for `createCombat`, `startCombat`, `actInCombat`, `resolveAttackAction`, or `buildInitiativeOrder`
- robust stale/duplicate combat submit recovery
- full condition mechanics
- saving throws
- spells
- reactions
- bonus actions
- resources
- movement/positioning
- area effects
- concentration
- resistance/immunity/vulnerability application
- full D&D 5e critical damage policy

## 5. Reuse, Refactor, Replace, Or Defer

| Component | Recommendation | Reason |
| --- | --- | --- |
| Stat-block tables and service | Reuse | Good reusable content foundation; actions/effects/damage metadata already modeled. |
| Encounter templates and scaling | Reuse | Rusk already has bounded solo/party scaling and equivalent reward logic. |
| Combat DB tables | Reuse for MVP | Combat/participants/logs/conditions cover basic state without immediate migration. |
| Combat engine math helpers | Reuse after direct tests | Small pure helper surface with deterministic overrides; needs direct regression coverage. |
| Combat service | Refactor behind adapter | It can execute combat, but its response shape and lifecycle are pre-6C. |
| Legacy runtime combat action windows | Refactor | Useful evidence for action windows, but must align with Stage 6C stale/duplicate/read-model rules. |
| Player combat summary in `adventureRuntimeService` | Replace/projection-wrap | Current summary exposes internal-ish fields such as visibility mode, exact turn index, result JSON, exact enemy HP/AC/control mode. |
| Generic `/api/dnd5e/combats/*` routes | Keep as dev/internal; do not make product API | Useful for CLI/dev validation, not player-safe web MVP shape. |
| SMS combat templates/simulator | Defer | SMS remains optional/minimized/disabled by default for Stage 6D. |
| Full 5e rules engine | Defer | MVP should not become Stage 6H or a full tactical engine. |

## 6. Stage 6C Compatibility Assessment

Stage 6C created the architecture combat should plug into:

- shared interaction domains already reserve `combat`
- result bundle helpers support result, consequences, discoveries, progress, complications, next, recovery, and status
- mutation plan helpers can represent ordered/deduped writes
- transition/next-beat helpers can model endpoint, same-scene, and next-window decisions
- read-model alignment helpers can assert result/read model consistency
- GM/dev trace helpers can describe request validation, selected outcome, mutation plan, transition, next beat, projection stripping, stale/duplicate, and recovery cases
- visibility helpers already hide `combat_pending`, `future_supported`, routing internals, path harness data, and debug fields from players

Combat currently sits beside that architecture, not inside it. Stage 6D should not collapse exploration/dialogue/combat into one runtime. It should define a combat adapter that implements the same shared contract while keeping combat-specific rules, state, and content separate.

## 7. Proposed Combat Adapter Boundary

Recommended adapter module shape:

```text
backend/src/interaction-core/adapters/combat/
  combatInteractionAdapter.js
  combatPreviewService.js
  combatSubmitService.js
  combatReadModelService.js
  combatTraceAdapter.js
  combatVisibilityAdapter.js
```

The exact location should follow existing repo conventions when implementation begins. The adapter should expose Stage 6C-shaped operations:

- `buildCombatInteractionContext(...)`
- `previewCombatAction(...)`
- `submitCombatAction(...)`
- `resolveCombatAction(...)`
- `buildCombatPlayerResultBundle(...)`
- `buildCombatPlayerReadModel(...)`
- `buildCombatGmDevTrace(...)`
- `projectCombatForPlayer(...)`
- `projectCombatForGmDev(...)`

Adapter responsibilities:

- translate combat state into shared interaction context
- validate actor, combat, participant, action, target, turn, and action-window state
- support non-mutating preview
- resolve committed action through existing combat service/engine
- build ordered mutation/output summary
- refresh player read model after writes and turn/next-beat selection
- hide GM/dev internals from player
- expose GM/dev trace/provenance to authorized dev tools
- interoperate with Rusk endpoint/completion state

The adapter should not rewrite exploration or dialogue.

## 8. Recommended Combat MVP Scope

The Combat MVP should be deliberately narrow:

- one active player character
- Greyvale Rusk confrontation as primary acceptance target
- one or more enemy NPC participants from existing encounter variants
- deterministic turn order with roll overrides in tests
- player turn action window
- AI/enemy turn action window or deterministic auto-resolution
- basic attack action
- optional defend/wait action only if already modeled simply
- hit, miss, damage, defeat, and combat end
- authored outcome/result bundle text
- objective/knowledge/history/latest development endpoint updates
- post-combat hook application
- player-safe endpoint or victory/awaiting-support status
- GM/dev trace for every committed combat beat
- refresh/resume after every key combat state

MVP should prove the Rusk boundary can move from `future_supported` to a real, bounded combat beat chain without exposing internals.

## 9. Explicit MVP Non-Goals

Stage 6D MVP should not include:

- full D&D 5e combat rules
- open-world navigation
- tactical grid or map movement
- spells
- spell slots
- bonus actions
- reactions
- opportunity attacks
- concentration
- resources/limited-use feature accounting
- area-of-effect targeting
- multi-character party coordination beyond future-safe scoping
- player-facing rules transparency expansion
- combat UI redesign
- SMS combat requirement
- AI narration
- dynamic prose generation
- major Greyvale content expansion
- final hollow mystery resolution
- full GM Campaign Inspector
- database migration unless a later implementation stage proves it is unavoidable and gets owner approval

## 10. Rusk Encounter Readiness

Rusk has a strong content foundation:

- Rusk dialogue already reaches a GM/dev-visible combat handoff.
- The player endpoint hides `combat_pending` and `future_supported`.
- `shrine-rusk-confrontation` exists as a Stage 5I encounter template.
- Solo and party variants are authored.
- Rusk remains story-fixed while allowing bounded enemy-count scaling.
- Equivalent reward resolution is already modeled.
- Post-combat hook content exists for `shrine-ruins`.

Gaps before live Rusk combat:

- Rusk needs a combat adapter entry point from the existing dialogue endpoint.
- Rusk's selected encounter variant must create concrete combat participants.
- Player-facing endpoint copy must change only when combat is actually live.
- Combat result bundles must avoid internal `combat_pending`/`future_supported` labels.
- Combat completion must update Greyvale objective/knowledge/history/latest development safely.
- GM/dev trace must show Rusk handoff details.
- Tests must prove no unsupported combat window appears before the new MVP is live.

## 11. Required Rules Subset

Recommended MVP rules subset:

- initiative: d20 plus DEX modifier; deterministic overrides for tests
- participant state: current HP, max HP, temp HP, defeated/active
- action availability: actor must be current active participant and action must be available to that participant
- targeting: single target, opposing faction, active, not defeated
- attack resolution: d20 plus attack bonus/effects against AC
- natural 1 miss and natural 20 hit marker
- damage: deterministic dice override in tests; simple damage application
- defeat: participant inactive/defeated at HP <= 0
- enemy behavior: deterministic first legal attack against player character
- end: combat resolves when only one faction remains active
- rewards/outcomes: route through existing encounter/progression services

Do not add saving throws, resistances, conditions, spells, or resources to MVP unless a direct Rusk blocker appears and the owner accepts the added scope.

## 12. Proposed Combat State Machine

Recommended player-safe states:

```text
not_started
starting
active_player_turn
active_enemy_turn
waiting
resolving
resolved_victory
resolved_defeat_or_fail_forward
endpoint_review
unavailable
stale
duplicate_handled
recovery_needed
```

Recommended internal states can continue using existing `dnd5e_combat.status` values:

```text
pending
active
resolved
canceled
```

The adapter should map internal states to player-safe states. Player payloads should not expose raw action-window internals, mutation plan state, or unsupported future-stage labels.

## 13. Turn And Action-Window Model

Stage 6D should keep the Stage 6C action-window rule:

- preview does not mutate
- submit consumes the current combat action window exactly once
- duplicate submit returns the current true state or idempotent handled result
- stale submit returns safe recovery/current state
- successful player action closes the player turn window
- next beat selection opens either enemy-turn/wait, next player-turn, resolved endpoint/review, or recovery-needed
- enemy turns should be deterministic and inspectable
- refresh/resume should show the current true combat state

Existing `combat_turn` and `combat_wait` windows are a useful starting point but must be tested and wrapped in Stage 6C semantics.

## 14. Targeting And Positioning Recommendation

MVP targeting should be single-target only:

- legal targets are visible opposing active participants
- player target labels should use safe display names
- unavailable targets should be hidden or safely explained
- no grid, range map, flanking, cover, engagement, or movement
- action metadata may retain range internally for future use

This keeps Rusk combat playable without implementing open-world navigation or tactical positioning.

## 15. Deterministic Enemy Behavior Recommendation

Use deterministic enemy behavior for MVP:

- enemy chooses first legal attack action
- enemy targets the active player character
- deterministic test overrides control attack and damage rolls
- GM/dev trace records AI selection reason
- player result says what happened without revealing raw AI internals

The existing `selectAiAction` helper already approximates this behavior and should be tested before reuse.

## 16. Player Combat Read Model Recommendation

Do not expose the existing raw `summarizeCombatForPlayer` shape directly.

Recommended player combat read model:

- combat status label
- round/turn phrased safely, if useful
- whose turn it is
- player character HP/status
- enemy display names and safe health bands or exact HP only if owner approves
- available player actions
- legal targets
- latest combat result bundle
- latest development/objective context
- safe next-step message
- endpoint/review status after resolution

Player read model should not include:

- `visibility_mode`
- raw current turn index
- raw `result_json`
- raw control mode unless intentionally rendered as safe copy
- hidden requirements
- raw mutation/action-window details
- GM/dev trace/provenance
- internal Rusk handoff labels
- source file paths or path harness metadata

## 17. GM/Dev Trace And Inspector Recommendation

Stage 6D should extend Stage 6C trace/provenance patterns for combat.

GM/dev trace should include:

- request, actor, campaign, character, combat, participant, action, target
- source combat status/action window
- validation result
- stale/duplicate/idempotency result
- selected deterministic outcome
- roll inputs and roll results
- action/effect/damage metadata
- output bundle
- mutation plan/write group results
- participant HP before/after
- defeated/resolved status
- transition/next-beat decision
- player result bundle
- refreshed read model summary
- fields stripped from player projection
- Rusk encounter/handoff metadata
- recovery diagnostics

Trace should be GM/dev-only and can remain response/test-helper scoped unless durable trace persistence is later approved.

## 18. Persistence And Schema Assessment

Existing schema appears sufficient for a narrow Combat MVP:

- `dnd5e_combat`
- `dnd5e_combat_participant`
- `dnd5e_combat_action_log`
- `dnd5e_combat_condition`
- `dnd5e_action_window`
- `dnd5e_encounter_template`
- existing progression/history/objective/knowledge tables

Likely no Stage 6D.1 migration is needed.

Potential future schema needs:

- durable resolution trace records
- durable idempotency keys per combat action submit
- player result bundle snapshots linked to combat logs
- stronger recovery-needed markers
- richer condition/resource state if Stage 6D expands beyond MVP

Recommendation: begin 6D.1/6D.2 without migration. If implementation proves durable trace/idempotency cannot be modeled with existing logs/action windows, stop and request owner approval for a narrowly scoped migration.

## 19. API And Service Recommendation

Do not make the generic `/api/dnd5e/combats/*` endpoints the product-facing Flutter API.

Recommended player-facing API/service shape:

- start/enter Rusk combat from the existing safe endpoint transition
- load current combat player read model
- preview combat action
- submit combat action
- wait/resolve deterministic enemy turn
- resume current combat state
- return endpoint/review state after combat resolves

Recommended GM/dev shape:

- inspect current combat state
- inspect latest combat trace
- compare player-vs-GM projection
- inspect Rusk encounter variant and handoff metadata

Existing combat routes/CLI can remain dev validation surfaces.

## 20. Web UI MVP Recommendation

Flutter MVP should be minimal:

- show combat status and current turn
- show player HP/status
- show enemy names and safe status/health
- show available combat actions
- show legal target choices
- support preview and final submit
- show result bundle sections
- show enemy turn/wait state
- show safe stale/duplicate/recovery messages
- show post-combat endpoint/review status
- hide all GM/dev trace and internals

Do not build a tactical grid, broad combat sheet, spell UI, resource manager, or GM dashboard.

## 21. Content Authoring Requirements

Combat authoring should use existing encounter templates and add only the minimal metadata needed by the adapter:

- encounter id
- story intent
- allowed participant variants
- player-safe combat start text
- player-safe round/turn framing
- authored action result labels where needed
- failure/fail-forward copy
- victory/defeat/retreat endpoint copy
- objective/knowledge/history/latest development outputs
- GM/dev handoff metadata

Rusk should use existing `shrine-rusk-confrontation` and `grey-road-shrine-combat-resolution` content where possible.

Do not add major NPCs, lore, locations, or final mystery revelations in Stage 6D MVP.

## 22. Test And Acceptance Strategy

Stage 6D should add layered tests:

### Shared Combat Runtime Tests

- initiative order
- attack resolution hit/miss/crit marker
- damage and temporary HP
- defeat/resolution
- deterministic AI selection
- player-safe projection
- GM/dev trace projection

### Combat Adapter Tests

- preview non-mutating
- submit commits once
- duplicate submit safe
- stale submit safe
- unavailable action safe
- read model refresh after writes
- transition/next-beat selection
- recovery-needed path
- player hidden-data denylist

### Rusk Acceptance Tests

- Rusk combat starts from existing endpoint/handoff
- Rusk encounter variant selected safely
- player turn renders legal actions and targets
- enemy turn resolves deterministically
- victory/fail-forward endpoint reached
- objectives/knowledge/history/latest development update
- post-combat hook applies once
- endpoint/resume stable
- GM/dev trace exposes internals only to authorized users
- player projection hides internals

### Flutter Tests

- combat status renders
- action/target selection renders
- preview/submit/result renders
- enemy wait/turn state renders
- endpoint/review renders
- hidden-data denylist passes rendered output

## 23. Recommended Stage 6D.1-6D.12 Sequence

1. Stage 6D.1 - Combat Adapter Contract And Boundary
2. Stage 6D.2 - Existing Combat Engine Direct Regression Tests
3. Stage 6D.3 - Combat Preview And Player-Safe Read Model
4. Stage 6D.4 - Combat Submit, Mutation Ordering, And Idempotency
5. Stage 6D.5 - Combat Turn/Next-Beat Orchestration
6. Stage 6D.6 - Deterministic Enemy Turn And Recovery Handling
7. Stage 6D.7 - Rusk Encounter Adapter And Participant Creation
8. Stage 6D.8 - Combat Result Bundle, Outcomes, And Post-Combat Outputs
9. Stage 6D.9 - GM/Dev Combat Trace And Visibility Inspector
10. Stage 6D.10 - Flutter Combat MVP UI
11. Stage 6D.11 - Rusk Combat Acceptance Suite
12. Stage 6D.12 - Stage 6D Regression Gate And Final Status

If owner wants a smaller scope, merge 6D.3-6D.6 into a single backend combat MVP pass and keep 6D.10/6D.11 separate.

## 24. Critical Risks

| Risk | Severity | Why it matters | Mitigation |
| --- | --- | --- | --- |
| Old combat service bypasses Stage 6C lifecycle | High | Could create stale, duplicate, or hidden-data behavior inconsistent with exploration/dialogue. | Build adapter before player exposure. |
| Player combat summary leaks internals | High | Existing summary includes raw-ish combat fields. | Create combat-specific player projection. |
| Direct combat tests are missing | High | Existing engine/service may work but is unverified by current regression gates. | Add 6D.2 direct tests first. |
| Rusk endpoint copy/status conflicts with live combat | Medium | Current endpoint says combat support is future-supported. | Change only when combat adapter is live and tested. |
| Combat MVP grows into full 5e rules | High | Scope explosion blocks playable Rusk MVP. | Lock rules subset before 6D.1. |
| Schema migration temptation | Medium | Trace/idempotency durability may be attractive but not required for first MVP. | Attempt existing tables first; require owner approval for migration. |
| Enemy health visibility unclear | Medium | Exact HP/AC can feel mechanical or leak GM info. | Owner decision before UI/read model implementation. |
| Encounter scaling not tied to combat creation | Medium | Rusk variants exist but do not instantiate live combat participants. | Build explicit Rusk encounter adapter. |
| Frontend combat UI missing | Medium | Backend-only combat will not satisfy web-first product goal. | Keep UI MVP separate and minimal. |

## 25. Owner Decisions Required Before 6D.1

Recommended default answers are included to keep implementation moving.

1. Should Stage 6D use Rusk as the only official combat MVP acceptance target?  
   Recommended: yes.

2. Should MVP expose exact enemy HP to players or health bands only?  
   Recommended: health bands for enemies; exact HP for the player character.

3. Should MVP include only basic attack plus wait/defend, or include more authored combat actions?  
   Recommended: basic attack plus wait/defend only if already easy to model.

4. Should enemy turns auto-resolve deterministically, or require a visible player "continue" click?  
   Recommended: auto-resolve in backend tests; player UI may show a Continue button if needed for clarity.

5. Should combat defeat fail-forward instead of game-over?  
   Recommended: yes for Greyvale MVP, with authored safe fail-forward or retreat state.

6. Should durable GM/dev trace persistence be required in 6D MVP?  
   Recommended: no; response/test-helper trace first, migration only if later approved.

7. Should existing `/api/dnd5e/combats/*` routes remain dev-only while player routes use `/api/play` style endpoints?  
   Recommended: yes.

8. Should Stage 6D correct docs that still point combat MVP to later Stage 6I?  
   Recommended: yes, but only as documentation/reference correction when 6D begins implementation.

## 26. Stage 6D.1 Readiness

Stage 6D.1 is ready to begin as a contract/boundary stage once the owner confirms the decisions above. The repo has enough existing combat infrastructure to avoid starting from scratch, but not enough Stage 6C-compatible product hardening to safely expose old combat directly to players.

Recommended 6D.1 acceptance target:

- define combat adapter contract
- map existing combat service into Stage 6C lifecycle terms
- define player and GM/dev projection contracts
- define Rusk entry/exit boundaries
- decide migration posture
- add contract tests without changing live player behavior

## Validation Notes

Audit validation should prioritize:

- combat source inventory
- existing Stage 6C regression command
- Greyvale vertical-slice command
- Stage 5I encounter tests
- Rusk endpoint boundary tests
- content validation for Greyvale
- `node --check` for combat modules

Any command failures should be reported as environment-related or code-related before Stage 6D.1 starts.
