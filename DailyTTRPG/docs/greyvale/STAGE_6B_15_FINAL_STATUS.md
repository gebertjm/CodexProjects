# Stage 6B.15 Final Status

Status: acceptance-covered for the current Greyvale web-first vertical slice  
Final validation stage: Stage 6B.15.8  
Primary acceptance command: `npm run test:greyvale-vertical-slice`

## Summary

Stage 6B.15 makes Greyvale enterable, playable, inspectable, and acceptance-covered as a web-first vertical slice. A normal authenticated player with one active character can start Greyvale, resume it, play the canonical route through exploration and dialogue, reach the shrine/Rusk boundary, and receive a player-safe endpoint state while combat remains future-supported.

The stage preserved the explicit non-goals: no combat implementation, no open-world navigation, no AI narration, no SMS requirement, no major content expansion, no player UI redesign, no full GM Campaign Inspector, and no database/schema migration.

## Stage Coverage

- 6B.15.1 established start/resume and initial state.
- 6B.15.2 hardened exploration playability.
- 6B.15.3 hardened dialogue playability.
- 6B.15.4 hardened objectives, knowledge, history, Latest Development, recap, completed records, archive, and search.
- 6B.15.5 established the Rusk endpoint and future-supported handoff.
- 6B.15.6 polished player UI endpoint/recovery behavior.
- 6B.15.7 added focused GM/dev slice inspection and visibility regression.
- 6B.15.8 added the formal acceptance suite, semantic path fixture, run command, manual checklist, and final status.

## Official Canonical Path

The official acceptance route is defined in:

```text
content/acceptance/greyvale/greyvale-vertical-slice.acceptance.expected-paths.json
```

It covers:

- Broken Caravan start.
- Free Focus on the broken axle.
- Broken Caravan investigation.
- Grey Road Inn transition.
- Tomas dialogue.
- Elin dialogue.
- Dunmere transition.
- Mara dialogue.
- Lysa dialogue.
- Garren shrine-route dialogue.
- Old forest path transition.
- Old-path tracking.
- Shrine ruins transition.
- Rusk confrontation.
- Endpoint review/resume.

## Automated Acceptance Command

Run:

```powershell
$env:DB_HOST='localhost'
$env:DATABASE_URL='postgresql://dailyrpg:dailyrpg_dev_password@localhost:5432/dailyrpg'
npm run test:greyvale-vertical-slice
```

This command validates Greyvale content and runs the formal acceptance test with force-exit semantics for local reliability.

## Manual Checklist

Manual QA lives at:

```text
docs/greyvale/GREYVALE_VERTICAL_SLICE_MANUAL_PLAYTHROUGH_CHECKLIST.md
```

Use it to verify the actual Flutter/web player experience, deployed content alignment, refresh/resume behavior, endpoint clarity, and rendered hidden-data safety.

## Acceptance Results Required For Handoff

Stage 6B.15 should be considered accepted when:

- `npm run test:greyvale-vertical-slice` passes.
- The broader Greyvale full-loop regression remains green or any failure is explicitly triaged.
- Player UI tests/analyze pass when UI has been touched.
- Manual checklist is completed for deployed or local Flutter web playthrough.
- No player hidden-data leak is observed.

## Known Limitations

- Full browser E2E automation is not yet present. The official automated gate is route/read-model based and backed by Flutter widget/model coverage plus manual UI checklist.
- Combat remains intentionally unimplemented; Rusk ends at a player-safe `endpoint_reached` boundary with GM/dev inspectable combat/future-supported details.
- Open-world navigation remains out of scope; route transitions are constrained to the authored vertical-slice path.
- Deployment readiness still requires hosting/backend deployment and Greyvale content import on the target environment.

## Readiness Recommendation

The Greyvale vertical slice is acceptance-covered for the current Stage 6B.15 scope and is ready to proceed to Stage 6C once the acceptance command and manual checklist pass in the intended test environment.

Stage 6C planning now lives at:

```text
docs/runtime/STAGE_6C_BEAT_RESOLUTION_RUNTIME_AUDIT_AND_HARDENING_PLAN.md
```

Use that plan as the audit-first handoff for beat resolution quality, mutation ordering, transaction safety, transition orchestration, player result bundles, GM/dev traces, and recovery behavior.
