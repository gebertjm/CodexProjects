# Stage 6B.8 - Narrative Scene Composition Overhaul

Stage 6B.8 shifts `/play/campaign/scene` from list-first presentation to a narrative-first player experience.

The backend still returns structured scene data for action validation, accessibility, diagnostics, and future UI modes. The player-facing default is now a composed, second-person, present-tense scene narration.

## Scene Philosophy

The scene page should answer, in prose first:

- Where am I?
- What does my character perceive right now?
- Who or what naturally draws attention?
- What changed because of the latest resolved beat?
- What question or aim is currently most relevant?

Structured lists are still available, but they live in collapsed reference sections instead of dominating the scene.

## Composition Model

DailyTTRPG uses a hybrid composition model:

- Content JSON provides authored narrative ingredients.
- Backend read-model services filter runtime state through character perspective.
- `SceneNarrationComposer` assembles safe, state-aware narration from the filtered ingredients.
- Flutter renders the composed narration and keeps the structured reference collapsed.

The frontend must not compose hidden/known state itself.

The composer also tracks player-safe NPC mention terms while assembling paragraphs. By default, once an NPC is named by authored scene prose, automatic/passive prose, or NPC activity, later generated focus/opportunity paragraphs avoid naming that NPC again. This keeps scenes from sounding like menus where the same person is introduced repeatedly. If an authored scene intentionally wants repeated NPC mentions, its narration package may opt out with:

```json
{
  "composition_notes": {
    "allow_repeated_npc_mentions": true
  }
}
```

## Current-Scene Contract

`GET /api/play/current-scene` now includes:

- `scene_narration`: composed player-facing narration.
- `scene_reference`: collapsed target-only reference data.
- `action_composer.target_chips`: target-only composer helpers.

Existing fields remain available:

- `visible_npcs`
- `visible_affordances`
- `known_facts`
- `scene_result_feed`
- `action_status`
- `mechanical_details`

## Scene Narration Shape

Example:

```json
{
  "scene_narration": {
    "mode": "full",
    "voice": "second_person_present",
    "title": "The Broken Caravan",
    "summary": "The broken caravan lies where the Grey Road bends into the trees.",
    "paragraphs": [
      { "kind": "setting", "text": "You stand where the Grey Road bends sharply toward the trees..." },
      { "kind": "environment", "text": "Rain darkens the torn canvas..." },
      { "kind": "presence", "text": "A shaken woman sits near the wagon..." },
      { "kind": "opportunity", "text": "The wagon damage, scattered cargo, and marks in the mud each seem to tell a different part of the story." }
    ],
    "full_current_narration_available": false
  }
}
```

Narration modes:

- `full`: first-view or fully refreshed narration.
- `refreshed`: narration reflects meaningful recent changes.
- `return_visit`: shorter return narration when little has changed.

Current implementation uses live filtered scene state and latest result state. Persistent visit-count and historical narration snapshot storage remain an incremental follow-up.

## Content Schema

Scenes may define a `narration` package:

```json
{
  "narration": {
    "version": 1,
    "voice": "second_person_present",
    "base": ["You stand where the Grey Road bends sharply toward the trees..."],
    "return_visit": ["The broken caravan is still where you left it..."],
    "sensory": ["The air smells of wet canvas, churned mud, and old smoke."],
    "environment_variants": [
      {
        "when": { "weather": ["rain", "drizzle"] },
        "text": "Rain darkens the torn canvas and turns the roadside mud slick beneath your boots."
      }
    ],
    "opportunity_variants": {
      "subtle": ["The most revealing details may be the ones the road has not yet managed to hide."],
      "soft_explicit": ["A closer look at the wreckage, the tracks, or the survivor account might narrow the truth."]
    }
  }
}
```

Affordances may define `narration.default` and `narration.return_visit` for important interactables.

## Tiered Strictness

Legacy scenes:

- May rely on existing `description`, `summary`, or `entry_text`.
- Composer fallbacks keep them playable.

Playtest-ready scenes:

- Require base narration.
- Require sensory prose.
- Require subtle and softly explicit opportunity variants.
- Should include important NPC/interactable prose when relevant.

Published scenes:

- Reserved for future stricter gates.

Greyvale's active broken-caravan scene has been upgraded with playtest-ready narration ingredients.

## Scene Reference

`Scene Reference` is collapsed by default and target-only.

It may include:

- People nearby
- Notable things
- Visible paths
- Action targets

It must not show:

- Verb suggestions
- Hidden NPCs
- Hidden exits
- Undiscovered clues
- GM/debug data
- Secret mechanics

## Action Composer Chips

The action composer now shows target chips only.

Examples:

- `broken caravan`
- `scattered cargo`
- `fresh tracks leaving the road`
- `road toward the inn`

It does not show default verb/action chips. Natural action text remains primary.

Chip behavior:

- If the action text is empty, tapping a target inserts a light starter phrase.
- If action text already exists, tapping a target preserves the text and attaches target metadata.
- Preview and submit still go through backend-authoritative validation.

## Scene Page Layout

Default order:

1. Scene title/context
2. Rich GM narration
3. Latest Development, if any
4. Current aim/status note
5. Action Composer
6. Collapsed Recent Developments
7. Collapsed Scene Reference
8. Mechanical Details
9. Dev-only diagnostics, when authorized

The previous prominent `People Present` and `Things You Can Focus On` sections are no longer part of the main flow.

## Safety Rules

The composer receives already-filtered character-perspective data. It must not expose:

- Hidden NPCs
- Unknown true names
- Secret roles or motives
- Undiscovered clues or affordances
- Hidden exits
- Future scenes
- Hidden objective criteria
- GM notes
- Secret DCs
- Raw event/debug payloads

## Manual QA Checklist

1. Sign in.
2. Create/select a character.
3. Start or open Greyvale.
4. Open `/play/campaign/scene`.
5. Confirm rich multi-paragraph narration appears.
6. Confirm visible NPCs/interactables are woven into prose.
7. Confirm action opportunities are prose, not menu language.
8. Confirm `People Present` is not a prominent main section.
9. Confirm `Things You Can Focus On` is not a prominent main section.
10. Confirm Latest Development appears after resolving a beat.
11. Confirm current objective appears as a small current aim note.
12. Confirm the action composer appears near the top after narration/context.
13. Confirm target chips only are visible.
14. Confirm no verb/action chips appear by default.
15. Tap a target chip with empty text and confirm starter text appears.
16. Type action text, tap a chip, and confirm text is preserved.
17. Preview/submit and confirm backend validation still works.
18. Expand Scene Reference and confirm it lists targets only.
19. Advance a beat and confirm narration reflects the changed state.
20. Refresh and confirm narration remains stable for the same state.

## Known Limitations

- Persistent visit-count tracking is not yet fully stored in a dedicated visit table.
- Historical narration snapshots are documented and partially modeled conceptually, but current live narration is generated from current state and existing result/history read models.
- Legacy scenes continue through fallbacks; only the active Greyvale playtest scene was upgraded in this phase.
