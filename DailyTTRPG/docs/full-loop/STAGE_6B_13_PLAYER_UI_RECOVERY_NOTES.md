# Stage 6B.13.4 Player UI Recovery Notes

Stage 6B.13.4 hardens the Flutter player app around full-loop state clarity, stale-state recovery, completed dialogue handling, and rendered hidden-data boundaries. This pass does not add Greyvale content or change player-facing mechanics visibility.

## UI Surfaces Audited

| Area | Component or file | Current state after this pass |
| --- | --- | --- |
| Campaign dashboard | `dashboard_page.dart`, `campaign_preview_page.dart` | Existing loading/error recovery remains in place; broader start-to-scene smoke remains for 6B.13.6. |
| Exploration scene surface | `campaign_scene_page.dart`, `_SceneHeader`, `_SceneNarrativeCard`, `_AvailableDialoguesCard`, `_SceneReferenceSection` | Scene title, location, narration, objective, latest result, action composer, and reference sections continue to render from player read models. Dialogue-enabled NPC references now show a main-flow `Conversations` card plus player-safe Talk buttons that route to the specific Focus/Commit scene id. |
| Exploration action composer | `campaign_scene_page.dart`, `_ActionComposer` | Preview and submit buttons are disabled while active; stale/invalid lifecycle errors now clear the old preview and mark the draft for review. |
| Free Focus/Closer Looks | `campaign_scene_page.dart`, `_SceneReferenceSection`, `_openCloserLookFromPreview` | Existing closer-look flow remains; stale/invalid errors clear preview state and ask the player to review current scene state. |
| Latest Development | `campaign_scene_page.dart`, `_LatestSceneResult`, `_LatestBeatResult` | Rendered output uses player-facing result text, safe mechanics, visible changes, knowledge, and objective updates. Dialogue latest-result cards now bridge into the focused dialogue route when the result says dialogue started. |
| Dialogue scene surface | `dialogue_scene_page.dart`, `ConversationSurfaceCard` | Conversation surface, participants, passive insight, latest dialogue development, and active controls render only while dialogue is active. |
| Clarifying Questions | `dialogue_scene_page.dart`, `ClarifyingQuestionList` | Asked/reopened answers remain local and player-facing; CQs still show that they do not spend the dialogue beat. |
| Committed Social Move composer | `dialogue_scene_page.dart`, `CommittedSocialMoveComposer` | Preview/submit uses dialogue lifecycle context; stale/ended errors clear preview state and mark the draft for review. |
| Dialogue completion | `dialogue_scene_page.dart`, `DialogueCompletedStateCard` | Exited/completed dialogues no longer render active CQ/CSM/exit controls; the player sees a completion card, current-scene return action, and optional summary load action. |
| Transcript/archive | `dialogue_scene_page.dart`, `DialogueTranscriptArchive` | Player-facing transcript/archive remains collapsed by default and excludes hidden/debug content. |
| Knowledge journal | `campaign_knowledge_page.dart` | Widget coverage now checks Greyvale clue output, partial framing, source label, and rendered denylist safety. |
| Campaign history | `campaign_history_page.dart` | Widget coverage now checks safe latest-development text, objective updates, discovery text, and rendered denylist safety. |
| API errors | `api_client.dart`, `ApiException` | Known stale, ended, unavailable, auth, and internal-looking failures are mapped to stable player-safe messages and recovery codes. |

## Frontend Fixes Applied

- Added `ApiException.code`, `recoveryAction`, `shouldInvalidatePreview`, and `shouldRefreshCurrentState`.
- Added `playerSafeApiErrorMessage` and `playerSafeApiErrorCode` to normalize stale, ended, unavailable, auth, and internal-looking backend errors.
- Parsed and submitted exploration `ActionLifecycleContext` from preview to submit.
- Parsed and submitted dialogue `DialogueLifecycleContext` from active dialogue state and CSM preview to CQ/CSM/exit calls.
- Preserved `dialogue_scene_id` query parameters in app routing so `/play/campaign/dialogue?dialogue_scene_id=...` loads the requested NPC conversation instead of the generic no-active-dialogue state.
- Parsed dialogue entry metadata on visible NPCs, affordances, and scene-reference entries.
- Added a visible `Conversations` card before the action composer so dialogue-enabled NPCs are not hidden inside the collapsed Scene Reference section.
- Added scene-reference Talk buttons that navigate to the specific NPC Focus/Commit dialogue route.
- Added a latest-result conversation CTA for exploration results such as `Dialogue started: Tomas and the Road.` so the player can continue into the Focus/Commit dialogue UI after typing a talk action.
- Added backend dialogue-entry decoration for player-safe NPC aliases, so authored exploration targets like `the innkeeper` can resolve to the Tomas Focus/Commit dialogue even when the target is not already emitted as `npc:tomas-rell`.
- Cleared stale exploration previews and marked drafts for review when stale/invalid lifecycle errors occur.
- Cleared stale dialogue CSM previews and marked drafts for review when stale/ended lifecycle errors occur.
- Added `DialogueCompletedStateCard` so completed dialogues show recovery/archive affordances instead of active controls.

## 2026-05-26 Dialogue UI Deployment Audit

- Expected player flow: the exploration scene remains the current scene, but dialogue-enabled NPCs appear in a main-flow `Conversations` card with `Talk with ...` buttons. Those buttons route to `/play/campaign/dialogue?dialogue_scene_id=...`, where the Focus/Commit UI renders the Conversation Surface, Passive Social Insight, Clarifying Questions, Committed Social Move preview/submit, exits, and transcript/archive controls.
- Latest-result bridge: if a player types a freeform action such as `talk to the innkeeper` and the resolved result says `Dialogue started`, the `Latest Exchange` card should show an `Open conversation with ...` CTA when the scene payload includes or can infer a matching `dialogue_scene_id`.
- Local source state: `apps/player_app/lib/campaign/campaign_scene_page.dart` and `dialogue_scene_page.dart` contain the intended UI, but the previously generated `frontend/play/main.dart.js` bundle was still dated 2026-05-22 and did not contain `Conversations`, `conversation_entry`, `latest_dialogue_entry`, or `Open conversation`.
- Hosted app state before rebuild: `https://dailyttrpg.com/play/main.dart.js` also lacked those strings, confirming Firebase Hosting was serving the stale Flutter bundle rather than the current source.
- Fix applied locally: `npm run build:player` rebuilt `apps/player_app/build/web` and copied it into `frontend/play`; the rebuilt `frontend/play/main.dart.js` now contains `Conversations`, `conversation_entry`, `latest_dialogue_entry`, and `Open conversation`.
- Backend payload hardening: the scene read model now bridges player-safe NPC aliases and authored affordances such as `the innkeeper`/`tomas` to `greyvale_tomas_roadside_worries_dialogue`, so the Flutter UI has the `dialogue_scene_id` it needs.
- Production deployment still required: deploy the rebuilt `frontend/play` bundle with `npm run deploy:hosting`, and deploy/restart the DigitalOcean backend plus re-import Greyvale world content if production should pick up backend/content metadata changes.
- Diagnostic cleanup: playtest diagnostics no longer report `Missing Latest Scene Feed Entry` when the latest result belongs to a different scene/feed scope, avoiding a false repair prompt during dialogue/transition flows.

## Tests Added

New suite: `apps/player_app/test/player_ui_recovery_test.dart`

Covered scenarios:

- API error normalization removes backend/internal details from player messages.
- Exploration stale preview submit passes lifecycle context, clears the old preview, shows a safe stale message, and keeps rendered UI free of hidden/debug fragments.
- Exploration scene reference can open a specific Tomas Focus/Commit route with `dialogue_scene_id=greyvale_tomas_roadside_worries_dialogue` from the main-flow `Conversations` card.
- Dialogue latest-result cards offer a player-safe bridge into the focused dialogue route after a `Dialogue started` result.
- Dialogue stale CSM submit passes lifecycle context, clears the old preview, shows a safe conversation-stale message, and keeps rendered UI clean.
- Completed dialogue state hides CQ/CSM/exit controls and offers return-to-scene recovery.
- Knowledge Journal renders the deduped Tomas clue with partial/source framing and no hidden-data leakage.
- Campaign History renders safe latest development, objective update, and discovery text without hidden-data leakage.

Existing dialogue UI tests continue to cover:

- dialogue section order
- CQ resolve/reopen behavior
- CSM preview/submit behavior
- overlap warning choices
- exit and transcript/archive rendering

## Player-Safe Error Messages

The Flutter API layer now maps known lifecycle and recovery cases to stable copy:

- Stale exploration action/preview: `That moment has changed. Review the current scene and choose your next action.`
- Stale dialogue state: `That moment has changed. Review the current conversation and choose your next move.`
- Action already resolving: `That action is already being resolved.`
- Ended dialogue: `This conversation has ended. Return to the current scene.`
- Unavailable action/transition: `That option is no longer available.`
- Missing active character: `Choose an active character before continuing.`
- Internal-looking backend error: `DailyTTRPG could not complete that request. Refresh the current scene and try again.`

These messages intentionally avoid table names, stack traces, action-window ids, branch ids, hidden requirements, validation notices, and debug terms.

## Rendered Visibility Boundary

The new widget tests inspect rendered `Text` output for a denylist including:

- hidden DC/internal check markers
- raw rolls and total results
- result-band or branch internals
- hidden requirements
- GM notes/debug summaries
- raw state/write/relationship-meter terms
- preview/routing confidence
- path harness metadata
- future-supported/combat routing internals
- database constraint and stack trace fragments
- final mystery wording

The rendered exploration, dialogue, knowledge, and history scenarios remain clean.

## Accessibility And Responsive Sanity

- Loading states still include visible text or actionable labels where existing widgets provide them; some scene/dialogue loading states are spinner-only and should get richer semantic copy in a later UI polish pass.
- Submit buttons disable while previewing/submitting, and stale errors remove old submit affordances in the covered flows.
- Completed dialogue recovery exposes clear button labels: `Return to Current Scene` and `Load Summary`.
- Existing layouts use scroll views and wraps for narrow screens; full mobile viewport smoke remains deferred.

## Deferred Gaps

- Full browser refresh and two-tab orchestration remains represented by stale lifecycle-token widget tests, not full browser automation.
- Campaign dashboard/start-to-scene and active-character switch UI smoke should be covered in 6B.13.6 or 6B.15.
- Archive/search page-level UI coverage remains thinner than component-level transcript/archive coverage.
- Combat UI remains out of scope; Rusk combat-pending/future-supported read-model coverage stays backend-side until the combat UI stage.
- GM/dev inspector expansion remains routed to 6B.13.5.

## Validation Commands

Run from `DailyRPG/apps/player_app`:

```powershell
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test test/player_ui_recovery_test.dart test/dialogue_ui_test.dart test/models_test.dart
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' test
& 'C:\Users\Joshu\CodexTools\flutter\bin\flutter.bat' analyze
& 'C:\Users\Joshu\CodexTools\flutter\bin\dart.bat' format --output=none --set-exit-if-changed lib test
```
