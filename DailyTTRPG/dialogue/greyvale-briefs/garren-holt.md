# Garren Holt Brief

## A. Purpose

Convert Garren's guarded path-knowledge dialogue into a high-complexity Focus/Commit scene where respect unlocks useful shrine-route knowledge and accusation can close the path down.

## B. Source Files

- `content/dialogue/greyvale/garren-path-knowledge.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## C. Current Legacy / New-Format Status

- Current production format: legacy node/option dialogue.
- Legacy slug: `garren-path-knowledge`.
- NPC template slug: `garren-holt`.
- Scene slug: `dunmere-village`.
- New Focus/Commit scene: `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json`.
- Expected paths: `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json`.
- Stage 6B.12.4 status: converted as fixture/test content; legacy source remains intact.

## D. NPC Role In Greyvale Arc

Garren is the old-path knowledge gate. He knows the shrine paths have grown busier and stranger, but he shares that only with someone who does not treat him as the obvious villain.

## E. Emotional Posture

- Cold.
- Wary.
- Practical.
- Used to suspicion.
- Respect-sensitive.
- More willing to be direct than warm.

## F. Voice And Tone Guidance

Garren should speak in trail logic and hard-earned warnings. He does not decorate fear. He should sound like someone who dislikes being needed by people who already mistrust him.

## G. What They Know

- The old paths are being used.
- The shrine area has more traffic than it should.
- People seem drawn there, not merely hiding there.
- He can identify a route or direction if he decides the player is worth helping.

## H. What They Misunderstand

He may assume the village will twist anything he says into blame. He may withhold useful information too long out of self-protection.

## I. What They Will Not Say Directly

- A final explanation for the shrine influence.
- A confession he does not owe.
- Hidden GM/dev route checks.
- Any unauthored direct route beyond existing transition structure.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_garren_observation`.
- Legacy title: `Garren's Observation`.
- Legacy flags: `garren_respected`, `garren_accused`, `clue_garren_observation`, `shrine_path_known`, `understanding_medium`.
- Legacy NPC state: hostile if accused without evidence.
- Legacy objective effects: complete `gather-local-insight`, activate `follow-the-leads`.
- Legacy reward: scene unlock `shrine-ruins`.
- Canonical knowledge IDs used by the conversion: `garren_knows_old_paths`, `old_path_still_used`, `tracks_converge_on_shrine`, `village_blames_hunter_and_road`.
- Existing transition dependency: `follow-the-tracks-to-the-shrine` requires `shrine_path_known`.
- Canonical mapping chosen for `clue_garren_observation`: `tracks_converge_on_shrine`, with the legacy clue key preserved in `metadata_json`.

## K. Suggested Conversation Surface

Open on Garren already half-braced against accusation. The scene should show villagers have made him tired of defending himself, but he still knows the paths better than anyone nearby.

## L. Suggested Passive Social Insights

- Accusation will shut him faster than silence.
- He is testing whether the player wants truth or a convenient suspect.
- He reacts to respect more than sympathy.

## M. Suggested Clarifying Questions

- "What did you actually see on the old paths?"
- "Why warn people away?"
- "What changed near the shrine?"
- "Who else uses those paths?"
- "Why do you think suspicion is dangerous?"

## N. Suggested Committed Social Moves

- Ask what he saw without accusation.
- Show respect for his caution.
- Press for the whole trail.
- Accuse him of hiding something.
- Offer to keep his name out of village gossip.

## O. Suggested Generic Fallback Behavior

Enable narrow fallback only if final implementation wants flexible respectful approaches:

- Allowed: ask plainly, show respect, offer discretion.
- Excluded: accuse, threaten, force confession, unlock shrine without authored success.
- Usage limit: one.
- May not grant `shrine_path_known` unless an authored result band explicitly allows it.

## P. Suggested Dialogue Exits / Transitions

- Free exit back to Dunmere.
- Transition or unlock intent toward old forest path / shrine route.
- Existing transition to shrine from old path: `follow-the-tracks-to-the-shrine`.
- Existing transition from Dunmere to old path: `follow-the-old-path`.
- Stage 6B.12.4 implementation exits to `old-forest-path` via the existing `follow-the-old-path` route intent.
- The shrine route is preserved as `shrine_path_known` plus `shrine-ruins` scene-unlock reward metadata; direct dialogue exit to `shrine-ruins` remains intentionally avoided so the old-path exploration step is not bypassed.

## Q. Suggested Relationship / Social State Fields

Persistent:

- `trust`
- `respect`
- `hostility`

Scene-local:

- `guardedness`
- `openness`
- `pressure`

## R. Suggested Relationship / Social State Writes

- Respectful directness: increase respect/openness, lower guardedness.
- Offer discretion: increase trust.
- Accusation: increase hostility/guardedness, may lock deeper route.
- Successful trail pressure: sets or preserves `shrine_path_known` only when authored.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve `Garren's Observation` clue intent.
- Preserve `shrine_path_known`.
- Preserve `understanding_medium`.
- Preserve scene unlock intent for `shrine-ruins` or transition path.
- Candidate canonical knowledge: `garren_knows_old_paths`, `old_path_still_used`, `tracks_converge_on_shrine`.

## T. Completed Record / Transcript / Archive Guidance

Completed summary should say Garren identified unusual movement near the shrine path after respectful questioning, or refused further help if accused. Transcript should preserve accusation/refusal because it matters for relationship state.

## U. Player-Facing Visibility Rules

- Do not show hidden route requirements directly.
- Do not expose raw respect/guardedness values.
- Do not confirm shrine source beyond authored knowledge.
- Player archive may mention old paths and shrine route only if surfaced.

## V. GM/Dev Debug Visibility Expectations

GM/dev should show failed requirement details, `garren_respected`, `garren_accused`, `shrine_path_known`, state writes, transition availability, and any route unlock outputs.

## W. Path Harness Expectations

Required:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`
- `transition_path`

## X. Implementation Notes For Later Codex Build

- Implemented Focus/Commit file name: `garren-path-knowledge-focus-commit.scene.json`.
- Implemented participant id: `npc:garren_holt`.
- Implemented NPC key: `garren-holt`.
- Implemented scene id: `greyvale_garren_path_knowledge_dialogue`.
- Implemented slug: `greyvale-garren-path-knowledge-dialogue`.
- Relationship-gated move metadata lives on `move_press_for_whole_trail` and reads `respect >= 1` plus `openness >= 1`; player-facing locked text stays narrative.
- Transition target is `old-forest-path`; shrine handoff remains route knowledge plus reward metadata.

## Y. Risks / Open Questions

- Production importer/registry wiring for Dialogue Focus/Commit scene JSON is still deferred.
- Runtime enforcement for authored relationship-gated metadata should be verified in later full path-harness work; player-safe lock wording and GM/dev-readable requirements are authored now.
- Direct dialogue exit to `shrine-ruins` is not used in this build. The live player route points to `old-forest-path`; `shrine_path_known` and `shrine-ruins` scene unlock metadata preserve the legacy shrine-route implication.
