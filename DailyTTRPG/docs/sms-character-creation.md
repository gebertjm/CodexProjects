# Stage 6A.3 SMS Character Creation

SMS character creation is a strict extension of the shared DailyTTRPG SMS pipeline. It runs through `SmsInboundService`, uses persisted onboarding state, and renders every player-facing message through `SmsOutboundFormatter` and `SmsTemplateRegistry`.

## Modes

The first creation step is `character.mode_select`:

```text
1) Quick start - fastest, smart defaults
2) Guided - more choices
```

Quick Start flow:

```text
mode -> name -> species -> lineage if needed -> class -> confirmation
```

Guided Moderate flow:

```text
mode -> name -> species -> lineage if needed -> class -> attribute profile -> background -> trait -> confirmation
```

The SMS formatter enforces 2-4 numbered options, so longer lists are paged with `More` and `Back` instead of sending five or more options in one SMS.

## Draft Persistence

Creation progress is persisted in two places:

- `account.onboarding_state = creating_character`
- `account.onboarding_substate`
- `account.sms_onboarding_draft_character_id`
- `account.sms_onboarding_metadata.character_creation`
- `dnd5e_character.status = draft`
- `dnd5e_character.draft_metadata_json`

Drafts are never active. A confirmed character is finalized atomically as `status = active`, `created_via_sms = true`, and assigned to `account.active_character_id`.

## Race And Class Handling

Species choices use narrative labels, not raw stats. Curated choices appear first, with expanded choices behind `More`.

Class choices support:

- Fighter
- Rogue
- Cleric
- Wizard
- Ranger
- Paladin
- Warlock
- Other

`Other` accepts a short class name and resolves common aliases through the SMS class resolver. For example, `mage` confirms as Wizard. Unknown class names return `character.unrecognized_class`.

## Attributes

Guided creation asks:

```text
How should your strengths lean?
1) Strong and durable
2) Quick and precise
3) Wise and resilient
4) More
```

The backend applies the standard array with weighted presets, then applies racial and subrace modifiers. SMS does not show raw stat math.

Quick Start chooses a class-appropriate preset automatically.

## Backgrounds And Traits

Guided backgrounds:

- Wanderer
- Guard
- Scholar
- Acolyte
- Outlander
- Artisan

Some SMS labels map to the closest currently seeded SRD background record until broader authored background data exists. The selected SMS label remains in draft metadata and the closest database background is stored on the character.

Traits:

- Brave
- Cautious
- Curious
- Wry

Traits feed `personality_traits` and future narration/default behavior.

## Confirmation, Edit, Restart

Confirmation uses `character.confirm_summary`:

```text
Create this character?
Name: Aric. Species: Human. Class: Fighter. Background: Guard. Trait: Brave.
1) Confirm
2) Edit
3) Start over
```

Edit returns to a specific step and then back to confirmation. Start over retires the draft safely and returns to mode selection.

## Resume

If the user returns mid-creation, the system uses the persisted substate and draft metadata.

Within the resume threshold, the next inbound resumes the current step. After the configured long-gap threshold, onboarding sends:

```text
onboarding.resume_confirm
1) Yes
2) Start over
```

Continuing uses `character.creation_resume`. Restart retires the draft and returns to `character.mode_select`.

## Templates

Character creation templates live in `backend/src/sms/smsTemplateRegistry.js`:

```text
character.mode_select
character.name_prompt
character.name_invalid
character.race_prompt
character.race_more
character.subrace_prompt
character.class_prompt
character.class_other_prompt
character.attribute_prompt
character.background_prompt
character.trait_prompt
character.confirm_summary
character.edit_prompt
character.restart_confirm
character.created
character.creation_resume
character.invalid_choice
character.unrecognized_class
character.unrecognized_race
```

## Simulator Testing

1. Double-click `Open SMS Simulator.cmd`.
2. Check `New phone onboarding test`.
3. Create a session and send `hello`.
4. Reply `START`.
5. Send any message to enter `character.mode_select`.
6. Test Quick Start with `1`, then name, species, class, confirm.
7. Test Guided with `2`, then name, species/subrace, class, attributes, background, trait, confirm.
8. Use Show Debug to inspect `onboarding_state`, `character_creation_step`, and `character_creation_draft`.

Focused tests:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm --prefix backend run test:sms-character
npm --prefix backend run test:sms-onboarding
npm --prefix backend run test:sms-simulator
```
