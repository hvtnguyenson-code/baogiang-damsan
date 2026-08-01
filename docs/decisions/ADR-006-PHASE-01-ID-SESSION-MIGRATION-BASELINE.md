# ADR-006 — Phase 01 ID, Session and Migration Baseline

- **Status:** Accepted
- **Date:** 2026-08-01
- **Scope:** Phase 01 schema and migration foundation

## Context

Phase 00 created `system_settings` without committed Prisma migration history. Phase 01 introduces identity, organizational assignment, capability, session and audit tables, including history-sensitive records and time-valid relationships. The repository needs one ID strategy and a safe upgrade path for both empty databases and a legacy Phase 00 database.

## Decision

### Entity identifiers

- Phase 01 entities use PostgreSQL UUID columns represented by Prisma as `String @db.Uuid @default(uuid())`.
- Stable catalog identifiers that are business keys, notably `CapabilityDefinition.key`, remain normalized strings.
- Username is stored lowercase; staff, subject-group, subject and additional-duty codes are stored uppercase. Migration CHECK constraints enforce normalization in addition to future application validation.

### Authentication and session foundation

- `User` stores only `passwordHash`; no plaintext password or recovery answer is modeled.
- `AuthSession` stores only a unique token hash plus expiry, revocation and bounded client metadata.
- Phase 01 schema provides the persistence foundation only. Authentication runtime, cookie handling, hashing implementation and authorization guards belong to later tasks.
- `SYSTEM_ADMIN` remains a technical capability and does not imply professional approval authority.

### Migration baseline

- `20260728000000_phase_00_baseline` represents only the pre-existing Phase 00 `system_settings` table.
- `20260801000000_phase_01_schema_foundation` adds all Phase 01 objects and never creates `system_settings`.
- Empty databases run both migrations with `prisma migrate deploy`.
- A verified legacy Phase 00 database marks the baseline applied with `prisma migrate resolve --applied` and then runs `prisma migrate deploy`.
- Baseline resolution is permitted only after read-only schema verification and a backup gate. It is never inferred from table existence alone.

### Temporal and history constraints

- Validity windows use `TIMESTAMPTZ(3)` and half-open ranges `[validFrom, validUntil)` for overlap detection.
- CHECK constraints enforce `validUntil >= validFrom`.
- PostgreSQL GiST exclusion constraints backed by `btree_gist` prevent overlapping memberships, teaching assignments, active capability grants and additional-duty assignments.
- Expression-based unique indexes prevent exact duplicates when nullable end/resource fields are involved.
- Foreign keys use `RESTRICT` for history-bearing grants, assignments, sessions and catalogs; audit events preserve records with `actorUserId = NULL` when an actor is deleted.

## Consequences

- CI must test both fresh deployment and the legacy baseline-resolution path on isolated PostgreSQL 17 databases.
- The official pre-operational database is not accessed by automated tests.
- Prisma cannot express every CHECK/exclusion constraint; the committed migration SQL and targeted PostgreSQL tests are authoritative for those constraints.
- `WorkloadAdjustmentRule` is intentionally absent until a later business phase.
