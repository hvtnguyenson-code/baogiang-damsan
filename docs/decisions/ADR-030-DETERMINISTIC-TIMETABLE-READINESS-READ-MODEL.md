# ADR-030 — Deterministic Timetable Readiness Read Model

- **Status:** Accepted
- **Date:** 2026-08-14
- **Scope:** LOCAL-FC-05B1
- **Authority:** `LOCAL-FC-05B0D-TIMETABLE-OPERATIONAL-READINESS-DECISION-CLOSURE.md`

## Context

ADR-020 retains immutable normal-base timetable lifecycle evidence and exact calendar targets. ADR-029 retains date-effective class-subject associations to exact PPCT versions. The accepted 05B0D closure authorizes the first bounded readiness profile without claiming complete operational readiness or changing either source aggregate.

## Decision

### Profile and HTTP boundary

The API exposes one read-only boundary:

`GET /api/timetable-versions/:id/readiness?from=YYYY-MM-DD&to=YYYY-MM-DD`

It evaluates only `NORMAL_BASE_PPCT_V1`, labelled honestly as `TIMETABLE READINESS — NORMAL BASE + PPCT BINDING`. Both inclusive civil-date boundaries are mandatory and finite. Invalid or out-of-domain ranges are rejected rather than inferred or clipped. `DRAFT` is not assessable; retained `VALIDATED`, `APPROVED`, `ACTIVE` and `SUPERSEDED` versions are assessable for a semantically valid range.

### Structured deterministic result

The response contains the profile, exact timetable/range scope, affected class-subject streams, root `PASS` or `FAIL`, every dimension, structured findings, exact source provenance and an evaluation timestamp. Externally visible collections are explicitly sorted. Every semantic value except `evaluatedAt` is deterministic for the same source snapshot and request.

The required dimensions are:

1. `NORMAL_BASE_TIMETABLE_FOUNDATION`;
2. `PPCT_ASSOCIATION_BINDING`.

The root passes only when both required dimensions pass. PPCT capacity, overlays, substitution/cancellation/make-up, local operational exceptions, special-activity collisions, resolved occurrence/execution, and progress/debt/reporting remain visible as `NOT_ASSESSED`; they are never converted to `PASS`.

### Historical normal-base evidence

The read model consumes retained validation/lifecycle evidence and exact immutable timetable entries. It narrowly checks structural coherence of the retained target, exact calendar ownership, effective week/date and validation actor/timestamp. It does not rerun the current timetable validator and therefore does not let later teacher, class, subject, assignment or slot state rewrite historical normal-base truth. `contentChecksum` is not required.

### Opportunity and PPCT binding resolution

Eligible normal opportunities are derived from exact timetable entries, their stored weekdays, the exact retained `AcademicCalendarVersion`, retained `AcademicWeekSegment` ranges and calendar teaching weekdays within the explicit request. This supports split and reserve weeks and naturally excludes retained interruption gaps. It uses civil-date arithmetic, never ISO-week arithmetic or current date.

Opportunities are grouped by `AcademicYear + SchoolClass + Subject + civil date`. A transaction-aware internal PPCT reader loads overlapping associations without PPCT item content and resolves exact inclusive date effectivity. Missing, ambiguous or DRAFT-target binding fails closed with a `BLOCKER`. Historical associations to `SUPERSEDED` PPCT versions remain valid and are never replaced with a current head.

### Consistency, authorization and recomputation

All timetable, calendar, segment and PPCT evidence reads for one response occur in one interactive Prisma transaction at `RepeatableRead` isolation. The endpoint requires exactly `TIMETABLE_MANAGE / SCHOOL_WIDE` through `SessionAuthGuard` and `CapabilityGuard`. Internal PPCT reading does not require or grant `PPCT_MANAGE`.

Readiness is recomputed on every request. The implementation creates no readiness table, snapshot, certification, cache, mutation, audit event, background recalculation or lifecycle gate. It changes no schema or migration and does not calculate PPCT capacity.

## Consequences

Consumers receive a bounded, provenance-rich assessment without inferring readiness from timetable status. Historical source identities remain exact, later source changes may legitimately change a later response, and no response claims full operational readiness.

## Explicit non-scope

PPCT capacity, operational overlays, substitutions, cancellations, make-up teaching, local exceptions, special activities, resolved occurrences, teaching execution/Báo giảng, progress, debt, reporting, certification, lifecycle gating, UI, deployment and production migration remain outside LOCAL-FC-05B1.
