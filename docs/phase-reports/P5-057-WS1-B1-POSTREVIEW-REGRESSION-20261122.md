# P5-057 / WS1-B1 — Post-review regressions (22/11/2026)

**Worktree:** `.worktrees/ws1-b1-gated-api-20261121`; draft PR #290, parent PR #289.
**Starting code HEAD:** `98a7e8691f3d02610a9222dd938ee47e4f5e2dd4`.
**Release state:** No merge, no production deployment, no B1 flag activation, no PostgreSQL schema migration. Project main and VPS Báo giảng unchanged.

## Rationale and safety boundary

Antigravity completed six read-only review tasks against the starting HEAD. No exploitable P0/P1/P2 security defect was confirmed, but the reviewer noted (a) potential loss of historical-source proof after technical Admin cancellation, (b) legacy generic modification of non-sensitive but B1 source-linked capabilities, and (c) missing real simultaneous PHT command races. Reviewer approval of the prior HEAD does not automatically cover the subsequent edits.

## Changes in this checkpoint

1. **B1-linked non-sensitive generic revoke gate**: `sensitive-generic-writer-gate.ts` now refuses generic revoke when a grant has a B1 `coordinateId`, *only while* `B1_REJECT_GENERIC_SENSITIVE_WRITES=true`. `CapabilitiesService.revoke()` passes the persisted grant's `coordinateId` to this guard before idempotent return or any write. Existing sensitive-key behavior remains unchanged; unlinked normal grants remain permitted; production default OFF remains unchanged. No database changes.
2. **Negative tests reproduce the problem first**: `sensitive-generic-writer-gate.spec.ts` added (i) a linked non-sensitive `TIMETABLE_MANAGE` guard test and (ii) a mock transaction test proving the legacy revoke writer cannot reach `capabilityGrant.update` for that linked grant.
3. **True PHT concurrent races**: `b1-real-writer-concurrency.integration.spec.ts` extends its disposable-schema PostgreSQL test with competing PHT APPOINT, TRANSFER and DISMISS commands at the same authorization epoch. At every race, exactly one command may succeed; verify current appointment count, final rights and authorization epoch. Same separate real Prisma clients and SERIALIZABLE transactions as the existing Principal test.
4. **Historical issuer semantic characterization**: `b1-role-command-writer.integration.spec.ts` now distinguishes the valid-at-source-time case after normal technical appointment expiry (including grant revocation *after* issuance) from `cancelledAt` (currently fail-closed). Both operate in a real PostgreSQL outer transaction guaranteed to roll back. **These tests do not constitute approval for retrospective VOID semantics**. Any revision to historical cancellation requires separately documented school policy and an independent re-review.

## Executed local tests

- Before runtime change: targeted Jest `sensitive-generic-writer-gate.spec.ts` **5 passed / 2 failed**, confirming that the missing guard allowed reaching the legacy update path.
- After runtime change: same Jest **7/7 PASS**; `GREEN_JEST_EXIT=0`.
- New PHT integration test transpiles under Jest locally but is **SKIPPED** without certified `TEST_DATABASE_URL`; this is **not** a PostgreSQL success.
- A temporary local PG17 drill script was not allowed to execute by the MCP safety mechanism; no production database was contacted or changed. Do not bypass this guard. Require exact-head GitHub CI PostgreSQL 17 + off-host PostgreSQL 16 for real database evidence.
- Git diff whitespace check: PASS. Scoped ESLint on all five modified TypeScript files: **PASS, 0 errors, 0 warnings**. Local targeted Jest regression: **7/7 PASS**. Full typecheck and actual PostgreSQL 16/17 evidence remain conditional on exact-head CI.
- Independent Antigravity post-fix read-only review task `ef295d8a-dd66-436d-83bf-5271d103fe4b` completed **PASS** with 0 changed files; confirmed the linked-coordinate gate is fail-closed when cutover flag is ON and inert when OFF, and validated synthetic test intent. This is not a substitute for PG16/17 execution or production authorization.

## Residual gates

- CI proof for all new real PostgreSQL tests at exact newly committed HEAD, plus independent Antigravity re-review of new source/test diff.
- Generic **create** and legacy responsibility-template writes may still interact with previously B1-managed non-sensitive coordinates; this patch addresses only **linked grant revoke**. Do not silently blanket-block unrelated teacher grants; separately model cutover policy and add targeted DB regressions.
- Define whether `RoleAppointment.cancelledAt` means retrospective VOID or a normal administrative end distinct from `validUntil`. Keep existing fail-closed behavior pending that decision, and do not invent historical source authority.
- UAT seven real roles/device flows, verified individual provenance for nine legacy grants, out-of-band Ed25519 trust/key issuance, technical direct source issue/revoke policy and rollback/cutover rehearsal remain separately required.
- Approval G1/G3/G4 in principle was already given and need not be requested again. There is still **NO-GO** for production first-Admin bootstrap, writer activation, and deployment without separate explicit PO authorization.

**Stage:** `P5-057/T56 = IN_PROGRESS`, `P6-050 = BLOCKED`. PR #289 unaffected; PR #290 remains Draft.
