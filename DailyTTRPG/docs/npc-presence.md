# NPC Schedules, Presence, and Routine Overrides

Stage 5J.3 adds a generic NPC presence layer on top of the living-world state and environment systems.

The core rule is:

```text
authored NPC definition
+ authored schedule
+ current environment time block
+ world/entity state
+ explicit overrides
+ character knowledge
= character-facing NPC presence
```

Schedules are defaults. Runtime world/entity state is truth.

## Authoring Model

NPC templates now support:

- `true_name`
- `public_role_label`
- `unknown_label`
- `aliases`
- `default_location_id`
- `default_scene_id`
- `default_visibility`
- `default_availability`
- `default_actions`
- `identity`
- `schedule`

Schedules use the 5J.2 environment time blocks by default:

- `dawn`
- `morning`
- `midday`
- `afternoon`
- `evening`
- `night`
- `late_night`

Custom labels are also supported through `custom_time_label`, for future events such as `market_day`, `festival_night`, or `siege_watch`.

## Identity Rules

NPC identity is character-limited.

- Public figures can show `true_name` when `identity.publicly_known` is true.
- Characters who know `identity.knowledge_id_for_true_name` see `true_name`.
- Role-known NPCs can show `public_role_label`, such as `the innkeeper`.
- Unknown NPCs can show `unknown_label`, such as `a shaken woman`.
- GM notes and hidden identity fields are never returned to normal player scene views.

## Override Hierarchy

NPC presence follows this priority:

```text
dead / removed / archived / defeated
> explicit entity state override
> scene lock
> condition state such as captured, fleeing, hiding, unconscious
> schedule
> default location
```

World/entity state lives in `dnd5e_world_entity_state`. Meaningful NPC state changes should be made through `applyNpcStateMutation`, which writes state and creates a `npc_state_changed` world event.

## Scene View Contract

`CharacterSceneViewService` and `GET /api/play/current-scene` now return:

- `visible_npcs`
- `known_relevant_npcs`
- NPC-derived entries in `visible_affordances`

Normal player responses include only character-facing labels and safe activity text. Dev/debug mode can include presence source breakdowns.

## NPC-Derived Affordances

Visible NPCs become affordances when appropriate:

```json
{
  "affordance_id": "npc:tomas-rell",
  "label": "the innkeeper",
  "tags": ["npc"],
  "actions": ["observe", "talk"],
  "source": "npc_presence",
  "npc_id": "tomas-rell"
}
```

Unavailable NPCs may only allow `observe`. Hidden and absent NPCs do not create primary scene affordances.

## Known Relevant Absent NPCs

Absent NPCs are not shown in the primary scene view. A secondary `known_relevant_npcs` list may show a known NPC if the character knows them and the NPC is relevant to the current objective, location, or recent events.

This list must not reveal hidden locations, hidden deaths, captures, or GM-only state.

## Greyvale Proof Content

The starter content now includes:

- Tomas Rell as the role-known innkeeper with morning, afternoon, evening, and night schedule entries.
- Elin Harrow as `a shaken woman` until the character gains `knows_elin_name`.
- Grey Road Travelers as a group NPC in the inn common room.

The Whispering Presence is explicitly hidden by default and does not appear in normal NPC presence output.

## Future Hooks

This foundation prepares for:

- richer Flutter scene UI sections for present people and known absent people
- GM schedule overrides
- event-driven NPC movement
- dialogue availability checks against NPC presence
- future NPC routines beyond coarse time blocks

## Manual Verification

1. Load or import the Greyvale content package.
2. Create a Greyvale world instance and active character in the Grey Road Inn.
3. Set environment `time_of_day` to `evening`.
4. Request `/api/play/current-scene`.
5. Verify Tomas appears as `the innkeeper`.
6. Verify travelers appear as a group.
7. Verify Elin appears as `a shaken woman`.
8. Grant `knows_elin_name` to the active character.
9. Verify Elin now appears as `Elin Harrow`.
10. Set Tomas `alive=false` or status `dead` with `applyNpcStateMutation`.
11. Verify Tomas no longer appears despite his evening schedule.
12. Move Tomas to `dunmere-village` with an override.
13. Verify he appears in Dunmere and not at the inn.
14. Confirm `dnd5e_world_event` contains `npc_state_changed`.

See `docs/examples/npc-presence/` for copy-paste JSON examples.
