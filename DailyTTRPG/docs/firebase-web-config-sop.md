# Firebase Web Config Recovery SOP

Use this when `/play` loads but sign-in is disabled with:

`Firebase web config is missing. Build with FIREBASE_WEB_API_KEY and FIREBASE_WEB_APP_ID dart-defines to enable sign-in.`

## Why It Happens

Flutter web bakes Firebase config into the compiled JavaScript at build time. If the app is built without the Firebase web `dart-define` values, deploying later will not fix it. You must rebuild the Flutter web app with the config present, then deploy hosting.

## Local Fix

From the project root:

```powershell
cd C:\Users\Joshu\CodexProjects\DailyRPG
```

1. Confirm the frontend env file exists:

```powershell
Test-Path .env.frontend
```

2. If it is missing, recreate it from Firebase:

```powershell
npx firebase-tools apps:list WEB --project dailyrpg
npx firebase-tools apps:sdkconfig WEB <WEB_APP_ID_FROM_LIST> --project dailyrpg --json
```

3. Put these values in `.env.frontend`:

```text
FIREBASE_WEB_API_KEY=<apiKey>
FIREBASE_WEB_APP_ID=<appId>
FIREBASE_PROJECT_ID=<projectId>
FIREBASE_AUTH_DOMAIN=<authDomain>
FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId>
FIREBASE_STORAGE_BUCKET=<storageBucket>
DAILY_TTRPG_API_BASE_URL=https://159-223-175-17.nip.io
```

4. Build the player app. The script now loads `.env.frontend` automatically and fails if required values are missing:

```powershell
$env:PATH = "C:\Users\Joshu\CodexTools\flutter\bin;$env:PATH"
npm run build:player
```

5. Run the hosting check:

```powershell
npm run build
```

6. Deploy Firebase Hosting:

```powershell
npm run deploy:hosting
```

7. Hard refresh `/play`, or clear the site data/service worker if the old bundle is cached.

## Quick Verification

The login page should no longer show the missing config warning, and `Continue with Google` should be enabled.

If the warning still appears, repeat steps 4-6. This almost always means Firebase Hosting still has an older Flutter bundle that was built without the `dart-define` values.
