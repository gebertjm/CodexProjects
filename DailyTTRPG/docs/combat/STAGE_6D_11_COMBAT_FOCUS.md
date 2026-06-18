# Stage 6D.11 - Combat Focus

Status: implemented as a deterministic service-bound Combat Focus runtime  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)
- [Stage 6D.8 Reactions And Interrupt Orchestration](STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)
- [Stage 6D.9 Automatic Turns And Deterministic Tactical Profiles](STAGE_6D_9_AUTOMATIC_TURNS_AND_DETERMINISTIC_TACTICAL_PROFILES.md)
- [Stage 6D.10 Multi-Target, Area, Visibility, And Faction Dynamics](STAGE_6D_10_MULTI_TARGET_AREA_VISIBILITY_FACTION_DYNAMICS.md)

## Executive Result

Stage 6D.11 adds a non-mutating Combat Focus runtime at:

```text
backend/src/engine/combat/combatFocus.js
```

The focused tests live at:

```text
backend/test/stage6d11-combat-focus.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

Combat Focus answers player tactical questions using current visible combat state and rules-knowable data. It does not submit actions, roll dice, mutate state, recommend a best action, reveal hidden mechanics, activate Rusk combat, add Flutter combat UI, add a GM/dev inspector UI, or add a database migration.

## Architecture

The runtime consumes the existing Stage 6D combat state shape and wraps earlier combat helpers:

- Stage 6D.7 player-turn read model and decision categories
- Stage 6D.6 positioning, routes, cover, reach, engagement, opportunity-candidate helpers, and retreat evaluation
- Stage 6D.5 condition and capability evaluation
- Stage 6D.4 action timing and resource contracts
- Stage 6D.10 visible target candidate and target preview helpers
- Stage 6D.1 ruleset identity and player/GM-dev projection conventions

The runtime boundary provides:

- Combat Focus context assembly
- guaranteed structured question templates
- deterministic free-text matching
- structured answer resolution
- player-safe answer and read-model projection
- GM/dev trace scaffolding
- answer validity and reuse helpers
- end-turn collapse and recovery suppression behavior

## Guaranteed Questions

The template registry contains 33 guaranteed questions across six categories.

Enemy-specific:

- `enemy.can_i_reach`
- `enemy.can_reach_me`
- `enemy.am_i_engaged`
- `enemy.opportunity_attack_if_move_away`
- `enemy.within_selected_action_range`
- `enemy.cover`
- `enemy.visible_conditions`
- `enemy.legal_target_for_selected_action`

Movement and positioning:

- `movement.can_move_to_zone`
- `movement.cost`
- `movement.route_risk`
- `movement.and_action_possible`
- `movement.cover_change`
- `movement.engagement_change`

Action feasibility:

- `action.can_use_now`
- `action.economy_cost`
- `action.visible_legal_targets`
- `action.affects_allies`
- `action.break_concentration`
- `action.resource_available`

Terrain and objects:

- `terrain.cover_available`
- `terrain.objects_interact`
- `terrain.object_cost`
- `terrain.reachable_zones`

Retreat:

- `retreat.possible`
- `retreat.escape_routes`
- `retreat.requirements`
- `retreat.opportunity_risk`

Self-state:

- `self.condition_restrictions`
- `self.movement_remaining`
- `self.turn_resources_remaining`
- `self.concentration`
- `self.reactions_remaining`

## Matching And Disambiguation

`matchCombatFocusFreeText` normalizes a short player question, scores it against canonical questions, synonyms, and supported phrases, then returns one of:

- `matched`
- `disambiguation_required`
- `parameter_choices_required`
- `unsupported`

The matcher is deterministic and local. It does not call an LLM, external service, search service, or best-action planner.

When a question is unsupported, the response gives nearest safe categories instead of fabricating advice. When several templates are plausible, the response returns player-safe alternatives. When a required enemy, action, zone, or object is ambiguous, the response returns bounded player-safe parameter choices.

## Prioritization And Progressive Disclosure

`buildPrioritizedCombatFocusSuggestions` keeps suggestions bounded. Current target, selected action, selected zone, self-state, retreat, and terrain cues are prioritized without dumping the full template catalog into the player read model.

`listCombatFocusQuestionGroups` supports collapsed and expanded groups:

- collapsed groups show two questions and an additional count
- expanded groups show up to eight questions
- recovery-needed state suppresses ordinary tactical suggestions and shows a recovery review prompt

## Answer Behavior

Answers are concise and deterministic. They may include:

- concise answer text
- certainty marker
- structured values
- supporting details
- related template ids
- player-safe status
- validity record for GM/dev and reuse logic

Answers may not include:

- exact hidden enemy Armor Class
- exact enemy hit points
- hidden Difficulty Classes
- concealed participant identities
- raw rolls
- mutation plans
- action-window internals
- source-state internals
- matcher scores
- dependency fingerprints in player payloads
- GM/dev trace fields

Combat Focus does not invent narrative prose. It summarizes current visible mechanics and authored labels.

## Reuse And Validity

`createAnswerValidityRecord` stores a dependency snapshot and fingerprint for the answer. `isCombatFocusAnswerValid` recomputes the relevant current dependencies from the active context and rejects reuse when visible inputs changed.

Supported invalidation paths include:

- turn changed
- turn closed
- movement, position, condition, action-economy, resource, visibility, target, object, reaction, concentration, route, cover, or retreat dependency changed
- answer marked invalid

`reuseCombatFocusAnswer` returns the original answer as `reused` only when dependencies remain valid. `invalidateStaleCombatFocusAnswers` marks stale answers with a safe invalidation reason. `collapseCombatFocusAnswersAtEndTurn` marks current-turn answers stale and collapsed when the turn ends.

## Visibility

Player projections are produced by:

- `projectCombatFocusAnswerForPlayer`
- `projectCombatFocusForPlayer`
- `buildCombatFocusReadModel`

All player projections run `assertNoCombatFocusPlayerHiddenData`.

GM/dev trace scaffolding is available through `buildCombatFocusGmDevTrace` and includes template selection, dependency declarations, dependency fingerprint, matcher trace, and visibility-filtering notes. This trace is not included in player projections.

## Legacy Reuse

Combat Focus reuses existing combat runtime helpers rather than duplicating mechanics:

| Existing component | Reuse in Combat Focus |
| --- | --- |
| Stage 6D.7 player-turn runtime | current turn read model and legal decision categories |
| Stage 6D.6 spatial movement | movement cost, route risk, cover, engagement, retreat, and opportunity-candidate context |
| Stage 6D.5 condition lifecycle | action/move/reaction capability and visible condition restrictions |
| Stage 6D.4 action/resource framework | action timing, resource costs, concentration markers |
| Stage 6D.10 targeting dynamics | visible legal targets and target legality preview |
| Stage 6D.1 adapter contracts | ruleset identity and projection boundary |

## Persistence Status

No migration was added.

Combat Focus is currently response/service scoped over the existing combat state and optional `combat_focus_answers` collection in the serializable state object. Durable persistence and cross-request replay hardening remain a Stage 6D.12 risk unless existing combat/action-window storage later proves sufficient.

Current durable or serializable concepts:

- answer id
- template id
- parameters
- turn id
- validity scope
- dependency snapshot/fingerprint
- player answer projection

Unproven Stage 6D.12 risks:

- durable answer reuse across process/reload boundaries
- stale answer invalidation after persisted combat reconstruction
- trace lookup by historical focus answer id
- recovery-state replay after partial persistence failures

## Stage 6D.12 Readiness

Stage 6D.12 can consume:

- deterministic Combat Focus question templates
- player-safe read-model projection
- answer validity fingerprints
- stale answer invalidation behavior
- end-turn collapse behavior
- GM/dev trace scaffolding
- visibility denylist enforcement

Stage 6D.12 should harden durable persistence, reload characterization, duplicate/replay behavior, and recovery boundaries for Focus answers without redesigning the Combat Focus template or projection contract.

## Tests

`backend/test/stage6d11-combat-focus.test.js` covers:

- required six categories and 33 guaranteed templates
- structured answer resolution for every template
- no mutation and no roll generation
- free-text direct matching
- parameter choices for ambiguous entities
- disambiguation for ambiguous questions
- unsupported question behavior
- player-safe answer projection
- bounded prioritized suggestions
- progressive collapsed/expanded groups
- valid answer reuse
- stale dependency invalidation
- end-turn answer collapse
- recovery-needed suggestion suppression
- GM/dev trace scaffolding
- player hidden-data denylist enforcement

