# Stage 6A.0 SMS Template System

DailyTTRPG SMS output is template-controlled. Any message that can appear in the SMS Simulator, dev SMS tooling, or a future Twilio sender must be rendered through the shared SMS formatter.

No player-facing SMS copy should be assembled ad hoc in simulator code, Twilio transport code, route handlers, or gameplay services.

## Locations

- Template registry: `backend/src/sms/smsTemplateRegistry.js`
- Outbound formatter: `backend/src/sms/smsOutboundFormatter.js`
- Registry validation: `backend/src/sms/smsTemplateValidation.js`
- Simulator/dev service: `backend/src/services/smsSimulatorService.js`
- Browser simulator inbound path: `backend/src/sms/smsInboundService.js`
- SMS onboarding handler: `backend/src/sms/smsOnboardingService.js`
- Browser simulator route: `backend/src/routes/devSmsSimulator.js`
- Tests: `backend/test/stage6a-sms-templates.test.js`, `backend/test/stage6a-sms-simulator.test.js`, and `backend/test/stage6a-sms-onboarding.test.js`

## Core Flow

The shared outbound path is:

```text
runtime / browser simulator / CLI simulator / future Twilio webhook
-> choose registered template_id
-> SmsOutboundFormatter
-> rendered player-facing SMS string
-> simulator thread or transport sender
```

The simulator services return rendered SMS text, which is the exact message a Twilio sender should send. Debug metadata is optional and separate; it must not be placed in the player message thread.

The browser simulator at `/dev/sms-simulator` uses:

```text
SmsInboundService -> SmsIdentityResolver -> SmsOnboardingService -> SmsConversationService -> SmsOutboundFormatter -> SmsMessageStore
```

Reference documentation: `docs/sms-simulator.md`.
Onboarding documentation: `docs/sms-onboarding.md`.

## Formatter Usage

```js
import { renderSmsTemplate } from './backend/src/sms/smsOutboundFormatter.js';

const rendered = renderSmsTemplate('gameplay.adventure_prompt', {
  scene_description: 'A broken caravan blocks the Grey Road.',
  atmosphere_line: 'Something feels wrong.',
  options: ['Inspect', 'Search for survivors', 'Move on'],
});

console.log(rendered.message);
```

Output:

```text
A broken caravan blocks the Grey Road. Something feels wrong.
1) Inspect
2) Search for survivors
3) Move on
```

## CLI / Simulator Commands

Validate the template pack:

```powershell
npm --prefix backend run cli -- validate-sms-templates
```

List templates:

```powershell
npm --prefix backend run cli -- list-sms-templates
```

Render HELP:

```powershell
npm --prefix backend run cli -- render-sms-template --template-id sms.help --variables '{"brand_name":"DailyTTRPG","support_email":"dailyttrpg@gmail.com"}'
```

Simulate inbound HELP:

```powershell
npm --prefix backend run cli -- simulate-sms-reply --input HELP
```

Render a combat simulator state:

```powershell
npm --prefix backend run cli -- render-sms-state --state combat_prompt --variables '{"combat_situation":"Rusk lunges from the archway.","options":["Strike","Defend","Try to talk him down"]}'
```

## Format Rules

- Tone is concise, narrative, and player-facing.
- Prefer messages at or below 160 characters.
- The formatter emits warnings above each template's `max_length_guidance`.
- The formatter emits a hard warning above 300 characters.
- Gameplay prompts must use 2-4 numbered options.
- Options render as `1) Option`.
- Raw IDs, debug fields, hidden flags, JSON, GM-only truth, and encounter scaling math must not appear in rendered player-facing SMS.
- Compliance/system templates should use fixed copy and no flavor variation.

## Template Shape

Each template defines:

- `template_id`
- `category`
- `description`
- `required_variables`
- `optional_variables`
- `body`
- `variation_slots`
- `max_length_guidance`
- `options`
- `example_variables`
- `example_output`

Templates are intentionally explicit. Add a new `template_id` instead of reusing a nearby template with unrelated variables.

## Adding A Template

1. Add the template to `backend/src/sms/smsTemplateRegistry.js`.
2. Give it at least one required variable so missing-variable validation is testable.
3. Add safe example variables and example output.
4. If the template is required platform copy, add its ID to `REQUIRED_SMS_TEMPLATE_IDS`.
5. Run `npm --prefix backend run test:sms`.
6. Run `npm --prefix backend run cli -- validate-sms-templates`.

Do not put unreviewed generated prose in compliance/system templates. Minor flavor variation is only allowed through explicit `variation_slots`.

## Examples

HELP:

```text
DailyTTRPG: Reply STOP to unsubscribe. Msg freq varies. Msg & data rates may apply. Help: dailyttrpg@gmail.com
```

Invalid input:

```text
I didn't understand that. Reply with a number or a short action.
```

Silent valid action:

```text
No player-facing SMS is sent. Debug records system.silent_action_recorded.
```

Duplicate SMS action:

```text
Your action for this beat is already set. To review or change it, use the web app: https://dailyttrpg.com/play
```

Default action:

```text
The moment passes. You keep watch and avoid direct risk as the group moves forward.
```

Catch-up:

```text
While you were away, the shrine fight ended. You held position. Current: the group is deciding what the hollow means.
```

Combat prompt:

```text
Rusk lunges from the archway.
1) Strike
2) Defend
3) Try to talk him down
```

Level-up available:

```text
You can level up. The choice can wait until a safe pause. Reply LEVEL when ready.
```

## Future Twilio Integration

Future Twilio delivery should call `renderSmsTemplate` or `renderSimulatorOutbound` before sending. The Twilio transport should be responsible only for transport concerns:

- phone number lookup
- consent and STOP/HELP handling
- delivery
- delivery errors/logging

It should not own user-facing copy.

## Tests

Focused SMS test:

```powershell
npm --prefix backend run test:sms
npm --prefix backend run test:sms-simulator
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend run test:sms-onboarding
```

Full backend regression suite, requires the Docker/Postgres stack so hostname `db` resolves:

```powershell
docker compose up -d db
npm --prefix backend test
```
