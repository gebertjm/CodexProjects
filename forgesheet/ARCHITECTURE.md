# Architecture

ForgeSheet separates concerns into four layers:

1. Rules repository
   Stores structured content under `rules/` in versionable JSON.
2. Rules engine
   Computes deterministic outputs and explanations in `src/modules/rules-engine`.
3. Builder state
   Stores user input and autosaved drafts in `src/modules/character-builder/store.ts`.
4. Presentation
   Renders the builder, inspectors, and future feature shells in route-level modules.

## Module Layout

- `src/modules/character-builder`
  Player-facing creation flow and draft state.
- `src/modules/rules-engine`
  Repository access, math helpers, validation, and explainability.
- `src/modules/dm-tools`
  Reserved feature shell for campaign tools.
- `src/modules/gameboard`
  Reserved feature shell for live scene and token play.
- `src/modules/ui`
  Shared primitives and styling utilities.
- `src/modules/assets`
  Logo and future iconography.

## Future Expansion

- Add content ingestion services that validate JSON packs against `rules/schema`.
- Introduce backend persistence behind the existing draft shape without changing the builder UI.
- Compose multiclassing as an additive engine stage rather than rewriting the current pipeline.
