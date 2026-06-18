# Stage 6C.3 - Outcome Quality, Consequence Framing, And Failure Handling

Status: implemented as shared result-bundle assembly helpers, diagnostics, tests, docs, and Greyvale acceptance fixture metadata  
Created: Stage 6C.3  
Primary predecessors: Stage 6C.1 Resolution Pipeline Contract And Stage 6C.2 Preview-To-Resolution Consistency  
Primary module: `backend/src/services/interactionCore/resolutionPipeline.js`  
Primary tests: `backend/test/interaction-core-outcome-quality.test.js`

## 1. Purpose

Stage 6C.3 improves how deterministic authored outcomes are assembled into player-facing committed beat result bundles.

This pass does not rewire exploration or dialogue runtime services. It hardens the shared contract layer so later adapters can provide consistent result sections without inventing prose or exposing internal mechanics.

## 2. Outcome-Quality Standards

A good committed beat result should communicate, when relevant:

- attempted action
- immediate result
- consequences
- discoveries
- progress
- complications
- next step
- recovery or endpoint status

Not every beat needs every section. Empty sections remain null or empty arrays and should be hidden by UI renderers.

All result text must remain authored, deterministic, concise, and player-safe.

## 3. Shared Result Bundle Assembler

Stage 6C.3 extends `createPlayerResultBundle` with:

- `attempted_action`
- `complications`

Existing sections remain:

- `result`
- `consequences`
- `discoveries`
- `progress`
- `next`
- `recovery`
- `status`

New shared helper:

- `createOutcomeQualityResultBundle`

The helper accepts authored outcome pieces plus an optional normalized output bundle and builds a player-safe result bundle.

It can derive safe sections from output bundle categories:

- knowledge outputs -> `discoveries`
- objective outputs -> `progress`
- player-safe state write summaries -> `consequences`
- player-safe relationship/social perception summaries -> `consequences`
- blocked transition player summaries -> `complications`
- transition or next-beat player labels -> `next`

The helper does not expose raw writes, provenance, branch ids, hidden requirements, or GM/dev diagnostics.

## 4. Exploration Outcome Behavior

Exploration Beat Action result bundles can now frame:

- the attempted Beat Action
- immediate scene result
- clue discovery
- objective or route progress
- safe state/location consequence
- unresolved complication
- next practical exploration or dialogue step

Greyvale acceptance metadata now marks Broken Caravan inspection as expecting:

- `attempted_action`
- `result`
- `discoveries`
- `progress`
- `next`

No authored exploration story content was changed.

## 5. Dialogue Outcome Behavior

Dialogue Committed Social Move result bundles can now frame:

- the attempted social move
- NPC response
- social consequence
- clue or testimony discovery
- objective or route progress
- safe relationship perception summary
- complication or unresolved pressure
- next dialogue or exploration step

Greyvale acceptance metadata now marks Tomas as expecting result sections including consequences and discoveries, and Rusk as expecting endpoint-adjacent complications/status.

No authored dialogue story content was changed.

## 6. Failure And Partial Success

Failure and partial-success outcomes should be represented through:

- authored result text
- safe complication text
- safe recovery or next-step guidance
- safe status labels

They must not reveal:

- hidden DCs
- raw rolls
- branch ids
- hidden requirements
- exact failed requirements
- raw relationship/social state
- GM-only truth
- internal failure codes

GM/dev diagnostics may include branch and check details according to existing permission policy.

## 7. Complication Framing

Complications now have a deterministic player-facing section.

Complications can represent:

- pressure getting worse
- route narrowing
- NPC distrust
- incomplete or misleading information
- unresolved threat
- endpoint or future-supported boundary

Complication text must come from authored outcome data or existing player-safe output summaries.

## 8. Next-Step Framing

The assembler prefers explicit authored `next` text.

If explicit `next` text is absent, it can safely derive next-step labels from:

- next-beat decision player label/summary
- transition decision player label/summary
- transition output player label/summary

It does not expose target ids, routing internals, combat/future-supported labels, or hidden requirements.

## 9. Unavailable, Locked, And Recovery Results

Unavailable and recovery responses continue to use the safe recovery envelope.

Stage 6C.3 adds coverage proving these responses can also carry:

- safe complication framing
- safe next-step guidance
- safe recovery message
- player-safe status

Internal unavailable reasons and stale/duplicate diagnostics remain GM/dev-only.

## 10. GM/Dev Diagnostics

New helper:

- `createOutcomeQualityDiagnostics`

Diagnostics report:

- quality status
- present result sections
- missing recommended sections
- warnings
- output reference counts used
- selected outcome
- failure/partial status marker
- next-step marker
- complication markers

`createResolutionTraceEnvelope` now includes `outcome_quality_diagnostics`.

This remains GM/dev trace data and is omitted from player projections.

Stage 6C.4 extends the recovery side of this work with mutation-safety diagnostics, no-mutation duplicate/stale decisions, and recovery-needed mutation failure envelopes. The 6C.3 result-bundle recovery sections remain player-facing; 6C.4 mutation diagnostics remain GM/dev-only.

Stage 6C.5 extends the next-step side of this work with transition-orchestration diagnostics and transition/result alignment checks. Outcome-quality next-step text can now be tested against the shared transition and next-beat decisions without exposing routing internals to players.

Stage 6C.6 extends the player-view side of this work with result/read-model alignment checks. Result discoveries, progress, next-beat decisions, endpoint states, and recovery states can now be tested against a normalized player read model while GM/dev diagnostics remain hidden from players.

## 11. Greyvale Acceptance Extension

The Greyvale vertical-slice fixture now includes `outcome_quality_assertions`.

Semantic expected section metadata was added for:

- Broken Caravan inspection
- Tomas pattern dialogue
- Rusk confrontation endpoint-adjacent beat

The DB-backed acceptance fixture-shape test now checks these markers when the local database-backed acceptance suite runs.

## 12. Tests Added

`backend/test/interaction-core-outcome-quality.test.js` covers:

- authored action/result text preservation
- output-derived discovery/progress/consequence/next sections
- dialogue social consequence projection
- raw relationship state hiding
- failure and partial-success complication framing
- unavailable and recovery player safety
- GM/dev diagnostics for present and missing sections
- trace diagnostics remaining GM/dev-only
- Rusk endpoint-adjacent internals staying player-hidden

`npm run test:interaction-core` now includes the 6C.3 suite.

## 13. Known Limitations

- Exploration and dialogue runtime services are not fully routed through the assembler yet.
- Existing player UI rendering is unchanged; 6C.6 added shared result/read-model alignment helpers without requiring UI file changes.
- Full mutation ordering, dedupe, and transaction safety remain 6C.4.
- Shared transition and next-beat orchestration scaffolding exists from 6C.5, but full runtime service adoption remains incremental.
- Shared read-model alignment scaffolding exists from 6C.6, but full runtime service adoption remains incremental.
- Full GM/dev trace persistence and inspector work remains 6C.7.
- No schema migration was added.

## 14. Behavior Preservation

No authored Greyvale content was changed.

No combat, navigation, AI narration, SMS requirement, rules transparency expansion, player UI redesign, or database/schema migration was added.
