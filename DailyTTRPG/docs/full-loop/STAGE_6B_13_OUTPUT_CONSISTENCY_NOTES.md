# Stage 6B.13.3 Output Consistency Notes

Stage 6B.13.3 hardens the player-facing and GM/dev output chain after Greyvale exploration and dialogue actions. The pass is intentionally narrow: it applies existing authored output metadata, verifies idempotency and visibility, and avoids new Greyvale content.

## Code Paths Audited

| Area | Runtime path | Notes |
| --- | --- | --- |
| Knowledge grants | `characterKnowledgeService.js`, `grantKnowledge` | Uses `ON CONFLICT (campaign_id, character_id, knowledge_type, knowledge_key)` so repeated grants update one clean character-knowledge row instead of creating journal noise. |
| Dialogue knowledge output | `dialogueFocusCommitRuntimeService.js`, `applyKnowledgeGrants` | CQs and CSMs grant canonical knowledge through the shared knowledge service. Reopened CQs and stale CSMs do not reapply outputs. |
| Dialogue objective/flag/reward output | `dialogueFocusCommitRuntimeService.js`, `applyCanonicalOutputEffects` | Existing authored `objective_updates`, `character_flags`, `campaign_flags`, and `rewards` now flow through `applyAdventureOutcome`. No new content or output types were added. |
| Objective progression | `adventureProgressionService.js`, `applyAdventureOutcome`, `syncAdventureProgressionStateInternal` | Explicit dialogue objective writes are reconciled with quest prerequisites. Greyvale cannot skip objective gates just because a later dialogue output is applied early. |
| History and Latest Development | `playerBeatResultService.js`, `gameplayHistoryService.js`, dialogue runtime `latest_development` | Exploration beat results remain the campaign history/latest-result source. Dialogue CSM results carry dialogue-local latest development and completed-record/archive output. |
| Completed dialogue records | `dialogueArchiveService.js`, `finalizeDialogueArchive` | Finalization reuses existing completed records when runtime state already has a completed record id. Duplicate exits stay single-write. |
| Transcript and summary | `dialogueArchiveService.js`, `appendDialogueTranscriptTurn`, `buildCompactSummary` | Player transcript turns are filtered through `playerFacingContent`; summaries use authored compact summaries or conservative generated fallback. |
| Archive/search | `dialogueArchiveService.js`, player archive/search routes | Player archive/search are scoped by active account campaign and character, and search indexes player-facing text only. |
| GM/dev provenance | `dialogueDebugWorkspaceService.js`, `explorationMechanicsDebugReadModel.js` | Authorized debug routes expose raw runtime state, audit timelines, relationship writes, output links, and validation context. Normal player routes remain filtered. |

## Invariants Covered

- Repeated knowledge grants dedupe to one player-facing journal entry while retaining safe updated metadata.
- Dialogue objective, flag, and scene-unlock reward outputs use the current adventure progression pipeline.
- Objective prerequisites are still enforced by progression sync; dialogue outputs cannot skip Greyvale objective order.
- Mara's assumption and Lysa's suspicion stay player-safe, pressure-framed, and not confirmed truth.
- Garren route output preserves shrine route knowledge and scene-unlock reward behavior.
- Rusk deeper-source output grants only partial shrine/hollow clues, combat-pending flags, and the intended next objective state.
- Completed records, transcript turns, archive detail, and search results are generated once per completed dialogue.
- Archive/search data is scoped to the active account, character, and campaign.
- Player-facing output payloads exclude debug, hidden DCs, raw rolls, hidden clue metadata, relationship meters, and final-mystery notes.
- GM/dev output provenance stays permission-gated.

## Tests Added

`backend/test/full-loop-output-consistency-regression.test.js` adds DB-backed integration coverage for:

- Tomas Pattern of Attacks dedupe across CQ and CSM, plus local-insight objective progress.
- Completed dialogue single-write behavior, transcript persistence, archive detail, search indexing, duplicate exit rejection, and cross-character archive/search scoping.
- Mara/Lysa misleading and partial clue wording in the player Knowledge Journal.
- Mara objective completion, Garren shrine-route flag/reward output, Rusk deeper-source flag/objective/reward output, campaign history safety, current-scene objective safety, player objective read model safety, and GM/dev debug permission gating.

## Runtime Fixes

- `dialogueFocusCommitRuntimeService.js` now carries `objective_updates`, `character_flags`, `campaign_flags`, `rewards`, and `canonical_output_links` from authored CQ/CSM result branches.
- Existing authored dialogue objective/flag/reward outputs are applied through `applyAdventureOutcome`.
- Scene-unlock rewards authored with `scene_slug` are normalized into the existing reward `value.scene_key` shape before application.
- Completed dialogue canonical output links now capture objective updates, flags, rewards, and scene unlocks for GM/dev/archive provenance without exposing raw internals to player archive output.

## Greyvale Findings

- Tomas and repeated Pattern of Attacks grants dedupe cleanly in `dnd5e_character_knowledge`.
- Objective sync correctly prevents premature local-insight activation unless the caravan aftermath prerequisite has been established.
- Mara's Assumption and Lysa's Suspicion remain safe clue entries, not final truth claims.
- Garren can now apply `shrine_path_known` and the `shrine-ruins` scene-unlock reward through existing progression output handling.
- Rusk can now apply `shrine_depth_unlocked`, `combat_pending`, `shrine_confrontation_ready`, `uncover-the-truth`, `resolve-the-threat`, and the `subterranean-hollow` scene-unlock reward through existing progression output handling.

## Deferred Gaps

- Frontend Knowledge Journal, History, Objective, Archive, and Search widget coverage remains deferred to Stage 6B.13.4.
- A full multi-scene Greyvale vertical-slice journey remains deferred to Stage 6B.13.6.
- Dialogue results remain dialogue-local latest developments rather than campaign-wide player beat results. This is documented behavior for now, not a regression.
- Reward output idempotency beyond stale/duplicate-submit protection should be revisited if future content allows the same live reward from multiple independent sources.
