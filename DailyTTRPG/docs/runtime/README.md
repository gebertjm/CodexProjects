# Runtime Docs

This folder tracks runtime orchestration plans and implementation notes.

Current plans:

- [Stage 6C Beat Resolution Runtime Audit And Hardening Plan](STAGE_6C_BEAT_RESOLUTION_RUNTIME_AUDIT_AND_HARDENING_PLAN.md)
- [Stage 6C.1 Resolution Pipeline Contract And Orchestration Map](STAGE_6C_1_RESOLUTION_PIPELINE_CONTRACT_AND_ORCHESTRATION_MAP.md)
- [Stage 6C.2 Preview-To-Resolution Consistency Pass](STAGE_6C_2_PREVIEW_TO_RESOLUTION_CONSISTENCY_PASS.md)
- [Stage 6C.3 Outcome Quality, Consequence Framing, And Failure Handling](STAGE_6C_3_OUTCOME_QUALITY_CONSEQUENCE_FRAMING_FAILURE_HANDLING.md)
- [Stage 6C.4 State Mutation Ordering, Dedupe, And Transaction Safety](STAGE_6C_4_STATE_MUTATION_ORDERING_DEDUPE_TRANSACTION_SAFETY.md)
- [Stage 6C.5 Transition Orchestration And Next-Beat Selection](STAGE_6C_5_TRANSITION_ORCHESTRATION_AND_NEXT_BEAT_SELECTION.md)
- [Stage 6C.6 Player Result Bundle And Read Model Refresh Hardening](STAGE_6C_6_PLAYER_RESULT_BUNDLE_AND_READ_MODEL_REFRESH_HARDENING.md)
- [Stage 6C.7 GM/Dev Resolution Trace And Provenance Inspector](STAGE_6C_7_GM_DEV_RESOLUTION_TRACE_AND_PROVENANCE_INSPECTOR.md)
- [Stage 6C.8 Beat Resolution Regression Suite](STAGE_6C_8_BEAT_RESOLUTION_REGRESSION_SUITE.md)
- [Stage 6C Final Status](STAGE_6C_FINAL_STATUS.md)
- [Beat Resolution Authoring Guidelines](BEAT_RESOLUTION_AUTHORING_GUIDELINES.md)
- [Stage 6D.0 Existing Combat System Audit And Combat MVP Specification](../combat/STAGE_6D_0_EXISTING_COMBAT_SYSTEM_AUDIT_AND_MVP_SPECIFICATION.md)
- [Stage 6D.1 Combat Adapter Contract And Architecture](../combat/STAGE_6D_1_COMBAT_ADAPTER_CONTRACT_AND_ARCHITECTURE.md)
- [Stage 6D.2 Legacy Combat Engine Verification](../combat/STAGE_6D_2_LEGACY_COMBAT_ENGINE_VERIFICATION.md)
- [Stage 6D.3 Authoritative Roll And Rules Resolution Foundation](../combat/STAGE_6D_3_AUTHORITATIVE_ROLL_AND_RULES_RESOLUTION_FOUNDATION.md)
- [Stage 6D.4 Action Effect And Resource Framework](../combat/STAGE_6D_4_ACTION_EFFECT_RESOURCE_FRAMEWORK.md)
- [Stage 6D.5 Conditions Concentration And Zero-Hit-Point Rules](../combat/STAGE_6D_5_CONDITIONS_CONCENTRATION_ZERO_HP_RULES.md)
- [Stage 6D.6 Positioning Movement Zones Cover Reach And Size](../combat/STAGE_6D_6_POSITIONING_MOVEMENT_ZONES_COVER_REACH_SIZE.md)
- [Stage 6D.7 Incremental Player Turn And Preview/Submit Consistency](../combat/STAGE_6D_7_INCREMENTAL_PLAYER_TURN_PREVIEW_SUBMIT_CONSISTENCY.md)
- [Stage 6D.8 Reactions And Interrupt Orchestration](../combat/STAGE_6D_8_REACTIONS_AND_INTERRUPT_ORCHESTRATION.md)
- [Stage 6D.9 Automatic Turns And Deterministic Tactical Profiles](../combat/STAGE_6D_9_AUTOMATIC_TURNS_AND_DETERMINISTIC_TACTICAL_PROFILES.md)
- [Stage 6D.10 Multi-Target, Area, Visibility, And Faction Dynamics](../combat/STAGE_6D_10_MULTI_TARGET_AREA_VISIBILITY_FACTION_DYNAMICS.md)
- [Stage 6D.11 Combat Focus](../combat/STAGE_6D_11_COMBAT_FOCUS.md)
- [Stage 6D.12 Persistence, Idempotency, Replay, And Recovery](../combat/STAGE_6D_12_PERSISTENCE_IDEMPOTENCY_REPLAY_RECOVERY.md)

Stage 6C should harden deterministic, authored beat resolution across exploration and dialogue while preserving domain-specific adapters. It should not implement combat, open-world navigation, AI narration, SMS requirements, major content expansion, database migrations, or a player UI redesign.

Stage 6D should bring the existing combat modules forward through the Stage 6C adapter/result/read-model/trace contracts before exposing live combat to players.
