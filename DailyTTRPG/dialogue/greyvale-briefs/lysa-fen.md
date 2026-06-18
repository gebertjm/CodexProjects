# Lysa Fen Brief

## A. Purpose

Convert Lysa's grief-and-suspicion dialogue into a medium-complexity Focus/Commit scene that preserves emotional pressure and misleading suspicion without turning grief into confirmed proof.

## B. Source Files

- `content/dialogue/greyvale/lysa-grief-and-suspicion.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## C. Current Legacy / New-Format Status

- Current production format: legacy node/option dialogue.
- Legacy slug: `lysa-grief-and-suspicion`.
- NPC template slug: `lysa-fen`.
- Scene slug: `dunmere-village`.
- Stage 6B.12.3 Focus/Commit scene: `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json`.
- Stage 6B.12.3 expected paths: `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json`.

## D. NPC Role In Greyvale Arc

Lysa is the emotional counterweight to Mara's practicality. She makes missing-person fear personal and shows how grief can point toward real concealment while also distorting certainty.

## E. Emotional Posture

- Raw.
- Accusatory.
- Desperate to be believed.
- Can soften when grief is taken seriously.
- Suspicious of simple answers.

## F. Voice And Tone Guidance

Lysa should sound like someone whose patience was spent before the scene began. She should be sharp but not cartoonishly irrational. Her grief gives her insight and bias at the same time.

## G. What They Know

- Her brother is missing.
- Dunmere is simplifying fear into convenient explanations.
- Some details do not fit the easy bandit story.

## H. What They Misunderstand

She may treat absence, silence, and fear as proof of concealment before evidence supports it.

## I. What They Will Not Say Directly

- She cannot name the final culprit or truth.
- She cannot confirm who is hiding what without authored evidence.
- She should not reveal hidden GM/dev-only suspicion state.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_lysa_suspicion`.
- Legacy title: `Lysa's Suspicion`.
- Legacy clue tier: misleading.
- Legacy flags: `lysa_trusts_you`, `clue_lysa_suspicion`, `heard_lysa_suspicion`.
- Legacy NPC state: friendly if the player takes her seriously.
- Legacy objectives: complete `gather-local-insight`, activate `follow-the-leads`.
- Canonical mapping used in Stage 6B.12.3: `clue_lysa_suspicion` -> `village_blames_hunter_and_road`.
- Supporting social-pressure context may use `dunmere_wants_simple_answer`.

## K. Suggested Conversation Surface

Open on Lysa watching every answer as if it might finally become honest. The surface should make her grief active in the room, not just backstory.

## L. Suggested Passive Social Insights

- Her certainty is grief-shaped but not empty.
- She softens when the player treats the missing as people, not leads.
- She is most dangerous to the truth when she feels dismissed.

## M. Suggested Clarifying Questions

- "Who is missing?"
- "Why do you think people are hiding the truth?"
- "Who do you suspect?"
- "What detail does not fit?"
- "What has fear changed in Dunmere?"

## N. Suggested Committed Social Moves

- Take her fear seriously.
- Separate grief from evidence gently.
- Ask for the detail she cannot let go.
- Challenge her accusation carefully.
- Promise to keep looking without validating every suspicion.

## O. Suggested Generic Fallback Behavior

Enable conservative fallback if useful:

- Allowed: listen, comfort, ask for a detail.
- Excluded: accuse a named NPC without authored support, confirm hidden culprit, promise impossible rescue.
- Usage limit: one.
- May grant only minor context unless authored result bands grant the suspicion clue.

## P. Suggested Dialogue Exits / Transitions

- Free exit back to Dunmere.
- Optional soft direction toward Garren or village fear only if supported by learned context.
- No direct shrine transition from Lysa unless final implementation authors a specific evidence chain.

## Q. Suggested Relationship / Social State Fields

Persistent:

- `trust`
- `respect`
- `hostility`

Scene-local:

- `grief`
- `suspicion`
- `openness`
- `pressure`

## R. Suggested Relationship / Social State Writes

- Taking grief seriously: increase trust/openness.
- Asking for specifics: increase respect if gentle.
- Challenging accusation harshly: increase hostility/suspicion.
- Validating every suspicion without care: may increase trust but worsen misleading certainty.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve `Lysa's Suspicion` as misleading/suspected knowledge.
- Preserve missing-person pressure.
- Canonical knowledge: `village_blames_hunter_and_road`, with `dunmere_wants_simple_answer` as supporting context.
- Stage 6B.12.3 preserves objective progression through authored committed-move results only.

## T. Completed Record / Transcript / Archive Guidance

Summary should distinguish suspicion from confirmation: Lysa believes fear is causing people to simplify or hide what happened. Archive/search should not turn her grief into proven truth.

## U. Player-Facing Visibility Rules

- Mark suspicion as suspicion.
- Hide raw grief/suspicion values.
- Hide failed hidden requirements.
- Do not expose any hidden NPC identity or schedule data through her claims.

## V. GM/Dev Debug Visibility Expectations

GM/dev should see misleading clue classification, trust/suspicion writes, whether the player validated or challenged her, and any objective/knowledge outputs.

## W. Path Harness Expectations

Required:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`

## X. Implementation Notes For Later Codex Build

- Implemented Focus/Commit file name: `lysa-grief-and-suspicion-focus-commit.scene.json`.
- Implemented participant id: `npc:lysa_fen`.
- Implemented NPC key: `lysa-fen`.
- Implemented scene id: `greyvale_lysa_grief_suspicion_dialogue`.
- Implemented slug: `greyvale-lysa-grief-suspicion-dialogue`.
- Keep the scene emotionally sharp but mechanically modest.
- Avoid inventing a named culprit or new missing-person subplot details beyond existing content.

## Y. Risks / Open Questions

- Production import/manifest wiring for Dialogue Focus/Commit scenes remains deferred.
- The legacy `clue_lysa_suspicion` key remains source-material metadata inside new knowledge grants; player-facing grants use `village_blames_hunter_and_road`.
- Lysa does not point directly to Garren in Stage 6B.12.3; she reinforces Dunmere's suspicion pressure without creating a hard gate or new scene unlock.
