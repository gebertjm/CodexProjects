# Stage 6C Final Status

Status: regression-covered for the current shared beat-resolution hardening scope  
Final validation stage: Stage 6C.8  
Primary regression command: `npm run test:stage:6c`

## Summary

Stage 6C hardens the deterministic, authored beat-resolution runtime surface shared by exploration and dialogue while preserving domain-specific adapters.

The stage added shared contracts, preview/commit consistency helpers, outcome-quality and result-bundle helpers, mutation-ordering and recovery scaffolding, transition/next-beat helpers, read-model refresh alignment helpers, GM/dev trace/provenance helpers, and a capstone regression command.

No combat, open-world navigation, AI narration, player-facing rules transparency expansion, SMS requirement, major Greyvale content, player UI redesign, full GM Campaign Inspector, or database/schema migration was added.

## Stage Coverage

- 6C.0 created the audit and hardening plan.
- 6C.1 defined shared beat-resolution contracts and orchestration maps.
- 6C.2 hardened preview-to-resolution consistency.
- 6C.3 improved outcome quality, consequence framing, and failure handling.
- 6C.4 hardened mutation ordering, dedupe, idempotency, and recovery scaffolding.
- 6C.5 hardened transition orchestration and next-beat selection.
- 6C.6 hardened player result bundle and read-model refresh alignment.
- 6C.7 hardened GM/dev trace and provenance inspection helpers.
- 6C.8 created the capstone regression suite, command, path fixture, and final status.

## Official Regression Command

Run from repo root:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:stage:6c
```

This runs:

- `npm --prefix backend run test:interaction-core`
- `npm --prefix backend run test:greyvale-vertical-slice`

The Greyvale vertical-slice command validates the Greyvale content package before executing the DB-backed route acceptance test.

## Shared Runtime Coverage

The shared runtime layer covers:

- resolution contracts
- preview non-mutation and preview/commit alignment
- outcome quality and player result bundles
- mutation plan ordering, dedupe, and recovery-needed behavior
- transition decisions and next-beat selection
- result/read-model alignment and refresh timing
- GM/dev trace envelopes, provenance inspection, access decisions, and redaction
- player-vs-GM projection comparison
- hidden-data denylist checks

## Greyvale Acceptance Extension Coverage

The Stage 6C gate reuses the Greyvale vertical-slice acceptance route.

It proves:

- Greyvale can start and resume.
- Broken Caravan, Grey Road Inn, Dunmere, old path, shrine, and Rusk route steps remain playable.
- Tomas, Elin, Mara, Lysa, Garren, and Rusk dialogue route steps remain usable.
- Free Focus remains non-committing.
- previews remain non-mutating.
- duplicate and stale submits are safe.
- outputs and completed records do not duplicate unexpectedly.
- player read models remain current and player-safe.
- the Rusk endpoint remains review-only and player-safe.
- authorized GM/dev inspection remains gated.

Stage 6C-specific route markers live in:

```text
content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json
content/acceptance/greyvale/greyvale-stage-6c-runtime.expected-paths.json
```

## Stale, Duplicate, Recovery, And Endpoint Coverage

The Stage 6C regression suite covers:

- stale preview/commit recovery helpers
- duplicate submit no-mutation semantics
- unavailable/locked option recovery
- recovery-needed envelopes
- recovery read models that hide unsafe old actions
- endpoint/review-only state
- future-supported/Rusk handoff hidden from players and visible to GM/dev helpers

## Trace And Provenance Coverage

GM/dev trace helpers cover:

- request and source state
- authorization and validation
- stale/duplicate/idempotency result
- selected deterministic outcome
- output bundle
- mutation plan and write group result
- transition decision
- next-beat decision
- read-model refresh and alignment
- player projection stripping
- warnings/errors/recovery status

No persistent trace table was added. Generated/attached trace envelopes and existing output/provenance records remain the current strategy.

## Visibility And Security Coverage

Player projections are tested to hide:

- GM notes and debug envelopes
- hidden DCs and raw rolls
- branch ids and hidden requirements
- raw relationship/social meters
- raw state writes
- mutation plans and idempotency keys
- internal transition and next-beat labels
- action-window internals
- `combat_pending` and `future_supported`
- target encounter ids
- source file paths
- path harness metadata
- stack traces and internal errors
- GM/dev trace internals
- final mystery truth

## Frontend Coverage

No frontend files were touched in Stage 6C.8.

The official Stage 6C gate is backend/shared-runtime and Greyvale route/read-model based. Full browser E2E remains deferred. Existing Flutter/manual playthrough checks from Stage 6B.15 remain the current rendered-output safety layer.

## Known Limitations

- The official Stage 6C command does not include the slower Greyvale full-loop suite by default.
- Trace persistence remains non-schema and non-durable.
- The full GM Campaign Inspector is deferred to Stage 6F.1.
- Combat and navigation remain unimplemented.
- Full browser E2E automation remains deferred.
- Stage 6C proves the shared runtime hardening scope; it does not claim production readiness for future combat/navigation domains.

## Readiness Recommendation

Stage 6C is regression-covered for the current beat-resolution hardening scope when:

- `npm run test:stage:6c` passes.
- `npm run test:greyvale-full-loop` remains green or any failure is triaged.
- content validation passes in the target test environment.

With those gates passing, the repo is ready to proceed to later stages such as Stage 6F.1 GM Campaign Inspector work, Stage 6G/6H rules transparency work, or future combat/navigation stages while preserving the Stage 6C non-goals.
