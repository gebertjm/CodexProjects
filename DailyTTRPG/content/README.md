# DailyTTRPG Content Layout

The active playable content is currently Greyvale plus the Shadows on the Grey Road campaign.

## Active Import Root

Use this package root for validation and import:

```powershell
docker compose exec -T backend npm run --silent cli -- validate-content --path content/worlds/greyvale
docker compose exec -T backend npm run --silent cli -- import-content --path content/worlds/greyvale --dry-run
docker compose exec -T backend npm run --silent cli -- import-content --path content/worlds/greyvale
```

The active manifest is:

```text
content/worlds/greyvale/manifest.json
```

That manifest stitches together:

- `content/worlds/greyvale` for the Greyvale world definition.
- `content/regions/greyvale` for Greyvale regions and region templates.
- `content/locations/greyvale` for Greyvale locations and location templates.
- `content/scenes/greyvale` for Greyvale scenes, scene templates, and transitions.
- `content/entities/greyvale` for NPC and world-entity definitions.
- `content/dialogue/greyvale` for active Greyvale dialogue content.
- `content/campaigns/shadows_grey_road` for the Grey Road campaign, quests, encounters, affordances, interactions, knowledge, hooks, events, and overlays.

## Archive Policy

Archived, stale, duplicate, or broken content belongs under:

```text
content/old - archive/
```

Do not import directly from archived folders unless intentionally restoring older content. If content is replaced, move the previous active files into a dated archive subfolder rather than deleting them.

## Reorganization SOP

1. Stage incoming content outside the active import tree or in a dated package folder.
2. Compare it against the active Greyvale/Grey Road folders.
3. Move replaced active files into `content/old - archive/<date>-<reason>/previous-active-layout/`.
4. Move source packages that should not remain importable into `content/old - archive/<date>-<reason>/source-packages/`.
5. Copy or move the chosen updated files into the canonical active folders listed above.
6. Keep `content/worlds/greyvale/manifest.json` as the single active package entrypoint.
7. Run duplicate discovery, content validation/import dry run, and backend regression tests before treating the content as ready.

## Current Canonical Package

As of the 2026-05-19 content reorganization:

- Active content contains Greyvale and Shadows on the Grey Road only.
- Emberfall and older/broken Greyvale packages are archived.
- The `greyvale_6b9_exploration_content_update` source package is archived after being normalized into the canonical active folders.
- No active `seed_package` import root remains.
