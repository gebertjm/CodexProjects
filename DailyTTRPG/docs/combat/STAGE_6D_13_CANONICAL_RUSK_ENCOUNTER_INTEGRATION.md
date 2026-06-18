# Stage 6D.13 - Canonical Rusk Encounter Integration

Status: implemented as an engine-level canonical encounter integration  
Date: 2026-06-17  
Primary predecessors:

- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)
- [Stage 6D.8 Reactions And Interrupt Orchestration](STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)
- [Stage 6D.9 Automatic Turns And Deterministic Tactical Profiles](STAGE_6D_9_AUTOMATIC_TURNS_AND_DETERMINISTIC_TACTICAL_PROFILES.md)
- [Stage 6D.10 Multi-Target, Area, Visibility, And Faction Dynamics](STAGE_6D_10_MULTI_TARGET_AREA_VISIBILITY_FACTION_DYNAMICS.md)
- [Stage 6D.11 Combat Focus](STAGE_6D_11_COMBAT_FOCUS.md)
- [Stage 6D.12 Persistence, Idempotency, Replay, And Recovery](STAGE_6D_12_PERSISTENCE_IDEMPOTENCY_REPLAY_RECOVERY.md)

## Executive Result

Stage 6D.13 adds the canonical Greyvale Rusk combat integration at:

```text
backend/src/engine/combat/canonicalRuskEncounter.js
```

The focused tests live at:

```text
backend/test/stage6d13-canonical-rusk-encounter.test.js
```

The Stage 6D regression command includes this suite:

```text
npm run test:stage:6d
```

This stage proves the existing 6D combat runtime can launch and resolve the canonical solo Rusk confrontation through authored Greyvale content and Stage 6D systems. It does not activate a live player combat route, add Flutter combat UI, apply Shrine Ruins aftermath, grant rewards, write objectives/knowledge/history/latest development, or continue into Stage 6D.14.

## Canonical Content Evidence

The integration is anchored to active Greyvale content:

- Encounter: `content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json`
- Encounter id: `shrine-rusk-confrontation`
- Scene: `shrine-ruins`
- Solo variant: one `rusk-bandit`, not scalable
- Dialogue: `content/dialogue/greyvale/rusk-at-the-shrine.json`
- Dialogue terminal node: `rusk-fight`
- Hook boundary: `content/campaigns/shadows_grey_road/hooks/grey-road-shrine-combat-resolution.json`

Stage 6D.13 uses the active encounter, dialogue, and hook identities but stops at a combat completion handoff. The hook remains a Stage 6D.14 aftermath boundary.

## Legacy Findings

Stage 6D.2 verified the existing Rusk encounter preview and Greyvale content references. This stage reuses that evidence and normalizes the minimal combat values needed for the canonical solo fight:

- Rusk stat block identity: `rusk-bandit`
- Rusk max HP: 18
- Rusk AC: 14
- Ruleset: D&D 5e 2014
- Variant policy: solo-safe, no extra lackeys

The existing legacy combat routes remain internal and are not exposed to the player app.

## Encounter Architecture

`canonicalRuskEncounter.js` composes the Stage 6D systems rather than replacing them:

- 6D.7 player-turn runtime opens the player turn and resolves player actions/movement.
- 6D.8 reaction runtime handles opportunity-attack trigger and reaction windows.
- 6D.9 automatic-turn runtime drives Rusk's deterministic turn.
- 6D.10 faction/visibility assumptions keep player and Rusk hostile and visible.
- 6D.11 Combat Focus answers tactical questions during the fight.
- 6D.12 durable operations provide idempotent launch and completion handoff.

The module exports helpers for canonical definition, launch/resume, player turn, player strike, player retreat, Rusk automatic step, surrender evaluation, completion handoff, Combat Focus, player projection, and GM/dev trace.

## Start-State Implementation

The canonical start state is intentionally conservative:

- Player begins at `shrine-edge`.
- Rusk begins at `shrine-center`.
- Initial proximity is `nearby`.
- Both participants are visible.
- No hidden participants, surprise, or default cover are introduced.
- Retreat to `grey-road-retreat` is visible and authored as a retreat route.
- Initiative is deterministic in tests and ruleset-explicit in state.

If more precise authored placement appears later, it can replace these conservative defaults without changing the adapter boundary.

## Rusk Participant And Actions

The canonical Rusk participant is:

- participant id: `rusk-bandit`
- faction: `enemy`
- control mode: deterministic enemy
- stat block id: `rusk-bandit`
- AC 14, max HP 18
- action: `rusk-rusty-blade`
- reaction: `rusk-opportunity-strike`

The player test participant receives `greyvale-player-strike` and `greyvale-player-opportunity-strike` so the acceptance paths can prove action, reaction, defeat, and nonlethal handoffs without adding Greyvale lore.

## Rusk Tactical Behavior

Rusk uses a direct aggressive melee tactical profile:

- If surrender is both narratively permitted and combat-qualified, select surrender intent.
- If engaged and the action is legal, attack with `rusk-rusty-blade`.
- If not engaged and the player is visible, move toward the player.
- If no safe action is legal, fall back through Dodge, Wait, then End Turn.

The tactical profile is declarative and GM/dev inspectable. It does not use AI narration or dynamic prose.

## Surrender Behavior

Rusk surrender requires both:

- narrative permission flag `rusk_surrender_permitted`
- low HP threshold at or below 35%

Surrender is not available from combat state alone and is not available from narrative permission alone. If Rusk is already defeated, defeat outcomes take priority over surrender.

## Player-Defeat Behavior

If the player reaches zero HP in this canonical encounter, Stage 6D.13 creates a `player_defeat_fail_forward` handoff. It does not open death-save gameplay, apply final aftermath, or mutate Greyvale progression. Stage 6D.14 owns the authored Shrine Ruins aftermath variant.

## Retreat Behavior

The player may retreat through the visible Grey Road route. Retreat movement can draw an opportunity-attack trigger through the reaction runtime. Once the player reaches `grey-road-retreat`, the encounter creates a `player_retreat` handoff and stops before aftermath mutation.

## Canonical Outcomes

The completion handoff supports:

- `rusk_defeat_lethal`
- `rusk_defeat_nonlethal`
- `rusk_surrender`
- `player_retreat`
- `player_defeat_fail_forward`
- additional contract-level outcomes from 6D.1 remain defined for later authored aftermath variants

Each completed path produces:

- completion handoff status
- outcome id
- shared aftermath state id `shrine_ruins_aftermath`
- hook identity `grey-road-shrine-combat-resolution`
- player-safe summary
- GM/dev trace

No objective, knowledge, history, Latest Development, XP, advancement, reward, or aftermath mutation is applied in this stage.

## Persistence And Recovery

Combat creation and completion handoff use 6D.12 durable operations:

- launch uses participant-entry operation identity
- completion uses encounter-completion-handoff operation identity
- duplicate launch resumes the same canonical combat
- duplicate completion returns the existing handoff
- player projections strip durable operation internals

No database migration was added. The integration remains serializable through the existing combat aggregate and 6D.12 service-state ledger.

## Combat Focus

Combat Focus works during the Rusk fight through the 6D.11 structured question system. The focused test verifies `enemy.can_reach_me` can be answered against the canonical state and that the player answer does not expose AC, raw state, GM/dev trace, or persistence internals.

## Acceptance Paths

The focused Stage 6D.13 suite covers:

- canonical content definition and launch validation
- idempotent Rusk combat creation/resume
- conservative solo start state and player projection safety
- player lethal Rusk defeat
- player nonlethal Rusk defeat
- Rusk movement into engagement and attack
- Rusk surrender with narrative and combat gates
- player retreat with opportunity-attack reaction handoff
- player zero-HP fail-forward
- idempotent completion handoff and reload safety
- Combat Focus during the encounter
- player opportunity attack prompt when Rusk movement provokes

Assertions prefer semantic ids, statuses, outcome ids, handoff markers, and visibility safety over brittle prose.

## Stage 6D.14 Readiness

Stage 6D.14 now consumes:

- `canonical_rusk_handoff`
- `outcome_id`
- `shared_aftermath_state_id`
- `post_combat_hook_identity`
- combat participant state
- player-safe completion summary
- GM/dev trace

See [Stage 6D.14 Encounter Resolution, Aftermath, And Rewards](STAGE_6D_14_ENCOUNTER_RESOLUTION_AFTERMATH_REWARDS.md) for the implemented Shrine Ruins aftermath variants, objective/knowledge/history/latest-development outputs, rewards/XP/pending-advancement detection, archive/search records, review-only next state, and player-safe post-combat review.

## Known Limitations

- Rusk stat/action values are normalized from Stage 6D.2 verified encounter evidence and minimal 5e-style action definitions, not from a fully authored active stat-block content file.
- The module is engine-level and not wired to a live route.
- Flutter combat UI remains unimplemented.
- Death saves are intentionally bypassed for the canonical fail-forward path.
- Broad live route/UI integration for encounter aftermath remains deferred beyond Stage 6D.14.
