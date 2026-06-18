# Stage 6B.5 Web Action Composer

Stage 6B.5 adds validated web action submission to the rich scene view.

The player writes natural text first, optionally chooses a visible target and verb, previews the backend interpretation, then confirms submission. The backend remains authoritative: Flutter never invents valid targets, hidden affordances, NPC identities, interactions, or outcomes.

## Flow

1. The player opens `/play/campaign/scene`.
2. `/api/play/current-scene` returns the character-specific scene view, including visible affordances and action status.
3. The player writes one clear action for the current beat.
4. The player may select a visible affordance and available verb.
5. The player previews via `POST /api/play/action/preview`.
6. If resolved, the player confirms via `POST /api/play/action/submit`.
7. If ambiguous or multi-action, the backend returns safe clarification options.
8. The submitted action appears on the scene page and can be edited while the window is open and editing is allowed.

## Runtime Config

Campaigns may define `web_runtime_config_json` on `dnd5e_campaign`.

Example:

```json
{
  "resolution_mode": "scheduled",
  "allow_action_editing": true,
  "action_window_policy": "open_until_resolution",
  "beat_interval_minutes": 1440,
  "daily_resolution_time_local": "09:00",
  "timezone": "America/Chicago",
  "manual_advance_enabled": true,
  "requires_preview_before_submit": true,
  "one_action_policy": "hybrid_primary"
}
```

Supported values are intentionally future-facing:

- `resolution_mode`: `scheduled`, `manual`, `immediate_solo`
- `action_window_policy`: `open_until_resolution`, `fixed_window`, `open_until_submitted`, `gm_controlled`, `immediate_on_submit`
- `allow_action_editing`: `true` or `false`
- `manual_advance_enabled`: `true` or `false`

For 6B.5, immediate solo resolution is not enabled. Submitting an action only updates the submitted action state and waits for the existing runtime/beat flow.

For the web async MVP, `open_until_resolution` is the default. The action window opens when the beat prompt is available and remains open until scheduled resolution or dev/GM manual advancement. This replaces the legacy SMS-era five-minute response timeout for web play.

## Preview Endpoint

`POST /api/play/action/preview`

Requires Firebase auth. The backend derives the active account, active character, active campaign, current scene, and current open action window.

Request:

```json
{
  "raw_text": "I ask the shaken woman what happened.",
  "selected_verb": null,
  "selected_affordance_id": null
}
```

Resolved response:

```json
{
  "status": "resolved",
  "candidate": {
    "verb": "talk",
    "target_affordance_id": "npc:npc_elira_survivor",
    "target_label": "a shaken woman",
    "target_type": "npc"
  },
  "validation": {
    "can_submit": true
  }
}
```

Clarification response:

```json
{
  "status": "needs_clarification",
  "message": "Who do you want to talk to?",
  "options": [
    {
      "label": "talk the innkeeper",
      "verb": "talk",
      "target_affordance_id": "npc:npc_innkeeper_tomas",
      "target_label": "the innkeeper"
    }
  ],
  "validation": {
    "can_submit": false
  }
}
```

## Submit Endpoint

`POST /api/play/action/submit`

Requires Firebase auth. The backend re-runs preview resolution and validation before storing anything. Client-provided resolved actions are not trusted.

Request:

```json
{
  "raw_text": "I ask the shaken woman what happened.",
  "selected_verb": "talk",
  "selected_affordance_id": "npc:npc_elira_survivor"
}
```

Response includes the updated `action_status` and refreshed `current_scene`.

## Persistence And Audit

Action submissions are stored in `dnd5e_web_action_submission`, unique by action window and character.

Edits replace the current submitted action while preserving previous versions in `submission_history_json`. Meaningful submit/update events are recorded in the campaign log as `action_submitted` or `action_submission_updated`.

## Safety Rules

- Only visible, available affordances from the character-specific scene view can be targeted.
- Unknown NPC true names, hidden NPCs, hidden clues, GM notes, secret DCs, future outcomes, and raw debug payloads are never returned to normal player responses.
- Preview is required before submit in the MVP.
- One clear primary action is accepted; obvious multi-action input asks the player to choose one.
- AI resolution is disabled by default.

## Manual Checklist

1. Sign in and open `/play/campaign/scene`.
2. Confirm the composer appears when the action status is `action_needed`.
3. Type: `I ask the shaken woman what happened.`
4. Preview the action and verify the target/verb are safe and visible.
5. Submit the action.
6. Confirm the submitted action appears and status changes to submitted.
7. Edit the action while the window is still open.
8. Try ambiguous text such as `Talk` and confirm clarification options appear.
9. Try obvious multi-action text and confirm the one-primary-action prompt appears.
10. Confirm no immediate beat resolution occurs in this stage.
