# Stage 6B.0 Flutter Web App Foundation

Stage 6B.0 pivots DailyTTRPG to a web-app-first product. The primary player interface is now the Flutter web app at `/play`. SMS remains in the codebase for simulator/testing and future optional notifications, but it is disabled by default for web-created accounts and is not required for onboarding, character creation, or gameplay.

## App Location

The Flutter app lives at:

```text
apps/player_app
```

This keeps the long-lived player app separate from the static public gateway in `frontend/`, while still allowing Firebase Hosting to serve the built Flutter app from `frontend/play`.

## Public And App Routes

Public routes:

- `/`
- `/privacy`
- `/terms`
- `/sms-terms`

Authenticated app routes:

- `/play`
- `/play/login`
- `/play/characters`
- `/play/create-character`
- `/play/campaign`
- `/play/settings`

Firebase Hosting rewrites `/play` and `/play/**` to `/play/index.html`, while policy pages stay static and public.

## Firebase Auth

Supported client methods:

- Google sign-in
- Email/password sign-in
- Email/password account creation
- Password reset email
- Sign out

Enable these providers in Firebase Console:

1. Open Firebase Console.
2. Select project `DailyRPG`.
3. Go to Authentication.
4. Enable Google.
5. Enable Email/Password.
6. Add authorized domains for local/dev/prod as needed, including `dailyttrpg.com`.

## Flutter Config

The Flutter app uses compile-time public Firebase web config:

```powershell
cd apps/player_app
flutter pub get
flutter run -d chrome --web-port 5000 `
  --dart-define=FIREBASE_WEB_API_KEY=your_web_api_key `
  --dart-define=FIREBASE_WEB_APP_ID=your_web_app_id `
  --dart-define=FIREBASE_PROJECT_ID=dailyrpg `
  --dart-define=FIREBASE_AUTH_DOMAIN=dailyrpg.firebaseapp.com `
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=your_sender_id `
  --dart-define=DAILY_TTRPG_API_BASE_URL=http://localhost:3000
```

Firebase web API keys are public client config, not service-account secrets. Do not commit service-account JSON or private keys.

## Build And Copy To Hosting

From repo root, set public Firebase web config as environment variables, then run:

```powershell
$env:FIREBASE_WEB_API_KEY="your_web_api_key"
$env:FIREBASE_WEB_APP_ID="your_web_app_id"
$env:FIREBASE_PROJECT_ID="dailyrpg"
$env:FIREBASE_AUTH_DOMAIN="dailyrpg.firebaseapp.com"
$env:FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
npm run build:player
```

The script runs:

```text
cd apps/player_app
flutter pub get
flutter build web --release --base-href /play/
node scripts/copy-player-build.mjs
```

The copy step replaces `frontend/play` with the Flutter build output.

This Codex environment does not currently have Flutter installed, so `frontend/play/index.html` is a temporary guard page. Replace it with real Flutter build output before production deployment.

## Backend Firebase Admin

The backend verifies Firebase ID tokens on authenticated routes.

Required production env vars:

```env
FIREBASE_PROJECT_ID=dailyrpg
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-example@dailyrpg.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CORS_ALLOWED_ORIGINS=https://dailyttrpg.com,https://www.dailyttrpg.com
```

Alternative:

```env
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/firebase-service-account.json
```

Never commit service-account files.

## `/api/me`

`GET /api/me` requires:

```http
Authorization: Bearer <firebase_id_token>
```

Flow:

```text
Flutter Firebase Auth
-> ID token
-> backend Firebase Admin verification
-> account lookup by firebase_uid
-> auto-create account on first call
-> return player state
```

Response shape:

```json
{
  "account": {
    "account_id": "123",
    "firebase_uid": "...",
    "email": "player@example.com",
    "display_name": "Player",
    "photo_url": null,
    "sms_enabled": false,
    "sms_mode": "disabled"
  },
  "active_character": null,
  "characters": [],
  "current_campaign": null,
  "action_required": false
}
```

Related endpoints:

- `GET /api/me/characters`
- `GET /api/me/active-character`
- `GET /api/me/current-campaign`

## Web Character Creation

Stage 6B.1 adds the primary web character creation flow at `/play/create-character`.

Supported MVP modes:

- Quick Start
- Guided
- Detailed shell with real Standard Array assignment

The backend owns validation and persistence through `/api/play/character-creation/*` and `/api/play/characters`. Created characters write real `dnd5e_character`, `dnd5e_character_class`, recommended item, and recommended spell rows. Phone number and SMS identity are not required.

Detailed mode uses clearly labeled recommended defaults for granular choices that are deferred to **6B.1D — Full Detailed Character Builder Completion**.

See `docs/web-character-creation.md`.

## Web Character Management

Stage 6B.2 adds real character list and practical sheet routes:

- `/play/characters`
- `/play/characters/:characterId`

These routes use authenticated backend data from `GET /api/play/characters` and `GET /api/play/characters/:character_id`. Active character switching uses `POST /api/play/active-character` and warns when switching away from a submitted unresolved action. See `docs/web-character-management.md`.

Phone number is optional. The web app never requires SMS identity.

## SMS Default

For Firebase-created web accounts:

- `sms_enabled = false`
- `sms_mode = disabled`
- `preferred_channel = email`

Future modes are represented but not enabled:

- `disabled`
- `alerts_only`
- `fallback_input`
- `full`

Existing SMS simulator flows still work for development, but they are no longer the primary player onboarding path.

## Dashboard

Stage 6B.3 makes `/play` the main player dashboard and starter adventure entry point.

`/play` shows:

- account identity
- active character if present
- character count and management route
- current campaign/adventure state from `GET /api/play/dashboard`
- location/scene/objective when available
- action status summary
- environment summary from 5J.2 when available
- visible NPC preview from 5J.3 when available
- SMS disabled/settings card

Start Adventure now opens a confirmation intro first. Campaign assignment happens only after the player presses Begin Adventure, through `POST /api/play/start-adventure`. Repeated starts resume the existing starter campaign instead of duplicating it.

`/play/campaign` is the campaign overview. `/play/campaign/scene` is the Stage 6B.4 rich scene view powered by backend current-scene state. Stage 6B.5 adds preview-first, backend-validated action composition and submission on that scene route.

No permanent fake dashboard data is used; empty state is displayed when the backend has no character or campaign state. See `docs/web-campaign-dashboard.md`.

## Deployment

Build and deploy:

```powershell
$env:FIREBASE_WEB_API_KEY="..."
$env:FIREBASE_WEB_APP_ID="..."
npm run build:player
npm run build
npx firebase-tools deploy --only hosting --project dailyrpg
```

Verify:

- `https://dailyttrpg.com/`
- `https://dailyttrpg.com/play`
- `https://dailyttrpg.com/play/settings`
- `https://dailyttrpg.com/privacy`
- `https://dailyttrpg.com/terms`
- `https://dailyttrpg.com/sms-terms`

## Manual Auth Checklist

1. Start backend with Firebase Admin env vars.
2. Run Flutter app with Firebase web dart-defines.
3. Open `/play`.
4. Confirm unauthenticated users see login.
5. Sign in with Google.
6. Confirm `/api/me` creates an account.
7. Sign out.
8. Create/sign in with email/password.
9. Confirm dashboard loads account state.
10. Confirm no phone number is requested.
11. Confirm SMS card says disabled.
12. If test data exists, confirm active character and campaign cards show real state.

## Test Commands

Backend and hosting:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
npm --prefix backend test -- --test-reporter=spec
npm run build
```

Flutter, on a machine with Flutter installed:

```powershell
cd apps/player_app
flutter pub get
flutter analyze
flutter test
flutter build web --release --base-href /play/
```
