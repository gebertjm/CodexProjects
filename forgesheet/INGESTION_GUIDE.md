# Ingestion Guide

PHB-Complete Engine supports three ingestion styles:

## 1. JSON Patch Import

Best for rich structured mechanics.

Fields:

- `id`
- `user_supplied_text`
- `notes`
- `verbatim_reference`
- `mechanical_effects`

## 2. CSV Import

Best for fast text entry.

Headers:

`id,user_supplied_text,notes,verbatim_reference`

## 3. Manual Editor Hook

The repository is ready for a future GUI editor. The current React app can later expose these entities through an admin route without changing the schema.

## Validation

Imports are validated against:

- `modules/rules-engine/phb-schema.mjs`
- `rules/schema/phb-index.schema.json`
- `rules/schema/phb-user-patch.schema.json`

## OCR Hook

No OCR is bundled. If you build one later, have it emit patch files that target existing entity ids instead of inventing new ids.
