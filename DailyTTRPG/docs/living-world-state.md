# Living World State and Character Knowledge

Stage 5J.1 establishes the foundation for web-first living campaigns.

The core rule is:

**Authored content defines what can happen. Database state records what has happened. Character knowledge controls what a player can see. Events record every meaningful change.**

## Architecture

DailyTTRPG uses hybrid storage:

- Authored definitions stay in content packages and files: worlds, scenes, affordances, interactions, knowledge definitions, objectives, and result bands.
- Mutable runtime truth lives in the database: world instances, entity state, location state, scene state, affordance state, character knowledge, objectives, action windows, and event history.
- State tables are authoritative today. `dnd5e_world_event` records structured audit/replay history for future GM tooling, repair tools, and projections.

## World Instances

`dnd5e_world_instance` represents a running copy of an authored world.

By default, world truth is shared at the world-instance level. If Tomas dies in one Greyvale world instance, every character in that same instance should see that truth unless a future private override explicitly changes scope.

Campaigns now reference `world_instance_id`. Existing campaigns are attached to a shared default instance per world.

## Runtime State Tables

Stage 5J.1 adds or formalizes:

- `dnd5e_world_entity_state` for NPC/object state such as alive/dead, disposition, and current location.
- `dnd5e_world_location_state` for persistent location changes such as a blocked road or damaged inn.
- `dnd5e_world_scene_state` for persistent scene changes such as `caravan_investigated`.
- `dnd5e_world_scene_affordance_state` for shared affordance lifecycle state.
- Existing SMS affordance state remains intact for transport-specific behavior.

## Character Knowledge

Knowledge is per-character, never per-account.

One account can own two characters in the same world instance, where Character A knows `attack_staged` and Character B does not.

`CharacterKnowledgeService` provides:

- `grantKnowledge`
- `hasKnowledge`
- `listKnowledgeForCharacter`
- `listKnownClues`
- `listKnownEntityFacts`

Knowledge definitions are authored in content packages. Runtime grants create `dnd5e_character_knowledge` rows and link to source events where available.

## Content Schema

Content packages can now include:

- `knowledgeDefinitions` in `knowledge/*.json`
- `sceneAffordances` in `affordances/*.json`
- `result_bands` on scene interactions

Greyvale proof files:

- `content/campaigns/shadows_grey_road/knowledge/greyvale-living-world-knowledge.json`
- `content/campaigns/shadows_grey_road/affordances/greyvale-exploration-affordances.json`
- `content/campaigns/shadows_grey_road/interactions/greyvale-interactions.json`

Copy-paste examples live in `docs/examples/living-world-state/`.

## Result Bands

Interactions can define authored skill-check result bands:

- `failure`
- `partial_success`
- `success`
- `great_success`
- `critical_success`

Each band provides authored result text, knowledge grants, objective updates, and state changes. The resolver selects a band from the check total and never generates canonical story text itself.

## Mutation Flow

`WorldStateMutationService` applies interaction results:

1. Create a `dnd5e_world_event`.
2. Apply scene, location, entity, or affordance state changes.
3. Grant per-character knowledge.
4. Update the event with the applied state and knowledge summary.
5. Return a structured mutation summary.

The service is transaction-backed where the database supports it.

## Character Scene View

`CharacterSceneViewService` assembles:

authored content + world instance state + campaign/runtime state + character knowledge = character-facing scene view.

The frontend should use backend views instead of deciding what the character knows.

Endpoint:

`GET /api/play/current-scene`

Behavior:

- Requires Firebase-authenticated account.
- Uses the active character and active campaign by default.
- Supports `character_id` and `campaign_instance_id` when authorized.
- Returns clean no-character/no-campaign states.
- Hides unknown clues, hidden truth, GM notes, and debug data.
- `include_debug=true` is only honored outside production for accounts with `account.can_advance_beats = TRUE`.

## Future Hooks

This stage prepares, but does not fully implement:

- Environment overlays such as weather, season, light, or magical pressure.
- NPC schedules and routines.
- Flutter rich scene UI.
- GM dashboard hooks, edits, overrides, and audit views.
- Replay/projection tooling from event history.

## Manual Verification

1. Load or import the Greyvale package.
2. Create two characters in the same campaign/world instance.
3. Have Character A resolve `inspect-broken-caravan` with a successful or great-success result band.
4. Verify `caravan_irregularity` is granted to Character A.
5. Verify `caravan_wreck` is resolved in shared affordance state.
6. Verify `strange_tracks` becomes available.
7. Verify Character B sees shared scene changes where appropriate.
8. Verify Character B does not know Character A's private clue unless granted.
9. Verify `dnd5e_world_event` contains the interaction/state/knowledge event.
10. Verify `/api/play/current-scene` returns a character-specific view without hidden truth.

## Test Commands

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend test
npm --prefix backend run cli -- validate-content --path ..\content\worlds\greyvale
npm --prefix backend run cli -- import-content --path ..\content\worlds\greyvale --dry-run
```

Flutter commands are only available on machines with Flutter installed:

```powershell
flutter test
flutter analyze
flutter build web
```
