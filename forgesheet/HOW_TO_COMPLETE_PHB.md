# How To Complete PHB

PHB-Complete Engine ships a complete structural map, not copyrighted prose.

## Goal

Use your owned Player's Handbook content to fill the placeholder entities so the dataset becomes rules-engine ready without this repository redistributing copyrighted text.

## Workflow

1. Generate the latest scaffold:

```bash
npm run phb:build
```

2. Review:

- `rules/phb-index/phb-index.json`
- `rules/validation/phb-checklist.json`
- `rules/user-content/sample-user-patch.json`

3. Create your own patch file in `rules/user-content/`.

4. Fill in:

- `user_supplied_text`
- `verbatim_reference`
- `mechanical_effects`
- optional `notes`

5. Import your file:

```bash
npm run phb:import -- .\rules\user-content\my-phb-patch.json
```

6. Audit completeness:

```bash
npm run phb:audit
```

## Recommended Order

1. Core rules
2. Species and subraces
3. Classes and class features
4. Subclasses
5. Backgrounds and feats
6. Equipment details
7. Spellcasting rules
8. Spell placeholders

## Important

- Do not paste content you do not have the right to store.
- Keep provenance accurate.
- Prefer structured mechanics over long prose wherever possible.
