# P5-056 / T55 — PR #257 correction evidence

Status: IN_REVIEW; final isolated regression gates passed. No merge,
deployment, production migration or independent approval is asserted.

## Provenance and diagnosis

One existing branch: `feat/p5-056-notification-center-webpush`.
Takeover HEAD `39b60d6026b093629ebcafc93750b04be93180f2`; canonical main fetched
directly as `088041952796e9628ae7aeed1026393525e35705`. Local tree was clean,
remote branch matched and no active overlapping repository test/build task was
found. Reviews 5722373124, 5722618883 and 5722773426 and complete failed CI #855 /
compatibility #78 job logs were read before implementation.

The deletion failure was reproduced on clean migration chains on **both**
Windows PG16.15 and PG17.10. The old expected hash was wrong; this was not a
proven PostgreSQL catalog version difference:

| Schema | Actual fingerprint | Enforcement | Inbound FK inventory |
| --- | --- | --- | --- |
| Handover, 30 migrations, PG16 and PG17 | `612e1f3b0d4abba0b6e796b15da72c5c` | true | exact match, 78 |
| Session/generation migration 31, PG16 and PG17 | `dcc09117df18e7b7c914f4a1aec781fe` | true | exact match, 78 |

There are 74 direct User FKs across 42 child tables and four indirect FKs to
allowlisted setup children. `verifiedGraph` remains fail-closed. A shared schema
proof exposes fingerprint/enforcement/inventory separately for tests and the
release verifier; no runtime learning, CASCADE deletion or eligibility bypass.

## Corrected behavior

- Session-bound subscriptions and ownership generation; atomic ordinary logout,
  logout-all, successful cookie replacement and password-change revocation.
  Expired/revoked/locked/inactive sessions are fenced at worker ticks/send checks.
  Endpoint/user/session/row locks serialize handoff and five-device admission.
- Fresh subscription/source checks after lease claim; generation-scoped 404/410
  invalidation and lease-owner CAS prevent late responses from changing a new
  owner's state. Each batch item's lease begins at its own claim time.
- Fixed generic Push with no user/source/notification identifiers; fixed generic
  public service-worker copy and inbox navigation, even with forged payloads.
  Strict bounded input plus actual ECDH public-key validation rejects malformed
  subscription keys, including implicit object-to-string conversion.
- Exact REPORTING_SUBMITTED / REPORTING_DECIDED event/action/source registration.
  Reuse the existing capability evaluator inside the source transaction at
  publication, and recheck resource authority for list/count/read/action/send.
  A continuation survives an all-hidden 200-row scan; unread checks include the
  action/source binding. Inbox/outbox conflict arbitration runs inside PostgreSQL.
- Code-only migration status and actual schema verification precede release
  activation; both controller transfer manifests include the new gate. Existing
  recovery fixtures assume admitted schema only in their command stubs; dedicated
  fixtures execute the real orchestrator/gate ordering. The Windows parent now
  propagates the AUD-04 subprocess exit code; a stale synthetic port was corrected
  to 5434. No safety assertion or production guard was relaxed.
- Four older HTTP fixtures now use the complete shared database cleanup, removing
  their dependency on suite ordering and retained domain records. The concurrent
  endpoint test checks the winning owner's session/generation without assuming
  Promise ordering determines the winner.

## Verification

| Gate | Actual result |
| --- | --- |
| API unit, frozen code | 114 suites, 2,143 tests PASS |
| Web unit | 46 files, 750 tests PASS |
| Lint / typecheck / production build | PASS |
| Prisma validate, schema static, notification migration verifier | PASS |
| PG16 fresh / legacy / replay migration contract, non-superuser role | PASS |
| Full local PG16.15 API integration at checkpoint `59bc4e6` | 54 suites, 754 PASS / one existing SKIP; exit 0 (824.944 s) |
| Full local PG17.10 API integration at checkpoint `59bc4e6` | 54 suites, 754 PASS / one existing SKIP; exit 0 (1146.699 s) |
| Windows deployment / HTTP-01 / release gate | PASS; all 37 AUD-04 cases and five release-admission scenarios |
| Real HTTPS Push receiver | PASS: ES256 VAPID verification, independent RFC8291 decryption, no redirect following |
| Service worker / UI / Workbox static and privacy checks | PASS |
| Secret scan / diff whitespace | PASS |

Integration runs are explicitly certified local test databases on isolated
loopback ports 55466/55467, not production. The local final suite uses a 30-second
Jest per-test budget to accommodate this Windows machine; assertions and the
existing one opt-in P5-054 live-browser skip are unchanged. Preliminary overloaded
runs produced upload/network/time-sensitive failures; the three unrelated suites
passed unchanged when rerun. Those preliminary runs are not presented as PASS.

Database tests cover source/capability removal, other-user 404s, malformed keys,
publication rollback/dedupe, ordinary/API logout without browser unsubscribe,
logout-all isolation, cookie replacement, offline expiry, each queued handoff
state, delayed 201/410, admission races, crashed leases, retry durability,
schema/FK/enforcement/partial-index drift and hidden/mixed pagination. The real
transport fixture trusts only its in-memory loopback test certificate; it does
not disable TLS verification globally or contact a real provider.

Actual built release verifier accepts migrated schema and rejects restored old
schema. Backup/restore rehearsals cover canonical main's 29-migration baseline,
the 30-migration handover with synthetic retained inbox/deliveries, both additive
migrations and matched PG16/PG17 tools with `--exit-on-error`. See
`docs/operations/P5-056-CONTROLLED-RELEASE-PLAN.md`; an initial cross-major restore
error was detected, corrected and not counted as successful restore evidence.

## Boundaries and documentation synchronization

An already in-flight provider request cannot be retracted after logout/handoff;
only generic content is exposed and stale completions cannot resurrect DB state.
An offline browser action that never reaches the server is not proof of logout;
expiry/handoff/server revocation remain authoritative. Actual provider/device,
Android/iOS and persona UAT belong to registered P5-057; CI is not VPS readiness.

Task register, current project status, T55 matrix and the implementation requirement
are synchronized on this branch. ADR-059/product baseline remain unchanged
because no new business authority is introduced. README/PROJECT_CONTEXT/roadmap
do not claim P5-056 closed; no closure sync or dependent task is started. Execution
scope is `docs/tasks/P5-056-CODEX-CORRECTION.md`.

After the consolidated push, exact-head CI and P6-021 compatibility must be read
directly from GitHub. Independent source-diff review is still required. The agent
must stop before merge/deploy; P5-056 is not CLOSED until its separate authorized
merge, authoritative post-merge CI and non-recursive documentation closure.

## CI #856 correction — retained failure evidence

Checkpoint `59bc4e6a92431bfea849070d9248a21656a9c711` passed off-host #79
(`41213658254`), including the full PG16 suite (754 PASS / one existing SKIP),
and the Windows job of CI #856 (`41213658255`). The main CI job failed exactly
one concurrency regression with P2002 on the inbox compound unique key; 53 other
integration suites and API/Web unit gates passed. Local success was insufficient
to prove this race absent. Complete job logs were retrieved and diagnosed before
the follow-up; no unchanged-SHA rerun or infrastructure excuse was used.

Prisma empty-update `upsert` can issue a client-side read followed by insert.
Both inbox and outbox now use `createMany(skipDuplicates)` to issue database
conflict arbitration, followed by a canonical inbox read in the same transaction.
No transaction error is swallowed and uniqueness/content/rollback remain intact.
The regression now runs three bursts of eight publishers and requires exactly
one inbox/outbox per burst, with every publisher returning the canonical row.
See Prisma's [CRUD reference](https://www.prisma.io/docs/orm/v6/prisma-client/queries/crud).

Post-correction local notification/security suites pass **20/20 on PG16 and
20/20 on PG17**, including three eight-publisher bursts per run. Full API unit
again passes **114 suites / 2,143 tests**, with lint/typecheck/production build
PASS. Exact-head remote evidence is reported on PR #257. Full local
integration rows above identify their actual pre-follow-up checkpoint; they are
not misrepresented as runs of the corrected publisher. Final exact-head CI must
run full PG17 and Playwright; off-host must run full PG16 before handover.
