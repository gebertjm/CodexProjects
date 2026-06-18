# Web Beat And Action Window Model

This document defines the web-first async beat model used by DailyTTRPG.

## Core Model

A beat is one resolved unit of campaign progress:

1. The current scene/prompt is shown to the player.
2. The action window opens immediately.
3. The player submits or edits one primary action.
4. The beat resolves by schedule or GM/dev advance.
5. The runtime applies the action, persists events/state changes, and opens the next action window.

An action window is not a short five-minute opening. For web async play, it is the full interval between the player-facing prompt and the next resolution.

## Timing

Timestamps are stored canonically as UTC `TIMESTAMPTZ`.

When a prompt is available at time `T`:

- `opens_at = T`
- `expires_at = next scheduled resolution time`, or `NULL` for manual/GM-controlled mode
- `status = open`

Players can submit/edit while:

- `status = open`
- `now >= opens_at`
- `now < expires_at`, unless `expires_at` is `NULL`
- the campaign is active
- `allow_action_editing = true` for replacement edits

Flutter displays scheduled close times in the user’s local timezone.

## Runtime Config

Campaigns may define `web_runtime_config_json`:

```json
{
  "resolution_mode": "scheduled",
  "beat_interval_minutes": 1440,
  "daily_resolution_time_local": "09:00",
  "timezone": "America/Chicago",
  "action_window_policy": "open_until_resolution",
  "allow_action_editing": true,
  "manual_advance_enabled": true
}
```

Supported `resolution_mode` values:

- `scheduled`
- `manual`
- `immediate_solo`

Supported `action_window_policy` values:

- `open_until_resolution`
- `fixed_window`
- `open_until_submitted`
- `gm_controlled`
- `immediate_on_submit`

The current web starter/default behavior is `open_until_resolution`, `scheduled`, and `allow_action_editing = true`. Immediate solo resolution is not enabled in this stage.

## Dev/GM Advance

Authorized dev/GM accounts can use one-click beat advancement:

`POST /api/dev/advance-beat`

Request:

```json
{
  "campaign_instance_id": "123"
}
```

Behavior:

1. Verifies Firebase auth.
2. Verifies the account capability server-side.
3. Closes and locks the current action window.
4. Runs the submitted action or configured default/no-op action through the real runtime.
5. Marks the old window resolved.
6. Records campaign log entries.
7. Opens the next action window immediately.
8. Returns the refreshed current scene/action status.

The endpoint is idempotency guarded against double-clicks: resolving windows return a safe status, and repeated requests within a short interval do not advance another beat accidentally.

## Enabling Dev/GM Capability

Accounts default to no beat-advance capability.

Enable a specific account manually:

```sql
UPDATE account
SET can_advance_beats = TRUE
WHERE email = 'your-email@example.com';
```

Disable it:

```sql
UPDATE account
SET can_advance_beats = FALSE
WHERE email = 'your-email@example.com';
```

Frontend visibility is only a convenience. The backend always enforces `can_advance_beats`.

## Manual Checklist

1. Start or resume a campaign.
2. Open `/play/campaign/scene`.
3. Confirm the action window is open immediately.
4. Confirm `opens_at` is prompt time/now and `expires_at` is the next resolution time.
5. Submit an action.
6. Confirm the submitted action remains editable while the window is open.
7. Confirm a normal player cannot see the advance button.
8. Enable `can_advance_beats` for your account.
9. Refresh/sign in again if needed.
10. Confirm the dev/GM advance button appears.
11. Click `Close Window & Resolve Beat`.
12. Confirm the old window resolves and the next window opens immediately.
13. Double-click or repeat quickly and confirm it does not resolve twice.
