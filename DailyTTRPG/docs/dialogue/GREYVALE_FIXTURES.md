# Greyvale Dialogue Fixtures

Build 11 added a focused Greyvale Dialogue Focus/Commit fixture for Elin end-to-end regression coverage. Stage 6B.12.2 adds the Tomas Rell Focus/Commit conversion fixture for the early Grey Road Inn dialogue chain. Stage 6B.12.3 adds Mara Vellin and Lysa Fen conversion fixtures for Dunmere's public-pressure and suspicion dialogues. Stage 6B.12.4 adds Garren Holt as the guarded old-path and shrine-route knowledge fixture. Stage 6B.12.5 adds Rusk as the shrine instability and combat-pending confrontation fixture.

## Fixture Files

- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/elin-memory-focus-commit.expected-paths.json`
- `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/tomas-roadside-worries-focus-commit.expected-paths.json`
- `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/mara-dunmere-pressure-focus-commit.expected-paths.json`
- `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/lysa-grief-and-suspicion-focus-commit.expected-paths.json`
- `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/garren-path-knowledge-focus-commit.expected-paths.json`
- `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.scene.json`
- `content/dialogue_focus_commit/greyvale/rusk-at-the-shrine-focus-commit.expected-paths.json`
- `backend/test/fixtures/greyvale-dialogue-fixtures.js`
- `backend/test/dialogue-greyvale-tomas-content.test.js`
- `backend/test/dialogue-greyvale-mara-lysa-content.test.js`
- `backend/test/dialogue-greyvale-garren-content.test.js`
- `backend/test/dialogue-greyvale-rusk-content.test.js`
- `backend/test/dialogue-greyvale-fixture-regression.test.js`

The existing legacy node/option dialogue files in `content/dialogue/greyvale` remain intact. The new Focus/Commit fixtures live under `content/dialogue_focus_commit/greyvale` so the legacy Greyvale importer does not mistake them for the older dialogue-graph format.

## Scene Summary

`greyvale_elin_memory_dialogue` centers on Elin Harrow at the Grey Road Inn hearth after the Grey Road attack.

`greyvale_tomas_roadside_worries_dialogue` centers on Tomas Rell at the Grey Road Inn, preserving the Pattern of Attacks clue and pointing toward Elin through the existing `elin-memory-fragments` exploration scene.

`greyvale_mara_dunmere_pressure_dialogue` centers on Mara Vellin in Dunmere village, preserving Mara's Assumption as the canonical `dunmere_wants_simple_answer` clue and keeping the bandit explanation useful but incomplete.

`greyvale_lysa_grief_suspicion_dialogue` centers on Lysa Fen in Dunmere village, preserving Lysa's Suspicion as the canonical `village_blames_hunter_and_road` clue and keeping suspicion emotionally meaningful but unconfirmed.

`greyvale_garren_path_knowledge_dialogue` centers on Garren Holt in Dunmere village, preserving Garren's Observation as the canonical `tracks_converge_on_shrine` clue and keeping shrine-route direction respect-sensitive without confirming Garren as a culprit.

`greyvale_rusk_at_the_shrine_dialogue` centers on Rusk at the shrine ruins, preserving Bandit Instability as the canonical `bandits_not_fully_self_directed` clue and keeping the combat/deeper-source handoff explicit without directly solving the shrine threat through dialogue.

The fixture covers:

- Conversation surface with narrative-first Greyvale prose.
- Passive Social Insight around Elin avoiding the old shrine bell.
- No-check Clarifying Questions.
- Checked Clarifying Question with persisted failure behavior.
- Clarifying Question unlocks.
- Canonical and non-canonical Clarifying Question behavior.
- Checked and no-check Committed Social Moves.
- Overlap warning from shallow submitted text into an available Clarifying Question.
- Generic fallback success, failure, usage tracking, and exhaustion.
- Persistent NPC relationship state: `trust`, `respect`, `hostility`.
- Scene-local posture/state: `openness`, `fear`, `pressure`, `stability`.
- Garren scene-local posture/state: `guardedness`, `pressure`, `openness`, `caution`.
- Rusk scene-local antagonist state: `instability`, `control`, `pressure`, `focus`, `fracture`.
- Authored exits with explicit transition targets.
- Garren's live route exit targets `old-forest-path`; `shrine_path_known` and `shrine-ruins` scene-unlock intent are preserved as authored output metadata.
- Rusk's combat handoff uses `combat_pending` / `shrine_confrontation_ready` metadata tied to `shrine-rusk-confrontation`.
- Rusk's hollow lead preserves `shrine_depth_unlocked`, `understanding_high`, `hollow_reaches_shrine_above`, and `subterranean-hollow` scene-unlock intent without bypassing `surface_threat_resolved`.
- Transcript turns, completed record finalization, authored summary, generated-summary variant coverage, archive/search visibility, lifecycle annotation safety, GM/dev debug workspace data, and path harness runs.

## Named Paths

`elin-memory-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `failure_path`
- `fallback_path`
- `minimal_interaction_path`
- `max_clarifying_question_path`
- `relationship_state_edge_case`
- `exit_transition_path`

`tomas-roadside-worries-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `transition_path`
- `max_clarifying_question_path`
- `relationship_state_path`

`mara-dunmere-pressure-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`
- `max_clarifying_question_path`

`lysa-grief-and-suspicion-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`
- `max_clarifying_question_path`

`garren-path-knowledge-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `relationship_state_path`
- `transition_path`
- `max_clarifying_question_path`

`rusk-at-the-shrine-focus-commit.expected-paths.json` defines these regression modes:

- `happy_path`
- `refusal_or_failure_path`
- `fallback_path`
- `minimal_exit_path`
- `instability_state_path`
- `combat_transition_path`
- `deeper_source_transition_path`
- `max_clarifying_question_path`

Each path is run through `POST /api/dev/dialogue-path-test/run` using the real dialogue runtime services. Non-validation path runs mutate the current GM/dev test context and must pass `allow_active_runtime_mutation=true`.

## Visibility Safety

Player-facing assertions reject debug-only markers such as:

- `raw_runtime_state`
- `preview_mapping`
- `matched_move_confidence`
- `relationship_audit`
- `old_value_json`
- `new_value_json`
- `preview_confidence`
- `secret_requirement`
- `gm_dev_content_ref`

GM/dev workspace tests verify those diagnostics remain available only through authorized dev routes.

## Stage 6B.12.6 Regression Inventory

`backend/test/dialogue-greyvale-stage6b12-regression.test.js` is the fast non-DB companion to the DB-backed fixture regression. It validates:

- all six converted scene files and expected-path files exist;
- scene ids and slugs are unique;
- every scene validates with the `playtest_ready` profile;
- the runtime registry resolves each scene by id and slug after test registration;
- required named paths exist for Tomas, Elin, Mara, Lysa, Garren, and Rusk;
- NPC, scene, objective, reward, and handoff references resolve against Greyvale source content;
- relationship/social state writes target defined fields;
- player-facing archive/search hooks avoid debug-only terms;
- continuity anchors preserve the intended clue/objective chain without exposing final-mystery internals;
- legacy dialogue source files remain available and non-conflicting.

Elin's `grey_road_inn_common_room` and `grey_road_inn_hollow_path` remain accepted local exploration context ids. They are not production scene slugs, and the regression suite treats them as established local handoff targets rather than broken references.

## Commands

Run the focused Greyvale regression:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
node --test backend\test\dialogue-greyvale-fixture-regression.test.js
```

Run the non-DB Tomas/Elin content validation:

```powershell
node --test backend\test\dialogue-greyvale-tomas-content.test.js
```

Run the non-DB Mara/Lysa content validation:

```powershell
node --test backend\test\dialogue-greyvale-mara-lysa-content.test.js
```

Run the non-DB Garren content validation:

```powershell
node --test backend\test\dialogue-greyvale-garren-content.test.js
```

Run the non-DB Rusk content validation:

```powershell
node --test backend\test\dialogue-greyvale-rusk-content.test.js
```

Run the final non-DB Stage 6B.12 regression inventory:

```powershell
node --test backend\test\dialogue-greyvale-stage6b12-regression.test.js
```

Run the broader backend suite:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
npm --prefix backend test
```

Run Flutter checks:

```powershell
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
```

Build hosting and player web output:

```powershell
npm run build
$env:PATH='C:\Users\Joshu\CodexTools\flutter\bin;' + $env:PATH
npm run build:player
```

## Current Limitations

- The fixtures are loaded into the runtime registry by tests. Production content-import wiring for Dialogue Focus/Commit scene JSON remains a future integration step.
- The path harness still uses the active GM/dev test context rather than an isolated sandbox state.
- The fixtures intentionally stay narrow; they prove the stack without expanding Greyvale into a large dialogue content pack.
