# Rules Engine

ForgeSheet uses a data-driven rules engine instead of UI-only logic.

## Current Pipeline

1. Resolve rule entities from the repository.
2. Merge raw player inputs with repository bonuses.
3. Compute ability modifiers and proficiency bonus.
4. Derive AC, HP, initiative, speed, attacks, spell math, skills, and saving throws.
5. Validate the draft for structural and rules-facing issues.
6. Emit human-readable explanations for inspector panels.

## Deterministic Order

- Base draft inputs
- Species bonuses
- Class-based proficiency and spellcasting rules
- Background proficiencies
- Equipment-derived formulas
- Validation and explanation pass

## Ambiguity Handling

Repository entities can carry `variantFlags` and optional rules metadata. This lets the UI surface "supported but not bundled" or "variant handling pending" states without hiding the ambiguity.

## Multiclass Readiness

The current MVP uses a single-class UI, but the engine is intentionally isolated so class progression can later become a list-based composition stage.
