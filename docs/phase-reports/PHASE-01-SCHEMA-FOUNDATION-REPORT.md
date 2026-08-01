# Phase 01 — Schema and Migration Foundation Report

## Scope

Task `PHASE-01-SCHEMA-MIGRATION-FOUNDATION-001` implements only the database/contracts foundation. It does not implement controllers, services, authentication runtime, authorization guards or UI.

- Branch: `phase/01-schema-migration-foundation`
- Required base: `f457c1431581e5c37365b24641170149d946cd97`
- Database target for automated verification: isolated PostgreSQL 17 in CI

## Schema decisions

- UUID is the entity ID strategy; stable capability keys remain normalized strings.
- `SystemSetting` remains unchanged while 12 Phase 01 models add identity, staff, subject/group, capability, session, audit and dynamic additional-duty foundations.
- Passwords and session tokens have hash-only columns.
- New timestamps use `TIMESTAMPTZ(3)`; validity uses half-open ranges for overlap checks.
- CHECK constraints enforce normalized username/codes and `validUntil >= validFrom`.
- Exact expression-based unique indexes and GiST exclusion constraints prevent duplicate/overlapping membership, staff-subject, active capability-grant and additional-duty assignment windows.
- History-bearing foreign keys do not cascade-delete grants, assignments or catalogs. Audit rows survive actor deletion using `SET NULL`.
- Additional duties remain organizational data and do not create capabilities. `WorkloadAdjustmentRule` is not modeled.

## Migration history and upgrade path

1. `20260728000000_phase_00_baseline` represents only the legacy `system_settings` table.
2. `20260801000000_phase_01_schema_foundation` adds Phase 01 types, tables, indexes, checks, foreign keys and exclusion constraints; it does not recreate `system_settings`.
3. Fresh databases run both migrations with `prisma migrate deploy`.
4. A legacy Phase 00 database must pass read-only shape checks and a backup/approval gate before `prisma migrate resolve --applied 20260728000000_phase_00_baseline`, followed by `prisma migrate deploy`.

The operational procedure is documented in `docs/operations/PHASE-00-BASELINE-TO-PHASE-01.md`. It was not run against the VPS or official database.

## Seed and contracts

- The idempotent seed upserts 25 system capability definitions and creates no user, password or production fixture.
- Management capabilities cover users, subject groups, subjects, capability grants, audit, additional-duty catalog and additional-duty assignment.
- Shared contracts expose public-safe Phase 01 statuses, catalog/assignment records and capability keys without password/session hashes.

## CI migration gates

CI retains lint, typecheck, unit, integration, build and Playwright. It additionally:

1. validates and generates Prisma Client;
2. runs static schema/migration/seed verification;
3. deploys migrations to a fresh isolated database;
4. simulates a legacy Phase 00 database, resolves the baseline and deploys Phase 01;
5. checks clean migration status on both paths;
6. runs the seed twice and verifies it does not duplicate catalog entries;
7. executes PostgreSQL checks for validity, exact duplicate, overlap, inactive-history and non-cascade policies.

CI uses test-only credentials and databases inside the GitHub Actions PostgreSQL service. It does not use VPS or production secrets.

## Verification evidence before push

- `npx prisma format --schema prisma/schema.prisma`: PASS.
- `npx prisma validate --schema prisma/schema.prisma`: PASS with a non-routable validation-only URL.
- `npx prisma generate --schema prisma/schema.prisma`: PASS.
- `npm run test:schema:static`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test:unit`: PASS — web 11 tests, API 23 tests.
- `npm run build`: PASS.
- `git diff --check`: PASS at report creation.

The local workstation has no Docker, `psql` or `pg_isready`; therefore PostgreSQL migration execution evidence must come from the isolated CI gate after push, as permitted by the task. No official database connection is used as a fallback.

## Security and limitations

- No plaintext/default password, real-person seed, database dump or production connection string is introduced.
- Schema persistence is implemented, but authentication/session runtime and authorization enforcement remain future tasks.
- Exclusion and CHECK constraints are represented in authoritative migration SQL because Prisma schema syntax cannot express them fully.
- This report does not claim full Phase 01 completion, merge readiness or deployment readiness.
