# Stage 6B.2 Character List And Practical Character Sheet

Stage 6B.2 gives Firebase-authenticated web players a real character management surface. SMS and phone identity are not required.

## Scope

This stage adds a practical playable sheet, not full character management.

Included now:

- Character list at `/play/characters`.
- Character sheet at `/play/characters/:characterId`.
- Explicit active character switching.
- Pending unresolved action warning before switching away from the current active character.
- Current adventure summary.
- Light character knowledge preview.
- Dashboard links into character management.

Deferred:

- Full inventory editing.
- Spell preparation and spellbook management.
- Resource, rest, condition, and feature-use tracking.
- Full campaign knowledge/history/journal.

## Backend Endpoints

All routes require Firebase bearer auth and backend account ownership.

- `GET /api/play/characters`
- `GET /api/play/characters/:character_id`
- `POST /api/play/active-character`

The legacy 6B.1 route remains available:

- `POST /api/play/characters/:character_id/set-active`

The new active-character endpoint returns explicit switch metadata, including whether the previous active character had a submitted unresolved action.

## Character List Contract

`GET /api/play/characters` returns only characters owned by the authenticated account.

```json
{
  "characters": [
    {
      "character_id": "123",
      "name": "Aric",
      "level": 1,
      "species": "Human",
      "subrace": null,
      "class": "Rogue",
      "background": "Wanderer",
      "trait": "Curious",
      "status": "active",
      "is_active_character": true,
      "current_campaign": {
        "campaign_instance_id": "44",
        "campaign_name": "Shadows on the Grey Road",
        "world_slug": "greyvale",
        "current_location_label": "Grey Road Inn",
        "current_objective": {
          "title": "Learn what happened to the caravan"
        },
        "action_required": true
      },
      "pending_action": {
        "has_pending_unresolved_action": false,
        "action_required": true,
        "status": "action_required"
      }
    }
  ],
  "active_character_id": "123"
}
```

Sorting is active character first, then recently updated/created characters.

## Practical Sheet Contract

`GET /api/play/characters/:character_id` uses backend character and `dnd5e_character` read-model data. Flutter does not compute core rules.

The response includes:

- Overview.
- Ability scores and modifiers.
- Combat basics.
- Features.
- Proficiencies.
- Equipment summary.
- Spell summary.
- Background and trait.
- Current adventure.
- Knowledge preview.
- Pending action state.
- Explicit limitations for deferred management.

Knowledge preview is intentionally light and character-limited. It returns a clue count plus recent known facts for the requested character only. It must not expose hidden world truth, GM notes, or another character's knowledge.

## Active Character Switching

Switching active character only updates the account/character active pointer.

It does not:

- Cancel pending actions.
- Move a character.
- Create or duplicate campaigns.
- Change old campaign membership.
- Resolve or alter action windows.

If the current active character has a submitted unresolved action, the Flutter UI shows:

```text
You have an unresolved action with {characterName}. Switching active characters will not cancel it, but you may miss updates for that character.
```

The backend still enforces ownership and idempotent switching.

## Pending Action Meanings

`has_pending_unresolved_action = true` means the character submitted an action and the beat/window has not resolved yet.

`action_required = true` means an open action window exists and the character has not submitted.

These states are scoped per character, not account-wide.

## Flutter Routes

- `/play/characters`
- `/play/characters/:characterId`

Dashboard links:

- **Manage Characters** opens `/play/characters`.
- **View Character** opens the active character sheet.
- **Create Character** and **Resume Draft** remain wired to 6B.1.
- **Start Adventure** routes to `/play` so the 6B.3 starter intro confirmation is preserved before campaign assignment.

## 6B.2D Roadmap

Future **6B.2D - Full Detailed Character Sheet & Character Management** should add:

- Inventory management.
- Equipment changes.
- Attunement if supported.
- Currency.
- Item use.
- Spellbook and prepared spell management.
- Resource tracking.
- Rests and recovery.
- Conditions.
- Feature usage tracking.
- Consumables.
- Detailed rules breakdowns.
- Character change audit/history.
- Printable/exportable sheet if desired.

## 6B.6 Roadmap

Future **6B.6 - Campaign History, Clues, and Character Knowledge** should add:

- Full known clues list.
- Facts, rumors, and confidence states.
- NPCs met.
- Locations discovered.
- Objective history.
- Beat history.
- Event links showing how something was learned.
- Private vs party-shared knowledge.
- Character journal.
- Campaign timeline.
- Search and filtering.
- Strict hidden-truth protection.

## Manual Checklist

1. Sign in at `/play`.
2. Open `/play`.
3. Click **Manage Characters**.
4. Confirm `/play/characters` loads real owned characters.
5. Create or use an existing character.
6. Open **View Character**.
7. Confirm overview, abilities, combat, features, proficiencies, equipment, spells, adventure, and knowledge preview render.
8. Confirm no hidden facts appear in knowledge preview.
9. Create a second character.
10. Set the second character active.
11. Confirm the first character's campaign membership and actions are unchanged.
12. Create or seed a submitted unresolved action for the active character.
13. Attempt to switch active character.
14. Confirm the warning modal appears.
15. Choose **Switch Anyway**.
16. Confirm the old action remains pending and dashboard/list/sheet active markers update.

## Test Commands

Backend DB-backed targeted test:

```powershell
cd backend
node --test --test-concurrency=1 test/stage6b2-web-character-management.test.js
```

Flutter checks:

```powershell
cd apps/player_app
flutter test
flutter analyze
flutter build web
```

If Flutter is not installed locally, run the same commands through the Flutter Docker image with `flutter pub get` first.
