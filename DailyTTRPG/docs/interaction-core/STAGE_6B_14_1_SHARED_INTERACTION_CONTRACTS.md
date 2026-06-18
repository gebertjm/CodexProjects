# Stage 6B.14.1 Shared Interaction Contracts

Stage 6B.14.1 adds a neutral internal contract layer for interaction systems while preserving the current exploration and dialogue runtimes.

This build is additive. It does not change Greyvale content, player-facing terminology, runtime behavior, visibility filtering, output processing, path harness execution, combat, navigation, or database schema.

## Module Location

The shared contract layer lives under:

- `backend/src/services/interactionCore/contracts.js`
- `backend/src/services/interactionCore/visibility.js`
- `backend/src/services/interactionCore/outputBundle.js`
- `backend/src/services/interactionCore/transitionOutput.js`
- `backend/src/services/interactionCore/debugEnvelope.js`
- `backend/src/services/interactionCore/errors.js`
- `backend/src/services/interactionCore/pathExpectations.js`
- `backend/src/services/interactionCore/index.js`

Existing adapter seed files remain in place:

- `backend/src/services/interactionCore/primitiveTypes.js`
- `backend/src/services/interactionCore/domainAdapter.js`
- `backend/src/services/interactionCore/explorationAdapter.js`
- `backend/src/services/dialogueFocusCommit/dialogueAdapter.js`

## Contract Boundaries

Content, UI, and player-facing docs keep domain-specific language:

- Exploration uses Surface, Free Focus, Beat Action, and exploration transitions.
- Dialogue uses Conversation Surface, Clarifying Questions, Committed Social Moves, and dialogue exits.

The shared layer uses neutral internal names only:

- Free Focus and Clarifying Questions map to `non_committing_inquiry`.
- Beat Actions and Committed Social Moves map to `committed_action`.
- Dialogue exits and scene handoffs map to `exit_or_transition`.

These mappings are helper-level only. The runtime is not rewired in this build.

## Domains And Visibility

`InteractionDomain` supports current domains and future placeholders:

- `exploration`
- `dialogue`
- `navigation`
- `combat`

Current content-facing values are normalized without renaming authored content:

- `surface_focus_commit` maps to `exploration`
- `dialogue_focus_commit` maps to `dialogue`

`VisibilityScope` defines:

- `player`
- `gm_dev`
- `test_harness`
- `system_internal`

The new visibility scope is foundational only. Shared visibility filtering migration belongs to Stage 6B.14.3.

## Shared Shapes Added

The shared contract helpers now cover:

- `InteractionContext`
- `InteractionOption`
- availability and requirement results
- check metadata
- preview request/result
- submit request/result
- interaction resolution result
- output bundle
- transition output
- debug envelope
- safe interaction error
- path expectation primitives

The output bundle includes optional slots for future combat/navigation-compatible outputs, but no combat or navigation runtime behavior is implemented.

## Debug And Error Safety

`createDebugEnvelope` defaults to `gm_dev` visibility and `player_safe: false`. It is explicitly not a player-facing payload shape.

`createSafeInteractionError` defines stable internal error codes plus player-safe recovery actions. This does not replace existing runtime error handling yet; migration belongs to later 6B.14 lifecycle work.

## Path Harness Status

`pathExpectations.js` introduces shared primitives that can represent exploration and dialogue path expectations. Domain-specific expected path JSON files remain unchanged. Path harness migration belongs to Stage 6B.14.5.

## Tests

Focused coverage lives in:

- `backend/test/interaction-core-contracts.test.js`

The existing adapter boundary test remains separate:

- `backend/test/dialogue-focus-commit-adapter.test.js`

## Migration Notes

Next stages should use this layer conservatively:

- Stage 6B.14.2 can extract preview/submit/resolution lifecycle helpers.
- Stage 6B.14.3 can introduce shared visibility filtering adapters.
- Stage 6B.14.4 can migrate output bundle assembly gradually.
- Stage 6B.14.5 can consolidate path harness utilities.
- Stage 6B.14.6 should rerun Greyvale full-loop regressions before moving toward Stage 6B.15.

No database or schema migration was added for 6B.14.1.

Stage 6B.14.2 now builds on these contracts through `backend/src/services/interactionCore/lifecycle.js` without rewiring exploration or dialogue runtime services.

Stage 6B.14.3 builds on `VisibilityScope`, `debugEnvelope`, and safe error contracts through `backend/src/services/interactionCore/visibilityBoundary.js` plus thin exploration/dialogue visibility adapters.

Stage 6B.14.4 builds on the shared output bundle contract through `backend/src/services/interactionCore/outputPipeline.js`, adding builder, provenance, normalization, dedupe, validation, and projection helpers without rewiring output persistence.
