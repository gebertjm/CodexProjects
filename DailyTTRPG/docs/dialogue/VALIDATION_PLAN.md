# Dialogue Validation Plan

Dialogue validation should use three severity levels:

- Hard errors: unsafe or ambiguous runtime behavior.
- Warnings: authoring quality issues that do not block safe runtime.
- Debug notices: reachability, optimization, test, or tooling suggestions.

Build 2 implementation note:

- The standalone validator now lives in `backend/src/content/dialogueFocusCommitValidation.js`.
- It returns `ok`, `hard_errors`, `warnings`, `debug_notices`, and compatibility `errors` text derived from hard errors.
- This build intentionally does not plug the validator into the package importer. Build 3 or a later schema/import task should decide exactly when focus/commit dialogue content becomes import-blocking.

Build 5 implementation note:

- Relationship/social state validation now distinguishes unambiguous shorthand reads from ambiguous shorthand reads.
- Explicit write scopes are checked against registered field definitions and `allowed_write_scopes`.
- Relationship field collisions fail unless content marks a deliberate override.
- Replacement overrides require an authored reason.
- Non-matching ladder override values require an authored `override_mapping` or `migration_mapping`.
- Runtime relationship writes still guard these rules server-side; validation is the authoring safety net, not the only protection.

Build 9 implementation note:

- Lifecycle validation now rejects pending suggested/generated records marked player-facing.
- Suppressed records require explicit `suppression_scope`.
- Retracted records require `retraction_reason`.
- Player-facing lifecycle text is checked for obvious implementation/debug terms such as audit logs, debug routes, preview confidence, lifecycle status, record IDs, and GM/dev wording.
- Content-side replacement links are checked where present. Runtime records additionally preserve replacement/retraction links in persistence.
- Runtime source safety in `dialogueAnnotationCorrectionService.js` rejects hidden relationship state, raw audit logs, debug route checks, secret requirements, preview confidence, hidden availability checks, GM/dev transcript metadata, and non-player-facing flags before records can become generated/player-facing output.

## Hard Errors

Hard errors must fail validation/import for dialogue-focus-commit content.

### Missing Required IDs

Error when required IDs are missing:

- `dialogue_scene.slug`
- `conversation_surface.surface_id`
- `passive_social_insight.insight_id`
- `clarifying_question.question_id`
- `committed_social_move.move_id`
- `dialogue_exit.exit_id`
- relationship field keys
- annotation/correction IDs or chain keys

### Duplicate IDs

Error for duplicates within a dialogue scene or relevant package scope:

- duplicate question IDs
- duplicate move IDs
- duplicate exit IDs
- duplicate passive insight IDs
- duplicate relationship field definitions
- duplicate annotation/correction chain keys

### Checked Move Missing Ability/Skill/DC

Error when a checked Clarifying Question, Passive Social Insight, or Committed Social Move lacks:

- ability or skill, depending on check engine requirements
- DC
- check mode
- valid check visibility

### State Write Missing Scope

Error when any state write lacks:

- `scope`
- `field`
- `operation`
- value or operation payload
- visibility
- reason/provenance source

### Ambiguous Shorthand Read

Error when content reads relationship/social state without explicit scope or target.

Bad:

```json
{ "requires_state": "trust >= 1" }
```

Good:

```json
{
  "relationship_state": {
    "scope": "character_npc",
    "target_id": "elin-harrow",
    "field": "trust",
    "operator": "gte",
    "value": 1
  }
}
```

### Unregistered Relationship Field

Error when a read or write references a relationship/social field that has no definition.

### Invalid Ladder Value

Error when a write sets a ladder field to an unregistered value or increments beyond allowed bounds without a clamp policy.

### Missing Override Mapping

Error when content defines a generic fallback, committed follow-up, correction, or summary override that references a missing move/question/surface.

### Unsafe Generic Fallback

Error when generic fallback can:

- reveal major clues without authored grants
- write relationship state without authored writes
- transition dialogue without authored exits
- make confessions or NPC admissions not present in content
- bypass check requirements
- expose hidden/GM-only text

### Broken Lifecycle Links

Error when annotations/corrections reference missing:

- chain IDs
- annotation IDs
- target content keys
- superseded correction IDs
- replacement refs

### Player-Facing Record Using Hidden-Only Source

Error when completed records, transcript turns, summaries, player search index, or player API fields include hidden-only source fields.

Examples:

- GM notes in player transcript.
- Hidden motive in player summary.
- Secret DC in visible mechanics.
- Unknown true NPC name before identity is known.

## Warnings

Warnings should not block legacy content, but should be visible in validation output.

Suggested warnings:

- Conversation surface is very short.
- Clarifying Question label sounds like a committed move.
- Committed Social Move label is vague.
- Move has no preview summary.
- Move has no failure branch where failure is reachable.
- Passive Social Insight has no safe success narration.
- Generic fallback exhaustion limit is missing.
- Dialogue exit has no summary.
- Relationship write has no player-facing perceived narration when visibility is player-perceived.
- Transcript policy is omitted and defaults will be used.
- Completed record summary policy is omitted.
- Multiple moves have similar labels/aliases.
- The dialogue scene has no test path metadata.

## Debug Notices

Debug notices are useful for authoring and tooling, but should not fail validation.

Suggested debug notices:

- Clarifying Question appears unreachable because no visible target points to it.
- Move is never preferred by preview mapping.
- Exit is reachable only after an uncommon hidden state.
- Relationship field is written but never read.
- Relationship field is read but never written in package.
- Summary/search tags are sparse.
- Annotation chain is open but has no correction draft.
- Correction draft is stale relative to content version.
- Transcript grows beyond recommended compact display threshold.
- Test path does not cover a failure branch.

## Validation Profiles

### Legacy Dialogue

- Existing graph dialogue remains valid.
- New Focus/Commit fields are optional.
- Missing adapter fields generate debug notices at most.

### Playtest-Ready Dialogue

Requires:

- Conversation surface.
- At least one Clarifying Question or explicit statement that none are available.
- At least one Committed Social Move.
- Authored success/failure text for reachable checked moves.
- Safe exits.
- Relationship state definitions for any reads/writes.
- Transcript/completed record policy.
- Test path metadata for at least one deterministic path.

### Published Dialogue

Future stricter profile. Likely requires:

- More complete branch coverage.
- Annotation/correction policy.
- Search tags.
- Accessibility text.
- Full safety scan.
