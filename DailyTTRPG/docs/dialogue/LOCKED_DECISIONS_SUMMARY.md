# Locked Decisions Summary

This file condenses the locked dialogue design into implementation-relevant groups. It should guide future Codex tasks without requiring each task to reread the full design discussion.

## Dialogue Basics

- Dialogue Focus/Commit is a dialogue adapter over shared Surface / Focus / Commit primitives.
- Shared primitive names remain reusable internally: `surface`, `passive_context`, `free_focus`, `committed_action`, `preview`, `resolution`, `state_changes`, `outputs`, `transitions`.
- Dialogue-facing names should be domain-specific: `conversation_surface`, `passive_social_insight`, `clarifying_questions`, `committed_social_moves`, `dialogue_exit`, `completed_dialogue_record`.
- Dialogue should preserve the async beat/action-window model. Clarifying questions do not consume the beat. Committed social moves do.
- Dialogue output must be character-perspective safe and authored-content-first.
- The system must not invent major clues, confessions, transitions, relationship changes, state changes, or canonical events unless authored JSON allows them.

## Clarifying Questions

- Clarifying Questions are dialogue-domain Free Focus.
- They resolve immediately and do not consume the dialogue beat/window.
- They should be compact, optional, and useful for orienting the player.
- They can be no-check, visible-check, hidden-check, success-only, or narrative-only, using shared check visibility rules.
- Results persist per character, campaign, dialogue scene/session, question, and relevant state version.
- Reopening a resolved question must not reroll.
- Clarifying Questions update the Knowledge Journal or history only when explicitly authored knowledge/state changes apply.
- Unresolved Clarifying Questions may be locked after a committed move is submitted, while resolved ones remain reviewable.

## Committed Social Moves

- Committed Social Moves are dialogue-domain committed actions.
- They consume the current dialogue action window or equivalent dialogue beat.
- They can be authored move chips, natural text, or a hybrid of natural text plus selected target/intent metadata.
- Examples include reassure, press, confront, bargain, confess, ask for help, test honesty, reveal evidence, or withdraw.
- Checked moves must use shared check resolution and visibility.
- No-check moves are valid when authored.
- A committed move can update relationship/social state, knowledge, objectives, scene state, dialogue state, or transitions only through authored rules.

## Preview And Overlap Handling

- Preview is required before submission, matching the web action composer posture.
- If a player submits a shallow move that overlaps an unresolved Clarifying Question, preview should block with choices:
  - Ask Clarifying Question.
  - Continue as Committed Social Move.
  - Edit.
- Continuing as a committed move should be explicit and should spend the beat.
- If a Clarifying Question has already been resolved, preview may still warn that the committed move is a deeper follow-up.
- Preview must revalidate visibility, availability, relationship state, known facts, and action-window state server-side.
- Frontend metadata is guidance only; the backend is authoritative.

## Relationship And Social State

- Relationship/social state is explicit authored/runtime state, not inferred from prose.
- State reads must declare scope and source.
- State writes must declare scope, target, field, value/operation, visibility, audit reason, and provenance.
- Relationship fields should be registered, typed, and validated before use.
- Ladder values such as trust, fear, suspicion, pressure, rapport, or hostility must use registered enums or numeric ranges.
- Hidden relationship state must not leak to player-facing UI.
- Player-visible relationship changes should be narrated only when perceptible or authored as safe.

## Transcript And Completed Records

- Dialogue should produce a transcript while active and a completed dialogue record when ended.
- Transcripts preserve turns, selected options, clarifying question results, committed moves, safe outputs, and provenance.
- Completed records are compact player-facing summaries plus links to expandable safe transcript detail.
- GM/dev records may include hidden/debug fields in separate views or payloads.
- Completed records should be stable read models, not raw event log reconstruction.

## Summaries

- Summaries are authored-content-first.
- Summary generation must not invent confessions, clues, motives, relationship changes, or next steps.
- If AI or generated summaries are ever introduced later, they must be disabled by default and constrained to safe source material.
- MVP summaries should be deterministic from authored result text, selected move labels, safe knowledge grants, and completed record metadata.

## Annotations And Corrections

- Annotation/correction lifecycle is a future structured authoring and QA layer.
- Annotations can mark confusing, unsafe, stale, missing, or unreachable dialogue content.
- Corrections can supersede prior authored/runtime records without mutating historical player-facing records silently.
- Correction chains must preserve provenance, author, reason, affected records, review status, and publish status.
- Player-facing completed records should not change retroactively unless a correction policy explicitly allows a safe replacement.

## Exits And Transitions

- Dialogue exits are authored and visible based on dialogue/session/scene conditions.
- Exits may return to the current scene, transition to another scene, end the dialogue, or open another domain such as combat later.
- Exits must not bypass action-window state or relationship/state validation.
- Dialogue transitions should be explicit and must not leak hidden future scenes or unavailable branches.

## Validation

- Unsafe or ambiguous runtime behavior should be hard errors.
- Authoring quality issues should be warnings.
- Optimization, reachability, and debug-tooling advice should be debug notices.
- Validation must catch hidden-only sources used in player-facing records.
- Validation must reject ambiguous shorthand reads and writes for relationship/social state.

## Player UI

- Player UI should be dialogue-first, not graph/debug-first.
- Recommended order:
  1. Current conversation surface.
  2. Latest Development, if present.
  3. Passive Social Insight, if visible.
  4. Clarifying Questions.
  5. Committed social move composer and authored move chips.
  6. Exits.
  7. Transcript/reference/archive collapsed below.
- The UI should use labels such as "Ask a clarifying question" and "Commit a social move", not generic exploration labels.
- It must not show hidden state, raw IDs, secret DCs under hidden visibility, GM notes, or correction internals.

## GM/Dev Tooling

- GM/dev tooling should be server-side authorized.
- Tools may inspect scene state, availability, preview mapping, relationship state, transcripts, annotation chains, audit timelines, validation, and test paths.
- Normal players must not see these diagnostics.
- Repair/correction tools must not silently mutate canonical records.

## Test Harness

- Future implementation needs deterministic tests for a Greyvale/Elin memory dialogue fixture.
- Tests should cover player and GM/dev visibility separately.
- Tests should prove Clarifying Questions do not consume beats and Committed Social Moves do.
- Tests should verify transcript/completed record creation and relationship audit provenance.

## Schema, Migrations, Backend, Frontend Package Structure

- Schema and validation should land before migrations.
- Migrations should land before runtime writes.
- Backend service skeletons should precede frontend UI.
- Player UI should consume typed API models, not raw event/debug payloads.
- GM/dev workspace should come after diagnostics and read models are stable.

