# Greyvale Vertical Slice Manual Playthrough Checklist

Use this checklist after the automated acceptance command passes. It is meant for a normal player-facing web playthrough plus a small authorized GM/dev inspection pass.

## Setup

- Log in as a normal player.
- Confirm exactly one active character exists, or verify the no-active-character recovery path is clear and actionable.
- Start Greyvale from the player-facing web entry.
- Confirm the initial scene is the Broken Caravan site.
- Confirm the initial objective/current aim is visible.
- Confirm Latest Development or opening status is visible enough to orient the player.
- Confirm no debug/internal IDs are visible.

## Opening Exploration

- Read the opening scene and confirm the situation is understandable.
- Use Free Focus on the broken axle if available.
- Confirm Free Focus feels non-committing and does not remove the committed action.
- Preview the Broken Caravan investigation.
- Confirm the preview is clearly not final.
- Submit the Broken Caravan investigation.
- Confirm the result text is readable and the next step is clear.
- Confirm objective, knowledge, history, and Latest Development update.
- Refresh the page and confirm the same current scene/state resumes.

## Grey Road Inn Dialogue

- Transition to the Grey Road Inn.
- Confirm Tomas and Elin dialogue options are visible.
- Enter Tomas dialogue.
- Confirm the conversation title/surface is visible.
- Use a Clarifying Question.
- Confirm it is visually distinct from a committed move.
- Preview and submit a Committed Social Move.
- Exit Tomas dialogue.
- Confirm a completed record/summary is available where the UI supports it.
- Enter Elin dialogue.
- Use a Clarifying Question.
- Preview and submit a Committed Social Move.
- Exit Elin dialogue.
- Confirm survivor memory/shrine bell clues are visible in player-safe wording.
- Refresh after dialogue exit and confirm the app resumes in a usable scene state.

## Dunmere Village Dialogue

- Transition to Dunmere.
- Confirm Mara, Lysa, and Garren dialogue options are visible.
- Enter Mara dialogue and complete the canonical move.
- Confirm Mara's clue is framed as partial/incomplete where supported.
- Enter Lysa dialogue and complete the canonical move.
- Confirm Lysa's suspicion remains player-safe and does not reveal final truth.
- Enter Garren dialogue and complete the shrine-route move.
- Confirm the old-path/shrine-route lead is visible.
- Confirm objectives and Latest Development point toward the next practical step.

## Shrine Route

- Follow the old forest path.
- Resolve the old-path tracking action.
- Confirm the shrine route becomes available.
- Follow the tracks/signs to the shrine ruins.
- Confirm the Rusk dialogue/confrontation option is visible.
- Refresh near the shrine route and confirm the current scene resumes correctly.

## Rusk Endpoint

- Enter Rusk dialogue.
- Use a Clarifying Question if available.
- Submit the committed move that keeps Rusk talking.
- Submit the committed move that pushes Rusk to name the source.
- Exit through the confrontation endpoint.
- Confirm the UI shows the current Greyvale playable slice endpoint.
- Confirm the status is player-safe and does not imply combat is playable.
- Confirm no combat UI/action window appears.
- Confirm objectives, knowledge, history, Latest Development, and recap/current state remain reviewable.
- Refresh at the endpoint and confirm the endpoint review state remains stable.
- Start/resume Greyvale again and confirm it resumes endpoint review rather than resetting the slice.

## Memory Surfaces

- Check objectives and confirm active/completed states are understandable.
- Check the knowledge journal and confirm required clues are present once.
- Check campaign history and confirm major route events are ordered and readable.
- Check Latest Development and confirm it reflects the most recent important change.
- Check recap/current-state summary if present.
- Check completed dialogue records/summaries.
- Search/archive for at least Tomas, Elin, Garren, and Rusk where supported.
- Confirm no final mystery explanation is revealed.

## Error And Recovery

- Try a stale action by previewing, advancing/resolving elsewhere if practical, then submitting the old preview.
- Confirm the stale message is safe and actionable.
- Try returning after refresh during dialogue and confirm dialogue state is restored or safely recovered.
- Confirm network/backend error UI is safe and does not expose stack traces.
- Confirm completed/awaiting-support state does not show broken action controls.

## Hidden-Data Safety

Confirm the normal player UI never shows:

- `combat_pending`
- `future_supported`
- `shrine-rusk-confrontation`
- hidden DCs
- raw rolls
- branch ids
- hidden requirements
- failed hidden requirements
- raw relationship/social meters
- raw state writes
- GM/dev diagnostics
- source file paths
- stack traces
- path harness metadata
- final mystery/truth labels

## GM/Dev Inspection

Use an authorized GM/dev account only.

- Open `/api/dev/greyvale-slice-inspector` or the equivalent dev route/tool.
- Confirm the inspector shows current slice state, scene, action window, active dialogue if any, objectives, knowledge, history, Latest Development, outputs, transitions, and endpoint state.
- Confirm the Rusk handoff shows internal `combat_pending` / future-supported details for GM/dev.
- Confirm player-vs-GM visibility comparison reports no player hidden-data violations.
- Confirm a normal player receives a safe 403 denial for the inspector route.

## Acceptance Decision

- Automated `npm run test:greyvale-vertical-slice` passed.
- Manual start/resume through endpoint was completed.
- No hidden/debug/internal data was visible to the player.
- Endpoint felt intentional rather than broken.
- Remaining issues are documented before moving to Stage 6C.
