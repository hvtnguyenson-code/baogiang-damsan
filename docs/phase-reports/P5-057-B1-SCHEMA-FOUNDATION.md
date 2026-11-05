# P5-057 / WS1 / B1 — Inert provenance schema foundation

Status: IN_REVIEW; independent GitHub review required. B2 is not authorized.

## Authority and scope

- Canonical code base verified directly from GitHub/Git: `85c406572400789fab5d3ec693a67d05528a9fec`.
- Product Owner explicitly authorized B1 implementation after [review 6659592897](https://github.com/hvtnguyenson-code/baogiang-damsan/issues/262#issuecomment-6659592897). A.2 design is accepted in principle, not evidence of a working projection writer.
- WS1 documentation was read from independent open PR #264 at `82ad42165cc62ac7a4fa49a4a4f916da1e0c67a6`; not from the stale local docs checkout. Independent PR #263 remains untouched at `e9dfb399f73b20ee45ed30408f46964e979636c6`.
- Registered parent: P5-057, traceability T56 and T50; history/scope safeguards T03–T05 and T18. Direct parent dependencies P5-051/052/053/054/055/056/020/030/010 are CLOSED in canonical main.
- Allowed implementation surfaces: `prisma/schema.prisma`, one additive migration, verified deletion inventory/fingerprint, schema/deletion regression tests, the isolated replay evidence runner, and task status/evidence documentation. No UI, catalogue, evaluator, controller, generic grant policy, bootstrap, runtime writer, feature flag or CI/CD changes.

## Schema delta

Migration: `20261105150000_p5_057_b1_provenance_foundation` (32nd migration).

Ten new empty models: AuthorizationState, AccessCommand, AccessCoordinate, AuthoritySeat, RoleAppointment, GrantSource, GrantSourceRevision, GrantProjectionRevision, GrantProjectionSlice, GrantSupport. `CapabilityGrant.coordinateId` is nullable and is never backfilled. User/definition relations and compound identity keys support the new FKs; existing grant data and authorization semantics are retained.

The migration adds 24 FKs, all RESTRICT on delete/update; 12 explicit check/exclusion constraints; 16 unique and 17 ordinary indexes; and two functions/seven triggers on NEW evidence tables only. Six evidence tables reject row UPDATE/DELETE. Support INSERT must be contained within both retained source-revision and projection-slice intervals. These are structural integrity rules, not an authorization or union-coverage engine.

Cross-coordinate integrity uses composite FKs at source/revision/projection/slice/support boundaries. Grant coordinate identity and resource FKs plus a managed-row shape check close the nullable composite-FK escape. A legacy source can reference only a grant already mapped to the same coordinate; B2 must perform that identity mapping explicitly before linking legacy evidence, without inferring provenance. Appointment sources must match the appointed user. Null-normalized coordinate uniqueness is an expression index, not nullable Prisma tuple uniqueness alone.

`capability_grants_exact_key` and `capability_grants_no_active_overlap` remain unchanged. Candidate `capability_grants_live_exact_key` is additive. The old full-history index STILL rejects recreating an identical revoked interval; a regression test proves this limitation. Seat occupancy uses half-open `tstzrange` per seat; no seat or global maximum-PHT policy is seeded.

There is no INSERT/backfill or capability definition change in the migration. New-table fixture rows used by tests are rolled back; they are not application activation.

## Measured schema proof

Full committed migration replay, not a guessed hash or runtime self-learning:

| Engine | Fresh + upgrade + second deploy | Fingerprint | Inbound deletion FK inventory |
| --- | --- | --- | --- |
| PostgreSQL 16.14 Windows | PASS | `dcc2a3bb3c84234d62d617e8128bcbfb` | 84 |
| PostgreSQL 17.10 Windows | PASS | `dcc2a3bb3c84234d62d617e8128bcbfb` | 84 |

Both fresh and upgraded databases produced identical proofs: 80 direct user FKs across 46 child tables, plus four indirect FKs. The complete measured inventory is committed in `user-delete-fk-inventory.ts`; only the fingerprint constant changes in `user-delete-schema.ts`. Deletion policy, approved cleanup sets, schema mismatch checks and runtime learning behavior are unchanged.

The test clusters are newly initialized task-owned clusters on loopback ports 55461/55471, separate from existing PostgreSQL installations/services. No production URL, data, credential or account was used.

Replay snapshots compare all 75 pre-existing public application tables before/after migration, with a synthetic active account/profile/definition/grant fixture. Only the new nullable column is excluded from legacy-row comparison. Data checksums and effective fixture grant IDs match; all new tables and grant-coordinate backfill remain empty. Existing exact-index and exclusion definitions compare byte-for-byte. Fingerprint/inventory are independently measured from both final replay paths.

Canonical main already has Prisma-datamodel versus physical-migration drift (UUID defaults and named FK/index differences, among other existing metadata). This PR does not repair or hide it: the replay runner compares baseline drift with final drift and requires exact equality. Result: **no incremental B1 drift**, not a blanket claim of zero repository drift.

## Validation

Targeted local suites on each engine: provenance-foundation integration, clean-slate deletion integration, access-baseline unit/integration, capability-authorization service and guard. Final results are recorded at the review checkpoint below. Schema tests exercise nullable identity, all compound link boundaries, legacy same-coordinate enforcement, positive intervals, unique receipts/revisions, retained evidence, support containment/cancellation, and adjacent/overlapping seat occupancy. User-deletion regression retains happy-path deletion, new-reference denial, unverified-schema rejection and concurrency/failure paths.

Additional checks: Prisma validate/generate, API lint, workspace typecheck, all four schema-static gates, staged diff check. Reproduction runner: `scripts/ci/test-p5-057-b1-replay.cjs`, with explicit `B1_TEST_PORT` 55461 or 55471 and `B1_OBSERVATION_PATH`; it starts no service and creates new uniquely named fixture databases. Test suites use the existing explicit isolated-test DB certification gate. Nothing connects to a default application DB.

## Rollback and B2 gate

Before activation, retain the additive schema and roll back to a B1-compatible binary with the matching physical fingerprint/inventory. A pre-B1 binary fails closed for clean-slate deletion on the expanded schema; that is an expected safety boundary, not permission to bypass verification. Destructive schema rollback is not supplied or authorized. If physically returning to main schema is separately approved, first prove every new table is empty and every coordinate null, then replay/test a reviewed inverse plan before using the old fingerprint. Do not delete evidence to manufacture compatibility.

B2 remains under registered P5-057 and requires separate acceptance/authorization: source-aware writer ownership for all grant paths; transactional union/projection and historical-evidence semantics; catalogue/actor/target policy; legacy reconciliation authority and disposition; snapshot JSON identity review before any new evidence writer is activated; receipt/version/lock protocol; and an explicit cutover/index/backout plan. Issuer-term dependence, ordinary-PHT read rights, grant-duration defaults and Principal override remain Product Owner choices. B1 encodes none of them.

No update to product baseline, README, roadmap or PROJECT_CONTEXT is needed: no professional workflow is enabled or claimed complete. Parent register/status and T56 evidence are synchronized; P5-057 and P6-050 are not CLOSED. No merge or deployment is authorized by local or CI results.

## Review checkpoint

Final local results: PostgreSQL 16.14 **6 suites, 166/166 PASS** (129.256 s); PostgreSQL 17.10 **6 suites, 166/166 PASS** (127.797 s). Each includes nine new provenance cases and 60 user-deletion cases. Prisma validate/generate, API lint, workspace typecheck, four schema-static gates, runner syntax and diff checks PASS. Initial local fixture corrections (unique-constraint precedence and measured inventory counts) were consolidated before the first push; no CI was used to diagnose them.
+
+Branch: `codex/p5-057-b1-provenance-foundation`, one scoped code PR against canonical main. Exact reviewed head and authoritative PR CI belong to GitHub evidence, not a self-referential hash in this document. No B2 implementation. No merge/deploy.
