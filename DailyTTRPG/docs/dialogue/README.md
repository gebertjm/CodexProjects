# Dialogue Focus/Commit Planning Package

This folder is a Codex-ready planning package for the future Dialogue Focus/Commit system.

It is documentation only. It does not implement runtime code, database migrations, API routes, UI, production behavior, or content imports.

## Purpose

Dialogue Focus/Commit adapts the existing exploration Surface / Focus / Commit model into a dialogue-specific domain.

Exploration already separates:

- Surface: what the character notices automatically.
- Focus: immediate closer looks that do not spend the beat.
- Commit: the action-window action that consumes the beat and advances consequences.

Dialogue needs the same pacing discipline, but different language, records, validation, UI, and tooling.

The player should experience:

1. A current conversation surface.
2. Passive social insight when the character qualifies.
3. Optional clarifying questions that do not consume the beat.
4. One committed social move that consumes the dialogue beat/window.
5. A safe transcript/completed record that can be reviewed later.

The backend should continue to think in shared primitives:

- `surface`
- `passive_context`
- `free_focus`
- `committed_action`
- `preview`
- `resolution`
- `state_changes`
- `outputs`
- `transitions`

The dialogue domain should expose player/content-facing names:

- `conversation_surface`
- `passive_social_insight`
- `clarifying_questions`
- `committed_social_moves`
- `dialogue_exit`
- `completed_dialogue_record`

## Why Adapter, Not Separate Engine

Dialogue should not duplicate the exploration engine. The slow async beat model, preview-before-submit, state-change application, knowledge filtering, check visibility, and safe read-model rules are shared product behavior.

Dialogue differs in:

- How content is authored.
- How player choices are framed.
- How social/relationship state is read and written.
- How transcripts and completed records are persisted.
- How GM/dev tools inspect conversation state.
- How annotations/corrections preserve or revise authored dialogue after play.

The right boundary is:

- Shared core resolves generic interaction primitives.
- Dialogue adapter maps dialogue-specific JSON and UI concepts onto those primitives.
- Dialogue services own transcripts, relationship/social state, dialogue summaries, and correction lifecycle.

## Implementation Phases

Future work should be split into small, mergeable tasks:

1. Shared interaction core plus dialogue adapter skeleton.
2. JSON schema and validation.
3. Database migrations.
4. Dialogue runtime MVP.
5. Relationship/social state runtime.
6. Transcripts, completed records, summaries, and search.
7. Player UI.
8. GM/dev debug workspace.
9. Annotation/correction lifecycle.
10. Full path test harness.
11. Greyvale fixtures and regression pass.
12. Greyvale dialogue expansion pass.
13. Post-dialogue full-loop stabilization.

See [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) for Codex-ready task slices.

## First Code Build Should Implement

The first code build after this planning package should be narrow:

- Add shared interaction core interfaces or skeleton modules.
- Add a dialogue adapter skeleton that can normalize dialogue JSON into shared primitives.
- Add tests for normalization and visibility boundaries.
- Do not change player-visible behavior yet.
- Do not add migrations yet.
- Do not replace the existing dialogue graph/session service yet.
- Do not add Flutter UI yet.

## First Code Build Should Not Implement

Do not attempt the full dialogue system in one pass.

Avoid:

- Full runtime replacement for `dialogueService`.
- New database tables before schema review.
- Player UI changes before API contracts stabilize.
- GM/dev tools before diagnostics payloads stabilize.
- Annotation/correction writes before completed record and transcript models exist.
- AI-generated dialogue, clues, confessions, relationship changes, or summaries.

## Planning Files

- [LOCKED_DECISIONS_SUMMARY.md](LOCKED_DECISIONS_SUMMARY.md): implementation-oriented decision summary.
- [ARCHITECTURE.md](ARCHITECTURE.md): proposed module boundaries and reuse strategy.
- [SCHEMA_PLAN.md](SCHEMA_PLAN.md): JSON and data shape proposal.
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md): future database table plan, not migrations.
- [API_PLAN.md](API_PLAN.md): service/API contracts and response sketches.
- [UI_PLAN.md](UI_PLAN.md): player and GM/dev UI plan.
- [VALIDATION_PLAN.md](VALIDATION_PLAN.md): hard errors, warnings, and debug notices.
- [TEST_PLAN.md](TEST_PLAN.md): test strategy and fixture recommendations.
- [../full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md](../full-loop/STAGE_6B_13_FULL_LOOP_STABILIZATION_PLAN.md): post-dialogue Greyvale full-loop hardening plan.
- [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md): future Codex task breakdown.
- [GREYVALE_FIXTURES.md](GREYVALE_FIXTURES.md): current Greyvale Elin Focus/Commit fixture notes.
- [GREYVALE_DIALOGUE_EXPANSION_PLAN.md](GREYVALE_DIALOGUE_EXPANSION_PLAN.md): Stage 6B.12 audit and conversion plan for expanding Greyvale legacy dialogue into Focus/Commit scenes.

## Existing Repo Context

Relevant existing modules to inspect during implementation:

- `backend/src/services/freeFocusService.js`
- `backend/src/services/actionComposerService.js`
- `backend/src/services/dialogueService.js`
- `backend/src/db/queries/dialogue.js`
- `backend/src/engine/dialogue/dialogueEngine.js`
- `backend/src/content/contentValidation.js`
- `backend/src/content/contentRepository.js`
- `backend/src/content/contentImporter.js`
- `backend/src/services/characterKnowledgeService.js`
- `backend/src/services/playerBeatResultService.js`
- `backend/src/services/gameplayHistoryService.js`
- `backend/src/services/narrativeStateService.js`
- `apps/player_app/lib/campaign/campaign_scene_page.dart`
- `apps/player_app/lib/api/models.dart`
- `apps/player_app/lib/api/api_client.dart`

Useful existing docs:

- `docs/web-exploration-surface-focus-commit.md`
- `docs/web-narrative-scene-composition.md`
- `docs/web-action-composer.md`
- `docs/web-campaign-history-knowledge.md`
- `docs/content-authoring/README.md`
