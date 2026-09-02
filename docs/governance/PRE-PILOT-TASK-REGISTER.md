# Pre-Pilot Task Register

## Status

**CANONICAL PRE-PILOT WORK REGISTER — proposed by P0 realignment.**

Starting baseline: `main@4bcf2e7fb2104304fd044693a0bf8838f6038d85`.

This register exists to prevent planned or deferred work from disappearing between phases. After this register is accepted, no pre-pilot requirement may be left only in prose such as “later”, “deferred”, “future slice” or “out of scope”. It must have a row here.

## Status vocabulary

- `PLANNED` — accepted work exists but dependencies are not yet all closed.
- `READY` — dependencies closed; task may be started with a dedicated branch.
- `IN_PROGRESS` — active task branch exists.
- `IN_REVIEW` — implementation/docs complete on branch; independent review/CI pending.
- `MERGED_AWAITING_DOC_SYNC` — implementation merged, but canonical post-merge status synchronization is not yet complete.
- `CLOSED` — merge, authoritative post-merge CI and mandatory documentation sync are complete.
- `BLOCKED_DECISION` — Product Owner decision required.
- `BLOCKED_EVIDENCE` — source workbook/VPS/other evidence required.
- `DEFERRED_WITH_TRIGGER` — intentionally outside current path; exact re-entry trigger is recorded.
- `CANCELLED` — explicitly cancelled by Product Owner; reason must remain recorded.

**Plain `DEFERRED` is prohibited.**

## Global gate

A dependent major task must not start if:

1. any dependency is not `CLOSED`;
2. any immediately preceding major task is `MERGED_AWAITING_DOC_SYNC`;
3. the task would consume a traceability row marked `RESTORE`, `REALIGN` or `NEW_PRODUCT_AUTHORITY` without an accepted architecture/decision closure for that row;
4. the task creates a new deferred item without adding a registered re-entry task and trigger in the same PR.

## P0 — Product/spec realignment and governance

| Task | Status | Depends on | Deliverable / closure | Trigger / notes |
|---|---|---|---|---|
| `P0-001` BAOGIANG-PRE-PILOT-SPEC-REALIGNMENT-001 | `IN_REVIEW` | none | Product baseline, traceability, task register, current status authority, sync protocol, ADR, stale status normalization | Branch `docs/pre-pilot-spec-realignment-001`; no runtime mutation; independent GitHub review/CI/merge still required |
| `P0-002` Close stale PR #11 hosting-portability direction | `BLOCKED_DECISION` | `P0-001` | Close PR #11 as superseded if Product Owner explicitly authorizes | Must not merge old standalone-Linux direction into current Windows/shared-Nginx architecture |
| `P0-003` Pilot scope decision: CORE vs FULL BUSINESS | `BLOCKED_DECISION` | `P0-001` | Record Product Owner decision before P5 pilot freeze | Does not block common P1-P3 foundations |

## P1 — Governance/business foundation

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P1-010` Homeroom responsibility architecture + persistence/control-plane sequence | `PLANNED` | `P0-001` | Date-effective retained `HomeroomAssignment` authority and runtime; exact history, capability and audit | T13, T14 |
| `P1-020` Business Configuration Control Plane architecture | `PLANNED` | `P0-001` | Typed/versioned business policy authority; explicit boundary from technical secrets/env | T21, T22 |
| `P1-030` Delayed go-live / operational-start policy architecture | `PLANNED` | `P0-001`, `P1-020` | Explicit operational-start business policy and invariants; no historical debt invention | T28, T30 |

## P2 — School data ingestion

| Task | Status | Depends on | Deliverable / closure | Trigger / traceability |
|---|---|---|---|---|
| `P2-010` PPCT real-workbook contract/security audit | `BLOCKED_EVIDENCE` | `P0-001` | Read authoritative school PPCT workbook/template; define sheet/column/identity/replay/error contract | Trigger: actual authoritative workbook supplied; T24 |
| `P2-020` PPCT native importer implementation | `PLANNED` | `P2-010` | Import pipeline using approved PPCT contract; no guessed mapping | T24 |
| `P2-030` Đam San TKB native-workbook architecture audit | `BLOCKED_EVIDENCE` | `P0-001` | Read actual four-sheet school TKB format; define matrix parsing, identities, markers, source reconciliation | Trigger: authoritative current workbook supplied; T25–T27 |
| `P2-040` Đam San TKB native adapter implementation | `PLANNED` | `P2-030` | Native adapter on top of canonical importer; class/teacher peer cross-check; fail-closed mismatch | T25, T26 |
| `P2-050` Morning/afternoon selective update and carry-forward | `PLANNED` | `P2-040` | Independently author morning or afternoon while creating one coherent retained canonical version; untouched session explicitly carried forward | T27 |

## P3 — Historical go-live and continuity

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P3-010` Pre-operational historical execution architecture | `PLANNED` | `P1-030`, `P2-020`, `P2-050` | Historical evidence/reconciliation contract; provenance, correction, PPCT allocation and no-auto-debt invariants | T28–T30 |
| `P3-020` Pre-operational history ingestion/reconciliation runtime | `PLANNED` | `P3-010` | Controlled import/confirmation UI/API for historical taught evidence; exact audit and reconciliation | T29, T30 |
| `P3-030` Public make-up scheduling runtime re-entry | `DEFERRED_WITH_TRIGGER` | proof source + separate architecture | Create/reverse public make-up schedules only after authoritative incomplete-obligation proof is accepted | Trigger: pilot requires public make-up scheduling; T08 |

## P4 — Special programmes and workload

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P4-010` GDĐP/HĐTN programme architecture closure | `PLANNED` | `P0-001`, `P1-010` | Programme/version/item/occurrence topology; GDĐP grade plans; HĐTN CLASS/GRADE/SCHOOL; exact per-slot staffing | T12, T15–T17 |
| `P4-020` Special-programme persistence + control plane | `PLANNED` | `P4-010` | Retained plan history, planning commands, audit, no overload of SpecialActivity runtime primitive | T16, T17 |
| `P4-030` Programme coordinator authorization | `PLANNED` | `P4-010`, `P4-020` | Exact coordinator resource/scope semantics using explicit capabilities; no role/title inference | T18 |
| `P4-040` Programme-to-SpecialActivity runtime bridge | `PLANNED` | `P4-020`, `P4-030` | Deterministic materialization/provenance into existing SpecialActivity collision/runtime foundation | T12, T17, T31 |
| `P4-050` Special-activity workload/reporting projection | `PLANNED` | `P4-040` | Confirmed teacher-slot participation contributes exactly once; no class-target fan-out multiplication; statement policy defined | T19, T20 |
| `P4-060` Workload adjustment policy/model | `DEFERRED_WITH_TRIGGER` | `P1-020` | Configurable reduction/percentage/override rules with history and report provenance | Trigger: pilot/official reporting claims adjusted workload; T23 |

## P5 — Pilot product closure

| Task | Status | Depends on | Deliverable / closure | Notes |
|---|---|---|---|---|
| `P5-010` Pilot business scope + cross-domain freeze | `PLANNED` | `P0-003`, P1-P4 tasks required by chosen scope | End-to-end regression closure for the exact pilot claim; no unresolved blocker hidden by partial totals | CORE vs FULL decision controls P4 dependency set |
| `P5-020` PWA production baseline | `PLANNED` | `P0-001`; preferably after primary pilot routes stabilize | Manifest/icons/service worker/update strategy; no offline caching of sensitive `/api`/auth/reporting data | T32 |
| `P5-030` Dedicated Báo giảng Telegram integration | `PLANNED` | `P5-010` auth/product identities stable | Dedicated bot/token/webhook; one-time short-lived linking; idempotent notifications; no DamSanV5 bot reuse | T33 |

## P6 — Production readiness and controlled pilot

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P6-010` Pre-deploy TLS/HTTP-01 authority | `PLANNED` | `P0-001` | Repo-side port-80 ACME challenge + redirect authority, separate Báo giảng PEM/renewal/reload lifecycle, collision tests | T34 |
| `P6-020` Production Stage 1 passive VPS evidence | `DEFERRED_WITH_TRIGGER` | `P5-010`, `P6-010` | PASS1 passive neighbour discovery + reviewed PASS2 exact readonly preflight | Trigger: exact pilot commit is deployment candidate; T35 |
| `P6-030` Production bootstrap + first controlled deploy | `PLANNED` | `P6-020` | Root/ACL/task/env/Nginx/DB/TLS bootstrap, migration gates, exact commit deploy, rollback and health evidence | no mutation before separate approval |
| `P6-040` TLS monitor multi-certificate refactor | `PLANNED` | `P6-010`, separate Báo giảng cert exists | Extend existing monitor by certificate groups without breaking Nội trú monitoring | no app-repo coupling unless explicitly designed |
| `P6-050` Teacher pilot go-live verification | `PLANNED` | `P5-020`, `P5-030`, `P6-030` | Real pilot smoke, installability, Telegram linking, reporting/statement sanity and rollback evidence | final pre-operational -> pilot decision remains explicit |

## Deferred/non-pilot register

These are not forgotten. They are deliberately outside the first pilot unless the trigger fires.

| Task | Status | Re-entry trigger |
|---|---|---|
| `D-ROOM-001` Room/Location resource + collision | `DEFERRED_WITH_TRIGGER` | Product requires room booking, room conflict detection or authoritative location occupancy |
| `D-ROSTER-001` Student/enrollment/participant roster | `DEFERRED_WITH_TRIGGER` | Product requires individual attendance, student targeting or arbitrary activity groups |
| `D-AI-001` Active AI business integration | `DEFERRED_WITH_TRIGGER` | Explicit Product Owner activation decision after pilot stability/security/cost policy review |
| `D-ACTIVITY-CATEGORY-001` Managed activity category catalogue | `DEFERRED_WITH_TRIGGER` | Product needs typed categories with downstream semantics beyond GDĐP/HĐTN programme identity |
| `D-EXPORT-001` Official export/archive/final retention closure | `DEFERRED_WITH_TRIGGER` | Pilot or regulatory workflow requires signed/archived export beyond current statement freeze |

## Mandatory task-start rule

Every future execution prompt for a major task must include:

- exact task ID from this register;
- current task status and dependencies;
- exact canonical main SHA;
- traceability row IDs affected;
- files/domains allowed and forbidden;
- required tests/evidence;
- documentation files that must be synchronized before review;
- explicit statement that merge/deploy remains separately authorized.

If the requested work is not in this register, create/register it first. Do not begin implementation and “document it later”.
