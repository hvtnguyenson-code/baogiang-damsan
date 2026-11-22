# P5-057 / WS1-B1 — Production read-only evidence, 22/11/2026

**Scope:** Báo giảng Đam San only. Authorized read-only observation of production, no direct production database write, no schema migration, no backup creation, no restoration, no GitHub merge or deployment. This evidence is not an external authority decision.

## 1. Release identity and GitHub classification

- Observed `C:\baogiang\shared\deployment-identity.json` identifies `baogiang-damsan`, canonical root `C:\baogiang`, HTTPS domain `https://baogiang.dtnt-damsan.edu.vn`, API port `3100`, and scheduled task `BaoGiangBackendPreDomain` under `bg_api`.
- Read-only Windows reparse target: `C:\baogiang\current` -> `C:\baogiang\releases\54c1916b81c7271614eeadcbc8ef6fb5de1789cd`.
- Target head of Draft PR #290 at this observation: `d0f22fa2e2e557f80f583dd6d97f3c63a8cc6e72`; parent #289 still Draft and must precede #290.
- Local execution of canonical `scripts/ci/classify-production-migrations.cjs 54c1916... d0f22fa...` returned `BAOGIANG_AUTO_DEPLOY_CLASSIFIED {"mode":"code-only","migrations":[]}` and ancestor check PASS.
- One diff under protected CI control-plane paths: `.github/workflows/ci.yml`. The diff adds two isolated read-only B1 inventory/rehearsal test steps and must be reviewed; there are **zero SQL migration deltas**. Do not claim this classification is permission to dispatch deployment; the workflow still requires exact green main CI, approved merge and release controls.
- `C:\baogiang\shared\baogiang-production.env` contained **0 explicitly configured `B1_*` variables**, hence **0 explicit `B1_*=true` entries**. This is file-level evidence only; it is not a complete runtime process-environment attestation.

## 2. Database source snapshot — read-only, no personal identifiers emitted

**Pinned target:** PostgreSQL `127.0.0.1:5434/baogiang`, `public` schema, matching the locally observed separate Báo giảng DB connection. The remote Node/Prisma process required `SET TRANSACTION READ ONLY`; it queried `current_setting('transaction_read_only')='on'`, `current_database()='baogiang'`, `current_schema()='public'`, with `REPEATABLE READ` isolation. The command printed only aggregates, capability names and SHA-256. No username, UUID, grant ID, SQL credential, password or API token was exported.

| Check | Result |
|---|---:|
| Active grants | **9** |
| Active legacy grants with null coordinate | **9** |
| Candidate users holding both technical-school-wide grants | **1** (candidate, not established Admin B1) |
| Technical Admin B1 seats | **0** |
| Current technical Admin appointments | **0** |
| B1 access commands | **0** |
| B1 grant sources | **0** |
| Access coordinates | **0** |
| Projection revisions | **0** |
| `provenanceVerified` | **false** |
| `canConfirm` | **false** |

Nine active grants, each `SCHOOL_WIDE`, one each: `AUDIT_VIEW`, `ADDITIONAL_DUTY_ASSIGNMENT_MANAGE`, `USER_MANAGE`, `SYSTEM_ADMIN`, `SUBJECT_GROUP_MANAGE`, `CAPABILITY_GRANT`, `ACADEMIC_STRUCTURE_MANAGE`, `ADDITIONAL_DUTY_CATALOG_MANAGE`, `SUBJECT_MANAGE`.

- Rights fingerprint SHA-256 (excludes `coordinateId`): `570e04d9ed2060f53d7d4150f0ede32cd35391e759748bef1e27222569f74dc0`.
- Linkage fingerprint SHA-256 (includes `coordinateId`): `8428736dca9117c1bfa21d9e4868e46ddeb679748298ed06fc39610cd7b244ad`.

These hashes were calculated with the same normalized fields and ID-sorted ordering as `scripts/ops/b1-bootstrap-readonly-preflight.cjs`. Since this was a short one-time **read-only observation**, a separately approved final preflight must recalculate and independently verify the fingerprints immediately before any cutover. A source-null grant must **not** be relabeled `ROLE_TEMPLATE` or `TECHNICAL_DIRECT` without individual historical authority evidence.

## 3. Backup archive presence/integrity (not restoration)

- Found scheduled archive `C:\baogiang\backups\postgres\baogiang-20261122-023002.dump`, created around 02:30 Vietnam time on 22/11.
- Size: **540,380 bytes**.
- SHA-256: `dbb7e4ac5db38958813d34f270351d4648984707588a6f7ef60d8933f625674b`.
- Installed `pg_restore --list` succeeded; archive table-of-contents read returned **928 lines**.
- The file was **not restored**, so this evidence does **not** establish restore success, FK integrity, application functionality after restore, recovery time or compatibility with a target clone. The archive must be refreshed and a clone restore tested under an authorized backup/rollback checkpoint.

## 4. Disposition and remaining external gates

- **Technical checkpoint:** both GitHub CI and PostgreSQL 16 workflows for `d0f22fa` SUCCESS. Current release is main `54c1916`; migration classification to the proposed head is `code-only`.
- **Operational checkpoint:** identity/release pointer valid and a recent readable archive exists; completed restore rehearsal on a protected production clone is NOT evidenced.
- **Authority checkpoint:** source status remains nine unlinked grants, zero B1 sources; real independent issuer, signed approval and external Ed25519 trust pin are NOT provided. G3/G4 separate issue/revoke authority has not been established.
- **User acceptance/security:** seven synthetic browser personas and a limited single-file Codex review are not seven school personnel's signed UAT or a full independent PR security approval. No formal GitHub review has been submitted.
- **NO-GO:** do not bootstrap, link, revoke, enable B1, merge or deploy until organization-level authority and approved technical/operational release gates are closed. Distinguish separate GO for code-only deployment with B1 OFF, for first Admin bootstrap, and for B1 feature activation.

**P5-057/T56 = IN_PROGRESS; P6-050 = BLOCKED.** This report contains no passwords, credentials, private keys or personal account IDs. No production DB writes, service restarts, GitHub merge or VPS deployment were performed.
