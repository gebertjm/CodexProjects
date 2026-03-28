# Data Model

## Rules Repository

The starter repository includes:

- Species
- Classes
- Backgrounds
- Spells
- Items
- Languages
- Optional rules metadata

Each record includes a source field and only ships with legally safe short-form content by default.

## Draft Model

`CharacterDraft` stores:

- identity fields
- level and experience
- creation mode
- selected species, class, and background
- chosen skills, spells, languages, and equipment
- raw ability assignments
- notes and optional rules flags

## Persistence Model

`prisma/schema.prisma` adds:

- `CharacterDraft` for durable character saves
- `ContentPack` for imported SRD, homebrew, or licensed expansion manifests
