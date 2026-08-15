# ADR-033 — Bounded Operational Overlay Control Plane

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** LOCAL-FC-05C2A
- **Authority:** ADR-031, ADR-032 and `LOCAL-FC-05C0D-OPERATIONAL-OVERLAYS-DECISION-CLOSURE.md`

## Context

05C1 established persistence for three operational-overlay aggregate families. This slice exposes a bounded runtime control plane only where the canonical repository can prove the required source facts without inference.

## Decision

The control plane defines `CALENDAR_EXCEPTION_MANAGE` at `SCHOOL_WIDE` and `TEACHING_OPERATION_MANAGE` at `SUBJECT` or `SCHOOL_WIDE`. It seeds definitions only and grants nothing automatically. `TIMETABLE_MANAGE`, `PPCT_MANAGE`, `SYSTEM_ADMIN`, roles, duties, membership, assignments, staff-subject eligibility, and UI visibility do not imply either capability.

The API exposes create, reverse, get and bounded-list routes for `CalendarException` and `OperationalLessonDisposition`. Mutations require authenticated session plus CSRF/origin validation; reads require authenticated session. Business authorization is evaluated after the exact persisted resource is known. Authorized cancellation and broad disposition enumeration require school-wide teaching-operation authority; other disposition operations use the exact retained subject, with a school-wide grant satisfying that subject request. Denials are generic and write bounded `AUTHORIZATION_DENIED` audit evidence.

There is no generic update/delete, unreverse, draft/approval, move/swap, or public command for Special Activity, resolved occurrence, execution, progress/debt, reporting, or make-up scheduling.

## Source, lifecycle and command identity

Disposition requests contain only the timetable-entry anchor, source civil date, disposition type, conditional assigned teacher, optional note/replacement, and request key. The server derives the full frozen bundle from the exact retained `TimetableEntry`, version, calendar, slot, class, subject, assignment and responsible teacher. It validates date effectivity, source status, calendar validity, weekday, assignment validity, and current/future authoritative-source continuity without rebinding to current heads.

Creation produces `ACTIVE`; reversal is conditional `ACTIVE → REVERSED` using `expectedUpdatedAt`. A replacement is a separate fully validated creation and may reference only a reversed predecessor in the same family. History remains retained and reads return exact stored identities.

Mutation identity uses fixed-key JSON and lowercase SHA-256: `calendar-exception-create-v1`, `lesson-disposition-create-v1`, and `operational-overlay-reverse-v1`. Same request key and fingerprint returns `IDEMPOTENT_REPLAY` with the currently retained row and no duplicate success audit. Reusing a key with another fingerprint conflicts. Different keys remain subject to semantic and database uniqueness.

All mutation decisions use `SERIALIZABLE`. Bounded retry applies only to recognized serialization or unique races. Validation, authorization, stale CAS and semantic conflicts are not retried. Business rows, exact-slot children and success audit are transactionally coupled.

## Precedence, eligibility and collision boundary

Disposition creation follows `CalendarInterruption → active CalendarException → disposition → base timetable`; ambiguity fails closed. Exception creation rejects overlap in both scope and time and cannot suppress an existing active disposition or make-up target.

Same-subject substitution requires an active user, canonical teaching `StaffProfile`, and deterministic currently valid `StaffSubject` for the exact source subject. Different-subject supervision requires active teaching staff and no subject proof. The command freezes the eligibility instant and result; eligibility never grants mutation authority and the assigned teacher need not own the source assignment.

Assigned-teacher occupancy checks date-effective normal timetable, interruptions, active exceptions, active dispositions and active `MakeupTeachingSchedule` targets. Suppressed or disposition-overridden responsible-teacher base occupancy does not occupy. Results always identify profile `CURRENT_CANONICAL_PRE_SPECIAL_ACTIVITY_V1` and Special Activity as `NOT_ASSESSED`; no full collision readiness is claimed.

Retrospective creation requires a nonblank note. Reversal always requires a nonblank reason. Successful new mutations write one transactionally coupled, sanitized business audit event; replay writes none.

## Make-up runtime fail-closed deferral

`MakeupTeachingSchedule` runtime remains unavailable in 05C2A. ADR-031 R12–R13 require proof of one exact existing incomplete PPCT obligation for one source opportunity. The current canonical repository can retain the historical timetable source and exact date-effective PPCT association/version, but it cannot yet prove which exact PPCT item was the distributed and incomplete obligation because deterministic occurrence/progress/item-position resolution does not exist.

A client-supplied `ppctItemId` is not proof. 05C2A therefore exposes no make-up DTO, create/reverse route, confirmation flag, inferred PPCT sequence, hidden occurrence resolver, or invented progress/debt state. This is fail-closed implementation sequencing and does not weaken or change ADR-031 R12–R13. A future make-up control-plane slice requires an authoritative source that proves the exact existing incomplete obligation; this ADR does not claim which future slice will provide it.

## Consequences

Calendar exceptions and lesson dispositions now have a bounded, auditable and historically stable control plane. 05C1 make-up persistence is still recognized as canonical occupancy, but remains unavailable for public runtime creation/reversal. Special Activity, `ResolvedLessonOccurrence`, `TeachingExecution`, PPCT execution/progress/debt, reporting/snapshots, and UI business semantics remain absent.
