# P5-057 / WS1 — B1 two-source transactional rehearsal (08/11/2026)

**Status:** TEST-ONLY / ISOLATED POSTGRESQL. No production writer, appointment API, migration, cron, or role activation.

## Why this gate matters

The production read-only inventory shows 9 active legacy grants with unlinked coordinates, and no B1 source records. The pure planner from PR #275 models multi-source coverage, but we must also prove that PostgreSQL B1 constraints can hold two independent sources without duplicating a capability grant.

## Rehearsal fixtures

Two integration tests use the existing isolated transaction harness, which deliberately rolls back all synthetic rows. They assert that:

- Role and independent professional sources support one effective grant through a shared coordinate and multiple support records.
- Duplicating a partially overlapping capability grant is rejected by database constraints.
- Ending the role at server confirmation time appends a new source revision; the latest projection retains support only from the independent source, so the original grant is preserved.
- When the sole verified source ends, closing the grant's validUntil at confirmation removes future effectivity without deleting its historical record.
- Old projection/source support snapshots remain retained.

**Not a production writer:** The tests prove possible PostgreSQL operations, not verified authorization, concurrency-safe command execution, authenticated issuer policy, idempotency, transaction rollback in a live command, or legacy reconciliation. Append-only source revisions require selecting the latest revision of each source; old accepted snapshots are historical and cannot be treated as currently active once superseded.

## Additional B1 conditional-write safety fixtures (candidate PR, CI required)

Three new **test-only** PostgreSQL fixtures extend the rehearsal:

- A compare-and-swap update using WHERE version = expected succeeds once and rejects a stale version for both an access coordinate and an appointment. This proves the SQL/Prisma primitive, **not** end-to-end multi-client serializability.
- The unique (actor, command type, request key) receipt prevents a second receipt with a changed fingerprint. The first receipt/result remains unchanged. This is **not** an implemented replay handler or HTTP 409 policy.
- A synthetic command that updates source revision and grant end time, then fails, leaves no user, grant or command behind after transaction rollback. This is **not** yet a production D2/D3 command.

The local TypeScript syntax check passed. Targeted ESLint could not finish on NGUYENSON because its Node process ran out of heap; there is no configured local isolated TEST_DATABASE_URL. A green exact-head CI on PostgreSQL plus independent review is mandatory before merge. No writer, API, evaluator, schema, migration, production data or deployment pipeline changes.

## Explicit blockers before real D2/D3 commands

The future writer must verify authority-seat occupancy, actor/target scope, source/support evidence, expected revisions, operation idempotency, and serialization inside the same transaction. It must preserve unknown-provenance bootstrap grants and never infer a source from a template label. The real endpoint must remain absent until these gates and UAT pass. No new deployment mechanism.

**WS1 remains IN_PROGRESS.**
