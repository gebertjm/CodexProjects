# Tomas Rell Brief

## A. Purpose

Convert Tomas Rell's legacy inn dialogue into a medium-complexity Dialogue Focus/Commit scene that establishes the Grey Road attack pattern and can point the player toward Elin without overexplaining the mystery.

## B. Source Files

- `content/dialogue/greyvale/tomas-roadside-worries.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## C. Current Legacy / New-Format Status

- Current production format: legacy node/option dialogue.
- Legacy slug: `tomas-roadside-worries`.
- NPC template slug: `tomas-rell`.
- Scene slug: `grey-road-inn`.
- New Focus/Commit scene authored in Stage 6B.12.2: `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json`.
- Expected paths authored in Stage 6B.12.2: `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json`.

## D. NPC Role In Greyvale Arc

Tomas is the early road-pattern clue-giver and inn/common-room contact. He makes the trouble feel social and local before the mystery becomes supernatural or shrine-focused.

## E. Emotional Posture

- Cautious.
- Helpful if treated respectfully.
- Afraid of overstating what he knows.
- Road-wise enough to compare current trouble against ordinary banditry.

## F. Voice And Tone Guidance

Tomas should sound practical, weary, and careful with rumor. He should speak in grounded comparisons: what bandits usually do, what travelers usually say, what feels wrong now. He should not sound like an oracle.

## G. What They Know

- The road trouble is not behaving like ordinary banditry.
- Travelers are fewer and more shaken.
- A survivor at the inn may remember more if treated gently.
- The Grey Road has a "pattern" that Tomas has been watching.

## H. What They Misunderstand

He cannot identify the true source. He may still use bandit language because it is the nearest ordinary frame.

## I. What They Will Not Say Directly

- The final nature of the Grey Road threat.
- The shrine or hollow truth unless the player already has separate evidence and the content explicitly allows it.
- Any hidden GM/dev-only state or certainty.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_pattern_of_attacks`.
- Legacy title: `Pattern of Attacks`.
- Legacy summary: attacks are inconsistent in a way Tomas does not believe ordinary bandits should be.
- Legacy flags: `clue_pattern_of_attacks`, `heard_tomas_account`, `told_tomas_about_caravan`, `elin_referred_by_tomas`.
- Objective effect: `shadows_grey_road:gather-local-insight:active:1`.
- Implemented canonical mapping: `clue_pattern_of_attacks` maps to `innkeeper_tracks_road_patterns`.
- Implemented survivor direction knowledge: `woman_near_hearth_survived_road_attack` and `knows_elin_name`.

## K. Suggested Conversation Surface

Use the inn common-room as social pressure: Tomas polishing a cup too long, listening to road talk, wanting to help but afraid of turning fear into a worse rumor. The surface should make clear he is not hiding a confession; he is measuring what he can safely say.

## L. Suggested Passive Social Insights

- Tomas is choosing his words because he knows rumor can panic Dunmere.
- He relaxes when the player asks for patterns rather than certainty.
- He glances toward Elin before naming her, suggesting the survivor lead before he says it aloud.

## M. Suggested Clarifying Questions

- "What makes this unlike ordinary bandits?"
- "Who survived the attack?"
- "What has changed in road traffic?"
- "What do you mean by the road's temper?"
- "Have travelers mentioned the old shrine?" Use only if tied to existing knowledge such as `travelers_mention_old_shrine`, and do not overconfirm.

## N. Suggested Committed Social Moves

- Reassure Tomas that partial information helps.
- Press him for the specific survivor.
- Compare the broken caravan evidence against his road pattern.
- Challenge the easy bandit explanation carefully.
- Dismiss his fear, causing him to withdraw.

## O. Suggested Generic Fallback Behavior

Enable only a narrow fallback if useful:

- Allowed: listen, reassure, ask for ordinary road context.
- Excluded: force confession, reveal hidden truth, unauthored shrine transition.
- Usage limit: one.
- May not grant a major clue or transition.
- Failed fallback should consume the fallback slot by default.

## P. Suggested Dialogue Exits / Transitions

- Free exit back to the Grey Road Inn common room.
- Implemented Stage 6B.12.2 transition intent toward Elin as exploration target `elin-memory-fragments`.
- Direct dialogue-to-dialogue routing was intentionally not used in this build.
- Preserve exploration continuity; do not teleport beyond the inn.

## Q. Suggested Relationship / Social State Fields

Persistent:

- `trust`
- `respect`
- `hostility`

Scene-local:

- `openness`
- `guardedness`
- `fear`

## R. Suggested Relationship / Social State Writes

- Respectful listening: small `trust` or `openness` increase.
- Careful challenge with evidence: small `respect` increase.
- Dismissal or panic-mongering: `guardedness` or `hostility` increase.
- Elin referral should not require raw relationship success if the player earns the road-pattern clue through normal means.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve `Pattern of Attacks` as player-facing clue intent.
- Preserve Elin referral.
- Preserve `gather-local-insight` progress.
- Implemented canonical knowledge: `innkeeper_tracks_road_patterns`, `woman_near_hearth_survived_road_attack`, and `knows_elin_name`.
- Implemented objective metadata: `shadows_grey_road:gather-local-insight:active:1`.
- No scene unlock beyond Elin/common-room routing was added.

## T. Completed Record / Transcript / Archive Guidance

Summary should say Tomas identified a road-attack pattern unlike ordinary banditry and pointed toward Elin if that path occurred. Transcript should preserve whether the player compared caravan evidence, asked generally, or dismissed him.

## U. Player-Facing Visibility Rules

- Hide exact DCs by default.
- Do not expose raw fear/guardedness values.
- Do not present Tomas's comparison as final truth.
- Player search/archive may include "road pattern", "ordinary bandits", "Tomas", and "survivor" only after learned.

## V. GM/Dev Debug Visibility Expectations

GM/dev view should show availability, clue grant source, objective update, Elin referral state write, fallback usage, and any check/result band selected.

## W. Path Harness Expectations

Required:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `transition_path`

`transition_path` currently exercises authored exit/finalization through the existing path harness mode. Direct Elin routing is represented by `exit_follow_elin_lead`, targeting exploration scene `elin-memory-fragments`.

## X. Implementation Notes For Later Codex Build

- Suggested Focus/Commit file name: `tomas-roadside-worries-focus-commit.scene.json`.
- Suggested participant id: `npc:tomas_rell`.
- Suggested NPC key: `tomas-rell`.
- Convert legacy options into a mix of CQs and committed moves rather than recreating the node graph.
- Stage 6B.12.2 uses `elin-memory-fragments` rather than direct dialogue-to-dialogue transition.

## Y. Risks / Open Questions

- TODO verify production import path for Focus/Commit dialogue before replacing legacy dialogue.
- TODO decide whether `exit_follow_elin_lead` should remain an exploration target or become a direct dialogue target after production routing is designed.
