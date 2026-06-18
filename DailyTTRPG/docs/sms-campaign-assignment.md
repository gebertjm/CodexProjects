# Stage 6A.4 SMS Campaign Assignment

Stage 6A.4 bridges SMS character creation into playable DailyTTRPG adventure flow. It runs inside the shared SMS pipeline:

`SmsInboundService -> SmsOnboardingService -> SmsCampaignAssignmentService -> runtime/content state -> SmsOutboundFormatter`

No player-facing assignment, intro, STATUS, or pacing message is emitted outside `SmsTemplateRegistry` and `SmsOutboundFormatter`.

## Default Assignment

The configurable starter assignment lives in `backend/src/sms/smsCampaignConfig.js`.

```js
{
  world_id: "greyvale",
  campaign_package_id: "shadows_grey_road",
  start_region_id: "greyvale_lowlands",
  start_region_slug: "greyvale-lowlands",
  start_location_id: "broken_caravan_site",
  start_location_slug: "broken-caravan-site",
  start_scene_id: "scene_broken_caravan",
  start_scene_slug: "broken-caravan-site",
  start_objective_id: "investigate_caravan",
  start_objective_slug: "witness-the-aftermath",
  quest_slug: "shadows_grey_road",
  instance_strategy: "solo_per_character",
  intro_fast_path: true
}
```

The underscore IDs mirror the product prompt. The slug fields map to the imported 5B/5C content package, where the actual Greyvale scene is `broken-caravan-site` and the first objective is `witness-the-aftermath`.

Supported future strategy names are represented now: `solo_per_character`, `invited_party`, `shared_starter`, `open_world_free_roam`, and `web_selected`.

## Assignment Behavior

After SMS character confirmation:

1. The character is finalized as an active level 1 SMS-created character.
2. The assignment service verifies the character is active and alive.
3. If the character already has an active campaign context, that campaign is resumed.
4. If no active campaign exists, a per-character Greyvale questline campaign instance is created.
5. Campaign membership is created and marked as the active context.
6. The starting scene, location, objective, and minimal character-known facts are initialized.
7. The account moves to `active_play`.
8. The simulator/session state receives campaign and pacing debug fields.

The MVP strategy is called `solo_per_character`, but the created starter campaign uses campaign type `questline` so the Shadows on the Grey Road quest availability rules activate correctly. It is still a per-character instance and does not force future SMS characters into the same shared campaign.

## Initial Knowledge

The system persists only practical, character-known context:

- `knows_grey_road_exists`
- `knows_dunmere_nearby`
- `knows_road_is_normal_trade_route`
- `knows_character_is_traveling_region`

It does not mark clues as discovered and does not reveal bandits, the shrine, disappearances, or the Whispering Presence.

## Intro Flow

The intro sends two player-facing SMS messages after `character.created`:

1. `intro.world_entry`
2. `intro.first_prompt`

Example:

```text
Your story begins in Greyvale, on the old road near Dunmere. Evening settles over the lowlands, and the air feels too still.
```

```text
Ahead, a caravan leans broken in the mud. No voices. No horses.
1) Inspect the caravan
2) Search for survivors
3) Examine the tracks
4) Continue to the inn
```

The first prompt options are mapped to real scene interactions/transitions. The first reply uses the intro fast-path so a newly onboarded player is not immediately stalled, but Stage 6A.4.5 records that valid first SMS action silently. The next outbound SMS normally appears when the beat resolves through **Advance to Next Beat** in the simulator or a scheduled progression window in production. After that first action, `intro_fast_path_completed=true` and `normal_sms_pacing_active=true`; subsequent substantive replies use normal action-window behavior.

Ordinary valid actions do not send an immediate "Action recorded" SMS. Duplicate SMS actions in the same beat do not overwrite the original; the first duplicate sends `input.action_already_set_web_app`, and later duplicates in that beat are silently ignored.

## Existing Campaign Resume

If a character already has an active campaign membership, repeated START or assignment calls return `campaign.resume_existing` and do not create another starter campaign or membership.

Completed, dead, or broken campaign states are routed through safe templates such as `campaign.completed_no_active`, `campaign.character_dead`, or `campaign.assignment_failed`.

## STATUS Budget

`SmsInteractionBudgetService` classifies non-substantive informational messages such as `STATUS`, “where am I?”, “what do I know?”, “recap”, and “objective”.

Per user/date:

- First request: `command.status_with_app_link`
- Second request: `command.status_link_only`
- Third and later: no outbound SMS; the simulator debug panel records `silent_ignore`

HELP and STOP are always exempt. Numeric gameplay replies and active action responses are never blocked by this budget.

## Simulator Testing

Open the simulator without CLI:

```text
Open SMS Simulator.cmd
```

Manual flow:

1. Create a simulator session with a new phone number and no active character.
2. Send `hello`; confirm `onboarding.welcome`.
3. Send `START`; confirm `onboarding.intro`.
4. Complete Quick Start character creation.
5. Confirm the thread shows `character.created`, `intro.world_entry`, and `intro.first_prompt`.
6. Open debug and verify `campaign_instance_id`, `world_id`, `active_scene_id`, `active_location_id`, `active_objective_id`, and `intro_fast_path_active`.
7. Reply `1`; confirm no immediate DM/system reply appears and debug shows `valid_first_action_recorded_silently`.
8. Click **Advance to Next Beat**; confirm the next SMS story output appears and normal pacing is active.
9. Reply `1`; confirm it records silently into the normal action window.
10. Reply `2`; confirm a single web-app guidance message appears. Reply `3`; confirm no second guidance appears.
11. Send `STATUS`, `STATUS`, `STATUS`; confirm full answer, link-only answer, then silent ignore.
12. Send `HELP`; confirm it still responds.

## Templates

Stage 6A.4 adds:

- `campaign.assigning`
- `campaign.assigned`
- `campaign.assignment_failed`
- `campaign.no_available_campaign`
- `campaign.resume_existing`
- `campaign.completed_no_active`
- `campaign.character_dead`
- `intro.world_entry`
- `intro.first_prompt`
- `intro.objective_hint`
- `intro.already_started`
- `intro.resume`
- `command.status_with_app_link`
- `command.status_link_only`
- `system.non_substantive_ignored`
- `input.action_already_set_web_app`
- `input.no_active_prompt`
- `system.silent_action_recorded`

## Tests

Use a local database URL from the host shell:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
npm run test:sms
npm run test:sms-onboarding
npm run test:sms-character
npm run test:sms-campaign
npm run test:sms-simulator
```

Full backend regression:

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
npm test
```
