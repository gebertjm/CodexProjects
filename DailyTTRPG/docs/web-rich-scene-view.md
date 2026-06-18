# Stage 6B.4 Rich Scene View

Stage 6B.4 adds the authenticated rich scene view at `/play/campaign/scene`. Stage 6B.5 builds on this page with preview-first action composition and validated submission. The scene view still depends on backend-filtered, character-limited state; Flutter does not decide hidden truth.

## Route Structure

- `/play/campaign` remains the campaign/adventure overview.
- `/play/campaign/scene` is the rich current scene view.
- If the active character has no active campaign, `/play/campaign/scene` returns to `/play/campaign`.

The campaign overview includes a **View Current Scene** CTA, and the scene page links back to the overview.

## Backend Contract

`GET /api/play/current-scene`

Requires Firebase bearer auth. By default it uses the authenticated account's active character and active campaign.

The response includes:

- `active_character`
- `campaign`
- `scene`
- `environment`
- `objective`
- `visible_npcs`
- `known_relevant_npcs`
- `visible_affordances`
- `known_facts`
- `scene_state_summary`
- `action_status`
- `recent_summary`
- `mechanical_details` only when `include_mechanics=true`

No phone number or SMS identity is required.

## Scene Model Posture

Scenes remain world/content objects. Campaigns provide context, pacing, current objective, current scene pointer, and action-window state. Character perspective filters what can be seen.

The backend assembles:

```text
authored world scene
+ campaign context
+ world/scene/affordance state
+ character knowledge
+ environment overlays
+ NPC presence
= character-facing scene view
```

Flutter must not decide hidden truth. It renders the already-filtered response.

## UI Sections

The rich scene page shows:

- Scene header with campaign, world, location, scene, and active character.
- Dominant authored/environment-aware scene description.
- Current objective and character-known progress.
- Environment card.
- People present.
- Known/relevant absent people when safe.
- Interactable things and visible affordances.
- Discoveries and known facts.
- Action status and submitted action if present.
- Collapsed mechanical details drawer.

## Affordance Display

Visible affordances show:

- Label.
- Short description when available.
- Available verbs/actions.
- Safe state when useful.
- Stage 6B.5 target helper: `Use in action`, which selects the affordance for the action composer without submitting anything.

NPC affordances are represented through the People Present section to avoid duplicate UI clutter.

## Mechanical Details

The mechanical details drawer is collapsed by default. It may show:

- Environment modifiers and reasons.
- Safe action-window status.
- Safe character context such as level and class.

It must not show hidden DCs, hidden enemies, hidden traps, undiscovered clues, future outcomes, GM notes, raw event payloads, or debug JSON.

## Safety Rules

The normal player response must not expose:

- Hidden world truth.
- Hidden NPCs.
- Unknown true NPC names.
- GM notes.
- Secret DCs.
- Future scenes.
- Debug/source internals.
- Raw JSON.

Known facts and discoveries come from character knowledge only.

## Manual Checklist

1. Sign in.
2. Ensure the active character has an active campaign.
3. Open `/play/campaign`.
4. Click **View Current Scene**.
5. Confirm the route is `/play/campaign/scene`.
6. Confirm rich scene description appears.
7. Confirm environment summary appears.
8. Confirm current objective appears.
9. Confirm visible NPCs use character-perspective labels.
10. Confirm visible affordances and actions appear.
11. Confirm visible affordances can be selected for the composer.
12. Confirm action status appears.
13. Expand/collapse Mechanical Details.
14. Confirm preview is required before action submission.
15. Use an account with no campaign and open `/play/campaign/scene`.
16. Confirm it returns to `/play/campaign`.

## Test Commands

Backend targeted test:

```powershell
cd backend
node --test --test-concurrency=1 test/stage6b4-rich-scene-view.test.js
```

Flutter checks:

```powershell
cd apps/player_app
flutter test
flutter analyze
flutter build web --release --base-href /play/
```

Root hosting check:

```powershell
npm run build
```
