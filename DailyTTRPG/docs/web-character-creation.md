# Stage 6B.1 Web Character Creation MVP

Stage 6B.1 moves DailyTTRPG character creation into the authenticated Flutter web app. SMS and phone identity are not required.

## Product Scope

The MVP supports three web creation modes:

- **Quick Start**: name, archetype, review, create.
- **Guided**: name, species, lineage if needed, class, attribute preset, background, trait, recommended defaults, review, create.
- **Detailed**: name, species, lineage if needed, class, manual Standard Array assignment, background, trait, recommended defaults, review, create.

Detailed mode is intentionally honest about its current limits. Standard Array assignment is real. Granular skill, tool, language, equipment, spell, and class-feature selection use recommended backend defaults for now.

## Routes

Flutter routes:

- `/play/create-character`
- `/play/create-character/quick`
- `/play/create-character/guided`
- `/play/create-character/detailed`

Backend routes:

- `GET /api/play/character-creation/options`
- `GET /api/play/character-creation/draft`
- `POST /api/play/character-creation/draft`
- `PATCH /api/play/character-creation/draft/:draft_id`
- `DELETE /api/play/character-creation/draft/:draft_id`
- `POST /api/play/characters`
- `POST /api/play/characters/:character_id/set-active`
- `POST /api/play/start-adventure`

All backend routes require Firebase bearer auth. The backend maps the Firebase UID to the backend account through the existing `/api/me` account foundation.

## Draft Persistence

Drafts are stored in `dnd5e_character_creation_draft`.

Rules:

- One active draft per account by default.
- Drafts belong to the authenticated backend account.
- Drafts are not `dnd5e_character` rows.
- Drafts cannot become active characters.
- Drafts cannot start campaigns.
- Final creation marks the draft `completed`.
- Start-over abandons the draft.

The Flutter app keeps local step state for responsiveness and saves the backend draft at major transitions.

## Backend Validation

Frontend validation is only guidance. Final validation happens in `webCharacterCreationService`.

The backend validates:

- mode
- name
- species/race
- subrace belongs to species
- supported class
- attribute preset or Standard Array
- background
- trait
- archetype references
- recommended default equipment/spell availability

Detailed Standard Array must assign exactly:

```json
[15, 14, 13, 12, 10, 8]
```

## Persistence Behavior

Final creation writes real rows:

- `dnd5e_character`
- `dnd5e_character_class`
- `dnd5e_character_item`
- `dnd5e_character_spell` when default spells apply

Created characters use:

- `status = active`
- `created_via_web = true`
- `created_via_sms = false`
- `web_creation_metadata_json` for mode/default audit details

If the account has no active character, the new character becomes active and `account.active_character_id` is set. If the account already has an active character, the new character remains finalized but does not replace the active character until the user explicitly chooses Set as Active Character.

## Start Adventure

After creating the first active character, the UI offers **Start Adventure** if no active campaign exists.

Stage 6B.3 routes that CTA back through `/play`, where the player sees a lightweight starter intro and presses **Begin Adventure** before any campaign is assigned. The endpoint delegates to the existing configurable starter campaign assignment service. Current starter config is Greyvale / Shadows on the Grey Road, but the UI and endpoint treat it as configurable starter assignment rather than a permanent hardcode.

## Defaults Policy

MVP defaults:

- equipment: recommended defaults
- spells: recommended defaults where needed
- skills: recommended defaults
- languages: recommended defaults
- granular class choices: recommended defaults

The review screen shows that defaults are being used.

## 6B.1D Roadmap

Future **6B.1D — Full Detailed Character Builder Completion** should add:

- point buy
- optional rolled stats if desired
- skill proficiency selection
- tool/language selection
- class starting choices
- subclass choices when applicable
- equipment selection
- spell/cantrip selection
- prepared vs known spell handling
- feature choices
- class-specific resources
- deeper validation
- full audit trail

This is deferred because 6B.1 focuses on the reliable auth-to-playable-character path.

## Manual Checklist

1. Sign in at `/play`.
2. Confirm dashboard shows Create Character.
3. Open `/play/create-character`.
4. Start Quick Start.
5. Enter a name, choose an archetype, create.
6. Confirm `/api/me` shows the character as active if it is the first character.
7. Confirm `dnd5e_character.created_via_web = true`.
8. Confirm `dnd5e_character_class` exists.
9. Confirm default items exist in `dnd5e_character_item`.
10. Create a second character.
11. Confirm the existing active character is not overwritten.
12. Use Set as Active Character.
13. Start Guided and refresh mid-flow.
14. Confirm draft resumes from the backend.
15. Start Detailed and assign Standard Array.
16. Confirm duplicate Standard Array values are rejected by backend validation.
17. Confirm no phone number or SMS identity is required.
18. Confirm Start Adventure opens the `/play` intro confirmation and Begin Adventure assigns or resumes the starter campaign.

## Test Commands

```powershell
cd backend
npm test

cd ..\apps\player_app
flutter test
flutter analyze
flutter build web
```

This local Codex host currently does not have Flutter/Dart on PATH, and Docker Desktop is not running, so DB-backed and Flutter checks need a reachable Postgres service and Flutter SDK installed.
