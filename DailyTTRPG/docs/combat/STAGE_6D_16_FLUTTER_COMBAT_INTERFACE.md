# Stage 6D.16 - Flutter Combat Interface

## Executive Result

Stage 6D.16 adds the first Flutter player combat interface boundary. The screen is designed around the Stage 6D player-safe combat read models and submit contracts, not the legacy combat-service response shape. It does not implement combat rules in the client and does not expose GM/developer trace data.

The Flutter route is `/play/combat`. It consumes a narrow `CombatRepository` contract that expects player-safe backend endpoints under `/api/play/combat/*`. A repository search found no backend transport route currently mounted at those paths, so backend route wiring remains the integration seam before this can be considered fully live against a running server.

## Prerequisite Evidence

The implementation uses the contracts and projections from the completed Stage 6D backend work:

- Stage 6D.1 combat adapter and projection boundary.
- Stage 6D.7 incremental turn read model fields such as `legal_decision_categories`, `available_authored_actions`, `visible_movement_destinations`, `latest_result`, and `end_turn_confirmation`.
- Stage 6D.8 reaction state fields such as `reaction_state`, `trigger`, `legal_reaction_options`, and `decline_option`.
- Stage 6D.9 automatic turn playback fields such as `automatic_state` and `latest_events`.
- Stage 6D.11 Combat Focus fields such as `combat_focus`, `focus_available`, suggestions, and answers.
- Stage 6D.14 encounter resolution fields such as `aftermath`, `rewards`, `review`, and resolution choices.
- Stage 6D.15 visibility expectations that player payloads do not expose traces, mutation plans, exact hidden enemy stats, raw state internals, or future/combat handoff labels.

## Client Architecture

Added `apps/player_app/lib/combat/` with three layers:

- `combat_models.dart` provides tolerant Flutter models for player-safe combat read models, previews, submit results, reactions, focus, recovery, and encounter review.
- `combat_repository.dart` defines a narrow backend adapter. It uses `/api/play/combat/current`, `/preview`, `/submit`, `/reaction/submit`, `/reaction/decline`, `/focus`, `/resolution`, and `/continue`.
- `combat_controller.dart` owns load, refresh, preview, submit, idempotency-key creation, stale/error handling, response-race suppression, reaction submission, Combat Focus, encounter resolution, and continue-adventure actions.
- `combat_screen.dart` renders the primary combat screen and keeps all rules decisions server-authored.

The app router now recognizes `/play/combat`.

## Primary Screen

The combat screen renders these player-facing sections in stable order:

- Combat overview with encounter title, status, round, current actor, position, and next step.
- Latest result.
- Initiative.
- Resources and position.
- Combatants.
- Current decision categories.
- Movement destinations.
- Authored actions and target selection.
- Preview and Commit controls.
- End Turn with meaningful confirmation copy.
- Reaction prompt when active.
- Automatic event playback when active.
- Combat Focus.
- Encounter review and rewards.
- Recovery-needed state.
- Visible combat log.

The screen is responsive through the existing `AppShell`, `SingleChildScrollView`, `Wrap`, `Card`, and constrained layout patterns.

## Player Operations

The UI can submit player intents for:

- Movement destination selection.
- Authored actions.
- Authored bonus actions.
- Object/free interaction timing when the server marks the action timing accordingly.
- Target selection, including multi-target-capable chips when target candidates are supplied.
- Ally or non-hostile confirmation when the action metadata requires it.
- Nonlethal intent when the action metadata supports it.
- Wait.
- End Turn with confirmation when the server says meaningful options remain.

Preview is visibly non-final and Commit is the final action. The client forwards `source_state_version` and `preview_identity` from preview responses when submitting.

## Reactions

When the read model has `reaction_state: waiting_for_player`, ordinary turn controls are hidden and the player sees only:

- Trigger summary.
- Legal reaction options.
- Decline option.
- Timeout behavior if supplied.

The Flutter client does not resolve opportunity attacks or implement reaction ordering.

## Automatic Turns

Automatic turn states render as playback/review, not as player decisions. The screen shows visible latest events and provides a local “Skip animation” affordance only. It does not run enemy AI, advance initiative, or create a meaningless Continue button.

## Combat Focus

Combat Focus renders if the player-safe read model exposes focus availability, suggestions, or an answer. The player can choose a suggested question or enter a short question. The screen submits the text to the backend and renders the refreshed player-safe state returned by the repository.

## Encounter Resolution And Review

Encounter resolution renders the shared aftermath state, rewards, advancement readiness, player review summary, resolution choices when supplied, and Continue Adventure. Normal combat controls are hidden in this state.

## Recovery

Recovery-needed states remove ordinary combat controls and End Turn. The screen shows the player-safe recovery message, refresh safety, retry safety, repair requirement, and a Refresh Combat action.

## Accessibility

The screen uses semantic labels for overview, decision, and reaction regions; minimum Material button sizing through existing app theme; visible text labels for icon buttons; and card headings for screen-reader navigation.

## Hidden Information Safety

Flutter does not render GM/developer traces. The model layer includes a small denylist guard for accidental raw internal fragments in visible text. The UI also avoids showing exact enemy hit points even if an unsafe payload accidentally includes them; exact HP is shown only for the player participant.

Player-visible tests assert rendered output does not contain hidden fragments such as `hidden_dc`, `raw_roll`, `branch_id`, `mutation_plan`, `idempotency_key`, `combat_pending`, `future_supported`, `trace_id`, or exact enemy HP fixture text.

## Canonical Rusk Paths

The UI is shaped for the canonical Rusk combat path from Stage 6D.13 through Stage 6D.14:

- Enter or resume combat at `/play/combat`.
- Show player turn read model.
- Preview and commit server-authored combat choices.
- Handle reaction prompts.
- Review automatic event playback.
- Use Combat Focus.
- Render encounter aftermath, rewards, review, and continuation.

This stage does not change Rusk backend behavior or reward logic.

## Legacy Retirement

The Flutter app does not call legacy `/combats/:id` or other old combat routes. All Flutter combat operations go through `CombatRepository`, which is intentionally scoped to player-safe `/api/play/combat/*` endpoints.

## Backend Changes

No backend files were changed in this stage. A search found no currently mounted `/api/play/combat` routes, so backend transport wiring remains needed before the Flutter screen can be live against the running app.

## Tests

Added focused Flutter tests for:

- Combat model parsing and hidden-data visible-text safety.
- Controller response-race protection and preview-to-submit metadata forwarding.
- Screen rendering of active turns, previews, commits, reactions, encounter resolution, recovery, and rendered-output denylist safety.

Flutter and Dart commands could not be executed in the current shell because neither `flutter` nor `dart` is on PATH. Backend Stage 6D regression remained passing after the Flutter edits.

## Scope Confirmation

This stage did not add combat mechanics, client-side rules, enemy AI, opportunity attack resolution, GM/developer inspector access, GM editing, migrations, Rusk content changes, reward changes, or a new state-management framework.

## Stage 6D.17 Readiness

The Flutter interface is ready for Stage 6D.17 manual/acceptance hardening once the player-safe `/api/play/combat/*` backend routes are mounted and Flutter tooling is available in the local/CI environment.
