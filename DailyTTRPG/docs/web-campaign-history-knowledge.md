# Stage 6B.6 - Scene Results, History, and Knowledge

Stage 6B.6 makes beat resolution visible inside the web scene experience.

The player-facing model is:

1. A player submits one validated action for the current open action window.
2. A scheduler or authorized dev/GM advances the beat through the real runtime.
3. The runtime closes and resolves the current action window, applies canonical state changes, and opens the next action window.
4. A character-safe beat result read model is persisted for the scene, history, and journal UI.
5. `/play/campaign/scene` refreshes and shows the latest result highlighted near the scene narrative.

There is no required acknowledgement gate and no separate result route for the MVP.

## Read Model

Canonical campaign logs, state mutations, action submissions, character knowledge, and objective state remain source of truth. The `dnd5e_player_beat_result` table is a stable player-facing read model for UI display.

The read model stores:

- campaign, world instance, character, scene, and location references
- action window and submitted action references
- scene type: `exploration`, `dialogue`, `combat`, or `unknown`
- result title, summary, and narration
- submitted and interpreted action summaries
- visible changes, knowledge gained, objective updates, and safe mechanics
- provenance back to the action window, submitted action, runtime action data, and canonical campaign log/event IDs where available

The read model is idempotent by `(action_window_id, character_id)` so double-clicking dev/GM advance does not create duplicate player-facing results for the same beat.

## Current Scene Contract

`GET /api/play/current-scene` includes:

```json
{
  "scene_result_feed": {
    "scene_id": "123",
    "scene_type": "exploration",
    "result_display_mode": "exploration_continuity",
    "latest_result": {},
    "recent_entries": [],
    "max_entries": 5
  }
}
```

The scene feed is scoped to the active character, active campaign, and current scene. The latest entry is marked with `is_latest` and `highlight`.

## Scene Rendering

`/play/campaign/scene` renders:

- base scene description
- latest result highlighted directly beneath the description
- recent scene-local results, usually the last 3-5 entries
- visible changes, knowledge gained, and objective updates near the latest result
- expandable safe mechanics
- action composer remains available when the next action window is open

Scene display modes:

- Exploration: Latest Development / Recent Developments
- Dialogue: Latest Exchange / Recent Conversation
- Combat: Latest Action / Recent Combat Log

## Campaign History

`GET /api/play/campaign/history` returns a character-visible timeline from the player-facing beat result read model.

Flutter route:

```text
/play/campaign/history
```

The UI shows beat results, submitted action summaries, result summaries, scene/location context, visible changes, objective updates, major discoveries, timestamps, and expandable safe mechanics.

This is not a GM/debug event log and does not expose raw event payloads.

## Knowledge Journal

`GET /api/play/campaign/knowledge` returns practical character knowledge from the 5J character knowledge model.

Flutter route:

```text
/play/campaign/knowledge
```

Sections:

- current objective
- clues
- facts
- rumors and uncertain claims
- people
- locations
- objective discoveries

Only character-known facts are returned. Hidden truth, GM notes, hidden NPC state, unknown true names, and undiscovered clues must not be included.

Knowledge entries include a source label when provenance is available. If a known fact can be tied back to a player-facing beat result through canonical event/log provenance, the journal returns that beat result as the source rather than exposing raw event payloads.

## Safe Mechanics

Expanded result details may show:

- submitted and interpreted action
- visible check outcome such as success/failure
- visible combat status when available
- objective/knowledge changes the character has learned

Normal player responses must not show:

- hidden DCs
- secret outcome bands
- hidden failed checks
- hidden NPC attitudes
- GM notes
- raw event payloads
- future scene content

## Manual Checklist

1. Sign in.
2. Open `/play/campaign/scene`.
3. Submit an action with the action composer.
4. Advance the beat with an authorized dev/GM account.
5. Confirm the page stays on `/play/campaign/scene`.
6. Confirm the latest result appears highlighted below the scene narrative.
7. Confirm older results for the same scene appear in the recent scene log.
8. Confirm the action composer remains available if the next action window is open.
9. Open `/play/campaign/history` and confirm the beat appears in the timeline.
10. Open `/play/campaign/knowledge` and confirm known facts/clues appear without hidden truth.
