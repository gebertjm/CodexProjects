# Stage 6B.15.2 - Exploration Segment Playability Pass

Status: implemented  
Build: Stage 6B.15.2  
Primary predecessor: Stage 6B.15.1 Slice Entry, Start/Resume, and Initial State

## Purpose

Stage 6B.15.2 hardens the exploration-only spine of the Greyvale playable vertical slice. A logged-in web player with one active character can start Greyvale, read the current exploration scene, use Free Focus, commit Beat Actions, follow existing scene transitions, discover required dialogue entry points, and resume at the shrine approach without dev-only route editing.

This stage does not implement open-world navigation, combat, AI narration, SMS requirements, major content additions, or the dialogue playability pass.

## Confirmed Exploration Route

The bounded exploration route for the 6B.15 slice is:

1. `broken-caravan-site` - starting exploration scene from the web start/resume flow.
2. `leave-broken-caravan-for-inn` - transition to `grey-road-inn`.
3. `grey-road-inn` - inn hub with Tomas and Elin dialogue entry points plus `continue-to-dunmere`.
4. `continue-to-dunmere` - transition to `dunmere-village`.
5. `dunmere-village` - village hub with Mara, Lysa, and Garren dialogue entry points plus `follow-the-old-path`.
6. `follow-the-old-path` - transition to `old-forest-path`.
7. `track-the-old-path` - route-unlock exploration action that can set `shrine_path_known`.
8. `follow-the-tracks-to-the-shrine` - gated transition to `shrine-ruins` once `shrine_path_known` is true.
9. `shrine-ruins` - shrine approach with Rusk dialogue entry point and shrine Free Focus.

The route stays constrained to existing scene transitions. It does not introduce open-world navigation.

## Runtime And Read Model Hardening

The playability gap found in this build was that authored scene affordances could hide runtime transition opportunities from the player-facing scene read model. This made important route actions such as `continue-to-dunmere` or `follow-the-old-path` difficult or impossible to discover in the web action composer.

The fix keeps authored affordances and merges in live runtime opportunities, deduping by stable interaction, transition, and action references. Runtime opportunities now receive player-facing verbs such as `move`, `talk`, or `investigate` instead of exposing raw runtime action types.

Travel intent parsing was also expanded so player phrasing like "head to", "continue to", "travel to", "return to", and "take the path" resolves as movement through existing transitions.

## Free Focus Behavior

The route test verifies that `focus_broken_axle` resolves from the starting scene and remains non-committing:

- It does not create a committed web action submission.
- It returns a player-safe `free_focus_result`.
- It leaves the Beat Action window available.

The existing committed-followup behavior remains intact: shallow inspect language can be offered as a closer look first, and the player can then confirm it as the committed Beat Action through the existing `continue_free_focus_interaction_id` flow.

## Beat Action Behavior

The route test verifies the Broken Caravan committed action path:

- Preview is player-safe and does not commit.
- Submit creates one committed action.
- Dev/GM beat advance resolves the action into a player-safe result.
- A new action window opens afterward.
- A player beat result record is created once.

The caravan check can succeed or fail under existing lightweight check behavior. On success, the journal may include the authored `caravan_axle_was_sabotaged` clue. On failure, the player still receives clear result feedback and the exploration route remains playable.

## Outputs And Transitions

The test verifies:

- Starting objective `witness-the-aftermath` is present at the opening scene.
- Latest result or recent summary is present after committed action resolution.
- Player-facing knowledge payloads remain hidden-data safe.
- `shrine_path_known` gates the shrine transition as intended.
- The shrine transition is hidden before the route flag and visible afterward.
- Refresh/resume at `shrine-ruins` preserves the current scene and action-needed state.

The direct route-unlock setup for `track-the-old-path` uses deterministic service-level resolution to avoid dice flake in the regression. Full knowledge/objective journal persistence for output-heavy paths remains covered by Stage 6B.13.3 output consistency tests and Stage 6B.15.4 memory/recap regression.

## Exploration-To-Dialogue Entry Points

The player-facing exploration read model now exposes required dialogue entries along the route:

- `grey-road-inn`: Tomas Rell and Elin Harrow.
- `dunmere-village`: Mara Vellin, Lysa Fen, and Garren Holt.
- `shrine-ruins`: Rusk.

This build only verifies exploration-side discoverability. Dialogue page playability and completion flow remain scoped to 6B.15.3.

## GM/Dev Diagnostics

The route test verifies authorized GM/dev diagnostics at the shrine approach through `/api/dev/exploration-mechanics`:

- Current scene is reported as `shrine-ruins`.
- Transition diagnostics are present.
- The debug payload remains behind GM/dev capability.

Normal player payloads are checked with a hidden-data denylist.

## Tests

Added:

- `backend/test/stage6b15-exploration-playability.test.js`

Updated:

- `backend/package.json` includes the 6B.15.2 test in `test:greyvale-full-loop`.

Primary command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg npm --prefix backend run test:greyvale-full-loop
```

Targeted command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg node --test --test-concurrency=1 backend/test/stage6b15-exploration-playability.test.js
```

## Deferred Work

- Dialogue interaction quality, CQ/CSM affordance clarity, and completed dialogue return flow: 6B.15.3.
- Full objective, knowledge, history, archive, and end-state recap across the complete slice: 6B.15.4.
- Shrine/Rusk endpoint completion and combat_pending/future_supported boundary: 6B.15.5.
- Broad player UI recovery and rendered responsive polish: 6B.15.6.
- Open-world navigation remains future work for 6G.
- Combat remains future work for 6I.
