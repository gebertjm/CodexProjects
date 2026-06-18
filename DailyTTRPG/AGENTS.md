# DailyTTRPG Agent Guide

## Purpose

DailyTTRPG is a web-first, asynchronous, authored TTRPG platform with persistent world state and character-limited knowledge. The current rules implementation targets D&D 5e 2014. Preserve deterministic mechanics, player-safe projections, authored content, and GM/dev traceability.

This file is a map, not the full specification. Read only the documents required for the current task.

## Operating Rules

1. Inspect the smallest relevant file set. Search for named symbols and nearby tests before reading broad docs.
2. Do not read the root `README.md` end-to-end unless the task concerns setup, deployment, hosting, or public positioning; it is large and partly historical.
3. For staged work, read the domain README, the current stage document, and its immediate predecessor. Open older plans only to resolve a contract question.
4. Before editing, identify the current source of truth and the closest regression test.
5. Avoid broad refactors, speculative features, unrelated formatting, and new dependencies.
6. Never read, print, edit, or commit real `.env*` values unless the user explicitly requests environment troubleshooting.

When sources disagree, use: current user request/locked decisions -> executable tests/current code -> newest completed stage doc -> domain architecture/README -> root README/older plans. State material conflicts instead of silently choosing an older contract.

## Repository Map

- `backend/src/engine/`: game-domain mechanics; keep these pure where practical.
- `backend/src/services/interactionCore/`: shared preview, submit, transition, visibility, result, and trace contracts.
- `backend/src/services/`: application orchestration and read-model assembly.
- `backend/src/db/queries/`: persistence queries.
- `backend/src/routes/`: HTTP boundaries; keep rules out of routes.
- `backend/test/`: Node unit, regression, and acceptance tests.
- `apps/player_app/lib/`: Flutter source; `apps/player_app/test/`: Flutter tests.
- `content/`: active authored content. Ignore `content/old - archive/` unless explicitly requested.
- `db/init/`: ordered schema/migration history; `db/seeds/`: reference/dev data.
- `docs/combat/`: Stage 6D; `docs/runtime/`: Stage 6C; `docs/interaction-core/`: shared lifecycle.
- `docs/greyvale/`: vertical-slice acceptance/status; other `docs/<domain>/` folders are domain sources.
- `frontend/`: public static site. `frontend/play/` is generated Flutter output.

## Architecture Invariants

- Authored content defines what may happen; DB state records what happened; character knowledge controls what a player sees; events record meaningful mutations.
- Server state and mechanics are authoritative. Clients submit intent and render safe read models.
- Preserve the lifecycle: context -> preview -> submit -> ordered mutation -> transition/next beat -> refreshed read model/result bundle.
- Preview and submit must share normalized inputs and the same rules path. Preview never mutates.
- All player output passes the visibility boundary. Never expose hidden DCs, exact enemy HP/AC, secret modifiers, raw mutations, internal turn indexes, or GM-only provenance.
- GM/dev traces explain rolls, rules, mutations, transitions, and provenance without altering player output.
- Prefer small adapters around verified legacy behavior over rewrites.
- Preserve deterministic ordering, idempotency, duplicate handling, refresh, and resume behavior.

## Combat Work

Start with `docs/combat/README.md`, the current Stage 6D document, and focused Stage 6D tests.

- Baseline ruleset: versioned D&D 5e 2014.
- Player combat goes through the Stage 6C-compatible combat adapter; do not expose legacy combat routes/services directly.
- Randomness is server-authoritative; tests use explicit roll overrides or injected roll sources.
- Actions use structured timing, targets, ordered effects, resource costs, and inspectable traces.
- Positioning uses abstract named zones/range and engagement, not a required grid.
- Incremental turns support movement/action decisions and explicit end turn.
- Conditions, concentration, zero HP, reactions, movement, cover, reach, forced movement, and retreat remain reusable systems—not Rusk-specific branches.
- Greyvale Rusk is the required end-to-end acceptance path, not a reason to hard-code the engine.
- Players receive approved enemy health/status bands, never exact hidden statistics.
- This snapshot contains implementation docs and focused tests through Stage 6D.18. Do not claim later stages are complete without repository evidence.

## Code and Data Conventions

- Node uses ES modules and existing object/naming conventions. Keep API/read-model field shapes stable.
- Put domain calculations in engine modules, orchestration in services, persistence in query modules, and transport concerns in routes.
- Use existing safe interaction/http errors; do not leak raw internal errors.
- Flutter renders server contracts and submits intent; do not reimplement hidden mechanics client-side.
- Reuse existing API clients, wrappers, theme, and navigation. Add tests for changed player-visible behavior.
- Run `dart format` on changed Dart files.
- Treat `db/init/` as migration history. Prefer a new ordered, idempotent migration over rewriting established migrations.
- Keep authored definitions in `content/` and mutable instance state in the DB. Validate content references/schemas after edits.

## Ignore Generated/Irrelevant Paths

Unless explicitly required, do not inspect or edit:

- `backend/node_modules/`
- `apps/player_app/.dart_tool/`
- `apps/player_app/build/`
- `frontend/play/`
- `.firebase/`, logs, coverage, build/test artifacts
- `content/old - archive/`

## Commands

Run the narrowest relevant check first.

Backend:

- One test: `cd backend && node --test --test-concurrency=1 test/<name>.test.js`
- All backend tests: `npm --prefix backend test`
- Interaction core: `npm run test:interaction-core`
- Greyvale full loop: `npm run test:greyvale-full-loop`
- Greyvale acceptance: `npm run test:greyvale-vertical-slice`
- Stage 6C: `npm run test:stage:6c`
- Stage 6D: `npm run test:stage:6d`
- Validate Greyvale content: `npm --prefix backend run --silent cli -- validate-content --path ../content/worlds/greyvale`

Backend tests intentionally use concurrency 1. Do not increase it without proving isolation.

Flutter, from `apps/player_app/`:

- One test: `flutter test test/<name>_test.dart`
- All tests: `flutter test`
- Analysis: `flutter analyze`
- Format: `dart format <changed paths>`

Hosting/build:

- Static hosting validation: `npm run build`
- Build/copy Flutter web: `npm run build:player`
- Never deploy unless the user explicitly requests deployment.

## Workflow and Done

- Bug: reproduce or add a failing focused test, make the smallest fix, rerun focused and affected regression suites.
- Staged feature: preserve prior contracts, implement only the named stage, update its status doc, and add focused plus acceptance coverage.
- Contract change: search backend, Flutter models, fixtures/content, tests, and docs for every consumer.
- Schema change: include migration, query/service integration, tests, and idempotency/recovery analysis.
- Player-visible change: verify player projection, GM/dev projection, hidden-data boundaries, refresh, and resume.

A task is done when requested behavior is implemented, relevant checks pass, visibility and lifecycle contracts remain intact, docs state implemented/deferred/limitations accurately, generated files/secrets are untouched, and the final report lists changed files, tests/results, and unverified risks.
