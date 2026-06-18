# Stage 6A.2 SMS Onboarding

SMS onboarding is part of the shared DailyTTRPG SMS pipeline. It is not simulator-only logic and future Twilio webhooks should reuse the same `SmsInboundService`.

Strict rules:

- No gameplay before explicit START consent.
- HELP and STOP are recognized at every onboarding stage.
- STOP records opt-out and suppresses further outbound messages until START re-consents.
- Every user-facing onboarding message is rendered through `SmsOutboundFormatter` and `SmsTemplateRegistry`.
- Onboarding state is persisted on `account`, not inferred from message history.

## State Machine

Persisted account fields:

- `account.onboarding_state`
- `account.onboarding_substate`
- `account.last_active_at`
- `account.sms_onboarding_draft_character_id`
- `account.sms_onboarding_metadata`
- `account.active_character_id`

States:

```text
unknown_phone
awaiting_start
onboarding_intro
creating_character
character_created
assigning_campaign
campaign_ready
intro_started
active_play
```

Character creation substates:

```text
creating_character:mode
creating_character:name
creating_character:race
creating_character:race_more
creating_character:subrace
creating_character:class
creating_character:class_other
creating_character:class_other_confirm
creating_character:attribute
creating_character:background
creating_character:trait
creating_character:confirm
creating_character:edit
```

Draft characters are stored in `dnd5e_character` with:

- `status = 'draft'`
- `created_via_sms = true`
- `draft_metadata_json`

Confirmed SMS characters become `status = 'active'`, move onboarding to `character_created`, and are assigned to `account.active_character_id`. The next gameplay inbound can transition the account into `active_play`.

## START Gate

Unknown phone flow:

```text
unknown phone inbound
-> create account
-> onboarding_state = awaiting_start
-> onboarding.welcome
```

Awaiting START:

```text
START / YES / BEGIN
-> onboarding_state = onboarding_intro
-> sms_opt_in_at set
-> onboarding.intro
```

Any other inbound while awaiting START:

```text
onboarding.prompt_start
```

No gameplay runtime, character play, action windows, combat, or level-up messages run before onboarding reaches `character_created` / `active_play`.

## Resume Logic

If a user is mid character creation and returns within the configured threshold, the system resumes automatically.

If inactive beyond `SMS_ONBOARDING_RESUME_HOURS` (default `48`):

```text
onboarding.resume_confirm
1) Yes
2) Start over
```

Choosing continue clears the resume flag and returns the user to the saved substate with `character.creation_resume`.

Choosing start over safely retires the draft character and resets to `creating_character:mode`.

## Templates

Required onboarding templates:

```text
onboarding.welcome
onboarding.prompt_start
onboarding.resume_confirm
onboarding.resume_continue
onboarding.resume_restart
onboarding.intro
onboarding.transition_to_creation
onboarding.character_name_prompt
onboarding.character_class_prompt
onboarding.character_species_prompt
onboarding.character_background_prompt
onboarding.character_confirm
onboarding.character_ready
```

Stage 6A.3 character creation now uses the dedicated `character.*` templates documented in `docs/sms-character-creation.md`. The older `onboarding.character_*` templates remain registered for compatibility and validation coverage, but the live creation flow uses the character creation template category.

All are registered in `backend/src/sms/smsTemplateRegistry.js`.

## Pipeline

Shared inbound path:

```text
Simulator or future Twilio
-> SmsInboundService
-> SmsIdentityResolver
-> SmsOnboardingService
-> SmsConversationService only after active_play
-> SmsOutboundFormatter
-> SmsMessageStore / transport sender
```

Important files:

- `backend/src/sms/smsInboundService.js`
- `backend/src/sms/smsOnboardingService.js`
- `backend/src/sms/smsCharacterCreationService.js`
- `backend/src/sms/smsOutboundFormatter.js`
- `backend/src/sms/smsTemplateRegistry.js`
- `backend/src/routes/devSmsSimulator.js`

## Simulator Test Steps

1. Double-click `Open SMS Simulator.cmd`.
2. Check `New phone onboarding test`.
3. Create a simulator session.
4. Send `hello`.
5. Confirm the response is a welcome that asks for START.
6. Send any non-START text and confirm onboarding is blocked.
7. Send `START`.
8. Continue into `character.mode_select`.
9. Choose Quick Start or Guided and finish character creation.
10. Use Show Debug and confirm `onboarding_state`, `onboarding_substate`, `character_creation_step`, and `character_creation_draft`.
11. Use `HELP` at any point.
12. Use `STOP` and confirm no further outbound messages are sent until START.

## Test Commands

Onboarding tests require a reachable Postgres database:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend run test:sms-onboarding
npm --prefix backend run test:sms-character
```

Related checks:

```powershell
npm --prefix backend run test:sms
npm --prefix backend run test:sms-simulator
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend test
```
