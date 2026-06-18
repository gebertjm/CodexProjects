# Greyvale Dialogue Creative Briefs

These briefs are Stage 6B.12.1 creative direction for converting Greyvale dialogue into the Dialogue Focus/Commit system.

They are human-readable implementation briefs, not final scene JSON. Later Codex builds should convert these briefs into schema-valid `dialogue_focus_commit` scenes after preserving existing Greyvale facts, clues, objectives, unlocks, NPC tone, and consequences.

## How To Use These Briefs

- Use the Elin Focus/Commit fixture as the new-format exemplar.
- Use legacy node/option dialogue as canonical source material until converted.
- Generate final scene JSON only in later implementation stages.
- Preserve existing lore and clue structure.
- Mark uncertain canonical ids as TODOs rather than inventing replacements.
- Keep converted scenes player-safe and GM/dev-inspectable.

## What Is Allowed

- Expand existing dialogue direction.
- Clarify emotional posture and voice.
- Define Passive Social Insight ideas.
- Define Clarifying Question ideas.
- Define Committed Social Move ideas.
- Define conservative generic fallback behavior.
- Define relationship/social state fields and writes.
- Define refusal/failure behavior.
- Define player-safe summaries.
- Define path harness expectations.
- Define visibility boundaries.
- Define transition intent grounded in existing content.

## What Is Not Allowed

- Do not create final dialogue scene JSON in this brief package.
- Do not rewrite production legacy dialogue files.
- Do not invent major new Greyvale lore, villains, locations, final mystery answers, or unsupported plot branches.
- Do not broaden player-facing mechanics visibility.
- Do not expose raw relationship meters, hidden DCs, debug state, hidden requirements, or GM/dev notes to players.
- Do not remove or replace legacy content until a later production conversion decision is made.

## Source Files Referenced

- `docs/dialogue/GREYVALE_DIALOGUE_EXPANSION_PLAN.md`
- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json`
- `content/dialogue/greyvale/tomas-roadside-worries.json`
- `content/dialogue/greyvale/elin-fragments-of-memory.json`
- `content/dialogue/greyvale/mara-dunmere-pressure.json`
- `content/dialogue/greyvale/lysa-grief-and-suspicion.json`
- `content/dialogue/greyvale/garren-path-knowledge.json`
- `content/dialogue/greyvale/rusk-at-the-shrine.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/locations/greyvale/locations.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## Target NPCs And Conversion Order

1. Tomas Rell
2. Elin Harrow
3. Mara Vellin
4. Lysa Fen
5. Garren Holt
6. Rusk

This order matches the planned Stage 6B.12 implementation sequence:

- `6B.12.2` - Tomas + Elin Integration Conversion
- `6B.12.3` - Mara + Lysa Conversion
- `6B.12.4` - Garren Conversion
- `6B.12.5` - Rusk Conversion
- `6B.12.6` - Dialogue Regression, Visibility, and Path Harness Pass

## Shared Dialogue Design Principles

- Dialogue should reveal pressure, not become exposition dumps.
- NPCs should preserve their emotional posture.
- Each dialogue should offer at least one useful path and one refusal/failure path.
- Clarifying Questions should feel like free focus: immediate, optional, and not beat-spending.
- Committed Social Moves should spend the dialogue beat and meaningfully change state, knowledge, relationship, or direction.
- Failure should create tension, partial understanding, or closure; it should not dead-end the campaign.
- Misleading clues should be marked as misleading or suspected and should not be treated as confirmed truth.
- Player-facing summaries must use player-facing sources only.
- GM/dev state can be explicit; player-facing relationship changes should remain narrative or perceived.
- No raw relationship meters in player-facing output.
- No hidden DCs in player-facing output unless a scene explicitly authors that policy.
- No final mystery reveal should occur in these dialogues.

## Shared Relationship / Social State Guidance

Recommended persistent NPC fields:

- `trust`
- `respect`
- `hostility`

Recommended scene-local posture fields:

- `openness`
- `pressure`
- `fear`
- `stability`
- `guardedness`
- `urgency`
- `grief`
- `suspicion`
- `control`
- `instability`

Do not force every NPC to use every field. Each scene should choose the smallest relevant subset.

Player-facing relationship visibility should use `player_perceived` summaries and narrative recap language. Exact state values and state-write audits are GM/dev-only.

## Shared Path Harness Expectations

Common paths for later expected-path fixtures:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path` when fallback is enabled
- `minimal_exit_path`
- `max_clarifying_question_path` where enough CQs exist
- `relationship_state_path` where relationship writes exist
- `transition_path` where exits/unlocks are authored
- `combat_transition_path` for Rusk if combat transition support is verified

Path tests should confirm player-facing snapshots exclude debug fields and GM/dev debug snapshots include check/state/routing details where authorized.

## Shared Output And Continuity Rules

- Knowledge grants must reference canonical knowledge/clue IDs where available.
- Legacy clue IDs should be preserved as source truth until mapped to canonical knowledge IDs.
- Objective updates must preserve the existing `shadows_grey_road` flow.
- Scene unlocks must reference canonical scene/location IDs.
- Duplicate knowledge should be idempotent and not break state.
- Clues should not reveal the final truth prematurely.
- Summaries and completed records should include only player-facing sources.
- Archive/search topics should remain player-safe.
- Annotation/correction chains are optional for non-Elin scenes unless needed for regression coverage.

## Brief Files

- [tomas-rell.md](tomas-rell.md)
- [elin-harrow.md](elin-harrow.md)
- [mara-vellin.md](mara-vellin.md)
- [lysa-fen.md](lysa-fen.md)
- [garren-holt.md](garren-holt.md)
- [rusk.md](rusk.md)

## Stage 6B.12 Completion Status

The briefs have now been converted into Focus/Commit regression fixtures for Tomas, Elin, Mara, Lysa, Garren, and Rusk under `content/dialogue_focus_commit/greyvale/`. Stage 6B.12.6 adds final backend regression coverage in `backend/test/dialogue-greyvale-stage6b12-regression.test.js` plus the DB-backed runtime/path-harness coverage in `backend/test/dialogue-greyvale-fixture-regression.test.js`.

The brief package remains useful as design intent and source-truth documentation. Later stabilization work should preserve the constraints here unless a human-authored revision explicitly changes Greyvale continuity.
