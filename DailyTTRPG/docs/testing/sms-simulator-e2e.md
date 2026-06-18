# SMS Simulator End-to-End Checklist

Use this checklist before Twilio integration. The simulator should behave as a browser transport over the real SMS pipeline, not as mock gameplay.

## Setup

1. Open `Open SMS Simulator.cmd` for the local Docker Postgres DB, or `Open SMS Simulator - Neon DB.cmd` when you intentionally want writes to the hosted Neon DB.
2. Open `http://localhost:8080/dev/sms-simulator`.
3. Keep `Real new-phone onboarding test (recommended)` checked for clean tests.
4. Click `Create Session`.
5. Keep `Show Debug` closed unless you are checking internal state.

## Checklist A: Quick Start Full Path

1. Send `hello`.
2. Expect `Welcome to DailyTTRPG... Reply START to begin.`
3. Click `Verify Persistence`; account should exist and onboarding should be awaiting START.
4. Send `START`.
5. Expect onboarding intro.
6. Send `continue`.
7. Expect character creation mode selection.
8. Send `1`.
9. Enter a name, such as `Aric`.
10. Choose `Human`.
11. Choose `Fighter`.
12. Send `1` or `Confirm`.
13. Expect `character.created`, Greyvale world intro, and the broken caravan prompt.
14. Click `Verify Persistence`; character, `dnd5e_character`, campaign instance, membership, scene, location, objective, and initial facts should exist.

## Checklist B: Guided Moderate Full Path

1. Create a fresh session.
2. Send `hello`, `START`, then `continue`.
3. Send `2` for Guided.
4. Enter `Mira`.
5. Choose `Elf`.
6. Choose `Wood Elf`.
7. Choose `Rogue`.
8. Choose `2` for quick/precise strengths.
9. Choose `Scholar`.
10. Choose `Curious`.
11. Send `Confirm`.
12. Verify persistence shows an active character and campaign context.

## Checklist C: Duplicate Action

1. Start from the broken caravan prompt.
2. Send `1`.
3. Verify only your inbound message appears; no DM confirmation should be sent.
4. Send `2`.
5. Expect one web-app guidance message.
6. Send `3`.
7. Expect no second guidance message.
8. Open debug and verify duplicate attempt count increased.

## Checklist D: STATUS Budget

1. After assignment, send `STATUS`.
2. Expect concise status plus `https://dailyttrpg.com/play`.
3. Send `OBJECTIVE`.
4. Expect app link only.
5. Send `RECAP`.
6. Expect no outbound SMS.
7. Send `HELP`.
8. Expect HELP response with STOP, frequency, rates, and support email.

## Checklist E: Resume/Interruption

1. Complete character creation and reach the first prompt.
2. Create another simulator session with the same phone, but do not use the fresh-session reset path.
3. Send `STATUS`.
4. Expect the existing campaign to resume, not a new character or campaign.
5. Verify persistence shows the same active character and campaign context.

## Checklist F: Beat Loop

1. Start from an active prompt.
2. Send `1`.
3. Confirm the action is silent and debug shows it was recorded.
4. Click `Advance to Next Beat`.
5. Expect real authored result text and next choices.
6. Send another valid number.
7. Click `Advance to Next Beat` again.
8. Expect another result/next prompt, or an explicit terminal/paused reason in debug.
9. Re-click `Advance to Next Beat`.
10. Expect idempotent `already_resolved` behavior, with no duplicate outbound result.

## Checklist G: Persistence Verification

Click `Verify Persistence` after each major stage and check:

- `account.exists = true`
- `phone_mapping.exists = true`
- `active_character.exists = true` after confirmation
- `dnd5e_character.exists = true` after confirmation
- `campaign.instance_exists = true` after assignment
- `campaign.membership_exists = true` after assignment
- `runtime.scene_key = broken-caravan-site`
- `runtime.objective_key = witness-the-aftermath`
- `knowledge.initial_facts_count = 4`
- `knowledge.hidden_truth_leaked = false`
- `last_action.exists = true` after action submission

## Automated Commands

```powershell
npm --prefix backend run test:sms-e2e
npm --prefix backend test
npm --prefix backend run lint --if-present
npm --prefix backend run typecheck --if-present
npm run build
```

If you run against Neon, confirm `.env.production` points at the intended Neon project before launching the simulator.
