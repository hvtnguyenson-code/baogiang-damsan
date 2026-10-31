# P5-056 controlled schema release plan — preparation only

This plan does **not** authorize a production migration, workflow dispatch,
restart, merge or deployment. PR #257 must first pass independent review and
exact-head CI plus P6-021 compatibility. Actual VPS readiness needs separately
reviewed passive/preflight evidence and explicit production authority.

## Enforced release boundary

The existing automatic path is code-only. Its exact-release
`assert-no-pending-migrations.ps1` runs before capability synchronization,
pointer switch and restart. Pending P5-056 migrations therefore stop activation;
merging source does not silently authorize a migration. The deployed controller
must be the reviewed GitHub commit, not a cached/copied local controller.

P5-056 additionally runs `assert-release-schema.ps1` on **both** the code-only
and authorized migration paths. It verifies the release identity, dedicated
loopback database on port 5434, the shared migration-measured schema fingerprint,
enforcement, full inbound User FK inventory, and notification FKs/unique indexes.
An exception or invalid verifier summary prevents pointer switch/API restart.
The SFTP and automatic worker manifests include this controller dependency.
The verifier uses the built module from the exact installed release and a
read-only transaction; it never learns an expected hash from production.

`test-p5-056-release-gate.ps1` executes the actual deployment orchestrator with
disposable filesystem/command fixtures. Pending migration, clean history with
wrong schema, and migrated-but-unverified schema cannot activate. Verified
code-only and verified migration paths require backup -> migration/status ->
schema verification -> switch -> restart -> health. PostgreSQL integration
also executes the actual Node schema verifier and rejects column, enforcement,
FK and unique-index drift independently.

## Separately authorized production sequence

1. Review the exact main/release SHA and green authoritative CI. Establish current
   and previous release identities, dedicated Báo giảng runtime/startup identity,
   database/role on 5434, readiness and protected Nội trú health/identity on 3000.
   Validate existing deployment identity/ACL/isolation and rollback compatibility.
2. Review migration SQL and an exact-SHA maintenance window. Preserve all existing
   backup, environment, host-key, service-identity and protected-neighbour gates.
   The approved migration path needs its existing explicit migration/maintenance
   flags; automatic code-only deployment must keep migration disabled.
3. Install/build the GitHub release without switching `current`. Create a verified
   dedicated database backup using the reviewed wrapper, check archive integrity,
   and record a tested restore route/capacity before mutation. Require reviewed
   same-major server/`pg_dump`/`pg_restore` versions and a successful isolated
   `pg_restore --exit-on-error`; listing an archive alone is not restore proof.
4. Quiesce and verify only the exact Báo giảng runtime. Do not reboot, restart
   PostgreSQL/shared Nginx, stop other Node processes or alter Nội trú/DamSanV5.
5. Run `prisma migrate deploy` against the exact installed release schema, then
   `prisma migrate status` and the new read-only schema gate. Both migrations are
   additive. The binding migration intentionally revokes unbound subscriptions
   and unfinished old deliveries; users must explicitly opt in again.
6. Run existing capability-catalog synchronization, switch the exact release,
   restart only the verified Báo giảng process, and verify API live/ready,
   frontend/public HTTPS, current SHA and protected neighbour identity/health.
   With Push disabled, inbox/auth must still work. Enable Push only with reviewed
   runtime secrets and separate supported-device smoke evidence.
7. Retain sanitized deployment reports and exact SHA evidence. Failure stays
   fail-closed and follows the existing recovery/compatibility approvals.

## Rollback and compatibility

- Before migration: no new code is activated. Keep the prior release running;
  inspect failed artifacts rather than forcing a rerun or changing pointers.
- Migration failure/unknown completion: do not start the new API. Inspect the
  migration record/schema under separate authority. Existing safe-stop and
  compatibility checks govern recovery; do not automatically reset or down-migrate.
- After successful additive migration, code rollback needs explicit compatibility
  approval. Keep new tables/columns/history and revoked subscriptions. The prior
  release ignores added fields; its clean-slate deletion fingerprint can block
  deletion on the expanded schema, which is a safe limitation, not grounds to
  relax the guard. No automatic consent re-enablement or table removal.
- Restoring a database is a separate destructive decision: quiesce the exact
  application, assess post-backup writes/data loss and obtain explicit authority.
  Never restore over a live database as an automatic code rollback step.

## Isolated rehearsal evidence

Local test-only PG17: replay 30 pre-binding migrations, observe exact-release
`migrate status` exit 1 with the binding migration pending, produce a custom-format
backup, deploy migration 31 and verify fingerprint
`dcc09117df18e7b7c914f4a1aec781fe` / enforcement / all 78 inbound FKs. Restore
that backup into a different fresh test database and verify all 30 migration
records restored. No dump contents or secrets were printed or committed.
An additional rehearsal starts from the exact canonical main schema (29
migrations from `088041952796e9628ae7aeed1026393525e35705`), retains a synthetic
user through both new migrations, passes the built release verifier, and restores
the 29-migration backup into another fresh PG17 database with the prior user intact.

PG16 data rehearsal also retains a synthetic inbox, revokes its unbound
subscription and cancels PENDING/LEASED/RETRY_WAIT deliveries without dropping
history. A same-major PG16 backup/restore with `--exit-on-error` restores all
30 prior migration records, the inbox/subscription and all three prior states.
A preliminary attempt using PG17 dump tools against PG16 reported unsupported
`transaction_timeout` during restore and was **not accepted as PASS**; the
successful matched-toolchain repeat is the restore evidence. This is why tool
version compatibility and actual restore, beyond `--list`, are required preflight.
PG16 full fresh/legacy/replay migration-contract script also passes with an
isolated non-superuser application role. These rehearsals do not establish
production backup freshness, host readiness or release permission.
