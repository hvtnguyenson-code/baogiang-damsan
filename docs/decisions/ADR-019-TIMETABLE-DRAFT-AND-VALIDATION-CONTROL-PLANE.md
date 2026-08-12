# ADR-019 — Timetable Draft and Validation Control Plane

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B1 timetable draft authoring and current-scope validation

## Context

ADR-017 established the retained `TimetableVersion` and normalized normal-lesson `TimetableEntry` persistence foundation. ADR-018 accepted the dedicated `TIMETABLE_MANAGE` capability and immutable time-slot revision workflow. The next backend slice needs a concurrency-safe way to prepare a draft, select its business-calendar target, replace normalized content and prove the checks that are currently implementable without claiming future PPCT or special-activity coverage.

## Decision

- All routes require explicit `TIMETABLE_MANAGE` at `SCHOOL_WIDE`; `SYSTEM_ADMIN` and other professional capabilities are not bypasses. Mutations also require the existing CSRF origin guard.
- The control plane supports DRAFT list/create/read, explicit target selection, normalized entry read, atomic replace-all authoring, and `DRAFT` to `VALIDATED`. It provides no individual entry CRUD, reopen, approval, activation, supersession, import or historical-effective resolution command.
- The server allocates the next AcademicYear-local version number in a serializable transaction. New versions explicitly begin as `DRAFT`, with null target, checksum and later lifecycle metadata. Multiple drafts are allowed.
- Target selection accepts an exact immutable calendar version and AcademicWeek. It derives `effectiveFrom` from the minimum segment start date, including split or reserve weeks. Draft preparation does not require the selected calendar version to be active.
- Replace-all is the sole 04B1 entry mutation. It accepts exact weekday, slot, class, subject and TeachingAssignment provenance, resolves the immutable `teacherUserId` snapshot on the server, validates current authoring eligibility in batches, and replaces all rows atomically. Empty replacement is permitted.
- New authoring requires an active same-year/same-weekday slot that permits regular teaching, an active same-year class, an active subject, exact assignment provenance, and an active teaching user/profile. Historical reads continue to expose the exact inactive slot revision already stored.
- Target, replace and validate require the exact prior `updatedAt` draft token and a serializable transaction. A conditional `DRAFT` plus token update advances the token by at least one millisecond and prevents lost updates or post-validation content changes.
- Validation covers the normal base timetable only. It rechecks target identity and derived date, teaching weekdays, current slot/class/subject/teacher state, TeachingAssignment coverage from `effectiveFrom` through the selected calendar end, and class/teacher overlap using exact half-open wall-clock intervals. It never uses ISO weeks, local timezone conversion, period labels or dynamic replacement identities.
- A completed validation with domain issues returns HTTP 200, an ordered issue report, and leaves the version `DRAFT`. Zero current-scope issues atomically sets `VALIDATED`, `validatedByUserId` and `validatedAt`; content and target are then immutable through 04B1.
- Every report declares `TIMETABLE_COMPLETENESS`, `PPCT_ASSOCIATION` and `SPECIAL_ACTIVITY_COLLISIONS` as deferred checks. `VALIDATED` therefore means only that the normalized normal base timetable passed the current calendar, master-data, assignment-coverage and collision checks. 04B2 must not interpret it as evidence that deferred domains passed.
- `contentChecksum` remains import-owned and is never populated by these commands.
- Create, target, replace and validation-run audits are written in the same transaction. Invalid domain validation is a successfully executed command and is audited as such; failed/stale transactions emit no success audit.
- This decision requires no schema, migration, seed or new capability.

## Deferred sequence

- **04B2:** approval, activation, supersession, historical date resolution, activation-time current-dependency recheck and lifecycle concurrency.
- **04B3:** Excel import, template/mapping, preview/comparison, checksum and idempotency.

Timetable completeness, the official import contract, future UI manual/bulk editing, approval/activation separation of duties and abandoned-draft retention remain unresolved.

## Consequences

Draft authoring is deterministic, normalized, auditable and safe under concurrent commands. Historical teacher and slot meaning cannot be reinterpreted. The explicit validation scope prevents downstream code from treating a partial domain foundation as full timetable readiness.
