# Stage 6B.15.4 - Objective, Knowledge, History, And Recap Flow

Status: implemented  
Build: Stage 6B.15.4  
Primary predecessors: Stage 6B.15.1, Stage 6B.15.2, and Stage 6B.15.3

## Purpose

Stage 6B.15.4 hardens the Greyvale slice memory layer. A logged-in web player with one active character can progress through exploration and dialogue, refresh or resume, and recover a coherent account of current objective, learned clues, prior events, completed dialogues, archive/search records, and the next practical state.

This stage does not implement combat, open-world navigation, AI narration, SMS requirements, major content additions, or the final Rusk endpoint. Rusk remains a combat-pending/future-supported boundary for 6B.15.5.

## Confirmed Memory Route Scope

The 6B.15.4 regression covers this canonical memory flow:

1. Start at `broken-caravan-site` with `witness-the-aftermath` active.
2. Resolve the Broken Caravan investigation and learn `clue_caravan_irregularity`.
3. Reach the Grey Road Inn and complete Tomas plus Elin dialogue.
4. Reach Dunmere and complete Mara, Lysa, and Garren dialogue.
5. Use Garren route knowledge and the old path to reach `shrine-ruins`.
6. Complete Rusk dialogue through the deeper-source hint and combat-pending exit.
7. Resume at `shrine-ruins` with `resolve-the-threat` active and player-safe memory surfaces intact.

No new clues, NPCs, locations, or lore were added.

## Objective Arc

The verified objective arc is:

- `witness-the-aftermath`: active at start, completed after the Broken Caravan investigation.
- `gather-local-insight`: active after the caravan investigation, progressed by Tomas, completed by Garren route dialogue.
- `follow-the-leads`: active after local insight, completed by tracking the old path.
- `uncover-the-truth`: active at shrine approach, completed by Rusk's deeper-source success path.
- `resolve-the-threat`: active at the Rusk combat-pending boundary.

The test asserts statuses and progress counts at the relevant route points and verifies repeated start/resume does not duplicate objective state.

## Knowledge And Clue Arc

The player journal is expected to show the earned clue arc once:

- `clue_caravan_irregularity`
- `innkeeper_tracks_road_patterns`
- `elin_sash_has_roadward_knot`
- `shrine_bell_stopped_attack`
- `dunmere_wants_simple_answer`
- `village_blames_hunter_and_road`
- `garren_knows_old_paths`
- `old_path_still_used`
- `tracks_converge_on_shrine`
- `clue_shrine_activity`
- `bandits_not_fully_self_directed`
- `shrine_depth_unlocked`
- `hollow_reaches_shrine_above`

The player journal read model now includes active-campaign knowledge rows whose `world_instance_id` is null, which covers deterministic exploration progression writes without broadening visibility or changing persistence. Player-facing journal text remains checked against the hidden-data denylist.

## History And Latest Development

The campaign history read model now includes completed Focus/Commit dialogue records as `dialogue_completed` timeline entries. These entries use existing player-safe completed record summaries, participate in chronological sorting, and link to completed record/transcript IDs without exposing GM/dev internals.

Latest Development remains scene-result-feed based for exploration and transition beats. Dialogue-specific recent outcomes remain available through dialogue result payloads, completed records, archive, search, and now campaign history.

## Recap And Current-State Read Model

There is no separate AI-generated recap system. The player-facing recap for 6B.15.4 is composed from existing stored outputs:

- Current scene read model: scene, current objective, action state, latest scene result.
- Knowledge journal: learned clues and current objective.
- Campaign history: exploration beat results plus completed dialogue records.
- Dialogue archive/search: completed summaries and transcript detail.

This keeps recap authored/content-driven and prevents invented facts.

## Completed Records, Transcripts, Archive, And Search

The regression completes Tomas, Elin, Mara, Lysa, Garren, and Rusk exactly once. It verifies:

- Six completed records exist.
- Each required dialogue has exactly one player-visible completed record.
- Archive list contains six records.
- Search finds each NPC by safe player-facing terms.
- Transcript/archive/search payloads pass the hidden-data denylist.

## Duplicate And Resume Behavior

The regression captures knowledge, completed-record, and dialogue-history counts before resume, calls `/api/play/start-adventure` again, and verifies:

- Current scene remains `shrine-ruins`.
- Current objective remains `resolve-the-threat`.
- Required knowledge counts remain unchanged.
- Completed dialogue record count remains unchanged.
- Dialogue history entry count remains unchanged.

## GM/Dev Provenance

Authorized GM/dev debug remains available through `/api/dev/dialogue-debug`. The regression verifies the Rusk debug payload includes output/provenance concepts such as knowledge grants, objective updates, and combat-pending routing. Normal player payloads do not include those internals.

## Code Changes

- `getCampaignHistoryForAccount` now merges player-visible completed dialogue records into the campaign timeline.
- `listKnowledgeForCharacter` now supports an optional `campaignId` and can include active-campaign knowledge rows with no world instance.
- `getCampaignKnowledgeForAccount` passes the active campaign id so the player journal reflects all earned Greyvale slice clues.

No database/schema migration was added.

## Tests

Added:

- `backend/test/stage6b15-memory-recap-flow.test.js`

Updated:

- `backend/package.json` includes the 6B.15.4 regression in `test:greyvale-full-loop`.

Targeted command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg node --test --test-concurrency=1 backend/test/stage6b15-memory-recap-flow.test.js
```

Full regression command:

```bash
DB_HOST=localhost DATABASE_URL=postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg npm --prefix backend run test:greyvale-full-loop
```

## Deferred Work

- Rusk endpoint completion or awaiting-support status: 6B.15.5.
- Final automated vertical slice acceptance suite and manual playthrough checklist: later 6B.15 acceptance pass.
- Broad rendered Flutter hidden-data and responsive UI coverage: later player UI acceptance pass.
- Combat remains 6I.
- Open-world navigation remains 6G.
