# Stage 6B.15.3 - Dialogue Segment Playability Pass

Status: implemented  
Build: Stage 6B.15.3  
Primary predecessors: Stage 6B.15.1 and Stage 6B.15.2

## Purpose

Stage 6B.15.3 hardens the dialogue portions of the Greyvale playable vertical slice. A logged-in web player with one active character can discover required conversations from exploration, open each Focus/Commit dialogue, read the conversation surface, use Clarifying Questions, preview and submit Committed Social Moves, exit cleanly, and continue the slice route without hidden-data leaks or stale dialogue state.

This stage does not implement combat, open-world navigation, AI narration, SMS requirements, major content additions, or the final Rusk completion endpoint.

## Confirmed Dialogue Route

The dialogue route for the bounded Greyvale slice is:

1. `grey-road-inn` - Tomas Rell and Elin Harrow.
2. `dunmere-village` - Mara Vellin, Lysa Fen, and Garren Holt.
3. `shrine-ruins` - Rusk.

The test route uses existing exploration transitions from 6B.15.2:

`broken-caravan-site` -> `grey-road-inn` -> `dunmere-village` -> `old-forest-path` -> `shrine-ruins`.

Garren's authored shrine-route move sets `shrine_path_known`, which makes `follow-the-tracks-to-the-shrine` visible from the old path. No new dialogue routes or major content were added.

## NPC Coverage

### Tomas

Verified:

- Reachable from `grey-road-inn`.
- Conversation surface, Clarifying Questions, Committed Social Moves, and exits are present.
- `clarify_bandit_pattern` remains non-committing and grants `innkeeper_tracks_road_patterns`.
- `move_compare_caravan_pattern` previews without committing, submits once, and remains player-safe.
- Exit creates a completed record and archive/search remains player-safe.

### Elin

Verified:

- Reachable from `grey-road-inn` after Tomas.
- `clarify_torn_sash` remains non-committing and grants `elin_sash_has_roadward_knot`.
- `move_press_shrine_warning` previews without committing, submits once, and grants `shrine_bell_stopped_attack`.
- Exit creates a completed record and archive/search remains player-safe.
- Relationship/social internals remain hidden from player payloads.

### Mara

Verified:

- Reachable from `dunmere-village`.
- `clarify_mara_bandit_explanation` remains non-committing and grants `dunmere_wants_simple_answer`.
- `move_report_broken_caravan` previews without committing and submits once.
- Exit returns to village state without hard-locking the investigation.

### Lysa

Verified:

- Reachable from `dunmere-village`.
- `clarify_lysa_hidden_truth` remains non-committing and grants `village_blames_hunter_and_road`.
- `move_ground_lysa_suspicion` previews without committing and submits once.
- Journal text remains partial/misleading-safe and does not present suspicion as confirmed truth.

### Garren

Verified:

- Reachable from `dunmere-village`.
- `clarify_garren_old_path_sighting` remains non-committing and grants `garren_knows_old_paths`.
- `move_ask_safest_way_to_approach_shrine` can be explicitly continued as a Committed Social Move when its wording overlaps a Clarifying Question.
- Successful route move grants `tracks_converge_on_shrine` and sets `shrine_path_known`.
- Old path then exposes the shrine transition.

### Rusk

Verified:

- Reachable from `shrine-ruins`.
- `clarify_rusk_what_he_hears` remains non-committing and grants `bandits_not_fully_self_directed`.
- `move_keep_rusk_talking` previews without committing and submits once.
- `exit_rusk_combat_pending` creates a completed record and keeps player-facing combat handoff text safe.
- GM/dev debug can inspect `combat_pending` and related routing details.

## Runtime And Read Model Behavior

The pass did not require runtime code changes. Existing Dialogue Focus/Commit behavior already supports:

- Player-facing conversation surfaces.
- Non-committing Clarifying Questions.
- Committed Social Move preview without persistence.
- Lifecycle-context guarded submission.
- Completed dialogue record creation on exit.
- Archive/search retrieval after completion.
- GM/dev debug visibility behind authorization.

The 6B.15.3 regression test strengthens this with one route-level player-flow proof across all required NPCs.

## Player Visibility

The new regression applies the shared hidden-data denylist to:

- Active dialogue read models.
- CQ results.
- CSM previews.
- CSM submit/results.
- Dialogue exits.
- Knowledge journal payloads.
- Completed archive records.
- Search results.
- Current scene after dialogue return.

Player payloads must not expose hidden DCs, raw rolls, result band internals, branch IDs, raw relationship/social state, GM/dev debug, future-supported internals, combat routing internals, final mystery labels, stack traces, or database constraint details.

## GM/Dev Diagnostics

Authorized GM/dev debug remains available through `/api/dev/dialogue-debug`. The regression verifies diagnostics for Tomas, Elin, Garren, and Rusk, including social move provenance and Rusk combat-pending routing details.

Normal players are still covered by existing permission regressions in the Greyvale full-loop command.

## Tests

Added:

- `backend/test/stage6b15-dialogue-playability.test.js`

Updated:

- `backend/package.json` now includes the 6B.15.3 test in `test:greyvale-full-loop`.

Targeted command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg node --test --test-concurrency=1 backend/test/stage6b15-dialogue-playability.test.js
```

Full regression command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg npm --prefix backend run test:greyvale-full-loop
```

## Deferred Work

- Full objective, knowledge, history, archive, and end-state recap across the complete route: 6B.15.4.
- Full shrine/Rusk endpoint and slice completion or awaiting-support status: 6B.15.5.
- Broad Flutter UI recovery, rendered hidden-data checks, and responsive polish: 6B.15.6.
- Canonical acceptance suite/manual checklist: 6B.15.7.
- Deployment/import smoke against hosted app and DigitalOcean backend: 6B.15.8.
