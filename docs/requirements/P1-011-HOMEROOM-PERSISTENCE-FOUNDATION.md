# P1-011 — Homeroom Persistence Foundation

## Status

**CLOSED — implementation, independent review, exact-head CI, merge, post-merge CI and `SYNC-P1-011` closure evidence satisfied.**

- Task: `P1-011`
- Branch: `feat/homeroom-persistence-foundation-011`
- Exact starting main: `172e1c13e5dbbdc6f91b4f014ea2729fcc3977ca`
- Dependency: `P1-010` — CLOSED
- Governing authority: `ADR-045-HOMEROOM-RESPONSIBILITY.md`
- Traceability: T13, T14
- Scope: Prisma/PostgreSQL persistence foundation + migration/static/integration regression coverage only.

Closure evidence:

- opening contract commit: `e0385a4829332275781224815dd3ee15dd4b18d0`;
- reviewed implementation head: `ae5515d63fb38987e9479ea69b3425b1e910a11a`;
- PR #95: `feat(homeroom): add P1-011 persistence foundation`;
- independent GitHub diff review: PASS;
- exact-head PR CI #337: SUCCESS, including the isolated PostgreSQL migration behavior suite;
- merge/main: `7530022d9027e0ba94add9ca25b70822c87b792a`;
- authoritative post-merge main CI #338: SUCCESS;
- no correction/re-entry task required;
- administrative closure: `SYNC-P1-011`.

No API/controller/service command surface, capability catalog/runtime mutation, admin UI, Special Programme runtime, workload/reporting change, CI/CD behavior change, VPS/TLS/database-production mutation, or DamSanV5/Quản lí nội trú mutation was authorized or introduced by this task.

## 1. Persistence objective

Map accepted ADR-045 into one retained canonical `HomeroomAssignment` persistence domain that can answer:

`AcademicYear + SchoolClass + civil DATE -> exact retained GVCN assertion`

without introducing a second GVCN authority or coupling responsibility history to `AcademicCalendarVersion`.

## 2. Approved physical topology for P1-011

### 2.1 Status

Create a dedicated enum:

```text
HomeroomAssignmentStatus
- ACTIVE
- REVERSED
```

`ACTIVE` means the row participates in current-truth interval resolution. `REVERSED` means the prior assertion is retained as correction evidence and must not participate in the no-overlap/current-truth set.

Do not reuse `OperationalOverlayStatus`; homeroom responsibility is a separate domain.

### 2.2 Core identity/effectivity

`HomeroomAssignment` must persist at least:

- `id` UUID;
- `academicYearId` UUID;
- `schoolClassId` UUID;
- `teacherUserId` UUID;
- `validFrom` inclusive civil `DATE`;
- nullable `validUntil` inclusive civil `DATE`;
- `status`;
- optional bounded business note;
- optional `entryReason` text reserved for explicit historical/backfill provenance required by P1-012;
- `createdByUserId` UUID;
- `createdAt` / `updatedAt` as `TIMESTAMPTZ(3)`.

There is no `academicCalendarVersionId`, `subjectId`, `StaffSubject` identity, timetable identity, AdditionalDuty identity, or activity identity on this master row.

### 2.3 Correction/reversal evidence

Persistence must support retained correction evidence through:

- nullable `replacesId` self-reference on a replacement assertion;
- `reversedByUserId`;
- `reversedAt`;
- `reversalReason`.

A reversed assertion remains addressable by its original ID. A corrected assertion receives a new ID. More than one replacement row may reference one reversed assertion when a correction legitimately reconstructs the old interval into multiple exact current-truth intervals; therefore `replacesId` must not be unique.

The database must reject direct self-replacement (`replacesId = id`). Cycle/topology validation beyond that belongs to the P1-012 command layer and must be fail-closed.

### 2.4 Same-year class integrity

Use an exact composite FK from:

`(school_class_id, academic_year_id)`

to existing:

`classes(id, academic_year_id)`.

The row must also retain an explicit FK to `academic_years(id)`.

### 2.5 Teacher and actor identity retention

- `teacherUserId` -> `users(id)` with `ON DELETE RESTRICT`;
- `createdByUserId` -> `users(id)` with `ON DELETE RESTRICT`;
- nullable `reversedByUserId` -> `users(id)` with `ON DELETE RESTRICT`;
- nullable `replacesId` -> retained `homeroom_assignments(id)` with `ON DELETE RESTRICT`.

P1-011 must **not** encode `User.status`, current `StaffProfile`, or `isTeachingStaff` as database constraints. ADR-045 explicitly separates current/future operational eligibility from bounded historical truth; those checks belong to P1-012.

### 2.6 Inclusive validity and current-truth overlap

Database checks must enforce:

```text
validUntil IS NULL OR validUntil >= validFrom
```

At most one `ACTIVE` row may overlap for one exact `AcademicYear + SchoolClass` on any civil date.

Implement this in PostgreSQL as a partial GiST exclusion constraint over the inclusive date range, conceptually:

```sql
EXCLUDE USING gist (
  academic_year_id WITH =,
  school_class_id WITH =,
  daterange(valid_from, valid_until, '[]') WITH &&
)
WHERE (status = 'ACTIVE')
```

`btree_gist` is already a required repository/database extension. Reversed evidence is intentionally excluded from this current-truth overlap constraint.

No teacher-side overlap exclusion is allowed: the accepted requirement does not say one teacher can never be GVCN of multiple classes concurrently.

### 2.7 Reversal metadata consistency

Add a database check requiring:

- `ACTIVE` -> `reversedByUserId`, `reversedAt`, `reversalReason` all null;
- `REVERSED` -> all three reversal evidence values present and `reversalReason` nonblank.

This protects retained correction evidence even if a future command-layer defect occurs.

### 2.8 Provenance/indexing

The Prisma/PostgreSQL mapping must provide:

- stable exact row identity;
- an exact provenance key suitable for later P4 source citation;
- class/year/status/date index suitable for deterministic exact-date resolution;
- teacher/year/date index for retained responsibility history;
- `replacesId` index for correction lineage traversal.

A later real-world GVCN change may shorten a prior still-active interval transactionally in P1-012; this is not a correction and does not require replacing the row. A correction of a false assertion must retain/reverse the prior row and create new current-truth row(s).

## 3. Prisma relations required

The schema must expose explicit inverse relations from:

- `AcademicYear`;
- `SchoolClass`;
- `User` as teacher;
- `User` as creator;
- `User` as reverser;
- self replacement/replacements.

All parent relations are `onDelete: Restrict` where historical evidence would otherwise be destroyed.

## 4. Migration requirements

Create one forward-only migration for P1-011. No edit/rewrite of previous migration files.

The migration must create:

- `HomeroomAssignmentStatus` enum;
- `homeroom_assignments` table;
- validity/reversal/self-replacement checks;
- exact indexes;
- partial GiST no-overlap constraint for `ACTIVE` current truth;
- all required restrictive FKs.

No data backfill is performed by this task. Production remains pre-operational and no production migration is authorized.

## 5. Regression gates

P1-011 may not enter review unless repository tests prove at least:

1. Prisma contains exactly one `HomeroomAssignment` model and dedicated status enum.
2. `validFrom` / `validUntil` use `@db.Date`.
3. No `academicCalendarVersionId`, subject dimension, AdditionalDuty identity, or StaffSubject dependency exists on the model.
4. Composite SchoolClass/AcademicYear integrity exists.
5. PostgreSQL migration rejects invalid date ranges.
6. Two overlapping `ACTIVE` rows for the same class/year are rejected, including overlap with an open-ended interval.
7. Adjacent inclusive intervals are allowed when the second starts the civil day after the first ends.
8. The same teacher may be assigned to different classes over overlapping dates.
9. Reversed rows may coexist with corrected active rows over the same civil interval.
10. Reversal metadata consistency is database-enforced.
11. Self-replacement is rejected and retained replacement lineage is indexed/FK-protected.
12. Deleting referenced AcademicYear, SchoolClass, teacher, creator, reverser or replaced row cannot destroy retained evidence.
13. Migration deploy works on the repository's isolated PostgreSQL migration gate.
14. Existing schema/static/migration regression suites remain green.

The exact-head GitHub CI #337 and post-merge CI #338 established these repository gates on the merged implementation. P1-012 remains responsible for command-layer cycle/topology validation and for exercising correction commands that may create multiple replacement rows from one retained reversed assertion.

## 6. Files/domains allowed

Expected changes are limited to:

- `prisma/schema.prisma`;
- one new `prisma/migrations/<timestamp>_homeroom_assignment_persistence_foundation/migration.sql`;
- bounded schema/migration verification code or tests necessary to enforce this contract;
- `package.json` only if required to wire a new bounded verification script without dropping existing gates;
- P1-011/task-register/current-status documentation required by accepted governance before review.

## 7. Files/domains forbidden

Do not modify in P1-011:

- API controllers/services/DTOs;
- capability definitions/seeds/runtime;
- frontend application code;
- SpecialActivity/Special Programme runtime behavior;
- reporting/workload semantics;
- deployment workflows/scripts except if a test-only wiring change is strictly necessary and independently justified;
- VPS/Nginx/TLS/PostgreSQL production state;
- DamSanV5/Quản lí nội trú repository or production.

## 8. Closure rule

P1-011 required:

`implementation -> independent diff review -> exact-head PR CI SUCCESS -> merge -> exact merge SHA -> post-merge main CI SUCCESS -> SYNC-P1-011`.

All gates are satisfied. `P1-012` may become `READY` only after the `SYNC-P1-011` closure PR itself is independently reviewed, merged and its post-merge main CI is green under the non-recursive governance protocol.
