# Stage 6A.5b Narrative-First SMS Exploration

Stage 6A.5b makes normal SMS exploration feel less like a repeated menu and more like asynchronous tabletop play. The simulator and future Twilio transport still use the same shared SMS pipeline, but exploration replies can now be short natural actions such as `look around`, `inspect the wagon`, `talk to the innkeeper`, or `follow the tracks`.

Player-facing SMS still must come from `SmsTemplateRegistry` and `SmsOutboundFormatter`.

## Runtime Model

Normal exploration uses this flow:

```text
Inbound SMS
-> SmsInboundService
-> SmsConversationService
-> DeterministicIntentResolver
-> active scene affordance/action
-> existing action-window submission
-> Advance to Next Beat / scheduled progression
-> real runtime/content result
-> SmsOutboundFormatter
-> SmsMessageStore
```

The resolver only maps player text to existing scene affordances. It does not invent outcomes, clues, scene changes, or result text. The runtime/content system remains responsible for action resolution.

## Action Vocabulary

The reusable action registry lives in `backend/src/sms/smsActionVerbRegistry.js`.

Canonical verbs:

- `observe`
- `investigate`
- `search`
- `track`
- `talk`
- `move`
- `use`
- `help`
- `wait`

Aliases are reusable. Examples:

- `look around` -> `observe`
- `inspect`, `examine`, `check` -> `investigate`
- `follow`, `trail` -> `track`
- `ask`, `speak` -> `talk`
- `go`, `enter`, `continue` -> `move`

## Affordances

Scene affordance helpers live in `backend/src/sms/smsExplorationAffordanceService.js`.

Affordances represent interactable people, objects, places, trails, exits, and scene features. They include:

- `affordance_key`
- `label`
- `aliases`
- `tags`
- `available_actions`
- `repeat_policy`
- persisted state such as `available`, `hidden`, `locked`, or `resolved`

Example authoring shape:

```json
{
  "id": "caravan_wreck",
  "label": "broken caravan",
  "aliases": ["caravan", "wagon", "wreck", "cart"],
  "tags": ["object", "investigatable", "searchable"],
  "available_actions": [
    {
      "verb": "investigate",
      "interaction_id": "inspect-broken-caravan",
      "repeat_policy": "once"
    }
  ],
  "adds_affordances": ["strange_tracks"]
}
```

Current runtime compatibility derives affordances from existing scene actions, so existing content keeps working while richer authored affordances can be added later.

## Repeat Policies

- `once`: hide after successful use in SMS exploration.
- `repeat_with_new_context`: reusable only when new context/facts make it meaningful again.
- `repeatable`: remains available, useful for movement or ongoing actions.
- `depleted_visible`: representable for web/debug, usually omitted from SMS prompts.

Affordance state persists in `dnd5e_scene_affordance_state`, keyed by campaign, character, scene, affordance, and action.

## Intent Resolution

The deterministic resolver lives in `backend/src/sms/smsIntentResolver.js`.

Resolution order:

1. Existing command handling for `HELP`, `STATUS`, `LEVEL`, `STOP`, and `START`.
2. Clarification numbered replies when a clarification is active.
3. Verb + target alias matches.
4. Target-only matches when there is one obvious action.
5. Verb-only matches when there is one obvious target, or clarification when there are several.
6. Invalid/no-match template if nothing safe resolves.

Ambiguous input creates a clarification prompt through `input.clarify_action`:

```text
Who do you approach?
1) The innkeeper
2) The shaken woman
3) The travelers
```

Clarification state is kept in simulator/session state and expires when the action window changes.

## Narrative-First SMS

Normal exploration now prefers `prompt_mode = narrative_first`:

```json
{
  "prompt_mode": "narrative_first",
  "guidance_level": "minimal",
  "include_action_hints": false,
  "include_numbered_options": false,
  "allow_freeform_actions": true
}
```

This means the player usually receives narrative without a repeated action menu:

```text
Rain taps against the inn windows. The innkeeper polishes the same cup too long. Near the hearth, a woman grips a torn caravan sash.
```

Numbered options remain appropriate for onboarding, character creation, combat, dialogue, confirmations, and clarification prompts.

## Guidance Levels

Guidance levels are:

- `tutorial`: early flow may include natural-input examples.
- `light`: occasional reminders.
- `minimal`: narrative-first, no repeated hints by default.
- `none`: narrative only except critical system prompts.

The Greyvale intro starts with tutorial-style guidance and transitions to minimal after the first exploration beat. `HELP` carries durable guidance so every prompt does not need to repeat the full action vocabulary.

HELP now includes natural-action examples plus compliance language:

```text
Reply naturally: 'look around,' 'talk to the innkeeper,' or 'follow tracks.' STATUS for context. STOP to opt out. Msg freq varies. Msg & data rates may apply.
```

## Seed Campaign Proof

The Broken Caravan and Grey Road Inn content now use richer SMS narrative. Runtime actions in these scenes become generic affordances:

- broken caravan / wagon
- survivors / missing travelers
- tracks / trail / footprints
- road or inn movement
- innkeeper and other visible people when present

Investigating the caravan marks that once-only affordance resolved, so repeated SMS prompts stop presenting it as an equal choice. If the player tries the exhausted target again, they receive the normal invalid/no-match guidance rather than looping the same action.

## Simulator Debug

The SMS simulator debug panel exposes:

- `prompt_mode`
- `guidance_level`
- `include_action_hints`
- `include_numbered_options`
- active/resolved affordances
- last intent resolver status
- resolved verb
- resolved target affordance
- resolved interaction or transition
- confidence and reason
- clarification state
- affordance persistence counts

Player-facing threads show only rendered SMS text, never debug JSON.

## Future AI Resolver

No external AI is called in this stage.

Freeform resolution logs are stored in `dnd5e_sms_intent_resolution_log` with:

- raw and normalized player text
- scene/campaign/character context
- available affordances and verbs
- resolver status
- candidates
- selected candidate
- confidence
- clarification flag
- `external_ai_used = false`

These logs provide a future evaluation dataset for a hosted or local AI resolver without changing the transport or runtime contract.

## Manual Simulator Walkthrough

1. Open `Open SMS Simulator.cmd`.
2. Create a fresh session with `Real new-phone onboarding test` enabled.
3. Send `hello`, then `START`.
4. Complete Quick Start character creation.
5. Observe the Greyvale intro and first Broken Caravan prompt.
6. Send `inspect the wagon`.
7. Confirm no immediate DM confirmation appears.
8. Click `Advance to Next Beat`.
9. Confirm a real caravan result appears through `gameplay.exploration_narrative`.
10. Confirm debug shows `resolved_verb = investigate` and a caravan affordance.
11. Send `inspect the caravan` again.
12. Confirm the exhausted once-only target does not silently loop the same result.
13. Send `follow the tracks`.
14. Confirm the resolver maps to the real tracks affordance and the next beat resolves through runtime.

## Test Commands

```powershell
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@127.0.0.1:5432/dailyrpg'
npm --prefix backend run test:sms-exploration -- --test-reporter=spec
npm --prefix backend run test:sms-simulator -- --test-reporter=spec
npm --prefix backend run test:sms-campaign -- --test-reporter=spec
npm --prefix backend run test:sms-e2e -- --test-reporter=spec
```

