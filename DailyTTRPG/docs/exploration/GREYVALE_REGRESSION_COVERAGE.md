# Greyvale Exploration Mechanics Regression Coverage

Stage 6B.11.6 adds focused regression coverage for the Exploration Mechanics Inspector against Greyvale / Shadows on the Grey Road content. The goal is to prove that GM/dev mechanics inspection is rich while normal player-facing Greyvale play remains clean.

## Coverage Sources

### Live imported Greyvale content

Backend regression imports `content/worlds/greyvale`, which pulls the active Shadows on the Grey Road content package:

- `content/scenes/greyvale/scenes.json`
- `content/scenes/greyvale/transitions/greyvale-transitions.json`
- `content/campaigns/shadows_grey_road/interactions/greyvale-interactions.json`
- `content/campaigns/shadows_grey_road/affordances/greyvale-exploration-affordances.json`
- `content/campaigns/shadows_grey_road/environment_flavors/greyvale-environment-flavors.json`
- `content/campaigns/shadows_grey_road/environment_modifiers/greyvale-environment-modifiers.json`
- `content/entities/greyvale/npcs/greyvale-npcs.json`
- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`

The live backend suite currently exercises the starting scene:

- Scene: `broken-caravan-site`
- Free Focus / Closer Look: `focus_broken_axle`, `focus_scattered_cargo`, `focus_roadside_mud`
- Passive Discovery: `notice_deep_tracks`, `notice_attack_not_looting`
- Beat Actions: `inspect-broken-caravan`, `examine-roadside-tracks`, `check-for-survivors`
- Transition coverage: authored transition targets from Broken Caravan toward later Grey Road content
- Environment coverage: current scene environment context and flavor/debug metadata

### Representative Flutter payload

Flutter widget regression uses a Broken Caravan-style inspector payload based on the live read-model shape. It includes representative entries for:

- Hidden DC/check details
- Result bands
- Environment modifiers
- NPC identity/schedule debug
- State reads and writes
- Knowledge/history outputs
- Transitions
- Audit timeline
- Visibility boundaries

This keeps widget tests deterministic and avoids depending on a live backend from Flutter tests.

## Backend Regression Tests

File:

- `backend/test/exploration-greyvale-mechanics-regression.test.js`

Coverage:

- GM/dev debug read model loads for the real Greyvale Broken Caravan start scene.
- Debug payload includes scene state, surface context, passive discoveries, Free Focus items, Beat Actions, check details, result bands, environment modifiers, transitions, audit timeline, validation, and visibility boundaries.
- Checked Free Focus and checked Beat Action mechanics expose GM/dev check metadata.
- No-check Free Focus is represented as `no_check` / `not_applicable`.
- Authored result-band state mutation and knowledge grant summaries are inspectable where available.
- Player-facing endpoints remain clean across current scene, action preview, Free Focus resolution, history, knowledge, and character sheet.
- Overlap preview for a shallow Broken Caravan action returns player-safe options without exposing hidden Closer Look internals.
- Submitted action plus `/api/dev/advance-beat` creates an explainable resolution path with selected result band and player-safe latest/current scene output.
- Normal and unauthenticated accounts cannot load `/api/dev/exploration-mechanics`; authorized GM/dev accounts with `can_advance_beats` can.

## Frontend Regression Tests

File:

- `apps/player_app/test/exploration_mechanics_greyvale_regression_test.dart`

Coverage:

- Normal player scene context does not render the Exploration Mechanics entry point.
- GM/dev inspector renders all planned panels against a Greyvale Broken Caravan payload.
- Inspector displays Broken Caravan Free Focus, Beat Action, check, result band, environment, NPC, state, knowledge/history, transition, audit, validation, and visibility boundary data.
- Selecting a Free Focus item updates linked inspector context.

## Player-Facing Boundary Coverage

The Greyvale backend regression reuses the Stage 6B.11.5 forbidden player-facing debug key checks. Covered player-facing surfaces include:

- `/api/play/current-scene`, including player-safe `include_mechanics=true`
- `/api/play/action/preview`
- `/api/play/free-focus/resolve`
- `/api/play/action/submit`
- `/api/play/campaign/history`
- `/api/play/campaign/knowledge`
- `/api/play/characters/:character_id`

Assertions reject hidden DCs, raw rolls, result-band internals, GM notes/summaries, instrumentation status, raw state reads/writes, hidden environment/NPC/knowledge/history/transition internals, audit timeline, validation debug notices, and visibility boundary sections.

## Commands

Backend targeted Greyvale regression:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
node --test --test-concurrency=1 test\exploration-greyvale-mechanics-regression.test.js
```

Stage 6B.11 backend regression set:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
node --test --test-concurrency=1 test\exploration-mechanics-debug-read-model.test.js test\exploration-mechanics-visibility-boundary.test.js test\exploration-greyvale-mechanics-regression.test.js
```

Flutter Greyvale inspector smoke:

```powershell
C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat test test\exploration_mechanics_greyvale_regression_test.dart
```

Flutter inspector and boundary regression:

```powershell
C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat test test\exploration_mechanics_inspector_test.dart test\exploration_mechanics_visibility_boundary_test.dart test\exploration_mechanics_greyvale_regression_test.dart
```

## Known Gaps

- The live backend regression currently exercises `broken-caravan-site` only. Grey Road Inn, Old Forest Path, Shrine Ruins, and Subterranean Hollow remain good candidates for broader Stage 6B.12 or later content regression.
- Live Broken Caravan backend data does not currently produce non-empty runtime `state_reads` from exact read logging; the inspector honestly reports available authored/result-band explainability without fabricating runtime reads.
- Live beat-action knowledge outputs are currently most inspectable through authored result-band summaries and player-facing knowledge/history endpoints; the dedicated `knowledge_outputs` debug section is richer for persisted Free Focus results than for all beat-result provenance.
- Live NPC schedule/hidden identity inspection is represented in Flutter mock coverage. A future backend fixture should drive a scene such as `grey-road-inn` or `shrine-ruins` when scene navigation/path setup becomes lightweight enough for routine tests.
- Full multi-scene path regression for Broken Caravan -> Inn -> Forest Path -> Shrine -> Hollow remains outside this focused 6B.11.6 pass.
