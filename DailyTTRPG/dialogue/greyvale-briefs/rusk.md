# Rusk Brief

## A. Purpose

Convert Rusk's shrine confrontation into a high-complexity Focus/Commit scene that can reveal shrine instability, support refusal/escalation, and transition toward combat or deeper shrine consequences only where existing systems support it.

## B. Source Files

- `content/dialogue/greyvale/rusk-at-the-shrine.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/quests/shadows-grey-road.json`
- `content/campaigns/shadows_grey_road/encounters/grey-road-encounters.json`

## C. Current Legacy / New-Format Status

- Current source format: legacy node/option dialogue.
- Legacy slug: `rusk-at-the-shrine`.
- NPC template slug: `rusk-bandit`.
- Scene slug: `shrine-ruins`.
- New Focus/Commit scene: `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.scene.json`.
- Expected paths: `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json`.

## D. NPC Role In Greyvale Arc

Rusk is the unstable shrine antagonist. He is a real threat, but successful conversation can reveal that the shrine made violence feel easier and more inevitable.

## E. Emotional Posture

- Hostile.
- Unstable.
- Half-listening to something else.
- Dangerous but not fully in control.
- Briefly clear under the right pressure.

## F. Voice And Tone Guidance

Rusk should sound like he is answering two conversations at once. His lines can be sharp and strange, but they must remain grounded in existing shrine influence. Avoid making him a lore narrator.

## G. What They Know

- Something at the shrine changed how violence felt.
- At first it made things simple; then it made them inevitable.
- There may be a deeper source beneath the shrine if the authored path exposes it.

## H. What They Misunderstand

He may experience influence as command, hunger, inevitability, or pressure rather than understanding its source.

## I. What They Will Not Say Directly

- The final nature of the hollow or Whispering Presence.
- A clean confession that resolves the mystery.
- Hidden encounter mechanics.
- A safe route to the hollow unless the authored conditions are met.

## J. Existing Facts / Clues / Objectives To Preserve

- Legacy clue: `clue_bandit_instability`.
- Legacy title: `Bandit Instability`.
- Legacy flags: `clue_bandit_instability`, `rusk_confronted_directly`, `shrine_depth_unlocked`, `understanding_high`.
- Legacy objectives: complete `uncover-the-truth`, activate `resolve-the-threat`.
- Legacy reward: scene unlock `subterranean-hollow`.
- Canonical knowledge IDs used: `bandits_not_fully_self_directed`, `shrine_depth_unlocked`, `hollow_reaches_shrine_above`.
- Existing transition: `descend-beneath-the-shrine` requires `surface_threat_resolved` and `shrine_depth_unlocked`.
- Canonical mapping: legacy `clue_bandit_instability` maps to `bandits_not_fully_self_directed` with the legacy clue key preserved in `metadata_json`.
- Combat encounter reference: `shrine-rusk-confrontation`.

## K. Suggested Conversation Surface

Open with Rusk as physically dangerous and mentally divided. The shrine should feel present in how he listens and reacts, but the surface should not explain the influence.

## L. Suggested Passive Social Insights

- Rusk is hostile, but some of his certainty does not feel fully self-directed.
- He reacts to words like "source", "listen", or "stop" as if they tug at something beneath anger.
- Escalation is near; this is not a safe interview.

## M. Suggested Clarifying Questions

- "What do you hear?"
- "When did the shrine change things?"
- "Who else hears it?"
- "What are you afraid of beneath the anger?"
- "What do you mean by 'it heard you'?"

## N. Suggested Committed Social Moves

- Keep him talking long enough for instability to show.
- Push him to name the source.
- Challenge his control.
- Offer a way to stop listening.
- End this now, transitioning toward combat or combat-ready state.

## O. Suggested Generic Fallback Behavior

Use extreme caution. If enabled:

- Allowed: keep talking, ask what he hears, de-escalate briefly.
- Excluded: force confession, bypass combat, reveal final source, unlock hollow without authored result.
- Usage limit: one.
- Failure should likely spend the beat and increase instability/escalation.

It is acceptable to disable fallback if the final scene is too dangerous for generic inputs.

## P. Suggested Dialogue Exits / Transitions

- Risky exit/withdraw from the shrine if supported by `withdraw-from-the-shrine`.
- Escalate to combat or combat-ready state.
- Unlock `subterranean-hollow` only after authored conditions such as `shrine_depth_unlocked` and surface threat resolution.
- Do not assume combat transition is supported until verified.

## Q. Suggested Relationship / Social State Fields

Persistent:

- `hostility`
- `respect` only if the design wants dangerous respect, otherwise omit.

Scene-local:

- `instability`
- `pressure`
- `control`
- `focus`
- `fracture`

## R. Suggested Relationship / Social State Writes

- Keeping him talking: may reduce control loss briefly or reveal instability.
- Push toward source: increases pressure, may unlock deeper clue on success.
- Threaten/end now: increases hostility or triggers combat transition.
- De-escalation failure: increases instability.

## S. Knowledge / Objective / Reward Outputs To Preserve

- Preserve `Bandit Instability`.
- Preserve `shrine_depth_unlocked` only when the deeper-source path succeeds.
- Preserve `understanding_high` if still used.
- Preserve objective shift from `uncover-the-truth` to `resolve-the-threat` where supported.
- Candidate canonical knowledge: `bandits_not_fully_self_directed`, `shrine_depth_unlocked`, `hollow_reaches_shrine_above`.

## T. Completed Record / Transcript / Archive Guidance

Summary should record whether Rusk revealed instability, whether the hollow/depth was exposed, and whether the conversation collapsed into violence. Do not turn the summary into a final explanation.

## U. Player-Facing Visibility Rules

- Do not expose encounter internals or combat trigger mechanics.
- Do not reveal hidden transition requirements.
- Do not expose raw instability/control values.
- Do not show hidden DCs or result bands.
- Player-facing text may say Rusk is unstable or half-listening only when surfaced.

## V. GM/Dev Debug Visibility Expectations

GM/dev should see escalation thresholds, hidden transition requirements, combat-transition status, state writes, objective/reward outputs, and whether `shrine_depth_unlocked` was authored by the selected path.

## W. Path Harness Expectations

Required:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path` if fallback is enabled
- `minimal_exit_path`
- `instability_state_path`
- `combat_transition_path`
- `combat_transition_path`
- `deeper_source_transition_path`

## X. Implementation Notes For Later Codex Build

- Suggested Focus/Commit file name: `rusk-at-the-shrine-focus-commit.scene.json`.
- Suggested participant id: `npc:rusk_bandit`.
- Suggested NPC key: `rusk-bandit`.
- Implemented combat behavior uses authored `combat_pending` / `shrine_confrontation_ready` metadata tied to `shrine-rusk-confrontation`; the dialogue runtime does not directly start combat.
- Implemented hollow handoff preserves `descend-beneath-the-shrine` as future-supported until `surface_threat_resolved` and `shrine_depth_unlocked` are both present.
- Keep Rusk high complexity but short in player-facing prose; danger should create urgency.

## Y. Risks / Open Questions

- Direct dialogue-to-combat transition is not wired in Stage 6B.12.5; Rusk uses combat-pending metadata plus an exploration return to `shrine-ruins`.
- `surface_threat_resolved` is still produced by shrine combat/event infrastructure, not by this dialogue fixture.
- Generic fallback is enabled once, constrained, and cannot grant major clues, transition to the hollow, or resolve combat.
- Stage 6B.12.6 should verify the UI and any future combat handoff consume the `combat_pending` metadata safely.
