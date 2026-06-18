# Stage 6B.15.5 - Rusk Boundary, Slice Completion, and Future-Supported Handoff

## Scope

Stage 6B.15.5 defines the current Greyvale vertical-slice endpoint at the Rusk shrine confrontation. The endpoint is intentionally a boundary, not playable combat.

The official endpoint route remains:

1. Start Greyvale at the Broken Caravan.
2. Move to the Grey Road Inn and complete Tomas / Elin local insight.
3. Move to Dunmere and complete Mara / Lysa / Garren village leads.
4. Follow Garren's old-path lead to the shrine route.
5. Reach `shrine-ruins`.
6. Complete the Rusk dialogue path through `exit_rusk_combat_pending`.

## Runtime Behavior

The endpoint is derived from existing Greyvale state rather than a new table or migration:

- `scene.key === shrine-ruins`
- `combat_pending === true`
- `shrine_confrontation_ready === true`
- Greyvale campaign/world context

The helper lives at:

- `backend/src/services/greyvaleSliceEndpointService.js`

The player read model now exposes a safe `slice_endpoint` object when the boundary is reached. It uses player-safe language such as "Greyvale slice endpoint reached" and "combat support is enabled" rather than internal routing labels.

The current scene action status is projected as:

- `state: slice_endpoint_reached`
- `can_submit: false`
- `can_edit: false`

This prevents the player from seeing a normal open action window after reaching the unsupported combat boundary. Direct exploration action preview/submit calls are also safely blocked with an endpoint message.

## GM/Dev Diagnostics

Authorized debug views keep the internal handoff details under `debug.slice_endpoint`:

- `handoff_kind: combat_pending`
- `future_supported_status: future_supported_until_combat_system`
- `target_encounter_id: shrine-rusk-confrontation`
- `source_dialogue_scene_id: greyvale_rusk_at_the_shrine_dialogue`
- `source_exit_id: exit_rusk_combat_pending`
- endpoint flags used for derivation

Normal player payloads must not include these internal labels.

## Outputs And Recap

The endpoint does not introduce major new content. Existing Rusk dialogue outputs remain canonical:

- `resolve-the-threat` becomes the active objective.
- `bandits_not_fully_self_directed` remains known once.
- `shrine_depth_unlocked` remains known once.
- `hollow_reaches_shrine_above` remains known once.
- Rusk completed dialogue record, transcript/summary, archive, and search remain available.

The endpoint status acts as the player-facing "what now?" recap until the future combat system exists.

## Idempotency And Recovery

The endpoint is derived from existing idempotent flags. Refreshing, resuming, or calling Start Greyvale again after the endpoint preserves:

- current scene `shrine-ruins`
- active objective `resolve-the-threat`
- `slice_endpoint.state === endpoint_reached`
- completed dialogue records
- knowledge and history counts

It does not create duplicate records or reset progress.

## Tests

Updated and added tests:

- `backend/test/stage6b15-rusk-endpoint-boundary.test.js`
- `backend/test/stage6b15-memory-recap-flow.test.js`

The Greyvale full-loop command now includes the focused endpoint boundary test:

```bash
npm --prefix backend run test:greyvale-full-loop
```

Targeted assertions cover:

- player-safe endpoint projection
- GM/dev internal routing projection
- endpoint action status projection
- blocked post-endpoint exploration preview/submit
- resume preserving endpoint state
- player hidden-data denylist including `combat_pending`, `future_supported`, and the encounter id

## Non-Goals Confirmed

This stage did not implement playable combat, open-world navigation, AI narration, SMS flow, database migrations, or major Greyvale content.
