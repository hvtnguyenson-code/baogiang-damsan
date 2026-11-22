# P5-057 / WS1-B1 — Generic create/template overlap regression (22/11/2026)

**Scope:** Draft PR #290, branch `feat/p5-057-b1-gated-command-api-20261121`; starting exact HEAD `8957d08a3a66981e68ddcc1535cb4650d46583f0`; parent Draft PR #289 unchanged.

**State:** TECHNICAL WORK IN PROGRESS, production B1 flags OFF. No main merge, production mutation, bootstrap, migration or deploy authorized.

## Confirmed gap and scope of remediation

The earlier checkpoint `P5-057-WS1-B1-POSTREVIEW-REGRESSION-20261122.md` protected generic **revoke** of a source-linked non-sensitive grant. Two remaining legacy write paths required targeted checks:

1. `CapabilitiesService.create` originally used only `assertGenericGrantSourceSafe(dto.capabilityKey)`. A non-sensitive school-wide/personal capability could still be inserted as an *unlinked* grant when a retained `AccessCoordinate` already existed for that same user, capability, scope and resource. This would bypass B1 source tracking.
2. `AccessBaselineService.applyTemplate` originally checked sensitive capabilities in the materialized template but did not check for pre-existing managed coordinates for its other keys before inserting grants. A teacher template containing a B1-tracked non-sensitive coordinate could write an untracked grant.

**Test-first evidence:** Added two targeted Jest tests to `sensitive-generic-writer-ingress.spec.ts`. At starting HEAD **4 passed / 2 failed**, because the paths reached mocked `GENERIC_CREATE_REACHED` and `GENERIC_TEMPLATE_CREATE_REACHED` instead of `ForbiddenException`. This proves the two missing ingress checks independently of any claimed production occurrence.

## Remediation

A shared guard `assertGenericCoordinatesUnmanaged(tx,userId,specifications)` in `sensitive-generic-writer-gate.ts` searches for **exact** `AccessCoordinate` identities (`userId`, `capabilityKey`, `scopeType`, `scopeResourceId ?? null`) and throws `ForbiddenException` if any tracked coordinate overlaps. It performs **no database query** unless `B1_REJECT_GENERIC_SENSITIVE_WRITES === 'true'`.

- Generic **create**: under this cutover flag, lock the target `users` row `FOR UPDATE` inside the same DB transaction and check managed coordinates before any insert/audit. The B1 command writer uses seat → sorted user-row → coordinate lock order; user locking prevents ordinary same-user B1/source race.
- Generic **template apply**: already locks the target user row at transaction entry. Check *all* materialized specs atomically after the existing sensitive-policy gate, before validation and before creating grants.
- Generic **revoke**: retain the earlier linked-coordinate safeguard. Do not edit existing flags, policy ownership, migrations, the baseline evaluator, or the B1 role command writer.
- When flag OFF: new helper short-circuits and the create path adds no lock or lookup. Ordinary teacher grants on **untracked** identities continue normally. Do not assign an invented source to any of the nine production legacy grants.
- This guard conservatively blocks any identity already registered in `AccessCoordinate`, including retained historical/empty ones; if an operational reactivation is needed, an explicit source-aware B1 decision is required instead of a generic grant bypass.

## Evidence collected before GitHub CI

- Targeted unit test on two guard/ingress suites: **14 tests PASS, 2 suites PASS** after the fix.
- Scoped ESLint on six changed TypeScript files: **PASS, 0 errors, 0 warnings**.
- API TypeScript `tsc --noEmit`: **PASS**.
- `git diff --check`: PASS; six scoped files changed (three runtime, three tests).
- Added one real HTTP PostgreSQL regression in `b1-sensitive-generic-http.integration.spec.ts`: create a disposable test-only `AccessCoordinate` for `TEACHER_BASE/PERSONAL`, attempt both generic create and TEACHER template, require HTTP 403/no grants/no template audit, and prove a different untracked teacher can still receive `TEACHER_BASE`. **This test is NOT YET DB-PASS until exact-head CI completes.**
- Independent Antigravity review is **OPEN/BLOCKED**: first read-only task `5255a42d-a496-4d68-b5aa-5edba7ce228d` failed `AGENT_TIMEOUT` at the 300-second deadline, 0 confirmed changed files. Retry with narrower runtime scope and 540-second limit, task `ebe62a92-f254-4a8f-88d8-bacb79816288`, failed `AGENT_PERMISSION_DENIED` without a valid review verdict, 0 confirmed changed files. **Do not claim independent review PASS**; troubleshoot agent permission and re-review the exact eventual PR HEAD before considering any merge or GO. This agent blocker does not justify bypassing the release gates or modifying production.

## Release boundaries

- Current previous exact-head green CI evidence at `8957d08`: workflow `45037434555` CI PG17 SUCCESS (64 integration suites, 799 PASS/1 skip; 129 unit suites/2,288 PASS; 61 Playwright PASS), off-host PG16 workflow `45037434628` SUCCESS (64 integration suites, 799 PASS/1 skip). **Those runs do not cover the new generic create/template code.**
- Require code review + actual PG16/17/Playwright CI at the NEW HEAD after push. Do not count a skipped integration test as PASS; do not re-run already-green old workflows.
- Draft PR #289 and PR #290 are still stacked and cannot be merged ahead of PO's **separate** deployment GO. Auto-deploy from main is prohibited without that GO.
- Production B1 activation, initial technical Admin bootstrap and source reconciliation remain **NO-GO**. Pending independent issuer/Ed25519 key pin, nine individual legacy grant provenances, policy for technical-direct issue/revoke, actual seven-persona UAT and full application rollback rehearsal. G1/G3/G4 principles already approved; no reapproval needed.

**Project stage:** `P5-057/T56=IN_PROGRESS`; `P6-050=BLOCKED`. No release of Báo giảng or impact to Nội trú.
