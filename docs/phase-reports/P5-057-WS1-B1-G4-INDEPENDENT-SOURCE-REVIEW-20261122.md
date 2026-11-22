# P5-057 / T56 — G4 dual-source lifecycle and narrowly scoped security review (22 November 2026)

**Branch:** `feat/p5-057-b1-gated-command-api-20261121`, Draft PR #290 (stacked on unmerged Draft #289). Baseline exact HEAD `65b679c654b7f029ac495fed0b356739e7b5f508`; main `54c1916b81c7271614eeadcbc8ef6fb5de1789cd`. The baseline CI `45002191648` and PG16 `45002191640` both completed SUCCESS.

## Confirmed regression gap addressed

The existing B1 HTTP lifecycle covered appointment/dismissal of the academic Vice-Principal and G3's independent audit source in a separate writer test. It did not explicitly exercise G4's **surviving independently authorized technical source** while dismissing a PHT after a previous PHT lifecycle had already ended.

The isolated fixture now exercises the actual Nest HTTP API and PostgreSQL 17 B1 transactional writer:

1. Run earlier PHT appointment/dismissal, leaving a retained G4 coordinate with no current role source.
2. In the disposable test schema **only**, create a synthetic `TECHNICAL_DIRECT` G4 evidence source at the existing coordinate. Reuse its exact coordinate ID and CAS-incremented projection version; mint a separately linked grant, source revision, projection support and increment the B1 authorization epoch. The fixture emulates a previously independently authorized technical source; it is **not** an issuer/revoker implementation or approval for a real target.
3. Issue the real guarded HTTP `APPOINT VICE_PRINCIPAL_ACADEMIC` command: verify G4 has **one grant and two independent supporting source revisions**.
4. Issue real guarded HTTP `DISMISS` command: verify PHT-owned sources close, G4 grant remains active with **only the independent technical revision**, personal teaching baseline remains intact, and `B1_GLOBAL.epoch=12`.
5. Verify all changes lived in an auto-migrated, uniquely generated `b1http_<UUID>` schema of the certified local `baogiang_test` database. Post-test inventory found **0** `b1http_` schemas. No production database, data migration or environment flags were changed.

The first new fixture failed on PostgreSQL's existing unique-coordinate constraint because it tried to create the same G4 coordinate twice; the fixture was corrected to reuse the retained coordinate and its monotonic version, without weakening schema or production code.

**Local evidence:** API test TypeScript PASS; scoped ESLint PASS at Node heap limit 2560 MB (an earlier 1024 MB heap attempt failed due to local resource exhaustion, not a test assertion); `b1-role-command-http-success.integration.spec.ts` **1/1 PASS** (50.883 seconds); `pg_namespace` check **0 leftover b1http schemas**. This checkpoint has no new production runtime code.

## Independent Codex evidence and its limits

- A series of initial broad read-only Codex tasks failed at MCP `AGENT_OUTPUT_LIMIT`; no reviewed conclusion is claimed.
- Read-only, single-file security task `80df5a63-0750-402e-a69d-5b8d258af04f` completed on the exact baseline B1 writer: `No confirmed bug`. No files changed.
- This narrow review ran in `TRUSTED_LOCAL` mode; the MCP reports `osSandboxVerified=false`, and it is **not** a formal independent GitHub PR approval or full-stack security sign-off.
- A second HTTP-service-only Codex review was stopped when its lingering process blocked MCP terminal capacity. It has **no completed review result** and cannot be counted as PASS.

## Gate status

G1/G3/G4 business ownership principles were already approved and are not reopened. The test proves union/revoke mechanics under a synthetic independent G4 source **only**. It does not establish an authorized production source issuer, independent technical-source issue/revoke procedure, initial Admin signer/trust, provenance for the nine current legacy grants, real business UAT by all seven school roles, a verified production backup/restore, or full independent PR security approval.

**Disposition:** P5-057/T56 remains `IN_PROGRESS`, P6-050 remains `BLOCKED`; PR #289 and #290 remain Draft. All production B1/AI switches remain OFF. Do not merge, backfill, revoke, migrate or deploy until the outstanding evidence and separate authorization gates close. Báo giảng deploy is GitHub-only after authorized green merge; no direct MCP/SSH VPS action.
