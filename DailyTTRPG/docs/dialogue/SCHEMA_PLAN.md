# Dialogue Schema Plan

This document proposes JSON/data shapes for Dialogue Focus/Commit. It is not a migration or implementation.

## Design Rules

- Keep critical active-scene context in the main dialogue scene document.
- Put heavy/archive/debug/global material behind links.
- Use stable content IDs/slugs, not database IDs.
- Prefer explicit state reads/writes over prose.
- Separate player-facing fields from GM/dev/debug fields.
- Do not rely on frontend filtering for hidden content.

Build 2 implementation note:

- Schema constants now live in `backend/src/services/dialogueFocusCommit/dialogueFocusCommitSchema.js`.
- The first validator accepts `interaction_domain: "dialogue_focus_commit"` and the documented `dialogue_model: "focus_commit"` alias.
- The validator is standalone for now. It is not yet wired into content import, runtime resolution, database persistence, or UI.
- Minimal validation fixtures live under `backend/test/fixtures/dialogue-focus-commit-fixtures.js`.

## Dialogue Scene

```json
{
  "slug": "elin-memory-dialogue",
  "scene_slug": "elin-memory-fragments",
  "npc_template_slug": "elin-harrow",
  "dialogue_model": "focus_commit",
  "title": "Elin's Broken Account",
  "conversation_surface": {},
  "passive_social_insight": [],
  "clarifying_questions": [],
  "committed_social_moves": [],
  "generic_fallback": {},
  "dialogue_exits": [],
  "relationship_context": {},
  "transcript_policy": {},
  "summary_policy": {},
  "annotation_policy": {},
  "links": {
    "completed_record_template": "completed_dialogue_records/elin-memory",
    "search_profile": "dialogue_search_profiles/greyvale-social"
  },
  "is_active": true
}
```

Required:

- `slug`
- `scene_slug` or equivalent dialogue attachment
- `dialogue_model`
- `conversation_surface`
- at least one `committed_social_move` or `dialogue_exit`

Validation notes:

- `dialogue_model` should be `focus_commit` for this adapter.
- Legacy graph-only dialogue remains valid without this field.
- `npc_template_slug` is required for single-NPC scenes unless the scene declares multi-party participants.

## Conversation Surface

Dialogue-domain `surface`.

```json
{
  "surface_id": "surface_elins_guarded_memory",
  "voice": "second_person_present",
  "speaker_context": [
    {
      "speaker_id": "elin-harrow",
      "known_label": "Elin",
      "unknown_label": "the shaken woman",
      "demeanor": "keeps one hand around the torn sash"
    }
  ],
  "paragraphs": [
    {
      "kind": "opening",
      "text": "The woman keeps her voice low enough that the inn's noise nearly swallows it."
    },
    {
      "kind": "tension",
      "text": "She answers when spoken to, but the rhythm of her breathing changes whenever the road is mentioned."
    }
  ],
  "available_context": [
    "caravan_attack",
    "grey_road"
  ],
  "hidden_context": [
    "gm_only_motive_reference"
  ]
}
```

Required:

- `surface_id`
- `paragraphs`

Optional:

- `speaker_context`
- `available_context`
- `state_variants`
- `latest_development_ref`
- `gm_notes` in GM-only fields only

Validation notes:

- Player-facing paragraphs must not use hidden-only sources.
- Unknown labels must be used until knowledge reveals identity.

## Passive Social Insight

Dialogue-domain `passive_context`.

```json
{
  "insight_id": "notice_elin_avoids_shrine",
  "target_id": "elin-harrow",
  "resolution_mode": "passive_social_insight",
  "priority": 80,
  "check": {
    "mode": "passive",
    "ability": "wisdom",
    "skill": "insight",
    "dc": 14,
    "visibility": "success_only"
  },
  "availability": {
    "requires_knowledge": ["caravan_attack_known"]
  },
  "on_success": {
    "text": "Your Passive Insight catches the omission: she talks around the shrine, not through it.",
    "knowledge_grants": ["elin_avoids_the_shrine"]
  },
  "on_failure": {
    "text": null
  }
}
```

Required:

- `insight_id`
- `resolution_mode`
- `on_success.text` if success is reachable

Defaults:

- `check.visibility`: `success_only`
- Failure is silent unless explicitly safe.

Validation notes:

- Failed hidden/success-only checks must persist backend-side but never leak in player APIs.
- Knowledge grants are optional and must be explicit.

## Clarifying Question

Dialogue-domain `free_focus`.

```json
{
  "question_id": "ask_what_she_remembers_first",
  "target_id": "elin-harrow",
  "label": "What do you remember first?",
  "resolution_mode": "clarifying_question",
  "priority": 90,
  "requires_check": false,
  "result": {
    "text": "She remembers the sound first: a wheel cracking, then shouting from the trees.",
    "summary": "Elin remembers the wagon breaking before she remembers the attackers."
  },
  "knowledge_grants": [],
  "state_changes": [],
  "committed_followup": {
    "enabled": true,
    "default_social_move_id": "press_on_wagon_break",
    "check_resolution": "advantage"
  }
}
```

Checked example:

```json
{
  "question_id": "watch_when_bandits_are_named",
  "target_id": "elin-harrow",
  "label": "Watch her reaction to the word bandits",
  "resolution_mode": "clarifying_question",
  "requires_check": true,
  "check": {
    "mode": "standard",
    "skill": "insight",
    "dc": 13,
    "visibility": "visible"
  },
  "on_success": {
    "text": "She flinches at the word, but not with recognition. It sounds like a wrong answer to her.",
    "knowledge_grants": ["bandits_not_full_explanation"]
  },
  "on_failure": {
    "text": "She is frightened enough that every hard word makes her flinch."
  }
}
```

Required:

- `question_id`
- `label`
- `resolution_mode`
- no-check: `result.text`
- checked: reachable `on_success.text` and `on_failure.text`

Defaults:

- `check.visibility`: `visible`
- `repeat_policy`: once per dialogue state version

Validation notes:

- Labels should read as questions or observations, not committed moves.
- Clarifying Questions may not apply major state changes unless explicitly authored and validated.

## Committed Social Move

Dialogue-domain `committed_action`.

```json
{
  "move_id": "press_for_shrine_detail",
  "label": "Press gently about the shrine",
  "resolution_mode": "committed_social_move",
  "social_move_type": "press",
  "target_id": "elin-harrow",
  "requires_check": true,
  "check": {
    "mode": "standard",
    "ability": "charisma",
    "skill": "persuasion",
    "dc": 14,
    "visibility": "visible"
  },
  "availability": {
    "requires_knowledge": ["bandits_not_full_explanation"]
  },
  "preview": {
    "summary": "You will spend the beat pressing Elin for what she is avoiding."
  },
  "on_success": {
    "npc_response": "She admits the attackers stopped when the shrine bell sounded.",
    "result_summary": "Elin connects the attack to the old shrine bell.",
    "knowledge_grants": ["shrine_bell_stopped_attack"],
    "relationship_writes": [
      {
        "scope": "character_npc",
        "field": "trust",
        "operation": "increment",
        "value": 1,
        "visibility": "gm_and_player_perceived",
        "reason": "The player pressed gently rather than accusing her."
      }
    ],
    "state_changes": [],
    "next_surface_ref": "surface_elins_shrine_memory"
  },
  "on_failure": {
    "npc_response": "She closes down and says she has already told you what she can.",
    "result_summary": "Elin withdraws from the question.",
    "relationship_writes": [
      {
        "scope": "character_npc",
        "field": "pressure",
        "operation": "increment",
        "value": 1,
        "visibility": "gm_only",
        "reason": "The question pushed too quickly."
      }
    ]
  }
}
```

Required:

- `move_id`
- `label`
- `resolution_mode`
- `social_move_type`
- target or explicit multi-party target model
- reachable outcome text

Validation notes:

- Checked moves require ability/skill/DC.
- State writes require registered field and scope.
- Outcome branches must not write hidden state through shorthand.

## Generic Fallback

Generic fallback handles natural dialogue moves that do not match a specific authored move.

```json
{
  "enabled": true,
  "safe_intents": ["ask_basic", "reassure", "listen", "clarify"],
  "exhaustion_policy": {
    "max_uses_per_surface": 2,
    "after_exhausted": "ask_for_specific_move"
  },
  "fallback_response": {
    "text": "She answers only in fragments, and none of them move beyond what she has already said.",
    "summary": "The conversation does not reveal anything new."
  },
  "disallowed_intents": ["force_confession", "reveal_secret", "skip_scene"]
}
```

Required if enabled:

- `safe_intents`
- `fallback_response.text`
- exhaustion policy

Validation notes:

- Unsafe generic fallback is a hard error.
- Fallback must not grant major clues, relationship changes, or transitions unless explicitly authored by intent.

## Relationship/Social State Definitions

```json
{
  "relationship_state_definitions": [
    {
      "field": "trust",
      "scope": "character_npc",
      "type": "ladder",
      "values": [-2, -1, 0, 1, 2],
      "default": 0,
      "player_visibility": "perceived_only",
      "gm_visibility": "full",
      "labels": {
        "-2": "hostile",
        "0": "uncertain",
        "2": "trusting"
      }
    }
  ]
}
```

Required:

- `field`
- `scope`
- `type`
- default or explicit initial-state rule

Validation notes:

- Relationship writes to unregistered fields are hard errors.
- Ladder values outside allowed values are hard errors.

## Completed Dialogue Record

```json
{
  "record_id": "completed_elin_memory_001",
  "dialogue_scene_id": "elin-memory-dialogue",
  "campaign_instance_id": "runtime",
  "character_id": "runtime",
  "participants": [
    {
      "participant_id": "elin-harrow",
      "player_label": "Elin",
      "known_identity_state": "known"
    }
  ],
  "started_at": "runtime",
  "completed_at": "runtime",
  "summary": "Elin described how the attack changed when the shrine bell sounded.",
  "visible_outcomes": [],
  "knowledge_gained": [],
  "relationship_changes_visible": [],
  "transcript_ref": "runtime",
  "provenance": {
    "event_ids": [],
    "state_mutation_ids": []
  }
}
```

Player-facing records must be safe summaries. GM/dev details belong in separate payloads or linked audit views.

## Transcript/Turn Records

```json
{
  "turn_id": "runtime",
  "dialogue_session_id": "runtime",
  "turn_index": 4,
  "turn_type": "committed_social_move",
  "speaker": {
    "type": "player_character",
    "label": "Kael"
  },
  "input": {
    "raw_text": "I gently ask what happened when the bell sounded.",
    "selected_move_id": "press_for_shrine_detail"
  },
  "output": {
    "npc_response": "She admits the bell changed everything.",
    "safe_mechanics": []
  },
  "visibility": "player_visible",
  "provenance": {}
}
```

Turn types:

- `conversation_surface`
- `passive_social_insight`
- `clarifying_question`
- `committed_social_move`
- `dialogue_exit`
- `system_summary`
- `gm_annotation`
- `correction_notice`

## Annotation/Correction Lifecycle Records

```json
{
  "annotation_id": "ann_001",
  "target_type": "dialogue_scene",
  "target_id": "elin-memory-dialogue",
  "annotation_type": "safety",
  "severity": "warning",
  "visibility": "gm_dev_only",
  "body": "This outcome references the shrine before the character can know it.",
  "created_by": "runtime_or_user",
  "status": "open"
}
```

```json
{
  "correction_id": "corr_001",
  "annotation_id": "ann_001",
  "target_type": "committed_social_move",
  "target_id": "press_for_shrine_detail",
  "correction_type": "content_patch",
  "replacement_ref": "content_patch_slug",
  "status": "draft",
  "supersedes_correction_id": null,
  "reviewed_by": null,
  "published_at": null
}
```

Validation notes:

- Broken lifecycle links are hard errors.
- Player-facing records cannot link directly to hidden-only annotation bodies.
