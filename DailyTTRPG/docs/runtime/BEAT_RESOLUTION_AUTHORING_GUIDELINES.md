# Beat Resolution Authoring Guidelines

Status: Stage 6C.3 guidance  
Purpose: help authored content produce clear deterministic beat outcomes without AI narration or hidden-data leaks

## Core Rule

Every committed beat should help the player understand:

- what they attempted
- what happened
- what changed
- what they learned
- what progressed
- what became harder or remains unresolved
- what they can do next

Use authored text and metadata. Do not rely on generated narration.

## Exploration Beat Actions

Author or provide metadata for:

- preview text that is honest but not over-specific
- attempted action label
- result text
- consequence text when the scene or state changes
- discovery summary when knowledge is granted
- progress summary when objective or route state changes
- complication text for failure, partial success, pressure, or unresolved danger
- next-step hint that matches an actual next state or visible route
- transition player label and summary

Avoid:

- hidden DCs
- raw rolls
- branch ids
- exact hidden requirements
- internal transition ids
- combat/future-supported internal labels

## Free Focus

Free Focus should:

- feel observational and non-committing
- avoid implying a Beat Action was spent
- reveal bounded authored information
- avoid major objective or route mutation unless explicitly intended by content
- preserve hidden mechanics and GM/dev diagnostics separately

## Dialogue Clarifying Questions

Clarifying Questions should:

- answer or focus a player question without consuming the committed social move
- preserve authored reply text
- provide safe relationship/social perception only when intended
- avoid raw relationship meters
- avoid hidden check data and branch ids

## Committed Social Moves

Committed Social Moves should provide:

- attempted social move label
- NPC response
- social consequence or perception summary when relevant
- clue/testimony discovery summary when knowledge is granted
- objective or route progress summary when relevant
- failure or partial-success text where authored
- complication text when trust, danger, pressure, or uncertainty changes
- next dialogue or exploration guidance

Avoid exposing:

- raw relationship/social state
- hidden requirements
- failed hidden requirements
- exact check internals
- GM/dev notes
- final mystery truth

## Endpoint And Future-Supported Beats

Endpoint or future-supported beats should provide:

- player-safe endpoint text
- review or awaiting-support wording
- what the player can review now
- what remains unsupported

Do not expose:

- `combat_pending`
- `future_supported`
- encounter ids
- branch ids
- target future stage internals
- GM/dev routing notes

## Recovery And Unavailable Cases

Recovery and unavailable copy should be:

- concise
- safe
- actionable
- non-technical

Use phrases like:

- "That option is not available from the current scene."
- "The situation changed. Review the current scene and choose again."
- "That route is not clear yet. Follow another lead first."
- "Something interrupted that resolution. Refresh the current scene."

Do not include:

- stack traces
- database constraint names
- internal ids
- hidden requirements
- branch names
- raw validation objects

## GM/Dev Diagnostics

GM/dev diagnostics may include:

- selected authored outcome
- missing recommended result sections
- branch/check details according to policy
- output references used
- complication markers
- next-step marker
- visibility filtering notes

These diagnostics must remain permission-gated and never appear in player payloads.

## Review Checklist

Before marking an authored committed beat ready:

- The preview does not promise more than the result can deliver.
- The committed result has authored text.
- Discoveries and progress are explicit when outputs exist.
- Complications are framed safely.
- Next steps align with actual available state.
- Failure or partial success is not a dead-end unless intentionally endpoint/recovery.
- Player text passes the hidden-data denylist.
- GM/dev diagnostics explain internal reasons separately.
