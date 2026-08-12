# ADR-022 — Timetable Import Persistence Foundation

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B3B timetable import persistence

## Context

ADR-021 accepts the first timetable-import architecture and requires durable identities before the workbook parser and import API can be implemented. The current schema has the normalized timetable aggregate and a nullable opaque `TimetableVersion.contentChecksum`, but it has no mapping profiles, typed aliases, committed receipt, target-scoped semantic duplicate constraint, request-idempotency record, or authoritative way to identify a receipt-backed version.

This decision resolves only that persistence foundation. It does not implement parsing, upload, inspection, preview, profile/alias APIs, confirmation commands, imported-DRAFT mutation rejection, approval, activation, UI, deployment, or production migration.

## Decision

### Stable profile and immutable revisions

- `TimetableImportProfile` is a school-wide stable UUID identity with `sourceKey`, `name`, creator and timestamps. It has no AcademicYear owner. `(sourceKey, name)` is unique; both values are trimmed and nonblank.
- `TimetableImportProfileRevision` retains positive numbered revisions. Revision content has no `updatedAt`; only the exact retirement metadata may change. `(profileId, revision)` is unique, and a PostgreSQL partial unique index permits at most one active revision per profile.
- Active revisions have no retirement actor/time. Retired revisions require both. A receipt references the exact revision, so later profile changes cannot reinterpret historical content.
- Teacher resolution mode is exactly `GENERIC_EXACT`, `STAFF_CODE`, `USERNAME`, or `APPROVED_ALIAS`. Generic exact resolution remains fail-closed when permitted exact namespaces identify more than one distinct User.

### Canonical column mappings

- `TimetableImportColumnMapping` belongs to one immutable profile revision and separates a bounded raw source header/key from the canonical semantic field.
- Canonical fields are exactly `WEEKDAY`, `SESSION`, `PERIOD_ORDINAL`, `SCHOOL_CLASS`, `SUBJECT`, and `TEACHER`.
- One revision cannot map two headers to the same canonical field or one normalized source header key to multiple fields. Completeness of all six mappings is a later service invariant; no trigger is added.

### Typed entity aliases and retained history

- `TimetableImportEntityAlias` belongs to the stable profile and has exactly one type: `TEACHER`, `SCHOOL_CLASS`, or `SUBJECT`. There is no generic JSON target.
- Teacher aliases reference one User. Subject aliases reference one Subject. School-class aliases reference one `SchoolClass` through the composite `(schoolClassId, academicYearId)` identity, so their meaning is AcademicYear-specific and cannot cross years.
- Active teacher/subject alias keys are unique by profile + type + normalized source value. Active class alias keys are unique by profile + AcademicYear + normalized source value. Target IDs are intentionally not unique.
- Alias retirement retains the old row and requires an exact retirement actor/time pair. A replacement creates a new active row; no historical target is rewritten.

### Semantic duplicate identity

- The semantic duplicate constraint is stored on `TimetableVersion`, which already owns `academicYearId`, `calendarVersionId`, `effectiveAcademicWeekId`, and `contentChecksum`.
- The unique identity is exactly `(academicYearId, calendarVersionId, effectiveAcademicWeekId, contentChecksum)` under the name `timetable_versions_import_semantic_duplicate_key`.
- PostgreSQL NULL semantics preserve manual/untargeted drafts. The same non-null checksum at the same exact target is rejected under concurrency, while the same content at another AcademicWeek or AcademicYear is allowed.
- `contentChecksum` remains nullable `VARCHAR(128)` and retains its existing nonblank/trimmed check and lookup index. No global checksum uniqueness or new 64-hex constraint is added to the historically opaque column.

### Immutable committed receipt and request identity

- `TimetableImportReceipt` exists only for a successfully committed canonical import and has a unique `timetableVersionId`. The receipt owns the foreign key to `TimetableVersion`; the optional reverse relation is the authoritative signal that a version is import-backed.
- A receipt references the exact profile revision and records `SHA-256`, `semantic-v1`, optional request key/fingerprint, bounded file/sheet/header provenance, row/entry counts, actor and commit time. It has no `updatedAt`, raw workbook, BYTEA, unbounded workbook JSON, formula/macro body, or filesystem path.
- AcademicYear, calendar version, AcademicWeek and semantic checksum are normalized through the exact linked TimetableVersion rather than duplicated in the receipt.
- The request-idempotency namespace is the school-wide timetable-import-confirm command represented by this table. A non-null `requestIdempotencyKey` is globally unique among receipts; actor, profile and target are deliberately not part of the key. PostgreSQL allows multiple null keys.
- Request key and fingerprint are either both null or both trimmed, nonblank values. Fingerprint serialization remains an 04B3C service decision. `SHA-256` and `semantic-v1` are enforced as receipt provenance.

> **Refinement (ADR-025):** these receipt fields remain immutable provenance for the original creation request, but a single pair is insufficient to retain additional keys accepted through semantic replay. ADR-025 introduces `TimetableImportRequestKey` as the authoritative one-to-many consumed-key namespace. The remainder of ADR-022 remains Accepted.

### History and enforcement boundary

- Every profile, revision, mapping, alias, canonical target, receipt, version and actor foreign key uses `ON DELETE RESTRICT`. History is never cascaded away.
- PostgreSQL CHECK constraints enforce normalized values, revision/row bounds, lifecycle pairs, typed alias target shape, request key/fingerprint pairing and checksum provenance.
- PostgreSQL partial unique indexes enforce the single active revision and active alias identities. Prisma records the representable supporting indexes and relations; raw migration/static/SQL regression freezes the remaining invariants.
- No trigger, parser, API, capability or seed change is introduced. The existing `TIMETABLE_MANAGE / SCHOOL_WIDE` capability will authorize the later control plane; the catalog remains at 27 capabilities.

## Consequences

04B3C can build inspection, mapping, preview and serializable confirmation on stable, concurrency-safe identities. A committed receipt always resolves to one immutable semantic target/version and exact mapping revision, while historical alias meanings remain available.

The application must still normalize exact lookup keys, require the complete six-field mapping set, serialize and validate request fingerprints, generate lowercase SHA-256 semantic checksums, replay existing receipts, and reject generic mutation of receipt-backed DRAFT content. Those are not database triggers or responsibilities of this slice.

## Remaining 04B3C decisions

- Parser package/version and the reviewed Node 22 dependency boundary.
- Exact request-fingerprint serialization.
- Numeric upload, expansion, dimension, string and processing-time limits.
- Durable raw-file retention outside PostgreSQL.
- Parser corpus, formula/link/merged-cell handling and security hardening.

## Explicit non-scope

Workbook parsing or dependencies, multipart upload, inspection/mapping/preview/confirmation API, DTO/contracts, profile or alias CRUD, audit commands, imported-DRAFT 409 behavior, frontend/E2E, completeness, PPCT, special activities, Room, deployment, VPS access and production migration are outside this decision. ADR-015 remains Proposed.
