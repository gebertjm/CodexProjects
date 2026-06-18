# Greyvale Docs

This folder tracks Greyvale vertical-slice planning and playability readiness.

Current plan:

- [Stage 6B.15 Greyvale Vertical Slice Audit & Playability Plan](STAGE_6B_15_VERTICAL_SLICE_PLAN.md)
- [Stage 6B.15.1 Slice Entry, Start/Resume, And Initial State](STAGE_6B_15_1_SLICE_ENTRY_START_RESUME_INITIAL_STATE.md)
- [Stage 6B.15.2 Exploration Segment Playability Pass](STAGE_6B_15_2_EXPLORATION_SEGMENT_PLAYABILITY_PASS.md)
- [Stage 6B.15.3 Dialogue Segment Playability Pass](STAGE_6B_15_3_DIALOGUE_SEGMENT_PLAYABILITY_PASS.md)
- [Stage 6B.15.4 Objective, Knowledge, History, And Recap Flow](STAGE_6B_15_4_OBJECTIVE_KNOWLEDGE_HISTORY_RECAP_FLOW.md)
- [Stage 6B.15.5 Rusk Boundary, Slice Completion, And Future-Supported Handoff](STAGE_6B_15_5_RUSK_BOUNDARY_SLICE_COMPLETION_FUTURE_SUPPORTED_HANDOFF.md)
- [Stage 6B.15.6 Player UI Playthrough Polish](STAGE_6B_15_6_PLAYER_UI_PLAYTHROUGH_POLISH.md)
- [Stage 6B.15.7 GM/Dev Slice Inspector And Regression Coverage](STAGE_6B_15_7_GM_DEV_SLICE_INSPECTOR_AND_REGRESSION_COVERAGE.md)
- [Stage 6B.15.8 End-To-End Vertical Slice Acceptance Suite](STAGE_6B_15_8_END_TO_END_VERTICAL_SLICE_ACCEPTANCE_SUITE.md)
- [Greyvale Vertical Slice Manual Playthrough Checklist](GREYVALE_VERTICAL_SLICE_MANUAL_PLAYTHROUGH_CHECKLIST.md)
- [Stage 6B.15 Final Status](STAGE_6B_15_FINAL_STATUS.md)

Related foundations:

- [Stage 6B.13 Greyvale Full Loop Regression Status](../full-loop/STAGE_6B_13_GREYVALE_FULL_LOOP_REGRESSION_STATUS.md)
- [Stage 6B.14 Final Status](../interaction-core/STAGE_6B_14_FINAL_STATUS.md)
- [Stage 6C Beat Resolution Runtime Audit And Hardening Plan](../runtime/STAGE_6C_BEAT_RESOLUTION_RUNTIME_AUDIT_AND_HARDENING_PLAN.md)

Stage 6B.15 should prove the playable Greyvale web slice from start/resume through the Rusk shrine confrontation boundary. It should not add new major content, implement combat, implement open-world navigation, or reveal the final mystery.

Current acceptance gate:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```
