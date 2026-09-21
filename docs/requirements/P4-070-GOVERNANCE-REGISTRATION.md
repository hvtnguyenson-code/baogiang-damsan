# P4-070 — Governance Registration Staging

## Status

**RETAINED GOVERNANCE RECONCILIATION EVIDENCE — CANONICAL REGISTRATION COMPLETED.**

This file originally staged the exact canonical registry changes required for P4-070 while draft PR #154 concurrently owned edits to both:

- `docs/governance/PRE-PILOT-TASK-REGISTER.md`
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`

Reconciliation status:
- PR #154 conflict and predecessor hard-stop are fully resolved following PR #154 merge and `SYNC-P2-060` closure (PR #156, canonical `main` SHA `0376549e5bf402077d143794b1ca6ab69bf2ab31`).
- `P2-060` closure is canonical (`CLOSED`).
- `T47` remains preserved in `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.
- `T48` has been canonically registered in `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.
- `P4-070`..`P4-074` have been canonically registered in `docs/governance/PRE-PILOT-TASK-REGISTER.md`.
- This document is retained reconciliation evidence; it is **NO LONGER** the sole registration location for this requirement.

## Required traceability row

Reserve `T48` because open draft PR #154 has already reserved `T47` for school-wide effective teacher schedule authority.

Canonical row to add after reconciliation:

| ID | Requirement / product fact | Source evidence | Later decision/current architecture | Current implementation | Disposition | Re-entry task |
|---|---|---|---|---|---|---|
| `T48` | HĐTN-HN and GDĐP week-level school workbooks must be deterministically bound to exact retained civil-date/time-slot timetable evidence without exposing backend IDs/enums or workload coefficients to teachers; TKB `GDĐP`/`TN-HN` markers are retained timetable structural evidence, not ordinary TimetableEntry or teaching evidence | Product Owner reviewed HĐTN-HN assignment plan and 2026-2027 GDĐP plan; accepted HĐTN-HN and GDĐP import workbook contracts; ADR-047 existing special-marker evidence; ADR-050/P4 programme topology | ADR-052 / P4-070: retain `GDDP`/`HDTN_HN` marker children under exact TimetableVersion; resolve official AcademicWeek + date-effective TKB + identity/homeroom authority; fail closed on count/coverage/identity ambiguity; import to DRAFT P4 state; reuse P4-040 materialization and P4-050 workload | Architecture/docs proposed only; runtime marker persistence/importers not yet implemented | `NEW_PRODUCT_AUTHORITY` | `P4-070` architecture -> `P4-071` marker bridge -> `P4-072` HĐTN importer + `P4-073` GDĐP importer -> `P4-074` lifecycle/E2E closure |

## Required task-register rows

Add under `P4 — Special programmes and workload` after P4-061, preserving all existing rows:

| Task | Status | Depends on | Deliverable / closure | Traceability |
|---|---|---|---|---|
| `P4-070` Special-programme workbook / timetable-slot bridge architecture | `IN_REVIEW` | `P2-050`, `P4-040`, `P4-050` | Accepted ADR-052 and P4-070 architecture: retained timetable-owned `GDDP`/`HDTN_HN` marker evidence; AcademicWeek/date-effective slot resolution; HĐTN CLASS/GRADE/SCHOOL_WIDE collapse; GDĐP grade collapse; exact count and identity fail-closed rules; DRAFT-only import confirmation; P4-040/P4-050 reuse; fully Vietnamese frontend contract; docs only | T48 |
| `P4-071` Retained TKB special-programme marker bridge | `PLANNED` | `P4-070`, `P2-050` | Schema/migration + native TKB persistence for exact GDDP/HDTN_HN marker children; semantic checksum integration; morning/afternoon carry-forward; internal retained marker resolver; no fake TimetableEntry/teacher/workload | T48 |
| `P4-072` HĐTN-HN workbook importer | `PLANNED` | `P4-071`, `P4-020`, `P4-030`, `P1-012` | Vietnamese inspect/preview/confirm flow for agreed 7-column HĐTN-HN workbook; official-week resolution; CLASS historical GVCN; GRADE/SCHOOL_WIDE exact marker collapse; exact teacher identity; exact-count blockers; idempotent DRAFT programme import only | T48 |
| `P4-073` GDĐP workbook importer | `PLANNED` | `P4-071`, `P4-020`, `P4-030` | Vietnamese inspect/preview/confirm flow for agreed 5-column GDĐP workbook; PPCT/week parsing; exact staff-code resolution; complete grade marker collapse; exact-count blockers; idempotent DRAFT programme import only | T48 |
| `P4-074` Special-programme import lifecycle and E2E closure | `PLANNED` | `P4-072`, `P4-073`, `P4-040`, `P4-050` | Admin/coordinator workspace, explicit confirm, bounded publish/materialize orchestration through existing P4 lifecycle, provenance/idempotency, end-to-end HĐTN CLASS/GRADE/SCHOOL_WIDE and GDĐP GRADE regression, no class fan-out, downstream workload/effective-schedule verification | T48 |

## Status transition on architecture merge

At the P4-070 merge/closure sequence:

1. P4-070 changes from `IN_REVIEW` to `MERGED_AWAITING_DOC_SYNC` after parent merge.
2. Exact-head CI and post-merge authoritative CI must pass according to repository governance.
3. Closure sync changes P4-070 to `CLOSED`.
4. Only then may P4-071 transition from `PLANNED` to `READY`.
5. P4-072 and P4-073 remain non-startable until P4-071 is CLOSED.
6. P4-074 remains non-startable until both P4-072 and P4-073 are CLOSED.

## Hard stop (SATISFIED)

**HARD STOP SATISFIED**:
- Latest canonical `main` (`0376549e5bf402077d143794b1ca6ab69bf2ab31`) post-`SYNC-P2-060` has been merged into this branch.
- `T47` is preserved.
- `T48` is canonically recorded in `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.
- `P4-070`..`P4-074` are canonically recorded in `docs/governance/PRE-PILOT-TASK-REGISTER.md`.
- This staging file is no longer the sole registration location; canonical registries have been synchronized within PR #155.
