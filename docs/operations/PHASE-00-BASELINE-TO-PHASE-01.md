# Runbook — Phase 00 Baseline to Phase 01

## Purpose and authorization boundary

This runbook covers a legacy Phase 00 PostgreSQL database that already contains `system_settings` but has no `_prisma_migrations` table. It does not authorize VPS access or execution. A separately approved deployment/migration task is required, and the user runs any VPS SQL/PowerShell directly.

Migration identifiers:

- baseline: `20260728000000_phase_00_baseline`;
- Phase 01: `20260801000000_phase_01_schema_foundation`.

Stop immediately if `_prisma_migrations` already exists, if any Phase 01 table exists, or if `system_settings` differs from the baseline below.

## 1. Read-only pre-check

Record the target database name/server through the approved secure channel. Do not paste credentials into GitHub, chat, shell history or logs.

Run read-only checks:

```sql
SELECT current_database(), current_user, version();

SELECT to_regclass('public.system_settings') AS system_settings,
       to_regclass('public._prisma_migrations') AS prisma_history,
       to_regclass('public.users') AS phase_01_users;

SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'system_settings'
ORDER BY ordinal_position;

SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public' AND table_name = 'system_settings'
ORDER BY constraint_name;
```

Expected `system_settings` shape:

| Column | PostgreSQL type | Nullable |
|---|---|---|
| `key` | `character varying(100)` | NO; primary key |
| `value` | `text` | NO |
| `description` | `character varying(255)` | YES |
| `updated_at` | `timestamp(3) without time zone` | NO |

## 2. Backup gate

Before any write:

1. create an approved, recoverable database backup outside the repository;
2. record backup timestamp, size and restore location;
3. verify the backup command succeeded;
4. obtain the task-specific migration approval.

Stop if backup or approval evidence is missing.

## 3. Verify repository artifact

On the approved deployment artifact, verify the commit and inspect:

```text
prisma/migrations/20260728000000_phase_00_baseline/migration.sql
prisma/migrations/20260801000000_phase_01_schema_foundation/migration.sql
```

Confirm the Phase 01 migration does not create `system_settings`. Set `DATABASE_URL` through the approved secret mechanism; never place it in a committed file.

## 4. Mark the verified baseline applied

Only after the pre-check and backup gate pass:

```powershell
npx prisma migrate resolve --schema prisma/schema.prisma --applied 20260728000000_phase_00_baseline
```

Then inspect status:

```powershell
npx prisma migrate status --schema prisma/schema.prisma
```

Stop if Prisma reports an unexpected migration, checksum conflict or connection target.

## 5. Deploy Phase 01 migration

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
```

Do not use `prisma db push` or `prisma migrate reset`.

## 6. Post-check

```powershell
npx prisma migrate status --schema prisma/schema.prisma
```

Verify read-only:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM public._prisma_migrations
ORDER BY started_at;

SELECT to_regclass('public.system_settings') AS system_settings,
       to_regclass('public.users') AS users,
       to_regclass('public.capability_definitions') AS capability_definitions,
       to_regclass('public.additional_duty_definitions') AS additional_duty_definitions;

SELECT count(*) AS system_setting_count FROM public.system_settings;
```

Confirm the pre-check `system_settings` row count/content remains intact and migration status is clean. Application health checks occur only after the separately authorized CD task.

## Stop and rollback criteria

Stop without further writes when:

- the target database/server is uncertain;
- baseline shape or existing migration history differs;
- backup/approval is absent;
- migration SQL contains an unexpected destructive statement;
- `migrate resolve`, `migrate deploy` or post-check reports an error;
- any unrelated application/database is affected.

Do not improvise rollback SQL. Preserve logs without secrets, isolate the application deployment if necessary, and restore from the approved backup only under a separately reviewed recovery plan.
