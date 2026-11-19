# P5-057 / WS1-B1 — Acceptance test checkpoint (18/11/2026)

**Baseline:** `main@54c1916b81c7271614eeadcbc8ef6fb5de1789cd`
**Worktree:** `.worktrees/ws1-b1-isolated-acceptance-20261118`
**Branch:** `test/p5-057-b1-isolated-acceptance-20261118`
**Scope:** ONLY tests and documentation. **NO production writer activation, API route, role/permission change, schema change, migration, CI/CD change or production database write.**

## What is established

1. PR #285's original uncommitted-code, PG16 and local-typecheck review blockers were superseded by merged code and green exact-head CI evidence:
   - PG16 ephemeral migrations + API integration: workflow run `43451370970`.
   - Main CI / API typecheck, Jest integration and build: `43457289551`, `43739439777`.
2. The remaining activation blocker is real: `B1RoleCommandWriter` is an unregistered class; `CapabilitiesModule` has no B1 command provider/controller and `POST /role-appointments/preflight` always returns `canConfirm=false`.
3. The existing generic grant and template-write guard is OFF unless `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`. Do not switch the flag without a reviewed, usable alternative command path.
4. The writer's four sensitive role capabilities are NOT the entire `PRINCIPAL` / `VICE_PRINCIPAL_ACADEMIC` responsibility templates. Keep teacher, timetable, PPCT, reporting, school-operability and unrelated independent grants intact. The current PHT template does not explicitly include `ADDITIONAL_DUTY_CATALOG_MANAGE`, although staged B1 issuer policy assigns it to the role: review this **policy/cutover difference**, do not silently change production template behavior.
5. The last known aggregate production inventory (08/11) contained legacy technical grants lacking B1 source/coordinate records. It is a historical snapshot, **not** verified current inventory; no legacy source may be inferred or automatically fabricated.

## Test changes in this checkpoint

- New `apps/api/test/capabilities/b1-acceptance-negative.integration.spec.ts`:
  1. Legacy `AUDIT_VIEW` with `coordinateId=NULL` is refused before B1 command/source creation and the existing grant remains unchanged.
  2. A technical capability holder without a B1 `TECHNICAL_ACCOUNT_ADMIN` appointment cannot issue Principal commands.
  3. An outdated `B1_GLOBAL` authorization epoch is refused without role evidence.
  4. Replaying a request key with a changed target is refused, preserving the first command and original source count.
  These are **real PostgreSQL fixtures** in an outer SERIALIZABLE transaction that is always rolled back; the transaction facade deliberately does **not** prove nested rollback or multi-connection concurrency.
- New `apps/api/test/capabilities/b1-operability-boundary.spec.ts`: Principal/PHT templates retain `TEACHER_BASE` and essential reporting/timetable/PPCT/teaching-operation capabilities, and do not grant generic `SYSTEM_ADMIN`, `USER_MANAGE`, or `CAPABILITY_GRANT` by default.

## Local evidence and limitations

- Existing `b1-role-command-writer.spec.ts`: **13/13 PASS**.
- Existing `sensitive-generic-writer-gate.spec.ts`: **5/5 PASS**.
- New `b1-operability-boundary.spec.ts`: **2/2 PASS**.
- New integration suite: Jest transpile-only load **PASS**, **4 tests skipped without certified `TEST_DATABASE_URL`**; **not** counted as PG pass.
- New test files: scoped, non-type-aware ESLint **PASS**.
- Standard local Jest/ESLint type-aware execution on laptop fails with pre-existing Windows Node/V8 `StackOverflowException` / `Fatal process out of memory: Zone`. Local temporary transpile-only Jest and non-type-aware ESLint configs were used solely for diagnostics and **MUST NOT be committed or used as CI substitutes**.
- A brand-new PostgreSQL 17.10 cluster was initialized under this disposable worktree with loopback port 55471, but MCP's managed-process lifecycle and `SECRET_CONTENT_DENIED` policy stopped the attempted test session **before any migrated test database was used**. No production DB was connected. PostgreSQL integration and canonical typecheck must run on the PR's existing CI jobs.

## Open gates (explicitly NOT passed)

1. Exact-head PR CI: PostgreSQL 17 integration and PostgreSQL 16 off-host workflow, typecheck, lint/build.
2. Real multi-connection `SERIALIZABLE` conflict/retry/atomic handover tests across Principal/PHT, including independent `AUDIT_VIEW` source preservation. New negative tests do not cover this.
3. Direct HTTP authorization tests for every generic sensitive ingress and a verified alternative source-aware API.
4. Fresh aggregate READ ONLY legacy/technical Admin B1 inventory; explicit approved reconciliation policy, no guessed provenance.
5. Independent security review and seven-persona E2E operability/rollback evidence.
6. Separate authorization to register/activate writer and enable cutover guard; **DO NOT** activate in this PR.

**Decision:** `P5-057/T56 = IN_PROGRESS`, `P6-050 = BLOCKED`. This checkpoint may be reviewed as test-only evidence. CI green does not prove B1 production readiness.

## Follow-up HTTP boundary acceptance (18/11/2026)

- New `apps/api/test/capabilities/b1-sensitive-generic-http.integration.spec.ts` uses the existing `Phase01Harness`, real NestJS HTTP routes, session cookie + CSRF and a CI-certified, isolated PostgreSQL test DB.
- Under `B1_REJECT_GENERIC_SENSITIVE_WRITES=true` **only inside the test process**, verifies (a) anonymous/CSRF failure; (b) all 9 sensitive generic create calls return 403 without B1 writes; (c) all 9 sensitive revoke calls plus previously revoked grant return 403 without mutation; (d) PRINCIPAL, VICE_PRINCIPAL_ACADEMIC and TECHNICAL_ACCOUNT_ADMIN generic template apply deny atomically; (e) unrelated TEACHER_BASE grant remains usable.
- Local transpile-only Jest discovered four tests, **4/4 skipped without a certified test DB**; scoped non-type-aware ESLint passed. This is not a passing PostgreSQL assertion.
- Exact-head CI and PG16 must exercise these HTTP paths. No other runtime/security flag/code/module/provider change is allowed in this PR. No activation or merger implied.

## 19/11/2026 — Multi-connection epoch persistence check

- Exact previous PR HEAD 9d65138a: CI workflow 44351412950 = SUCCESS; PostgreSQL 16 off-host workflow 44351412882 = SUCCESS. The real HTTP negative suite passes on both PostgreSQL versions.
- New b1-authorization-epoch-concurrency.integration.spec.ts uses three independent Prisma clients connected ONLY to a certified ephemeral TEST_DATABASE_URL. It creates a uniquely named, temporary authorization_states row (never B1_GLOBAL), forces both SERIALIZABLE readers to observe epoch zero before attempting concurrent increments, and requires exactly one commit with a serialization/write-conflict loser. The row is deleted and clients are disconnected after the test.
- This tests PostgreSQL multi-connection SERIALIZABLE behavior for the epoch persistence primitive. It does NOT run two complete B1RoleCommandWriter operations, demonstrate transfer of retained evidence, or clear the real concurrent APPOINT/TRANSFER acceptance gate.
- Laptop targeted non-type-aware lint passed; transpile-only Jest discovered 1 test and skipped it without a certified test DB. Exact-head CI on PG16/17 remains mandatory evidence.
- The test never registers the staged writer or enables B1 in a running app. No production data, schema, migration, or release workflow change.