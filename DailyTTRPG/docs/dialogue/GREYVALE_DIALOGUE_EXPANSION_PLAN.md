# Greyvale Dialogue Expansion Plan

Stage 6B.12 converts and expands existing Greyvale dialogue into the Dialogue Focus/Commit system. This document is the Stage 6B.12.0 audit and conversion plan only.

No final converted scene JSON should be generated in this stage. Legacy node/option dialogue remains canonical source material until human-authored creative briefs are prepared and reviewed.

## 1. Purpose

Greyvale currently has two dialogue content families:

- A newer Dialogue Focus/Commit Elin fixture under `content/dialogue_focus_commit/greyvale`.
- Older legacy node/option dialogue files under `content/dialogue/greyvale`.

Stage 6B.12 should preserve the established Greyvale facts, NPC tones, clues, objectives, scene unlocks, and consequences while moving the target NPC conversations into the richer Focus/Commit model:

- `conversation_surface`
- `passive_social_insight`
- `clarifying_questions`
- `committed_social_moves`
- `generic_fallback`
- `dialogue_exits`
- relationship/social state reads and writes
- transcripts and completed records
- deterministic summaries
- archive/search hooks
- annotation/correction chains where useful
- GM/dev debug visibility
- path harness coverage
- player-facing visibility boundaries

The Elin Focus/Commit scene is the exemplar for structure and testing shape. The older node/option files are conversion seeds, not final new-format scenes. Full final prose and creative direction should be authored separately before Codex generates converted scene JSON.

Stage 6B.12.1 creative briefs now live under `dialogue/greyvale-briefs/`:

- `dialogue/greyvale-briefs/README.md`
- `dialogue/greyvale-briefs/tomas-rell.md`
- `dialogue/greyvale-briefs/elin-harrow.md`
- `dialogue/greyvale-briefs/mara-vellin.md`
- `dialogue/greyvale-briefs/lysa-fen.md`
- `dialogue/greyvale-briefs/garren-holt.md`
- `dialogue/greyvale-briefs/rusk.md`

## 2. Existing Greyvale Dialogue Inventory

| Path | Slug / ID | NPC | Scene / Location | Format | Scope | References | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json` | `greyvale_elin_memory_dialogue`, slug `greyvale-elin-memory-dialogue` | Elin Harrow | `grey_road_inn_common_room` entry, Elin hearth memory | `dialogue_focus_commit` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js`; exercised by `backend/test/dialogue-greyvale-fixture-regression.test.js` | Preserve as exemplar; reconcile with legacy Elin before production registration |
| `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json` | fixture `greyvale_elin_memory_dialogue` | Elin Harrow | Elin hearth memory | `expected_paths` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js` | Preserve as path-harness style model |
| `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json` | `greyvale_tomas_roadside_worries_dialogue`, slug `greyvale-tomas-roadside-worries-dialogue` | Tomas Rell | `grey-road-inn` | `dialogue_focus_commit` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js`; covered by Tomas content and Greyvale fixture regression tests | Stage 6B.12.2 conversion fixture; legacy file remains source material |
| `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json` | fixture `greyvale_tomas_roadside_worries_dialogue` | Tomas Rell | Grey Road Inn | `expected_paths` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js` | Stage 6B.12.2 path metadata |
| `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json` | `greyvale_mara_dunmere_pressure_dialogue`, slug `greyvale-mara-dunmere-pressure-dialogue` | Mara Vellin | `dunmere-village` | `dialogue_focus_commit` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js`; covered by Mara/Lysa content and Greyvale fixture regression tests | Stage 6B.12.3 conversion fixture; legacy file remains source material |
| `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json` | fixture `greyvale_mara_dunmere_pressure_dialogue` | Mara Vellin | Dunmere village | `expected_paths` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js` | Stage 6B.12.3 path metadata |
| `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json` | `greyvale_lysa_grief_suspicion_dialogue`, slug `greyvale-lysa-grief-suspicion-dialogue` | Lysa Fen | `dunmere-village` | `dialogue_focus_commit` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js`; covered by Mara/Lysa content and Greyvale fixture regression tests | Stage 6B.12.3 conversion fixture; legacy file remains source material |
| `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json` | fixture `greyvale_lysa_grief_suspicion_dialogue` | Lysa Fen | Dunmere village | `expected_paths` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js` | Stage 6B.12.3 path metadata |
| `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json` | `greyvale_garren_path_knowledge_dialogue`, slug `greyvale-garren-path-knowledge-dialogue` | Garren Holt | `dunmere-village` | `dialogue_focus_commit` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js`; covered by Garren content and Greyvale fixture regression tests | Stage 6B.12.4 conversion fixture; legacy file remains source material |
| `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json` | fixture `greyvale_garren_path_knowledge_dialogue` | Garren Holt | Dunmere village / old path lead | `expected_paths` | Fixture/test content | Loaded by `backend/test/fixtures/greyvale-dialogue-fixtures.js` | Stage 6B.12.4 path metadata |
| `content/dialogue/greyvale/tomas-roadside-worries.json` | `tomas-roadside-worries` | Tomas Rell | `grey-road-inn` | `legacy_node_dialogue` | Production content | Imported by `content/worlds/greyvale/manifest.json` via `dialogues` path | Convert from legacy; keep as canonical source material |
| `content/dialogue/greyvale/elin-fragments-of-memory.json` | `elin-fragments-of-memory` | Elin Harrow | `elin-memory-fragments` | `legacy_node_dialogue` | Production content | Imported by Greyvale manifest legacy dialogue path | Source material for reconciling Elin; likely deprecated after Focus/Commit production replacement |
| `content/dialogue/greyvale/mara-dunmere-pressure.json` | `mara-dunmere-pressure` | Mara Vellin | `dunmere-village` | `legacy_node_dialogue` | Production content | Imported by Greyvale manifest legacy dialogue path | Convert from legacy |
| `content/dialogue/greyvale/lysa-grief-and-suspicion.json` | `lysa-grief-and-suspicion` | Lysa Fen | `dunmere-village` | `legacy_node_dialogue` | Production content | Imported by Greyvale manifest legacy dialogue path | Convert from legacy |
| `content/dialogue/greyvale/garren-path-knowledge.json` | `garren-path-knowledge` | Garren Holt | `dunmere-village` | `legacy_node_dialogue` | Production content | Imported by Greyvale manifest legacy dialogue path | Convert from legacy |
| `content/dialogue/greyvale/rusk-at-the-shrine.json` | `rusk-at-the-shrine` | Rusk / `rusk-bandit` | `shrine-ruins` | `legacy_node_dialogue` | Production content | Imported by Greyvale manifest legacy dialogue path | Convert from legacy; combat transition needs verification |
| `backend/test/fixtures/greyvale-dialogue-fixtures.js` | `greyvaleElinMemorySceneFixture` | Elin Harrow | Elin hearth memory | `partial_fixture` | Test fixture loader | Reads the Focus/Commit scene and expected paths | Preserve; expand or mirror for later converted fixtures |
| `backend/test/fixtures/dialogue-focus-commit-fixtures.js` | multiple synthetic fixtures | Synthetic / test NPCs | Test-only scenes | `partial_fixture` | Test-only | Focus/Commit runtime/service tests | Reference for fixture structure, not Greyvale canon |

No additional production Greyvale legacy dialogue JSON files were discovered beyond the six legacy files. Focus/Commit Greyvale fixture content now includes Elin and Tomas under `content/dialogue_focus_commit/greyvale`.

Important importer finding: `content/worlds/greyvale/manifest.json` registers legacy dialogue through `../../dialogue/greyvale`. The new `content/dialogue_focus_commit/greyvale` directory is not production-imported by that manifest today; it is currently test-loaded.

Stage 6B.12.2 added Tomas Focus/Commit content under `content/dialogue_focus_commit/greyvale`; production importer wiring is still deferred.

Stage 6B.12.3 added Mara and Lysa Focus/Commit content under `content/dialogue_focus_commit/greyvale`; production importer wiring is still deferred.

Stage 6B.12.4 added Garren Focus/Commit content under `content/dialogue_focus_commit/greyvale`; production importer wiring is still deferred.

## 3. New-Format Exemplar Analysis

`content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json` is the current Focus/Commit exemplar.

### Structural Pattern

- Scene identity: `greyvale_elin_memory_dialogue`, slug `greyvale-elin-memory-dialogue`.
- Scene type/domain: `scene_type: dialogue`, `interaction_domain: dialogue_focus_commit`.
- Beat shape: `soft_target_max: 3`.
- Participant model: `npc:elin_harrow` with `npc_key: elin-harrow`, unknown and known labels, and visibility-aware identity fields.
- Entry behavior: references a Grey Road inn/common-room source and a conversation surface id.
- Conversation surface: atmospheric paragraphs separated into opening, posture, and tension.

### Passive Social Insight Pattern

The passive insight `insight_elin_shrine_bell_avoidance` is a restrained narrative-only Wisdom Insight check:

- Uses a hidden DC for player-facing purposes.
- Provides a player-safe success note.
- Grants a small knowledge item, not a full mystery answer.
- Has authored failure fallback behavior rather than exposing mechanics.

This is a good model for converted scenes: small, contextual, and safe to skip.

### Relationship / Social State Pattern

The scene defines persistent relationship ladders:

- `trust`
- `respect`
- `hostility`

It also defines scene-local posture fields:

- `openness`
- `fear`
- `pressure`
- `stability`

Persistent values are player-perceived or recap-friendly. Scene-local values are GM-only posture mechanics. Converted scenes should use the same separation: narrative relationship recap for players, raw state only for GM/dev.

### Clarifying Question Pattern

The Elin fixture uses four Clarifying Questions:

- `clarify_sound_first`
- `clarify_torn_sash`
- `clarify_read_her_fear`
- `clarify_roadward_knot`

The pattern is strong:

- Most CQs are no-check memory/fact probes.
- At least one CQ is checked.
- One CQ unlocks or deepens another route.
- CQs grant small context or knowledge but do not spend the committed beat.
- Result persistence and visibility are covered in expected paths.

Converted scenes should preserve this shape, usually with 3-5 CQs depending on NPC complexity.

### Committed Social Move Pattern

The Elin fixture includes:

- `move_reassure_elin` as a no-check trust-building move.
- `move_press_shrine_warning` as a checked pressure move.
- `move_follow_first_sound_deeper` as a checked deeper-memory move.
- `move_accuse_concealment` as a checked high-risk move.
- `move_follow_memory_to_road` as a no-check transition-oriented move.

This mix gives a strong conversion target:

- At least one no-check committed move.
- At least one checked committed move.
- At least one refusal or posture-damaging path.
- At least one transition or scene-unlock path when supported by legacy content.

### Generic Fallback Pattern

Elin's fallback is enabled but narrow:

- usage limit: one
- allowed move types: ask, listen, reassure
- excluded move types: force confession, unauthored hidden-truth reveal, unauthored transition
- no major clue grant
- no transition
- no relationship write
- failed fallback consumes the slot

Converted scenes should copy this conservative policy only when a generic fallback is intentionally useful. It should remain disabled by default for scenes where fallback could invent facts.

### Exits and Transitions

The fixture includes:

- free rest exit
- return-to-common-room transition
- hollow-path transition

Converted scenes should not assume every dialogue returns to exploration. Exit targets should be explicit and validated against scene/location ids.

### Summary, Transcript, Archive, and Lifecycle Hooks

The fixture includes:

- deterministic authored summary behavior
- completed dialogue record shape
- transcript turn seed data
- NPC profile recap
- search index metadata
- annotation chains
- correction chains
- validation/debug metadata

For most converted scenes, the minimum should be deterministic completed-record summary, transcript linkage, player-safe archive/search terms, and GM/dev debug metadata. Annotation/correction fixture coverage can be lighter outside Elin unless Stage 6B.12.1 creative briefs require it.

### Expected Path Coverage

`elin-memory-focus-commit.expected-paths.json` defines named paths:

- `happy_path`
- `failure_path`
- `fallback_path`
- `minimal_interaction_path`
- `max_clarifying_question_path`
- `relationship_state_edge_case`
- `exit_transition_path`

This should become the path-harness expectation model for converted Greyvale dialogues.

### Exemplar Issues / Implementation Notes

- The Focus/Commit Elin scene is currently test-loaded, not production-imported through the Greyvale manifest.
- Legacy Elin still exists as production legacy dialogue and must be reconciled before replacement.
- Some legacy knowledge ids differ from newer Greyvale knowledge registry style; conversion should verify canonical ids before authoring.
- The scene is intentionally high-complexity and should not force every NPC to match its size.

## 4. Legacy Dialogue Audit

### Tomas Rell / Tomas and the Road

Source: `content/dialogue/greyvale/tomas-roadside-worries.json`

- NPC role: innkeeper/informant at the Grey Road inn.
- Emotional posture: worried, practical, road-wise.
- Entry node: `tomas-greeting`.
- Main options: ask about the road, mention the caravan.
- Branches: road-pattern branch and caravan comparison branch converge on the pattern clue.
- Terminal node: `tomas-farewell`.
- Facts/clues: recent trouble does not match ordinary bandit behavior; ordinary bandits strip goods and scatter after one or two hits.
- Knowledge granted: `clue_pattern_of_attacks`.
- Flags: `heard_tomas_account`, `told_tomas_about_caravan`, `elin_referred_by_tomas`.
- Objective effect: `shadows_grey_road:gather-local-insight:active:1`.
- Transition implication: points toward a survivor near the inn fire, effectively Elin.
- Current limitations: informational node flow lacks passive insight, relationship posture, explicit check metadata, transcript/completed summary, and path harness coverage.

### Elin Harrow / Elin's Fragments

Source: `content/dialogue/greyvale/elin-fragments-of-memory.json`

- NPC role: survivor of the road attack.
- Emotional posture: shaken, fragile, wary of pressure.
- Entry node: `elin-greeting`.
- Main options: ask gently, push hard.
- Branches: gentle questioning opens memory; pressure shuts her down.
- Terminal node: `elin-farewell`.
- Facts/clues: attackers listened for something; they stopped at once; same whisper.
- Knowledge granted: `clue_survivor_memory_fragment`.
- Flags: `elin_treated_gently`, `elin_shut_down`, `clue_survivor_memory_fragment`.
- Objective effects: completes `gather-local-insight`, activates `follow-the-leads`.
- NPC state effects: hard pressure marks Elin as hostile.
- Current limitations: legacy memory facts must be reconciled with the richer Focus/Commit scene rather than duplicated or contradicted.

### Mara Vellin / Mara Under Pressure

Source: `content/dialogue/greyvale/mara-dunmere-pressure.json`

- NPC role: acting village authority and pressure point.
- Emotional posture: practical, defensive, wants actionable proof.
- Entry node: `mara-greeting`.
- Main options: report the caravan, suggest something deeper.
- Branches: bandit explanation branch and proof-demand branch.
- Terminal nodes: `mara-bandits`, `mara-proof`.
- Facts/clues: Mara is leaning toward the bandit explanation because it is politically survivable and immediately actionable.
- Knowledge granted: `clue_mara_assumption`.
- Flags: `clue_mara_assumption`, `mara_demanded_proof`.
- Current limitations: good candidate for passive insight and pressure/reassure/offer-proof committed moves, but legacy file lacks explicit relationship state or checks.

### Lysa Fen / Lysa's Suspicion

Source: `content/dialogue/greyvale/lysa-grief-and-suspicion.json`

- NPC role: grief-driven village voice tied to a missing brother.
- Emotional posture: suspicious, grieving, afraid people are simplifying the truth.
- Entry node: `lysa-greeting`.
- Main options: take her seriously, ask why she suspects concealment.
- Branches: trust-building branch and suspicion clue branch.
- Terminal nodes: `lysa-open`, `lysa-suspicion`.
- Facts/clues: she thinks people are hiding or simplifying what happened; missing-person pressure matters.
- Knowledge granted: `clue_lysa_suspicion`.
- Flags: `lysa_trusts_you`, `clue_lysa_suspicion`, `heard_lysa_suspicion`.
- Objective effects: completes `gather-local-insight`, activates `follow-the-leads`.
- NPC state effects: taking her seriously can mark Lysa friendly.
- Current limitations: should separate confirmed facts from grief-shaped suspicion and avoid overcanonizing her interpretation.

### Garren Holt / Garren and the Old Paths

Source: `content/dialogue/greyvale/garren-path-knowledge.json`

- NPC role: guarded hunter with old-path knowledge.
- Emotional posture: defensive, respect-sensitive, withholding.
- Entry node: `garren-greeting`.
- Main options: ask what he saw, accuse him outright.
- Branches: respectful opening unlocks partial route; accusation shuts him down.
- Terminal nodes: `garren-defensive`, `garren-farewell`.
- Facts/clues: someone moved toward the old shrine road; Garren knows paths others avoid.
- Knowledge granted: `clue_garren_observation`.
- Flags: `garren_respected`, `garren_accused`, `clue_garren_observation`, `shrine_path_known`, `understanding_medium`.
- Objective effects: completes `gather-local-insight`, activates `follow-the-leads`.
- NPC state effects: accusation can mark Garren hostile.
- Transition implication: unlocks shrine path knowledge.
- Current limitations: high-value candidate for respect/trust/hostility state and gated committed moves.

### Rusk / Rusk at the Shrine

Source: `content/dialogue/greyvale/rusk-at-the-shrine.json`

- NPC role: unstable shrine antagonist / bandit leader.
- Emotional posture: hostile, fraying, shrine-influenced.
- Entry node: `rusk-greeting`.
- Main options: ask what he hears, end this now.
- Branches: instability reveal, direct confrontation, deeper source push.
- Terminal node: `rusk-fight`.
- Facts/clues: the shrine made violence easier and louder in his head; something deeper beneath the shrine may be involved.
- Knowledge granted: `clue_bandit_instability`.
- Flags: `clue_bandit_instability`, `rusk_confronted_directly`, `shrine_depth_unlocked`, `understanding_high`.
- Objective effects: completes `uncover-the-truth`, activates `resolve-the-threat`.
- Combat implication: dialogue collapses into violence.
- Current limitations: needs explicit risky exits, refusal/escalation behavior, and verified combat/encounter transition support.

## 5. Legacy-to-Focus/Commit Conversion Map

| Legacy field / concept | Focus/Commit target | Conversion notes |
| --- | --- | --- |
| `root_node_slug` / entry node text | `conversation_surface` | Convert greeting into narrative-first surface with NPC posture and scene tension. |
| Node body text | `conversation_surface`, CQ result text, move result text, or `latest_development` | Preserve factual claims; avoid duplicating full node text as menu content. |
| Dialogue option asking for information | `clarifying_questions` | Use CQs for non-beat, context-building questions. |
| Dialogue option that changes posture, unlocks a scene, or carries risk | `committed_social_moves` | Use committed moves for consequential choices that spend the beat. |
| `next_node_slug` | unlocks, `latest_development`, result branch routing, or exits | Avoid recreating node graph blindly; express availability and consequences. |
| Outcome text | result branch output / `latest_development` | Keep player-facing text concise and preserve the established fact or refusal. |
| `knowledge_entries` | `knowledge_grants` and search/archive hooks | Verify ids against canonical Greyvale knowledge registry before conversion. |
| `objectives` | `objective_updates` | Preserve quest ids and statuses; validate against `shadows-grey-road` quest definitions. |
| `rewards` / scene unlocks | `state_writes`, `transitions`, or `dialogue_exits` | Make unlocks explicit and auditable. |
| `npc_states` | relationship/social state writes or NPC profile recap hooks | Separate persistent relationship changes from scene-local posture. |
| `character_flags` | character/campaign state writes | Use explicit scope and do not leak flags to players. |
| `session_flags` | scene/session state writes | Keep temporary scene flags separate from persistent canon. |
| Terminal nodes | `dialogue_exits` and completed-record finalization | Each terminal state should decide whether the dialogue is resolved, exited, or transitioned. |
| Legacy clue summaries | deterministic summary behavior | Preserve old summaries as source material; do not silently rewrite completed history later. |
| Legacy hidden/hostile outcomes | failure/refusal result branches | Make refusal paths authored and testable. |
| Legacy graph validation | schema validation + path harness | Converted scenes need schema, runtime, visibility, debug, and expected-path coverage. |

## 6. NPC-by-NPC Conversion Brief Outlines

These are outlines only. Stage 6B.12.1 should fill them with human-authored creative direction before JSON generation.

### Tomas Rell

- A. Role: early road-pattern clue-giver and grounding innkeeper.
- B. Sources: `tomas-roadside-worries.json`; NPC data in `greyvale-npcs.json`.
- C. Facts to preserve: attacks differ from ordinary bandit trouble; bandits would usually strip goods and scatter.
- D. Clues to preserve: `clue_pattern_of_attacks`, or mapped canonical equivalent.
- E. Effects to preserve: `heard_tomas_account`, Elin referral, `gather-local-insight` progress.
- F. Emotional posture: worried, practical, not theatrical.
- G. What he knows: road habits, traveler patterns, and that this trouble feels wrong.
- H. What he misunderstands: he can compare to bandits but cannot explain the deeper cause.
- I. What he will not say directly: final mystery answers or supernatural certainty.
- J. Suggested state fields: trust, respect, concern; scene-local caution.
- K. Passive insight: Tomas is avoiding exaggeration because he knows rumor can panic the inn.
- L. CQs: ordinary bandits, caravan timing, survivor by the fire, road pattern.
- M. Moves: reassure him you need facts; press for specifics; compare caravan evidence.
- N. Failure/refusal: he becomes guarded or repeats folk wisdom.
- O. Exits/transitions: point to Elin or return to inn/common-room investigation.
- P. Summary behavior: compact "Tomas identified a pattern unlike ordinary banditry and pointed toward Elin."
- Q. Path coverage: happy clue path, minimal Elin referral, pressure/failure, max CQs.
- R. Risks: legacy clue id may need canonical knowledge id reconciliation.

### Elin Harrow

- A. Role: survivor memory exemplar.
- B. Sources: Focus/Commit Elin fixture and `elin-fragments-of-memory.json`.
- C. Facts to preserve: attackers listened; broken memory fragments; pressure shuts her down.
- D. Clues to preserve: survivor memory fragment plus Focus/Commit broken wheel, shrine bell, hollow path memory.
- E. Effects to preserve: gentle treatment, shut-down pressure, objective progression from local insight to follow leads.
- F. Emotional posture: shaken, fragmented, responsive to gentleness.
- G. What she knows: sensory fragments and fear-patterns, not a clean explanation.
- H. What she misunderstands: she may interpret memory emotionally rather than systematically.
- I. What she will not say directly: full source of the threat or unauthored final truths.
- J. Suggested state fields: keep existing trust/respect/hostility and openness/fear/pressure/stability.
- K. Passive insight: keep shrine-bell avoidance style.
- L. CQs: preserve existing CQs and reconcile legacy "same whisper" memory.
- M. Moves: keep reassurance, pressure, deeper follow-up, accusation, road-memory transition.
- N. Failure/refusal: pressure can close her down; accusation damages trust.
- O. Exits/transitions: rest, common room, hollow path if authored.
- P. Summary behavior: keep authored deterministic summary; preserve original compact record after corrections.
- Q. Path coverage: existing seven named paths are the model.
- R. Risks: production replacement/coexistence with legacy Elin must be decided.

### Mara Vellin

- A. Role: practical authority under political pressure.
- B. Sources: `mara-dunmere-pressure.json`; NPC data in `greyvale-npcs.json`.
- C. Facts to preserve: Mara wants proof and favors bandit explanation because it is actionable.
- D. Clues to preserve: `clue_mara_assumption`, or canonical equivalent.
- E. Effects to preserve: proof demand flag and local-insight progression where valid.
- F. Emotional posture: controlled, impatient, burdened.
- G. What she knows: village fear, pressure to name a solvable enemy, practical constraints.
- H. What she misunderstands: bandits as sufficient explanation.
- I. What she will not say directly: that her public stance may be politically convenient unless earned through insight.
- J. Suggested state fields: trust, respect, pressure, defensiveness, willingness_to_act.
- K. Passive insight: Mara is testing whether the player has evidence, not just dread.
- L. CQs: public pressure, what proof she needs, why bandits, who is most afraid.
- M. Moves: offer evidence, challenge bandit assumption, ask for authority/help, pressure for resources.
- N. Failure/refusal: she demands proof or narrows support.
- O. Exits/transitions: village investigation, return with evidence, possible objective update.
- P. Summary behavior: "Mara pressed for actionable proof and leaned toward bandits as the survivable explanation."
- Q. Path coverage: evidence success, deeper-truth refusal, minimal exit, CQs.
- R. Risks: avoid making Mara foolish; her assumption should remain misleading but understandable.

### Lysa Fen

- A. Role: grief and suspicion voice.
- B. Sources: `lysa-grief-and-suspicion.json`; NPC data in `greyvale-npcs.json`.
- C. Facts to preserve: missing brother, suspicion that people are hiding/simplifying truth.
- D. Clues to preserve: `clue_lysa_suspicion`, or canonical equivalent.
- E. Effects to preserve: trust flag, suspicion clue, local-insight/follow-leads progression.
- F. Emotional posture: grieving, brittle, observant.
- G. What she knows: what people avoid saying, what feels wrong around the missing.
- H. What she misunderstands: grief may turn gaps into accusations.
- I. What she will not say directly: confirmed culprits or final hidden truths.
- J. Suggested state fields: trust, fear, suspicion, grief_pressure.
- K. Passive insight: her suspicion is grief-shaped but not empty.
- L. CQs: missing brother, who is simplifying, who she distrusts, what changed.
- M. Moves: validate grief, ask for specifics, challenge assumption gently, press for names.
- N. Failure/refusal: she withdraws or becomes accusatory.
- O. Exits/transitions: village lead follow-up; maybe points toward Garren or public pressure.
- P. Summary behavior: distinguish suspicion from confirmed fact.
- Q. Path coverage: trust success, suspicion clue, pressure failure, visibility boundary around misleading clue.
- R. Risks: misleading clue must be marked player-safe without being presented as proven truth.

### Garren Holt

- A. Role: guarded path-knowledge gate.
- B. Sources: `garren-path-knowledge.json`; NPC data in `greyvale-npcs.json`.
- C. Facts to preserve: old shrine road/path knowledge; accusation shuts him down.
- D. Clues to preserve: `clue_garren_observation`, shrine path known, understanding medium.
- E. Effects to preserve: `garren_respected`, `garren_accused`, shrine path unlock, objective progression.
- F. Emotional posture: wary, defensive, respect-sensitive.
- G. What he knows: old paths, movement toward shrine, what villagers misread.
- H. What he misunderstands: may overprotect himself or withhold too much.
- I. What he will not say directly: everything he saw without earned respect or proof of seriousness.
- J. Suggested state fields: respect, trust, hostility, guardedness, willingness_to_guide.
- K. Passive insight: accusation will close him faster than silence.
- L. CQs: old paths, what he saw, why he stayed quiet, shrine route.
- M. Moves: show respect, accuse, offer protection, ask for direct route.
- N. Failure/refusal: defensive shutdown or hostile posture.
- O. Exits/transitions: unlock old path/shrine route.
- P. Summary behavior: "Garren identified the old shrine path after respectful questioning."
- Q. Path coverage: respect unlock, accusation failure, shrine transition, relationship state path.
- R. Risks: exact transition ids/scene targets need verification.

### Rusk

- A. Role: unstable shrine antagonist.
- B. Sources: `rusk-at-the-shrine.json`; NPC data in `greyvale-npcs.json`.
- C. Facts to preserve: shrine influence made violence easier/louder; deeper source clue.
- D. Clues to preserve: `clue_bandit_instability`, `shrine_depth_unlocked`, understanding high.
- E. Effects to preserve: confrontation flag, uncover/resolve objective progression, combat implication.
- F. Emotional posture: hostile, fraying, dangerous.
- G. What he knows: sensory instability and pressure from the shrine.
- H. What he misunderstands: may frame influence as command, hunger, or noise rather than truth.
- I. What he will not say directly: clean exposition or safe confession.
- J. Suggested state fields: hostility, instability, pressure, fear, violence_threshold.
- K. Passive insight: his threat is real but not entirely self-directed.
- L. CQs: what he hears, what changed at shrine, who gave orders, what lies below.
- M. Moves: de-escalate, pressure for truth, threaten, push toward source.
- N. Failure/refusal: immediate escalation or combat transition.
- O. Exits/transitions: risky exit, combat/encounter transition, shrine-depth unlock where authored.
- P. Summary behavior: record instability and transition without overexplaining final mystery.
- Q. Path coverage: instability reveal, direct fight, deeper-source unlock, combat transition.
- R. Risks: combat transition support must be verified before conversion finalization.

## 7. Cross-Dialogue Continuity Plan

- Tomas should point toward Elin without revealing Elin's memory content.
- Elin can deepen broken wheel, shrine bell, first sound, and hollow path memory.
- Mara frames public pressure and the bandit explanation as politically survivable, not necessarily true.
- Lysa introduces grief-driven suspicion and concealment concerns.
- Garren provides old-path/shrine approach knowledge when respect is earned.
- Rusk exposes shrine instability and can transition toward combat or deeper shrine consequences.
- Knowledge grants should not duplicate incorrectly; repeated clues should be idempotent or deliberately recap-safe.
- Misleading clues should be marked as suspicion/assumption where the player sees them.
- Canonical outputs, rumors, assumptions, and non-canonical dialogue-only observations should be explicit.
- No converted dialogue should reveal the final mystery earlier than the existing Greyvale arc supports.
- Objective updates should remain coherent with `shadows_grey_road` quest phases.
- Scene unlocks and transitions should use explicit validated targets.

## 8. Stage 6B.12 Sub-Build Plan

### 6B.12.0 - Audit Existing Greyvale Dialogue and Build Conversion Plan

- Goal: inventory existing dialogue and produce this plan.
- Likely files: docs only.
- Inputs: legacy dialogue JSON, Elin Focus/Commit fixture, Greyvale NPC/objective/knowledge content.
- Outputs: conversion plan and doc/task references.
- Tests: docs/search validation only unless existing content validation is run read-only.
- Acceptance: no runtime or content behavior changed.

### 6B.12.1 - Author Greyvale Dialogue Creative Briefs

- Goal: gather human-authored creative direction before JSON generation.
- Likely files: creative brief docs under `dialogue/greyvale-briefs/`.
- Inputs: this audit, existing Greyvale canon, human-authored tone/fact constraints.
- Outputs: per-NPC creative briefs with approved CQs, moves, refusal behavior, summary intent, and boundaries.
- Tests: docs review and schema-neutral checklist validation.
- Acceptance: briefs are complete enough for Codex to generate scene JSON without inventing major lore.

Build 6B.12.1 implementation note:

- Added `dialogue/greyvale-briefs/README.md`.
- Added per-NPC briefs for Tomas Rell, Elin Harrow, Mara Vellin, Lysa Fen, Garren Holt, and Rusk.
- Briefs remain creative direction only and do not include final scene JSON.

### 6B.12.2 - Tomas + Elin Integration Conversion

- Goal: convert Tomas and reconcile Elin production integration.
- Likely files: `content/dialogue_focus_commit/greyvale/*`, fixture registry/importer docs or manifest wiring if approved, expected paths.
- Inputs: Tomas brief, Elin fixture, legacy Tomas/Elin files.
- Outputs: Tomas Focus/Commit scene, Elin reconciliation plan or production registration update, expected paths.
- Tests: schema validation, runtime load, path harness, visibility boundary, archive/search summary.
- Acceptance: Tomas points cleanly to Elin; Elin legacy and new-format content do not conflict.

Build 6B.12.2 implementation note:

- Added `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json`.
- Added `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json`.
- Updated `backend/test/fixtures/greyvale-dialogue-fixtures.js` so tests can register Tomas and Elin Focus/Commit scenes together.
- Added non-DB content validation coverage in `backend/test/dialogue-greyvale-tomas-content.test.js`.
- Expanded `backend/test/dialogue-greyvale-fixture-regression.test.js` with Tomas runtime, fallback, archive, GM/dev debug, and path-harness scenarios.
- Preserved Elin Focus/Commit content unchanged.
- Mapped Tomas's legacy `Pattern of Attacks` clue intent to canonical knowledge id `innkeeper_tracks_road_patterns`.
- Represented the Elin lead as exploration target `elin-memory-fragments` rather than direct dialogue-to-dialogue routing.

### 6B.12.3 - Mara + Lysa Conversion

- Goal: convert village pressure and suspicion dialogues.
- Likely files: new Mara/Lysa Focus/Commit scenes and expected paths.
- Inputs: Mara/Lysa briefs and legacy files.
- Outputs: medium-complexity scenes with assumptions/suspicion marked safely.
- Tests: schema/runtime/path harness, knowledge/objective updates, misleading clue visibility.
- Acceptance: public pressure, grief, and suspicion enrich the arc without becoming premature truth.

Build 6B.12.3 implementation note:

- Added `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json`.
- Added `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json`.
- Added `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json`.
- Added `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json`.
- Updated `backend/test/fixtures/greyvale-dialogue-fixtures.js` so Elin, Tomas, Mara, and Lysa can be registered together.
- Added non-DB content validation coverage in `backend/test/dialogue-greyvale-mara-lysa-content.test.js`.
- Expanded `backend/test/dialogue-greyvale-fixture-regression.test.js` with Mara/Lysa runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Used `dunmere_wants_simple_answer` for Mara's Assumption and `village_blames_hunter_and_road` for Lysa's Suspicion, preserving legacy clue keys as metadata.
- Kept Mara and Lysa transitions inside `dunmere-village`; neither scene introduces a major unlock or hard gate.

### 6B.12.4 - Garren Conversion

- Goal: convert guarded old-path knowledge scene.
- Likely files: Garren Focus/Commit scene, expected paths, transition/unlock references.
- Inputs: Garren brief, legacy file, shrine/old-path scene ids.
- Outputs: high-complexity respect-gated path knowledge dialogue.
- Tests: respect/hostility writes, locked/unlocked path, shrine transition, path harness.
- Acceptance: respectful approach unlocks path knowledge; accusation/refusal behavior is durable.

Build 6B.12.4 implementation note:

- Added `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json`.
- Added `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json`.
- Updated `backend/test/fixtures/greyvale-dialogue-fixtures.js` so Elin, Tomas, Mara, Lysa, and Garren can be registered together.
- Added non-DB Garren content validation coverage in `backend/test/dialogue-greyvale-garren-content.test.js`.
- Expanded `backend/test/dialogue-greyvale-fixture-regression.test.js` with Garren runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Used `tracks_converge_on_shrine` as the canonical mapping for legacy `clue_garren_observation`, preserving the legacy clue key in `metadata_json`.
- Preserved `shrine_path_known`, `understanding_medium`, `garren_respected`, `garren_accused`, `gather-local-insight`, `follow-the-leads`, and `shrine-ruins` scene-unlock intent.
- Live dialogue transition targets `old-forest-path` via `follow-the-old-path` route intent; direct dialogue exit to `shrine-ruins` is intentionally not used.

### 6B.12.5 - Rusk Conversion

- Goal: convert unstable shrine antagonist scene.
- Likely files: Rusk Focus/Commit scene, expected paths, combat/transition references if supported.
- Inputs: Rusk brief, legacy file, shrine/encounter content.
- Outputs: high-complexity risky dialogue with escalation/combat transition.
- Tests: refusal/escalation, instability clue, combat transition if supported, player-vs-GM visibility.
- Acceptance: Rusk can reveal authored instability without becoming an exposition machine.

Build 6B.12.5 implementation note:

- Added `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.scene.json`.
- Added `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json`.
- Updated `backend/test/fixtures/greyvale-dialogue-fixtures.js` so Elin, Tomas, Mara, Lysa, Garren, and Rusk can be registered together.
- Added non-DB Rusk content validation coverage in `backend/test/dialogue-greyvale-rusk-content.test.js`.
- Expanded `backend/test/dialogue-greyvale-fixture-regression.test.js` with Rusk runtime, fallback, archive, GM/dev debug, and path-harness assertions.
- Mapped legacy `clue_bandit_instability` to canonical `bandits_not_fully_self_directed`, preserving the legacy clue key in `metadata_json`.
- Preserved `shrine_depth_unlocked`, `understanding_high`, `rusk_confronted_directly`, `uncover-the-truth`, `resolve-the-threat`, `subterranean-hollow` scene-unlock intent, and `shrine-rusk-confrontation` encounter metadata.
- Combat handoff is represented as `combat_pending` / `shrine_confrontation_ready` metadata because the dialogue runtime does not directly start combat.
- Hollow handoff remains future-supported through the existing `descend-beneath-the-shrine` transition gate, which requires `surface_threat_resolved` and `shrine_depth_unlocked`.

### 6B.12.6 - Dialogue Regression, Visibility, and Path Harness Pass

- Goal: validate the converted Greyvale dialogue suite end-to-end.
- Likely files: backend tests, fixture registry, expected paths, docs.
- Inputs: all converted scenes and expected paths.
- Outputs: regression coverage for schema, runtime, UI, archive/search, debug, lifecycle boundaries.
- Tests: full dialogue-focused suite plus Greyvale path harness.
- Acceptance: converted scenes are stable, player-safe, and GM/dev inspectable.

Build 6B.12.6 implementation note:

- Added consolidated non-DB regression coverage in `backend/test/dialogue-greyvale-stage6b12-regression.test.js`.
- The suite inventories all six converted Focus/Commit scenes, verifies scene and expected-path files exist, validates schema with the `playtest_ready` profile, registers every scene by id and slug, and confirms legacy files remain retained and non-conflicting.
- Static reference validation now checks Greyvale NPC slugs, canonical scene slugs, quest objective slugs, scene-unlock rewards, and authored handoff transitions.
- Elin's local exploration targets `grey_road_inn_common_room` and `grey_road_inn_hollow_path` are accepted as established local context ids rather than production scene slugs.
- Player-facing archive/search hooks are checked against debug-only terms, while GM/dev debug visibility remains covered by the DB-backed fixture regression suite.
- Cross-dialogue continuity assertions now cover Tomas, Elin, Mara, Lysa, Garren, and Rusk clue/objective/transition anchors without revealing the final entity or unsupported final mechanism.
- Runtime validation remains in `backend/test/dialogue-greyvale-fixture-regression.test.js`, which exercises entry, CQ resolution, CSM preview/submit, fallback, exits, archive/search, GM/dev debug, and path harness runs against the registered Greyvale scene set.
- Flutter dialogue UI regression was not expanded in 6B.12.6 because no frontend files changed; existing backend player-facing read model and archive/search boundary tests are the coverage source for this pass.

## 9. Validation Plan

### Schema / Content Validation

- Valid `dialogue_focus_commit` schema.
- Valid participant and NPC references.
- Valid scene and location references.
- Valid knowledge ids or documented reconciliation of legacy clue ids.
- Valid objective ids and quest status changes.
- Valid reward and scene unlock references.
- Valid transition targets.
- Valid relationship/social state fields.
- Valid check definitions and DC visibility policies.
- Valid fallback constraints.
- Valid completed dialogue record, transcript, search, and archive hooks.

### Runtime Validation

- Scene loads through Dialogue Focus/Commit runtime.
- Clarifying Questions resolve, persist, and reopen without reroll.
- Checked CQs handle success and failure.
- Committed moves preview, submit, resolve, and spend the beat.
- Generic fallback works only where enabled and exhausts correctly.
- Exits and transitions finalize or route dialogue explicitly.
- Relationship/social writes audit correctly.
- Summaries, completed records, and transcript turns generate correctly.

### Visibility Validation

- Player output excludes hidden DCs unless authored policy allows.
- Player output excludes raw relationship meters and scene-local posture.
- Player output excludes GM-only state, hidden requirements, raw audit, and debug metadata.
- Player archive excludes debug/hidden lifecycle records.
- GM/dev debug can inspect hidden routing, state, checks, previews, transcript metadata, and lifecycle chains.

## 10. Path Harness Plan

Minimum expected paths should be defined per converted scene:

| NPC | Required paths |
| --- | --- |
| Tomas | `happy_path`, `minimal_exit_path`, `max_clarifying_question_path`, `failure_or_refusal_path` |
| Elin | Preserve `happy_path`, `failure_path`, `fallback_path`, `minimal_interaction_path`, `max_clarifying_question_path`, `relationship_state_edge_case`, `exit_transition_path` |
| Mara | `happy_path`, `refusal_or_failure_path`, `fallback_path`, `minimal_exit_path`, `relationship_state_path`, `max_clarifying_question_path` |
| Lysa | `happy_path`, `refusal_or_failure_path`, `fallback_path`, `minimal_exit_path`, `relationship_state_path`, `max_clarifying_question_path` |
| Garren | `happy_path`, `refusal_or_failure_path`, `fallback_path`, `minimal_exit_path`, `relationship_state_path`, `transition_path`, `max_clarifying_question_path` |
| Rusk | `happy_path`, `refusal_or_failure_path`, `fallback_path`, `minimal_exit_path`, `instability_state_path`, `combat_transition_path`, `deeper_source_transition_path`, `max_clarifying_question_path` |

Fallback paths should exist only for scenes where generic fallback is enabled. If fallback is disabled, the expected path should assert that fallback is unavailable and revise prompts remain safe.

## 11. Regression Testing Plan

### Backend / Content Tests

- Dialogue schema validation for all converted Greyvale scenes.
- Importer or registry validation once production registration is decided.
- Runtime load tests.
- Path harness tests for all expected paths.
- Relationship/social state read/write and audit tests.
- Knowledge, objective, reward, and transition output tests.
- Transcript, completed record, summary, search, and archive tests.
- Annotation/correction visibility tests where lifecycle fixtures are used.
- Player-facing visibility boundary tests.
- GM/dev debug visibility tests.

### Frontend Tests

- Player DialogueSceneView renders converted scenes in narrative-first order.
- Clarifying Questions display, resolve, persist, and reopen.
- Committed Social Move preview/submit behavior works.
- Generic fallback revise prompts display where authored.
- Exits/transitions render and resolve.
- Completed dialogue summary/archive displays player-safe content.
- GM/dev debug workspace can inspect converted scenes where frontend debug tests are practical.

### Greyvale Continuity Tests

- No duplicate knowledge grants that break state.
- No premature final mystery reveal.
- No invalid scene unlocks.
- No broken objective transitions.
- No expected-path drift.
- No hidden truth leakage to player-facing payloads or UI.

## 12. Open Questions and Risks

- Which legacy dialogue format paths are still reachable from the current player runtime after the web-first changes?
- Should converted Focus/Commit scenes replace legacy dialogue files in production, or coexist during a transition period?
- Should legacy files move to an archive/source-material directory after conversion, or remain in place with manifest changes?
- Where should production Focus/Commit Greyvale files be registered: a new manifest section, existing content import pipeline, or runtime registry?
- Should Elin Focus/Commit fully replace `elin-fragments-of-memory.json`, or should both remain reachable in different contexts?
- Rusk uses canonical NPC slug `rusk-bandit`, source scene `shrine-ruins`, encounter `shrine-rusk-confrontation`, and hollow scene `subterranean-hollow`.
- Rusk exits return to `shrine-ruins`; combat is represented as `combat_pending`, and hollow routing is represented through the existing `descend-beneath-the-shrine` gate.
- Are legacy clue ids such as `clue_pattern_of_attacks` canonical, or should they map to newer ids like `innkeeper_tracks_road_patterns` and related Greyvale knowledge entries?
- Rusk's direct combat start remains future-supported for dialogue runtime; Stage 6B.12.5 records combat-pending metadata instead.
- How much annotation/correction fixture coverage should non-Elin dialogues include?
- How much transcript/completed-record fixture seed data should each converted NPC carry versus relying on runtime-generated records?
- Should all converted scenes include generic fallback, or only selected medium/high-complexity scenes?
- How much check/DC mechanics should be added to NPCs whose legacy dialogue is purely choice-based?

## 13. Final Stage 6B.12 Status

- Converted scenes: Tomas Rell, Elin Harrow, Mara Vellin, Lysa Fen, Garren Holt, and Rusk all have Focus/Commit scene fixtures and expected-path metadata under `content/dialogue_focus_commit/greyvale/`.
- Legacy files: the six legacy node dialogue files remain in `content/dialogue/greyvale/` as source material and do not conflict with new Focus/Commit ids/slugs.
- Path coverage: all required named paths are present; Elin keeps its original seven-path fixture, and Tomas/Mara/Lysa/Garren/Rusk add the required Stage 6B.12 paths.
- Validation coverage: non-DB content tests cover schema/static references, while the DB-backed fixture regression covers runtime load, path harness, archive/search, relationship/social state, player visibility, and GM/dev debug boundaries.
- Player visibility: player-facing archive/search hooks exclude hidden DCs, raw rolls, result-band internals, GM/debug summaries, preview confidence, path metadata, and instrumentation terms.
- GM/dev visibility: authorized debug/path-harness tests continue to expose checks, routing, relationship/social state, transcripts, validation, lifecycle records, and named path results through GM/dev-only routes.
- Future-supported items: production content-import registration for Focus/Commit JSON, isolated path-harness sandboxing, direct dialogue-to-combat startup for Rusk, and full live Flutter dialogue regression remain outside this stage.
- Recommended next stage: Stage 6B.13 - Post-Dialogue Stabilization & Full Loop Hardening. See `docs/full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md`.

## 14. Historical 6B.12.0 Guardrail

Stage 6B.12.0 was intentionally an audit and planning stage. Final converted Focus/Commit scene JSON waited until Stage 6B.12.1 provided human-authored creative briefs for each target NPC.

Future stabilization work should still avoid inventing major new lore, villains, locations, mystery answers, transitions, or relationship consequences unless a later human-authored brief explicitly authorizes those changes.
