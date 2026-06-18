# Stage 6B.9: Exploration Interaction Layer

Stage 6B.9 adds the exploration-only **Surface / Focus / Commit** model.

The goal is to let players read a narrative scene, optionally open a few immediate closer-look details, and then commit one meaningful beat action. Free Focus informs the action; it does not replace the beat system.

## Interaction Layers

**Automatic Observation**

Automatic observations are what a competent character notices immediately. They are composed into scene narration. They do not consume the action window. They create canonical events only when authored knowledge grants or state changes are applied.

**Passive Discovery**

Passive discoveries are automatic but conditional. They can use passive checks, hidden checks, skills, prior knowledge, background, or authored visibility conditions. The first result is persisted so refreshes do not reroll. Default `check.visibility` is `success_only`, so failures are silent unless content explicitly provides safe failure narration.

**Free Focus**

Free Focus entries appear as compact **Closer Looks** inside collapsed Scene Reference. Opening a card resolves immediately and does not consume the beat. Results persist per character, campaign, scene, interaction, and state version. Viewed cards can be reopened without rerolling.

**Beat Action**

Beat actions are the committed action-window submission. They use `resolution_mode: "beat_action"` and may include `beat_action_type` such as `investigate`, `travel`, `social`, `track`, `prepare`, or `interact`.

## Content Schema

Exploration scenes may define:

```json
{
  "interaction_model": "surface_focus_commit",
  "automatic_observations": [],
  "passive_discoveries": [],
  "free_focus": [],
  "beat_actions": []
}
```

Checked Free Focus example:

```json
{
  "interaction_id": "focus_muddy_tracks",
  "target_id": "muddy_tracks",
  "label": "Muddy tracks",
  "resolution_mode": "free_focus",
  "requires_check": true,
  "check": {
    "mode": "active",
    "skill": "survival",
    "dc": 14,
    "visibility": "visible"
  },
  "on_success": {
    "narration": "The tracks are fresher than they first appeared.",
    "knowledge_grants": ["tracks_are_fresh"]
  },
  "on_failure": {
    "narration": "The mud is too churned to read clearly. The obvious part remains: tracks lead away from the road."
  },
  "committed_followup": {
    "enabled": true,
    "check_resolution": "advantage",
    "beat_action_type": "investigate"
  }
}
```

## Check Visibility

Supported values:

- `visible`: show compact check label and outcome.
- `hidden`: do not reveal that a check happened.
- `success_only`: show only on success; persist failures backend-side.
- `narrative_only`: show prose without a mechanics label.

Defaults:

- Passive Discovery defaults to `success_only`.
- Free Focus defaults to `visible`.

## Persistence

`dnd5e_character_exploration_interaction_result` stores Automatic Observation, Passive Discovery, and Free Focus results that need durability.

This prevents duplicate Free Focus rolls and passive rerolls across refreshes. It also preserves viewed state, stale state, check visibility, result narration, knowledge/state applications, and canonical event provenance.

## API Contract

`GET /api/play/current-scene` now includes:

- `scene_reference.closer_looks`
- Free Focus statuses: `unopened`, `current_viewed`, `stale_viewed`, `superseded`, `expired`, `unavailable`
- target-chip `free_focus_state`
- target-chip `known_context` when a successful viewed Free Focus safely provides context

`POST /api/play/free-focus/resolve`

Request:

```json
{
  "scene_id": "123",
  "interaction_id": "focus_muddy_tracks"
}
```

Behavior:

- Requires Firebase auth.
- Requires active character and campaign.
- Requires the requested closer look to be visible and available in the current scene.
- Returns an existing persisted result if already resolved.
- Resolves and persists first open if unresolved.
- Does not consume, close, or create action windows.
- Does not resolve the beat.
- Creates canonical campaign/history/knowledge records only when authored knowledge grants or state changes apply.

## Beat Preview Overlap

If a player submits a shallow beat action that overlaps an unopened available Closer Look, preview returns `status: "free_focus_overlap"` instead of silently accepting it.

The player can:

- Open Closer Look
- Continue as Beat Action
- Edit Action

Continuing as a beat action marks the action as a committed follow-up. Default `check_resolution` is `advantage`; content can override to `standard` or `take_20`.

## UI Behavior

Scene Reference remains collapsed by default and now includes **Closer Looks**.

Free Focus cards:

- Resolve on first open.
- Show a loading state.
- Show a viewed marker after resolution.
- Preserve and reopen the same result.
- Show visible check labels above result prose.
- Disable unopened cards after an action has been submitted.
- Keep viewed cards reopenable after submission.

Action composer target chips remain target-only. They may show a subtle viewed marker or known context, but they do not become pushy action CTAs.

## History And Knowledge

Automatic Observation, Passive Discovery, and Free Focus update the Knowledge Journal only when authored grants are applied.

They appear in campaign history only when they create a canonical event. Surface-only closer looks remain local to the scene reference card.

## Safety Rules

All Surface / Focus / Commit output is character-perspective safe.

Never expose hidden NPCs, unknown true names, secret roles, undiscovered clues, hidden exits, hidden action targets, secret DCs under hidden visibility, failed hidden checks, GM notes, debug payloads, future content, or hidden objective criteria.

Filter before composing and before returning API responses.

## Greyvale Examples

The active Greyvale exploration scenes now include examples of:

- Automatic observations.
- Passive discoveries.
- Free Focus cards with visible checks.
- Free Focus cards with no checks.
- Authored success and failure narration.
- Authored knowledge grants only where meaningful.
- Beat actions marked with `resolution_mode: "beat_action"`.
- Committed follow-up metadata using `advantage`, `standard`, and `take_20`.

## Manual QA

1. Sign in and open the active Greyvale exploration scene.
2. Confirm narration includes obvious scene facts without menu-like prompts.
3. Refresh and confirm passive discoveries do not reroll or flicker.
4. Expand Scene Reference.
5. Open a Closer Look card.
6. Confirm the result resolves immediately and the action window remains open.
7. Collapse and reopen the card; confirm the same result is shown.
8. Confirm a visible check shows a compact mechanics label.
9. Confirm authored knowledge appears in Knowledge only when a grant exists.
10. Confirm surface-only closer looks do not appear in History.
11. Submit a shallow overlapping action like “I inspect the muddy tracks.”
12. Confirm the preview blocks with Open Closer Look / Continue as Beat Action / Edit Action.
13. Open the Closer Look from the warning and confirm draft text is preserved.
14. Submit again and choose Continue as Beat Action.
15. Confirm the beat action can be submitted and later resolved normally.
16. Submit a non-overlap beat action and confirm the usual beat loop still works.
17. Confirm unopened Closer Looks lock after submission but viewed ones remain reopenable.
18. Confirm no hidden names, clues, failed hidden checks, debug IDs, or raw JSON appear.

## Limitations

This stage implements exploration Surface / Focus / Commit only. Dialogue and combat-specific focus/commit behavior are future work.

State-changing Free Focus currently supports safe scene-state patches and read-model refresh hooks. Deeper target/objective mutation support should be expanded as authored content grows.
