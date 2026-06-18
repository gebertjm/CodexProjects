# Stage 5J.2 Environment Context And Rich Description Overlays

DailyTTRPG scene descriptions are now assembled from authored scene text plus a reusable environment layer. The goal is richer character-facing presentation without runtime AI prose.

Core rule:

```text
authored scene description
+ effective environment context
+ world/location/scene state
+ character knowledge
+ authored flavor overlays
= character-facing rich scene description
```

Authored content defines the flavor entries and modifiers. Mutable environment state lives in the database. Character knowledge still controls what a player can see.

## Environment State

Environment state can exist at four scopes:

- `world`: broad defaults such as season, regional weather, and time block.
- `region`: optional regional variation.
- `location`: local variation such as inn interior, road, woods, village.
- `scene`: immediate override such as tense common room or foggy caravan site.

Effective priority:

```text
scene override > location override > region override > world state > content default
```

The database table is `dnd5e_environment_state`. Use `EnvironmentStateService` to read or mutate it:

- `getEffectiveEnvironment({ worldInstanceId, locationId, sceneId, regionId })`
- `setEnvironmentOverride({ worldInstanceId, scopeType, scopeId, values, reason })`
- `clearEnvironmentOverride({ worldInstanceId, scopeType, scopeId })`
- `advanceTime({ worldInstanceId, amount })`
- `maybeTransitionWeather({ worldInstanceId, transitionTable })`

Meaningful changes create `dnd5e_world_event` rows such as `environment_override_set`, `environment_override_cleared`, `time_advanced`, and `weather_changed`.

## Context Fields

Supported baseline fields:

- `weather`: `clear`, `cloudy`, `rain`, `heavy_rain`, `storm`, `fog`, `wind`, `snow`
- `time_of_day`: `dawn`, `morning`, `midday`, `afternoon`, `evening`, `night`, `late_night`
- `season`: `spring`, `summer`, `autumn`, `winter`
- `light_level`: `bright`, `dim`, `dark`, `magical`, `firelit`, `moonlit`
- `temperature_band`: `freezing`, `cold`, `cool`, `mild`, `warm`, `hot`, `sweltering`
- `wind`: `still`, `light`, `moderate`, `strong`, `gale`
- `visibility`: `clear`, `dim`, `obscured`, `heavily_obscured`
- `location_environment`: `road`, `inn`, `village`, `forest`, `shrine`, `lowlands`, `interior`, `exterior`, `cave`, `ruin`, `field`, `river`, `camp`
- `mood_or_tone`: `calm`, `uneasy`, `tense`, `somber`, `watchful`, `dangerous`, `hopeful`, `mysterious`, `quiet`

`terrain_or_biome` and `precipitation` remain string fields so packages can add world-appropriate tags without schema churn.

## Flavor Entries

Environment flavor lives in content packages under `environment_flavors`. A flavor entry is authored prose that may be filtered by weather, time, season, tags, mood, known facts, or world flags.

Description slots:

- `weather_overlay`
- `time_overlay`
- `season_overlay`
- `light_overlay`
- `location_mood`
- `sound_overlay`
- `smell_overlay`
- `crowd_overlay`
- `state_change_overlay`
- `character_knowledge_overlay`

Selection behavior:

- Normal runtime uses weighted selection.
- Debug/tests use deterministic selection.
- Seeded debug mode is supported by the selector.
- Recent usage is tracked in `dnd5e_environment_flavor_usage` to avoid immediate repeats.
- If every matching entry is in cooldown, the selector can gracefully fall back rather than fail rendering.

Flavor text must not contain GM-only notes, debug IDs, or hidden truth unless gated behind `requires_known_facts`.

## Description Assembly

`EnvironmentDescriptionService` assembles final descriptions. It loads:

- base authored scene text
- effective environment
- selected flavor overlays
- known character facts
- scene/world state tags when available

`CharacterSceneViewService` now uses this assembler, so `GET /api/play/current-scene` returns an environment-enhanced `scene.description`.

Player response includes:

- final scene description
- visible affordances
- known facts
- environment summary

Debug/admin response can include:

- selected flavor IDs
- description components
- environment source breakdown
- selector filtering reasons

## Mechanical Modifiers

Environmental modifiers are explicit content, not hidden arbitrary penalties.

Example:

```json
{
  "id": "heavy_rain_survival_tracking",
  "environment_id": "heavy_rain",
  "check_type": "skill",
  "skill": "survival",
  "context": "tracking",
  "modifier": -2,
  "reason": "Heavy rain distorts tracks and washes smaller signs into the mud."
}
```

Main narrative should make pressure obvious:

```text
Rain has softened the road into dark mud, blurring wagon ruts and washing smaller tracks into the ditch.
```

Raw mechanics stay in `mechanical_details`, available to the Flutter app as an inspectable layer. `resultBandService.resolveResultBand` can accept `environment_modifiers` and apply them to the check total when provided by the caller.

## Greyvale Proof Content

The Greyvale package now includes:

- Broken Caravan foggy morning overlay.
- Broken Caravan rainy evening overlay.
- Grey Road Inn rainy evening overlays.
- Grey Road Inn quiet night mood overlay.
- Autumn lowlands flavor.
- Heavy rain, rain, fog, and darkness modifiers.

These examples are in:

- `content/campaigns/shadows_grey_road/environment_flavors/greyvale-environment-flavors.json`
- `content/campaigns/shadows_grey_road/environment_modifiers/greyvale-environment-modifiers.json`

## Future Hooks

Stage 5J.3 NPC schedules can use the same effective environment and event log to decide NPC presence. Future Flutter rich scene UI should show:

- rich description by default
- environment summary as ambient context
- mechanics in a collapsed detail view
- GM/debug components only for authorized users

Future GM tools can call `EnvironmentStateService` to override weather, time, visibility, and mood. Future visual presentation can map `EnvironmentContext` to background art, palettes, and ambient effects.

## Manual Verification

1. Load or import the Greyvale content package.
2. Create a Greyvale world instance and active character/campaign.
3. Set world environment to `autumn`, `rain`, `evening`.
4. Set the Grey Road Inn location environment to `inn`, `interior`, `quiet`.
5. Request `/api/play/current-scene?include_debug=true&include_mechanics=true`.
6. Verify the scene description includes authored rain/evening flavor.
7. Verify debug shows selected flavor IDs and source breakdown.
8. Change weather to `clear` and time to `morning`.
9. Verify the description changes or falls back to base scene text without failure.
10. Query heavy rain tracking modifiers and verify `Survival tracking: -2` appears in mechanics, not main narrative.
11. Verify `dnd5e_world_event` records environment changes.
