# P5-057 / T56 - WS1-B1 leadership UI and isolated recovery checkpoint (2026-11-22)

## Scope and baseline

Registered task P5-057 remains IN_PROGRESS; P6-050 remains BLOCKED. Worktree branch feat/p5-057-b1-gated-command-api-20261121, Draft PR #290, base HEAD d82e22e7ed8a20b929e3fd098be0fa5c0a41036a (CI 44983027935 and PG16 44983027937 SUCCESS). Canonical main at task start: 54c1916b81c7271614eeadcbc8ef6fb5de1789cd. G1/G3/G4 accepted in PR #290 comment 7073734866; no additional business authority assumed.

## Delivered

- Users workspace: leadership tab for Admin with USER_MANAGE and CAPABILITY_GRANT, existing B1 Principal/PHT appointment, dismissal and transfer commands, named incumbents, read-only precheck and explicit confirmation. No self-appointment; missing prerequisites, unresolved legacy conflicts and incomplete prechecks block UI submission. Exact request key/payload retained on ambiguous failure; conflict requires fresh inspection.
- Additive command context exposes submission readiness without changing canConfirm=false. Transactional writer remains the authorization boundary. Generic responsibility-template preview reflects the same existing gate as its apply method; teacher template stays eligible. No flag activation, migration, scope expansion or production data changes.
- Bootstrap integration fixture includes local-only, explicitly opted-in native pg_dump/pg_restore recovery on its uniquely generated b1init schema within baogiang_test. Archive hashed and restored transactionally; prior grants, audit, epoch and absence of new B1 entities verified. No production backup or real-user restore implied.

## Verified local evidence

- API and Web TypeScript PASS.
- Web: 34/34 tests across existing Users workspace and new leadership panel suites.
- API: 16/16 tests across four targeted suites, isolated PostgreSQL 17, all migrations applied (existing 33). Actual native backup/restore verified 9 identical legacy grant rows, original epoch and audit, zero new B1 command/seat/source after restore. Acceptance and fixture schemas removed (read-only post-check: zero matching namespaces).
- Local browser fixture provisioning was refused by MCP (SECRET_CONTENT_DENIED). No bypass attempted. Separate credential-free mock-browser trial reached a healthy Vite HTTP 200, but Playwright did not produce results after more than two minutes; local session stopped. This is NOT browser acceptance or real seven-persona UAT. Unverified candidate excluded from commit.

## Release gates

Before any activation: independent issuer/trusted bootstrap and technical-source authority evidence; actual legacy/source reconciliation; authorized seat provisioning; verified production backup and real seven-persona UAT; exact-head CI and independent review. All production flags remain OFF. PR #290 stays Draft. No merge, VPS change, deployment or change to CI/CD. Only GitHub automatic CD after separately authorized green main merge.

Scoped API/Web ESLint PASS; local Vite process stopped. Browser candidate preserved in ignored test-results/p5-057-b1-local-run/browser-candidate.spec.ts.

CI follow-up: f9c4626 PG16 44991260201 and Windows deployment contract PASS; CI 44991260291 stopped before tests at UI foundation static verification because an API-client source comment contained a prohibited technical word. Comment-only correction; canonical scripts/ui/verify-ui-foundation.cjs PASS locally. No rule or behavior changed. New exact-head CI required.


## Follow-up: 22/11/2026 live browser evidence

- Local Playwright hang resolved by separating active Vite logs from Playwright output cleanup. Validated and retained `tests/e2e/specs/p5-057-b1-leadership-ui.spec.ts`: 8/8 PASS, 15.6 s; 19 screenshots of mock navigation/confirmation at 320/375/414/1366 widths. The mock fixture is not a substitute for real auth.
- Reused existing certified B1 HTTP integration fixture; no separate secret provisioner, new signer, external connection or production account. Opt-in helper `apps/api/test/helpers/b1-local-browser-acceptance.ts` runs Chromium against real Nest HTTP bound to 127.0.0.1:3100 and built Web preview at 127.0.0.1:5173. Corrected synthetic HDTN master shape (gradeLevel=null), not migration. Dev-server navigation timeout resolved by production build/preview and DOM-ready navigation; no API interception. Final targeted Jest suite 1/1 PASS (53.407 s; includes existing lifecycle assertions and opt-in browser journey).
- `B1_LIVE_BROWSER_ADMIN_APPOINTMENTS_PASS`: selected existing synthetic personnel and recorded both Principal/PHT through real UI/POST; checked two current appointments and PHT additional-duty catalog grant. All seven synthetic identities logged in; teacher 2, TTCM 4, PHT 8 (first-password change), Principal 2, GDĐP 1, HĐTN-HN 1 real routes; no access-management/AI grants for non-Admin. 18 images in ignored tests/e2e/test-results/p5-057-b1-live/b1http_34ed4b0c083c4f19a3c3c8fd50d52f5f. Verified no leftover b1http/b1ready schema or test listeners. These are route-entry/appointment checks, not every business action, physical Android, independent UX review or creating/activating PHT from scratch.
- Legacy read-only report now includes `legacyRightsReview` (known catalog key and scope type, counts, type compatibility, NOT_ESTABLISHED). Unknown keys/scopes are aggregated, no identities/resource IDs; incomplete/duplicate inventory rejects fingerprints; truncated inventory omits review. 10/10 unit tests PASS; actual scratch nine-row rehearsal PASS, rights hash preserved and changed linkage detected. Does not establish which legacy rights were legitimately issued.
- Reproduction: reuse approved isolated test-db configuration, build Web, launch preview at standard loopback port 5173 with no existing listener on 3100/5173; set B1_LOCAL_BROWSER_ACCEPTANCE=1 in local test process and run only b1-role-command-http-success.integration.spec.ts via existing Jest. Default CI does not run opt-in live helper; normal Playwright workflow runs the mock spec. Never use on production. No changes to authority, runtime flags or release pipeline.
- Remaining: real external technical-Admin appointment/trust and evidence, authority for issuing/revoking independent technical sources, actual grant provenance, production-specific backup/restore verification, full persona business and independent review. G1/G3/G4 already accepted; do not reopen them. No merge/deploy.

## G4 retained-source and scoped-review follow-up

See docs/phase-reports/P5-057-WS1-B1-G4-INDEPENDENT-SOURCE-REVIEW-20261122.md: real HTTP PHT dual-source G4 retention on isolated PG17 (1/1 PASS, no leftover schemas) and read-only Codex writer audit ("No confirmed bug", single file only). Production issuer/trust, legacy provenance, full PR review and cutover remain blocked.
