# Mara Vellin Brief

## A. Purpose

Convert Mara's village-authority dialogue into a medium-complexity Focus/Commit scene about pressure, proof, and the politically survivable bandit explanation.

## B. Source Files

- `content/dialogue/greyvale/mara-dunmere-pressure.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`

## C. Current Legacy / New-Format Status

- Current production format: legacy node/option dialogue.
- Legacy slug: `mara-dunmere-pressure`.
- NPC template slug: `mara-vellin`.
- Scene slug: `dunmere-village`.
- Stage 6B.12.3 Focus/Commit scene: `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json`.
- Stage 6B.12.3 expected paths: `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json`.

## D. NPC Role In Greyvale Arc

Mara represents practical authority and public pressure. She is not foolish; she is constrained by responsibility and needs action the village can survive.

## E. Emotional Posture

- Controlled.
- Tired.
- Impatient with speculation.
- Protective of village stability.
- Unwilling to frighten the village without proof.

## F. Voice And Tone Guidance

Mara should sound clipped, practical, and morally burdened. She should cut off panic but listen to evidence. Her bandit explanation should feel survivable, not stupid.

## G. What They Know

- Dunmere needs a usable answer.
- People are afraid and pressure is building.
- Bandits are a clear public explanation even if incomplete.
- Proof matters more to her than dread.

## H. What They Misunderstand

She may overvalue explanations that are actionable. She can imagine deeper causes but resists moving on them without proof.

## I. What They Will Not Say Directly

- She will not admit that a simple answer is politically convenient unless trust/respect is earned.
- She will not confirm the final mystery.
- She will not expose hidden village state or GM/dev route checks.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_mara_assumption`.
- Legacy title: `Mara's Assumption`.
- Legacy clue tier: misleading.
- Legacy flags: `clue_mara_assumption`, `mara_demanded_proof`.
- Canonical mapping used in Stage 6B.12.3: `clue_mara_assumption` -> `dunmere_wants_simple_answer`.

## K. Suggested Conversation Surface

Open on Mara managing fear as a public resource. She is not merely angry; she is triaging panic, gossip, and practical need. The surface should show she wants help but rejects ungrounded dread.

## L. Suggested Passive Social Insights

- Mara is not dismissing deeper possibilities; she is demanding proof she can act on.
- Her bandit explanation is a shield against panic as much as a theory.
- She responds better to practical next steps than abstract warnings.

## M. Suggested Clarifying Questions

- "Why do you favor the bandit explanation?"
- "What proof would change your mind?"
- "Who is pressuring you?"
- "What can Dunmere not afford right now?"
- "What are you leaving unsaid?"

## N. Suggested Committed Social Moves

- Report the broken caravan clearly.
- Suggest the pattern is deeper than banditry.
- Present gathered local insight.
- Challenge her certainty.
- Offer a practical next step the village can act on.

## O. Suggested Generic Fallback Behavior

Enable a narrow fallback only if the final scene needs flexible player phrasing:

- Allowed: report, reassure, ask for proof standard.
- Excluded: force village action, reveal unauthored culprit, skip evidence.
- Usage limit: one.
- No major clue or transition unless authored result bands explicitly allow it.

## P. Suggested Dialogue Exits / Transitions

- Free exit back to Dunmere scene.
- Optional transition intent back to investigation, not a new location.
- No direct shrine transition from Mara unless the player already has separate route evidence.

## Q. Suggested Relationship / Social State Fields

Persistent:

- `trust`
- `respect`
- `hostility`

Scene-local:

- `pressure`
- `control`
- `urgency`

## R. Suggested Relationship / Social State Writes

- Practical evidence: increase respect/control.
- Useful next step: increase trust.
- Speculation without evidence: increase pressure, maybe reduce respect.
- Direct challenge can succeed if evidence-backed; otherwise it hardens her proof demand.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve `Mara's Assumption` as misleading/social-pressure knowledge.
- Canonical knowledge: `dunmere_wants_simple_answer`.
- Stage 6B.12.3 preserves `gather-local-insight` progress and activates `follow-the-leads` only through authored committed-move results.

## T. Completed Record / Transcript / Archive Guidance

Completed summary should say Mara pressed for actionable proof and leaned toward bandits because Dunmere needs a survivable answer. It should mark the assumption as incomplete or misleading, not confirmed.

## U. Player-Facing Visibility Rules

- Do not present Mara's assumption as truth.
- Hide raw pressure/control values.
- Hide hidden requirements for changing her stance.
- Search/archive tags may include Mara, Dunmere, proof, bandits, public pressure.

## V. GM/Dev Debug Visibility Expectations

GM/dev should see evidence requirements, failed requirements, misleading clue classification, relationship writes, pressure/control changes, and any objective updates.

## W. Path Harness Expectations

Required:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`

## X. Implementation Notes For Later Codex Build

- Implemented Focus/Commit file name: `mara-dunmere-pressure-focus-commit.scene.json`.
- Implemented participant id: `npc:mara_vellin`.
- Implemented NPC key: `mara-vellin`.
- Implemented scene id: `greyvale_mara_dunmere_pressure_dialogue`.
- Implemented slug: `greyvale-mara-dunmere-pressure-dialogue`.
- Keep complexity medium; do not add a full council/politics subplot.
- Treat "bandits" as a player-safe assumption category, not a confirmed solution.

## Y. Risks / Open Questions

- Production import/manifest wiring for Dialogue Focus/Commit scenes remains deferred.
- The legacy `clue_mara_assumption` key remains source-material metadata inside new knowledge grants; player-facing grants use `dunmere_wants_simple_answer`.
- Mara alters objectives only through authored committed-move results, not passive/clarifying-only pressure.
