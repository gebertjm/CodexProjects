# ForgeSheet

ForgeSheet is a production-quality D&D 5e-compatible character builder focused on players first, with a modular architecture ready for DM planning tools and a future interactive gameboard.

This repository also includes **PHB-Complete Engine**, a legal-safe indexing, schema, ingestion, and completeness-tracking subsystem for Player's Handbook content.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Zustand for local draft persistence
- Zod-ready typed rules repository structure
- Vitest for critical rules tests
- Prisma schema included for future SQLite-backed persistence

Vite was chosen over Next.js for this MVP because ForgeSheet is primarily a client-first tool with local persistence, heavy interactive state, and a clear path to Electron or Tauri packaging later.

## What Ships

- Character library with autosaved drafts
- Guided or expert mode toggle
- Rules-backed species, class, background, ability, equipment, and spell selections
- Explainable rules inspector for AC, HP, proficiency, spellcasting, and skills
- Validation panel with warnings/errors/info
- Printable summary view
- JSON export
- Reserved module routes for DM tools and gameboard expansion
- Legally safe starter rules repository using concise open-compatible content
- PHB-Complete Engine scaffolding with generated PHB index data, placeholder spell slots, import tooling, and audit reports

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Run tests:

```bash
npm run test
```

4. Build for production:

```bash
npm run build
```

5. Generate and audit PHB-Complete Engine artifacts:

```bash
npm run phb:build
npm run phb:audit
```

## Repository Layout

```text
forgesheet/
  design/
  prisma/
  public/
  rules/
    core/
    custom/
    homebrew/
    licenses/
    phb-index/
    schema/
    srd/
    user-content/
    validation/
  modules/
    completeness-tracker/
    ingestion/
    rules-engine/
  src/
    app/
    modules/
      assets/
      character-builder/
      dm-tools/
      gameboard/
      rules-engine/
      ui/
  tests/
```

## Content Boundaries

ForgeSheet does not bundle proprietary 5e text. The default repository contains concise, legally safe starter content. The data model and content directories are set up so licensed expansions, user-supplied packs, or homebrew imports can be added later without rewriting the application.

PHB-Complete Engine follows the same model: it ships ids, references, summaries, schemas, and placeholders, while the owner can locally add their own text and structured mechanics.

## Expansion Notes

- `src/modules/dm-tools` is the future home for campaign dashboards, encounter design, lore tools, and initiative planning.
- `src/modules/gameboard` reserves scene, token, overlay, and DM/player state boundaries.
- `prisma/schema.prisma` models persistence for character drafts and content packs when a backend is added.

See the other project documents for deeper detail:

- `ARCHITECTURE.md`
- `RULES_ENGINE.md`
- `DATA_MODEL.md`
- `ROADMAP.md`
- `DESIGN_SYSTEM.md`
- `CONTENT_POLICY.md`
- `HOW_TO_COMPLETE_PHB.md`
- `INGESTION_GUIDE.md`
- `LEGAL_NOTE.md`
