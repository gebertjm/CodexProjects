# Public Landing Page Positioning

DailyTTRPG's public gateway at `/` presents the product as an async-first living campaign platform.

Core positioning:

```text
Async-first living campaigns.
```

DailyTTRPG is a web-first platform for persistent tabletop-style adventures that players can enjoy at their own pace. It is not primarily an AI GM, an infinite story generator, an SMS adventure app, or a traditional live-session VTT.

## Route Structure

Public routes:

- `/`
- `/privacy`
- `/terms`
- `/sms-terms`

Authenticated player app routes:

- `/play`
- `/play/*`

Firebase Hosting rewrites `/play` and `/play/**` to `/play/index.html`. Policy routes remain static and public.

## Copy Rules

The landing page should emphasize:

- asynchronous play for busy people
- authored intentional content
- structured world memory
- human GM hooks
- natural player actions with validated outcomes
- persistent character identity
- character-limited perspective
- accessibility for new players, with depth for veterans

Avoid:

- positioning DailyTTRPG as SMS-first
- positioning DailyTTRPG primarily as an AI GM
- claiming campaigns are AI-generated
- implying AI replaces human GMs
- promising infinite autonomous story generation
- fake testimonials or screenshots

Acceptable AI positioning:

```text
Minimal AI assistance helps interpret natural player actions, but outcomes come from authored content, rules, and structured world state.
```

Acceptable SMS positioning:

```text
Optional notifications may help players know when a new beat is ready.
```

## Current Landing Structure

The static landing page lives at:

```text
frontend/index.html
```

It contains:

1. Hero with Start Playing and Log In CTAs to `/play`.
2. Concise How it works steps.
3. Eight product pillars.
4. Web-first `/play` CTA.
5. Contact section.
6. Footer links to `/privacy`, `/terms`, and `/sms-terms`.

Shared styles live in:

```text
frontend/styles.css
```

## Validation

Run:

```powershell
npm run build
```

The hosting smoke test verifies:

- `/` exists.
- `/play` exists.
- policy pages exist.
- Start Playing and Log In point to `/play`.
- all eight product pillars appear.
- the page avoids SMS-first and AI-GM positioning.
- responsive CSS exists.

## Deployment

If the Flutter player app has been built:

```powershell
npm run build:player
npm run build
npm run deploy:hosting
```

If Flutter is unavailable, `npm run build` still validates the public gateway, policy routes, and `/play` placeholder route.
