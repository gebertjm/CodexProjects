# Stage 6B.3 Campaign Dashboard And Adventure Entry

Stage 6B.3 turns `/play` into the authenticated player dashboard and starter adventure entry point. SMS and phone identity are not required.

## Scope

Included now:

- Real dashboard read model from backend account, active character, campaign, runtime, environment, and NPC state.
- Starter adventure intro confirmation before campaign assignment.
- Idempotent Begin Adventure endpoint.
- Light real `/play/campaign` preview.
- Action status summary.
- Environment summary from the 5J.2 environment layer when available.
- Character-perspective NPC preview from the 5J.3 presence layer when available.

Deferred:

- Full campaign history, clues, and journal: 6B.6.

Stage 6B.4 adds `/play/campaign/scene` as the rich current scene view. Stage 6B.5 adds preview-first action composition and submission on that route. `/play/campaign` remains the overview and links to it with **View Current Scene**.

## Backend Endpoints

All routes require Firebase bearer auth and backend account ownership.

- `GET /api/play/dashboard`
- `GET /api/play/starter-adventure`
- `POST /api/play/start-adventure`
- `GET /api/play/current-adventure`

`/api/play/dashboard` calls `PlayerDashboardService`, which summarizes existing systems instead of replacing them.

## Dashboard Contract

Example:

```json
{
  "account": {
    "account_id": "123",
    "display_name": "Player",
    "sms_enabled": false,
    "sms_mode": "disabled"
  },
  "active_character": {
    "character_id": "44",
    "name": "Aric",
    "level": 1,
    "species": "Human",
    "class": "Fighter"
  },
  "characters_summary": {
    "count": 1,
    "manage_route": "/play/characters"
  },
  "current_adventure": {
    "has_active_campaign": true,
    "campaign_instance_id": "88",
    "world_id": "greyvale",
    "world_name": "Greyvale",
    "campaign_package_id": "shadows_grey_road",
    "campaign_name": "Shadows on the Grey Road: Aric",
    "current_location_name": "Broken Caravan",
    "current_scene_title": "Broken Caravan",
    "current_objective": {
      "title": "Witness the aftermath"
    },
    "environment": {
      "weather": "rain",
      "time_of_day": "evening",
      "season": "autumn",
      "summary": "Evening · Rain · Autumn"
    },
    "visible_npc_preview": [],
    "action_status": {
      "state": "action_needed",
      "label": "Action needed",
      "description": "Your character can act now."
    },
    "preview_route": "/play/campaign",
    "scene_route": "/play/campaign/scene",
    "full_scene_view_deferred_to": "6B.4"
  },
  "next_actions": {
    "can_create_character": false,
    "can_resume_draft": false,
    "can_start_adventure": false,
    "can_continue_adventure": true,
    "continue_route": "/play/campaign",
    "manage_characters_route": "/play/characters"
  }
}
```

## Start Adventure Flow

The UI must not assign a campaign immediately when the player clicks Start Adventure.

Flow:

```text
/play
-> Start Adventure
-> intro confirmation
-> Begin Adventure
-> POST /api/play/start-adventure
-> /play/campaign
```

Current starter config:

- World: Greyvale
- Campaign package: Shadows on the Grey Road

The frontend receives starter text from the backend through `starter_adventure`; it does not hardcode Greyvale as a permanent frontend rule.

## Idempotency

`POST /api/play/start-adventure` delegates to the existing configurable starter assignment service. It:

- Uses the active character by default.
- Rejects missing active characters.
- Rejects unowned or non-active characters.
- Resumes an existing active campaign instead of duplicating it.
- Returns `/play/campaign` as the route hint.

Repeated Begin Adventure clicks should return the existing campaign. The frontend also disables repeated clicks while a start request is in flight.

## Action Statuses

Dashboard action status values:

- `no_active_character`
- `ready_to_start`
- `action_needed`
- `action_submitted`
- `waiting_for_next_beat`

Future values are reserved for paused, complete, stale, and beat-ready states.

`action_submitted` means the character has submitted an action that has not resolved. `action_needed` means the character can act now.

## Environment And NPC Preview Safety

The dashboard and `/play/campaign` preview may show compact summaries only.

Environment:

- Uses 5J.2 effective environment when available.
- Shows a compact summary such as `Evening · Rain · Autumn`.
- Does not expose mechanical debug details.

NPC preview:

- Uses 5J.3 NPC presence.
- Shows visible NPCs only.
- Uses character-perspective display names.
- Does not reveal hidden NPCs, hidden locations, unknown true names, GM notes, or debug source state.

## Flutter Routes

- `/play`: main dashboard.
- `/play/campaign`: light real adventure preview.
- `/play/campaign/scene`: rich current scene view from `GET /api/play/current-scene`.
- `/play/characters`: character management.
- `/play/characters/:characterId`: practical character sheet.
- `/play/create-character`: character creation.

Character list, sheet, and post-creation CTAs route back to `/play` for Start Adventure so the confirmation step is preserved.

## Manual Checklist

1. Sign in.
2. Open `/play` with no character.
3. Confirm Create Character CTA.
4. Create or select an active character.
5. Return to `/play`.
6. Confirm Start Adventure CTA appears.
7. Click Start Adventure.
8. Confirm the intro appears and no campaign is created before Begin Adventure.
9. Click Cancel.
10. Confirm still no campaign.
11. Click Start Adventure again.
12. Click Begin Adventure.
13. Confirm route to `/play/campaign`.
14. Confirm campaign, world, location, scene, and objective render.
15. Confirm environment summary renders if available.
16. Confirm NPC preview renders if present.
17. Confirm action status renders.
18. Return to `/play` and confirm Continue Adventure appears.
19. Repeat Begin Adventure or call the endpoint manually and confirm no duplicate campaign.

## Test Commands

Backend targeted test:

```powershell
cd backend
node --test --test-concurrency=1 test/stage6b3-campaign-dashboard.test.js
```

Flutter checks:

```powershell
cd apps/player_app
flutter test
flutter analyze
flutter build web --release --base-href /play/
```
