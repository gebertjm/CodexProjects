# Stage 6A SMS Simulator

The DailyTTRPG SMS Simulator is a browser transport for testing the same SMS gameplay pipeline future Twilio webhooks will use. It is intentionally a developer tool, not a player-facing web app.

Route:

```text
/dev/sms-simulator
```

## Pipeline

Simulator inbound messages follow the shared path:

```text
browser simulator
-> POST /api/dev/sms-simulator/inbound
-> SmsInboundService
-> SmsIdentityResolver
-> SmsConversationService
-> runtime/action-window/default progression adapters
-> SmsOutboundFormatter
-> SmsMessageStore
-> polling endpoint
-> browser thread
```

The simulator transport adapter is `backend/src/sms/simulatorTransportAdapter.js`. Future Twilio webhook code should parse Twilio payloads and then call `SmsInboundService` in the same way.

The simulator is a transport adapter, not a gameplay mock. A normal simulator run starts with a real phone/account lookup, persists onboarding state, creates a real `dnd5e_character`, assigns the character to a real Greyvale campaign instance, and resolves actions through the authored runtime. Fake session fields are only for advanced/debug resume experiments and cannot produce successful fake adventure results.

Stage 6A.5 end-to-end validation checklist:

```text
docs/testing/sms-simulator-e2e.md
```

## Locations

- Browser UI: `frontend/dev/sms-simulator/index.html`
- Browser script: `frontend/dev/sms-simulator/sms-simulator.js`
- Browser styles: `frontend/dev/sms-simulator/sms-simulator.css`
- API route: `backend/src/routes/devSmsSimulator.js`
- Inbound service: `backend/src/sms/smsInboundService.js`
- Identity resolver: `backend/src/sms/smsIdentityResolver.js`
- Conversation service: `backend/src/sms/smsConversationService.js`
- Beat cycle service: `backend/src/sms/smsSimulatorBeatCycleService.js`
- Message store: `backend/src/sms/smsMessageStore.js`
- Outbound formatter: `backend/src/sms/smsOutboundFormatter.js`
- Template registry: `backend/src/sms/smsTemplateRegistry.js`
- Tests: `backend/test/stage6a-sms-simulator.test.js`

## Enable / Disable

Local development enables the simulator by default.

```env
ENABLE_SMS_SIMULATOR=true
SMS_SIMULATOR_DEV_PASSWORD=local_dev_only_change_me_if_enabled_in_production
```

Production behavior:

- Disabled unless `ENABLE_SMS_SIMULATOR=true`.
- If enabled in production, requests must include `x-sms-simulator-token` matching `SMS_SIMULATOR_DEV_PASSWORD`.
- Do not expose `/dev/sms-simulator` publicly without protection.

The temporary Firebase public site ignores `frontend/dev/**`, so the public landing page deployment does not include the simulator UI.

## API

Create a fake SMS session:

```http
POST /api/dev/sms-simulator/session
```

```json
{
  "phone_number": "+15550000001",
  "user_id": "sms_simulator_user_1",
  "active_sms_character_id": null,
  "active_sms_character_name": "Adventurer",
  "campaign_id": null
}
```

List sessions:

```http
GET /api/dev/sms-simulator/sessions
```

Poll messages:

```http
GET /api/dev/sms-simulator/messages/:session_id
```

Send inbound SMS:

```http
POST /api/dev/sms-simulator/inbound
```

```json
{
  "session_id": "sms_sim_0001",
  "message": "1"
}
```

Dev controls:

```text
POST /api/dev/sms-simulator/create-fresh-session
POST /api/dev/sms-simulator/reset-test-user
POST /api/dev/sms-simulator/seed-default-content
POST /api/dev/sms-simulator/seed-prompt
POST /api/dev/sms-simulator/advance-next-beat
POST /api/dev/sms-simulator/advance-window
POST /api/dev/sms-simulator/close-window
POST /api/dev/sms-simulator/resolve-threshold
POST /api/dev/sms-simulator/catchup
POST /api/dev/sms-simulator/combat-prompt
POST /api/dev/sms-simulator/combat-resolve
POST /api/dev/sms-simulator/level-available
POST /api/dev/sms-simulator/level-hp-roll
POST /api/dev/sms-simulator/level-spell-choice
POST /api/dev/sms-simulator/level-complete
GET /api/dev/sms-simulator/debug/:session_id
GET /api/dev/sms-simulator/persistence/:session_id
```

For Stage 6A.5 validation, prefer `create-fresh-session` when you need a clean new-phone run. It resets persisted test state for that phone, creates a simulator transport session, and lets the first inbound SMS create/resolve the real account through `SmsInboundService`. `reset-test-user` removes persisted test account state for the selected phone and clears the simulator session. `seed-default-content` validates that the configured Greyvale / Shadows on the Grey Road starter references are present.

## Browser Flow

No-CLI access:

```text
Open SMS Simulator.cmd
```

Double-click the launcher from the project folder. It starts Docker Desktop if needed, runs the backend/frontend stack, waits for `/dev/sms-simulator`, and opens the browser automatically.

Neon-backed no-CLI access:

```text
Open SMS Simulator - Neon DB.cmd
```

Use this launcher when simulator activity should persist to the hosted Neon database. It reads `.env.production`, starts the local backend/frontend containers with `docker-compose.sms-neon.yml`, and does not start the local Docker Postgres service. The backend still runs locally; only the database target changes. Because this writes real accounts, characters, campaign memberships, knowledge, and action history to Neon, use it intentionally and verify writes with **Verify Persistence**.

1. Start the local stack.
2. Open `http://localhost:8080/dev/sms-simulator`.
3. Create a new-phone session using the default **Real new-phone onboarding test** option.
4. Send `hello`, `START`, then complete Quick Start or Guided character creation.
5. Confirm the intro and first Greyvale prompt appear from campaign assignment.
6. Reply with `1`, `2`, `STATUS`, `LEVEL`, `HELP`, or a short action.
7. For a valid first action, confirm the thread shows your inbound SMS only; ordinary actions are recorded silently.
8. Click **Advance to Next Beat** to close/readiness the current beat, apply missing defaults, resolve through the real campaign runtime, and display actual result/next prompt output immediately.
9. Use **Verify Persistence** to reload account, character, campaign membership, and runtime state from the database.
10. Use advanced controls only when you need to test individual pieces such as reminders, close-only, threshold resolution, catch-up, combat, or level-up prompts.
11. Toggle Show Debug only when inspecting internal state.

The message thread shows final SMS-equivalent text only. Debug payloads are separate and hidden by default.

## Local DB vs Neon DB

The simulator writes to whatever Postgres connection the backend receives in `DATABASE_URL`.

- Local launcher: `Open SMS Simulator.cmd` uses `.env` and the normal Docker Compose stack. In the default setup, `.env` points at the local Docker Postgres host `db`.
- Neon launcher: `Open SMS Simulator - Neon DB.cmd` uses `.env.production`. In the current deployment model, that file points at Neon with SSL enabled.
- Neon does not require Docker. Docker is used here only to run the local backend and nginx frontend that host the simulator UI.
- DigitalOcean production similarly uses Docker for the backend container and Neon for Postgres; it should use `docker-compose.prod.yml`, which has no bundled Postgres service.

## Stage 6A.4.5 Silence And Beat Control

Ordinary valid SMS actions are mostly silent by default:

- The first valid action for an open beat/window is persisted and audited.
- No immediate "Action recorded" SMS is sent.
- The simulator thread displays the player's inbound message and waits for the beat to resolve.
- `HELP`, `STOP`, invalid input, late responses, and budgeted `STATUS` responses still send appropriate template-rendered replies.

Duplicate SMS action attempts do not overwrite the original action. The first duplicate/change attempt in a beat sends `input.action_already_set_web_app` with the web app link. Further duplicate attempts in that same beat are silently ignored and visible in debug state. This cap is separate from the daily non-substantive SMS budget.

The primary **Advance to Next Beat** control calls:

```text
POST /api/dev/sms-simulator/advance-next-beat
```

That endpoint is implemented by `SmsSimulatorBeatCycleService`, a simulator adapter over the shared SMS/runtime services. It does not wait for wall-clock time: it loads the current session/context, closes the current simulator beat, applies defaults for missing participants when needed, resolves submitted actions through runtime/progression, persists the beat result, assembles the next runtime output, renders outbound SMS through `SmsOutboundFormatter`, stores messages in `SmsMessageStore`, and refreshes the browser thread.

If a session does not have a persisted numeric campaign and character context, the beat cycle refuses to create fake success output and reports `non_persistent_simulator_context` in debug state. A real successful action should show authored result text, such as the caravan inspection outcome, plus the next runtime prompt where available. Generic messages like "Action resolved" or "the story moves forward" are not valid successful simulator output.

Production scheduled progression and simulator manual progression are intentionally different only at the trigger boundary. Production will process due windows on real schedule; the simulator button forces that lifecycle immediately for testing. The resolution, formatting, message storage, default-action, and runtime-prompt paths stay shared.

The endpoint response includes `new_message_ids`, previous/next action-window IDs, `created_result_message`, `created_next_prompt`, `reason_if_no_prompt`, runtime state before/after, and an idempotency status. Repeated clicks against the same resolved beat return `already_resolved` and do not duplicate result messages, defaults, or next action windows.

Advanced controls remain available under **Advanced beat controls**:

- `Send Window Reminder`
- `Close Window Only`
- `Apply Defaults / Resolve Threshold`
- `Trigger Catch-Up`
- combat and level-up template triggers
- `Refresh Real Runtime Prompt`
- `Verify Persistence`

Debug now includes the current beat/window ID, whether the current player submitted, submitted action summary, duplicate attempt count, duplicate guidance status, pending/default participants, previous/next action-window IDs, runtime state before/after the last advancement, created-result/prompt booleans, no-prompt reason, new message IDs, idempotency status, last response-policy decision, last silent outcome reason, whether a next prompt was generated, and a persistence snapshot for account, active character, `dnd5e_character`, campaign instance, membership, scene/location/objective, and known facts.

Future Twilio note: for silent valid actions, a Twilio webhook can acknowledge the inbound request without sending an SMS body. The action is still stored and audited; only the outbound player message is suppressed until progression resolves.

## Stage 6A.5b Narrative Exploration Testing

Normal exploration now supports narrative-first SMS prompts and natural action replies. After the intro/tutorial beat, the simulator may show narrative without numbered options. Replies such as `inspect the wagon`, `follow the tracks`, `talk to the innkeeper`, and `move toward the inn` are resolved by the deterministic intent resolver against active scene affordances, then submitted through the same action-window path used by numbered options.

The resolver does not create story outcomes. It only maps text to existing runtime actions. `Advance to Next Beat` still resolves the submitted action through real campaign/runtime services and renders the authored result through SMS templates.

Debug includes:

- `prompt_mode`
- `guidance_level`
- `include_action_hints`
- `include_numbered_options`
- active/resolved affordances
- last resolver status, verb, target, confidence, and reason
- clarification state
- affordance persistence counts
- future-AI intent log status

Manual check:

1. Complete onboarding and Quick Start character creation.
2. At the Broken Caravan prompt, send `inspect the wagon`.
3. Confirm the action is recorded silently.
4. Click `Advance to Next Beat`.
5. Confirm the result appears through `gameplay.exploration_narrative`.
6. Confirm `inspect-broken-caravan` no longer appears as an active affordance.
7. Send `follow the tracks`.
8. Confirm debug resolves `track` against the tracks affordance.

Full model documentation lives in `docs/sms-narrative-exploration.md`.

## Onboarding Testing

To test Stage 6A.2 onboarding:

1. Check `New phone onboarding test` before creating a session.
2. Send any first message, such as `hello`.
3. The simulator should send `onboarding.welcome`.
4. Send a non-START message and confirm `onboarding.prompt_start`.
5. Send `START` and continue into SMS character creation.
6. Toggle Show Debug to inspect `onboarding_state`, `onboarding_substate`, `character_creation_step`, and draft character state.

The simulator does not send an unsolicited onboarding message when a session is created. The first outbound onboarding message is triggered by inbound SMS activity, matching the future Twilio path.

## Character Creation Testing

Stage 6A.3 character creation uses the same simulator inbound endpoint and the same shared SMS pipeline future Twilio will use.

Quick Start:

1. Enter onboarding with a new phone and reply `START`.
2. Reply once more to open `character.mode_select`.
3. Reply `1`.
4. Enter a name.
5. Choose a species.
6. Choose a class.
7. Confirm.

Guided:

1. Choose `2` at `character.mode_select`.
2. Enter a name.
3. Choose species and subrace if prompted.
4. Choose class, attributes, background, and trait.
5. Confirm, edit, or start over.

Long SMS lists are paged with `More` and `Back` so the thread never needs giant menus. Player-facing messages stay template-rendered; debug-only draft payloads remain in the Show Debug panel.

## Action Windows And Party Testing

For current MVP solo testing, complete onboarding and character creation in one session. For party/default behavior, use advanced test fixtures or future invited-party setup so each participant has a persisted account/character/campaign context.

1. Start from a real active prompt.
2. Player 1 replies with a number.
3. Confirm no immediate DM/system confirmation appears.
4. Player 1 sends another number; confirm one web-app guidance SMS appears.
5. Player 1 sends a third number; confirm no extra outbound SMS appears.
6. Player 2 does not respond.
7. Click **Advance to Next Beat** or run the relevant backend test fixture.
8. Missing participants receive neutral default-action and missed-participation messages; responding participants receive the next SMS story output.

This preserves the Stage 5F rule: defaults apply only when the threshold is reached and resolution occurs.

## Manual Reliability Tests

Normal beat cycle:

1. Open `/dev/sms-simulator`.
2. Start or resume an active campaign prompt.
3. Send `1`.
4. Verify no DM confirmation appears.
5. Click **Advance to Next Beat**.
6. Verify a result and/or next prompt appears immediately.

Duplicate action:

1. Send `1`.
2. Send `2`.
3. Verify one web-app guidance message appears.
4. Send `3`.
5. Verify no second guidance message appears.

No waiting:

1. Submit an action.
2. Immediately click **Advance to Next Beat**.
3. Verify progression occurs without real time passing.

Advanced controls:

1. Confirm advanced controls are available but not required.
2. Confirm the warning explains they can leave the simulator in an intermediate state.

## Combat And Level-Up Testing

Combat:

- Trigger Combat Prompt renders `combat.start` and `combat.prompt`.
- Numeric replies use the same inbound handler.
- Resolve Combat Beat renders `combat.result` and `combat.end`.

Level-up:

- Trigger Level-Up Prompt renders `level.available`.
- Reply `LEVEL` to start/resume the compact SMS flow.
- Developer controls can render HP roll, spell choice, invalid choice, and completion templates.

## Template Rule

All outbound simulator messages must be rendered through `SmsOutboundFormatter` with a registered template. The thread should never show:

- debug JSON
- raw internal IDs
- hidden flags
- encounter scaling math
- GM-only state

## Test Commands

Focused simulator tests:

```powershell
npm --prefix backend run test:sms-simulator
```

Template pack tests:

```powershell
npm --prefix backend run test:sms
npm --prefix backend run test:sms-character
npm --prefix backend run test:sms-e2e
```

Full backend regression suite:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend test
```

Static public-site build check:

```powershell
npm run build
```
