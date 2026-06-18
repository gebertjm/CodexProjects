# Elin Harrow Brief

## A. Purpose

Preserve Elin as the Dialogue Focus/Commit exemplar while reconciling the legacy Elin memory scene with the newer Focus/Commit fixture. Later work should patch or production-register the existing new-format scene, not rewrite it wholesale.

## B. Source Files

- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json`
- `content/dialogue/greyvale/elin-fragments-of-memory.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## C. Current Legacy / New-Format Status

- Current new-format fixture: `greyvale_elin_memory_dialogue`, slug `greyvale-elin-memory-dialogue`.
- Current legacy production dialogue: `elin-fragments-of-memory`.
- NPC template slug: `elin-harrow`.
- Legacy scene slug: `elin-memory-fragments`.
- Focus/Commit fixture is test-loaded, not yet production-imported through the Greyvale manifest.
- Stage 6B.12.2 confirmed this file remains unchanged as the canonical new-format exemplar.

## D. NPC Role In Greyvale Arc

Elin is the survivor memory exemplar and emotional core of the early Grey Road mystery. She provides fragments rather than exposition.

## E. Emotional Posture

- Shaken.
- Exhausted.
- Responsive to gentleness.
- Prone to closing down under pressure.
- Trying to hold traumatic sensory fragments still enough to speak them.

## F. Voice And Tone Guidance

Elin should speak in fragments, sensory impressions, and corrections to herself. She should not narrate a clean timeline. Her clarity should come in small, costly pieces.

## G. What They Know

- The attackers paused together as if listening.
- The broken wheel, first sound, torn green sash, shrine bell, and hollow path are meaningful fragments in the Focus/Commit scene.
- She fears more than ordinary bandits.

## H. What They Misunderstand

She may conflate memory, fear, and later interpretation. She does not fully understand the source.

## I. What They Will Not Say Directly

- The full final mystery.
- The exact nature of the hollow or Whispering Presence as confirmed truth.
- Hidden GM/dev state.
- Clean cause-and-effect beyond her own memory fragments.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_survivor_memory_fragment`.
- Legacy flags: `clue_survivor_memory_fragment`, `elin_treated_gently`, `elin_shut_down`.
- Legacy objectives: complete `gather-local-insight`, activate `follow-the-leads`.
- New-format fixture elements: torn green sash, roadward knot, broken wheel, first sound, shrine bell memory, hollow path lead.
- Canonical candidate knowledge IDs: `survivor_fears_more_than_bandits`, `woman_near_hearth_survived_road_attack`, `knows_elin_name`, `shrine_depth_unlocked` only if actually discovered.
- TODO verify canonical mapping for `clue_survivor_memory_fragment`.

## K. Suggested Conversation Surface

Preserve the existing Focus/Commit surface: hearth, torn sash, held breath, sensory fragments, and the feeling that questions can either steady or scatter her memory.

## L. Suggested Passive Social Insights

Keep `insight_elin_shrine_bell_avoidance` as the model. If patching, preserve its restrained style: a small player-safe observation that she avoids a specific sensory memory, not a full reveal.

## M. Suggested Clarifying Questions

Preserve existing CQ shape:

- What sound came first?
- The torn green sash.
- Read what frightens her.
- The roadward knot.

If legacy reconciliation is needed, add or fold in "the shared pause / same whisper" as a result detail, not a new major branch unless the creative brief later demands it.

## N. Suggested Committed Social Moves

Preserve existing moves:

- Reassure Elin she can stop.
- Press gently about the shrine bell.
- Spend time on the first sound.
- Accuse her of holding something back.
- Turn the memory toward the road.

Pressure and accusation should remain risky and able to increase fear/pressure or reduce trust.

## O. Suggested Generic Fallback Behavior

Preserve existing conservative fallback:

- Enabled.
- Usage limit one.
- Allowed: ask, listen, reassure.
- Excluded: force confession, unauthored hidden truth, unauthored transition.
- No major clue grant, relationship write, or transition.

## P. Suggested Dialogue Exits / Transitions

Preserve:

- Let Elin rest.
- Return to the common room.
- Follow the hollow path lead if unlocked and supported.

Also verify compatibility with existing transition slugs `return-to-common-room` and any route toward `old-forest-path` or `shrine-ruins`.

## Q. Suggested Relationship / Social State Fields

Preserve existing persistent fields:

- `trust`
- `respect`
- `hostility`

Preserve existing scene-local fields:

- `openness`
- `fear`
- `pressure`
- `stability`

## R. Suggested Relationship / Social State Writes

- Gentle reassurance: increase trust/openness/stability.
- Patient memory work: increase openness, reduce fear if successful.
- Shrine pressure: success may increase trust or knowledge; failure may increase pressure.
- Accusation: increase hostility/pressure, decrease trust.
- Letting her rest should be player-safe and not punish the player.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve survivor memory fragment intent.
- Preserve broken wheel / shrine bell / hollow path fixture intent.
- Preserve `gather-local-insight` and `follow-the-leads` progression where the scene is production-integrated.
- Do not duplicate knowledge grants if exploration has already discovered the same fact.

## T. Completed Record / Transcript / Archive Guidance

Keep authored deterministic summary behavior. Completed record should indicate which memory fragments surfaced without exposing hidden-only notes. Transcript should distinguish player gentleness, pressure, and accusation.

## U. Player-Facing Visibility Rules

- Hide exact DCs by default.
- Do not show raw fear, pressure, openness, or stability values.
- Do not expose GM/dev hidden source links.
- Archive/search should include only surfaced memory fragments.
- Corrections/annotations should surface only when approved and player-facing.

## V. GM/Dev Debug Visibility Expectations

GM/dev workspace should show relationship state reads/writes, CQ unlocks, overlap warnings, fallback exhaustion, transcript/completed-record links, lifecycle chains, and path harness coverage.

## W. Path Harness Expectations

Use existing expected paths as baseline:

- `happy_path`
- `failure_path`
- `fallback_path`
- `minimal_interaction_path`
- `max_clarifying_question_path`
- `relationship_state_edge_case`
- `exit_transition_path`

## X. Implementation Notes For Later Codex Build

- Do not rewrite wholesale.
- First verify schema/runtime issues, production registration, and legacy reconciliation.
- Keep Elin as the style model for high-complexity Greyvale dialogue.
- Suggested production decision: either register the Focus/Commit scene and retire legacy reachability, or explicitly keep both in separate contexts.
- Stage 6B.12.2 did not patch Elin; Tomas points toward existing exploration scene `elin-memory-fragments` rather than direct dialogue-to-dialogue routing.

## Y. Risks / Open Questions

- TODO decide whether Focus/Commit Elin replaces `elin-fragments-of-memory` completely.
- TODO verify canonical mapping for legacy survivor memory clue.
- TODO verify exact transition target for hollow path lead.
- TODO decide how much lifecycle fixture data should remain in production content versus tests.
