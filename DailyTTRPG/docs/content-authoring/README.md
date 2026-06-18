# DailyRPG Content Authoring Guide

Stage 5B defines the canonical JSON authoring grammar for DailyRPG content packages. Content is authored on disk, validated by the Stage 5C importer, then transactionally imported into the backend.

This guide is intentionally author-facing. If you are writing a world package by hand or with AI assistance, start here.

## Package Shape

World packages live under `content/worlds/<world_slug>`.

```text
content/
  worlds/
    emberfall/
      manifest.json
      world.json
      templates/
        regions/
        locations/
        scenes/
      campaigns/
      regions/
      locations/
      scenes/
      transitions/
      entity_templates/
        npcs/
      world_entities/
      quests/
      interactions/
      dialogue/
      campaign_overlays/
        locations/
        scenes/
```

Folders are optional unless the package needs that content type. `world.json` is required and must contain exactly one world record.

## Shared Object Conventions

Most authored records use the same core conventions:

- `slug` is the stable external identifier. Use lowercase letters, numbers, hyphens, or underscores.
- `name`, `title`, or `label` is the human-facing display string, depending on content type.
- `text` stores layered authored prose. Prefer this over scattering one-off string fields.
- References use slugs, never database IDs.
- `tags`, `metadata`, and notes-style fields may be used for authoring clarity when supported, but runtime logic should live in structured conditions/effects.
- Conditions are structured JSON objects, not prose.
- Effects are declarative JSON objects executed later by the centralized progression/runtime systems.

Numeric database IDs are intentionally absent from content files. The importer resolves slugs to IDs internally.

## Text Layers

Use `text` to provide deterministic authored prose for different interfaces.

Supported keys:

- `title`: compact title if the object does not already have `name`/`title`.
- `short`: short UI/SMS-friendly line.
- `summary`: one or two sentence summary.
- `full`: rich narrative text.
- `entry`: text shown when entering a scene or node.
- `sms`: very compact future Twilio copy.
- `recap`: text suitable for logs/history.
- `success`: success result text for checks.
- `failure`: failure result text for checks.
- `gm_notes`: author/GM-only notes.
- `variants`: conditional text variants for future runtime selection.

The importer copies the strongest available layer into legacy database fields where needed. For example, scene `summary` can come from `text.summary`, and interaction `success_text` can come from `text.success`.

## Condition Model

Conditions are shared across scenes, quests, objectives, dialogue, interactions, transitions, and outcomes. They describe when authored content is available or when an objective/outcome applies.

Current supported core keys:

- `required_alignment_abbreviations`: array such as `["LG", "NG"]`.
- `required_campaign_types`: array of `solo`, `party`, `questline`, or `world_event`.
- `required_campaign_flags` / `forbidden_campaign_flags`: map of campaign/world-truth flag keys to expected values.
- `required_character_flags` / `forbidden_character_flags`: map of character knowledge/state flag keys to expected values.
- `required_quest_states`: array of `{ "quest_key": "...", "statuses": ["active"] }`.
- `required_objective_states`: array of `{ "quest_key": "...", "objective_key": "...", "statuses": ["completed"] }`.
- `required_scene_states`, `required_location_states`, `required_entity_states`: structured state checks reserved for runtime/world state.
- `required_knowledge` / `forbidden_knowledge`: checks against character-known discoveries.

Dialogue-only condition extensions:

- `required_session_flags` / `forbidden_session_flags`
- `required_visited_node_keys` / `forbidden_visited_node_keys`
- `required_choice_keys` / `forbidden_choice_keys`
- `requires_success` / `requires_failure`
- `minimum_margin`, `maximum_margin`, `minimum_total`, `maximum_total`, `minimum_roll`, `maximum_roll`

Unsupported keys are rejected by validation. This is deliberate: authors should not sneak rules into prose or unrecognized JSON.

## Effect And Outcome Model

Effects are centralized. Content declares what should happen; runtime/progression services apply it.

Supported effect keys:

- `campaign_flags`: set campaign/world-truth flags.
- `character_flags`: set character knowledge/state flags.
- `npc_states`: update NPC/world-entity disposition-style state.
- `quests`: start, activate, complete, fail, lock, or mark quests available.
- `objectives`: update objective state and progress counts.
- `rewards`: declare centralized rewards such as XP, item, flags, scene unlocks, NPC disposition, or knowledge.
- `xp`: shorthand integer XP grant when a simple reward is enough.
- `knowledge_entries`: reveal player-known lore/event/scene/quest/NPC knowledge.
- `source_knowledge_title` and `source_knowledge_summary`: history/knowledge context for the effect source.
- `session_flags`: dialogue-session-only short-term memory.

Effects can be attached to dialogue nodes/options/outcomes, interactions, scene transitions, scene entry/exit hooks, quests, objectives, and future conditional triggers.

## Scene Authoring

Scenes belong to locations. They define authored opportunities, not every possible action the engine may infer later.

A scene may include:

- `location_slug`
- `template_slug`
- layered `text`
- `entry_conditions`
- starting-scene marker
- authored interactions in `interactions/`
- movement options in `transitions/`
- campaign-specific discovery/availability in `campaign_overlays/scenes/`

Scene availability should use conditions and overlays rather than hardcoded route logic.

## Quest And Objective Authoring

Quests and objectives are separate concepts but currently authored together in one quest file for practical package loading.

Quest records provide:

- quest `slug`, `name`, layered text, and availability conditions
- discovery/recap text
- objective references via embedded objective records
- completion or follow-up effects in future content extensions

Objectives provide:

- objective `slug`, `title`, layered text
- `activation_conditions`
- `completion_conditions`
- `failure_conditions`
- optional `progress_target`
- optional `hard_gate`

Use explicit effects for direct completion, and condition blocks for implicit completion checks.

## Dialogue Authoring

Dialogue is a graph, not a line.

A dialogue file contains:

- dialogue `slug`, `scene_slug`, optional `npc_template_slug`
- trigger metadata such as `trigger_type` and `trigger_event`
- root availability conditions
- `nodes`

Each node contains:

- node `slug`
- `speaker_type`: `npc`, `narrator`, or `system`
- optional `speaker_npc_template_slug`
- layered text
- entry/terminal flags
- node availability conditions
- optional `entry_effects`
- `options`

Each option contains:

- option `slug`, `label`, layered text
- availability conditions
- optional skill check:
  - `check_mode`: `none`, `explicit`, or `implicit`
  - `skill_slug`
  - `difficulty_class`
  - `check_visibility`: `visible` or `hidden`
- `outcomes`

Each outcome contains:

- outcome `slug`
- optional `next_node_slug`
- conditions, including check-result conditions
- effects
- result text
- terminal marker

Dialogue may branch, converge, loop intentionally, or transition into other systems through effects.

## Interaction Authoring

Interactions are non-dialogue actionable content tied to scenes and optionally NPCs/entities.

The initial importer supports skill-check interactions:

- `scene_slug`
- optional `npc_template_slug`
- `label`
- `interaction_type`: currently `skill_check`
- `skill_slug`
- `difficulty_class`
- availability conditions
- `success_effects`
- `failure_effects`
- layered result text

Use interactions for things like investigating a clue, forcing a door, reading an inscription, or calming an animal outside a dialogue graph.

## Encounter Authoring

Encounters are authored templates that describe story intent, allowed scaling boundaries, async pacing, and equivalent rewards. They are loaded from `encounters/` and imported into `dnd5e_encounter_template`.

Encounter records provide:

- `encounter_id`: stable slug used by CLI/API/runtime preview
- `campaign_slug` and `scene_slug`: optional anchors for campaign and scene context
- `encounter_type`: `tutorial`, `minor`, `major`, `story`, `final`, `optional`, or `non_combat`
- `difficulty_intent`: `trivial`, `easy`, `medium`, `hard`, `deadly`, `story`, `avoidable`, or `tutorial`
- `scaling_enabled`: whether runtime may scale at all
- `story_fixed_by_default`: story encounters should set this true
- `explicit_story_scaling`: required if a story-fixed encounter allows scaling
- `allowed_scaling_methods`: prefer `variant_selection`, then `enemy_count`, then `stat_tweak`
- `party_size_range`, `level_range`, and `async_beat_target`
- `variants`: authored enemy compositions for solo/small/full party contexts
- `resolution_paths`: combat and non-combat paths that can resolve the encounter
- `reward_value`: one outcome reward value, equivalent across valid paths when configured

Story encounters are fixed unless the author explicitly enables limited scaling. Solo-enabled encounters should include a solo variant and at least one viable path such as `escape`, `negotiation`, `stealth`, `avoidance`, or `fail_forward`.

Async beat targets should stay practical:

- minor encounters: usually 2-4 beats
- major/story encounters: usually 4-6 beats
- final/story-special encounters may use authored pacing rather than pure power estimates

Copyable template:

```powershell
docs/content-authoring/templates/encounter.template.json
```

## Transition Authoring

Transitions describe explicit movement between scenes.

Baseline movement comes from location/scene structure. Scene-level transitions can add, restrict, or recommend paths.

Transition records support:

- `from_scene_slug`
- `to_scene_slug`
- `label`
- layered text
- `conditions`
- `recommendation`
- `is_default_path`
- `sort_order`

Conditional transitions are how hidden paths, unlocked paths, and alignment-flavored recommendations become data instead of code.

## Reusable Authoring Patterns

Use these patterns as building blocks:

- Talk-to-NPC unlocks clue: dialogue option sets a character flag and reveals knowledge, then an interaction or transition requires that flag.
- Investigation scene with multiple clue paths: several interactions can complete the same objective through different effects.
- Diplomacy-or-combat branch: dialogue success sets trust flags; failure can set hostility flags or trigger a future combat event.
- Delivery quest: quest starts through dialogue, objective completes through scene entry or interaction, reward effect grants XP/item.
- Ambush scene: entering a scene sets a campaign flag or starts a combat event in a future event hook.

Keep reuse explicit for now. Do not invent inheritance in package files yet; copy small patterns and keep slugs clear.

## Author Workflow

1. Create or edit JSON under the correct `content/worlds/<world_slug>` folder.
2. Use slugs for references. Never use DB IDs.
3. Run validation.
4. Fix every validation/reference error.
5. Run dry-run import and review creates/updates.
6. Run import.
7. Inspect imported content through CLI/API/runtime.

Commands:

```powershell
docker compose exec -T backend npm run --silent cli -- validate-content --path content/worlds/emberfall
docker compose exec -T backend npm run --silent cli -- import-content --path content/worlds/emberfall --dry-run
docker compose exec -T backend npm run --silent cli -- import-content --path content/worlds/emberfall
```

Use compact mode for machine-readable output:

```powershell
docker compose exec -T backend npm run --silent cli -- validate-content --path content/worlds/emberfall --compact
```

## Common Authoring Mistakes

- Using numeric database IDs in JSON. Use slugs instead.
- Adding unsupported condition/effect keys. Validation rejects unknown keys.
- Referencing a scene, NPC template, skill, quest, or objective slug that does not exist in the package or database.
- Putting dialogue-session-only flags on non-dialogue effects.
- Forgetting that location and scene slugs still need to be globally unique while legacy key constraints remain.
- Treating templates as runtime state. Runtime consequences belong on world/campaign/character state, not template files.

## Template Files

Copyable JSON templates live in `docs/content-authoring/templates/`.

The Emberfall sample package at `content/worlds/emberfall` is the current executable example package. It includes scenes, a transition, a quest/objective, an interaction, an NPC template, a world entity, campaign overlays, and a dialogue graph.
