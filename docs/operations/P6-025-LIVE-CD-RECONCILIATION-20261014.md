# P6-025 — Reconcile live Báo giảng with the GitHub production CD contract

**Status:** READ-ONLY AUDIT / REGISTRATION PROPOSAL. **No approval to execute CD, edit protected Nginx, restart tasks, migrate production DB, or merge this document.**

**Audit date:** 2026-10-14, Asia/Ho_Chi_Minh.  
**Canonical observed GitHub main:** `b9d0d68fb4affa74545272e18525f8950c2ec4f6` (main push CI #713, run 38344476487 SUCCESS).  
**Repository:** `hvtnguyenson-code/baogiang-damsan`.  
**Evidence boundary:** direct GitHub REST/connector reads and passive Windows VPS observation through authorized remote desktop; not formal P6-020 PASS 1/PASS 2. Never treat old pre-activation documentation as current host evidence.

## 1. Operational facts observed live (no production mutations)

| Area | 2026-10-14 actual evidence |
| --- | --- |
| Public | `https://baogiang.dtnt-damsan.edu.vn/` and `/api/health/ready` both 200 |
| Protected neighbour | `https://dtnt-damsan.edu.vn/` 200; `DamSanV5` task running; Node listener on 3000 |
| Runtime | `BaoGiangBackendPreDomain` task **running** as `bg_api`; launcher `C:\baogiang\shared\start-api-predomain.ps1`; Node on `127.0.0.1:3100` |
| App release | Sole `C:\baogiang\releases\b9d0d68fb4affa74545272e18525f8950c2ec4f6`; compiled API and web dist present. Directory naming agrees with GitHub main, but independently verified binary/source provenance remains outstanding |
| Release pointers | `C:\baogiang\current` and `previous` **absent** |
| Identity marker | `C:\baogiang\shared\deployment-identity.json` **absent** |
| Versioned startup authority | `C:\baogiang\shared\startup-bundles` **absent** |
| Expected task | `BaoGiangBackend` **absent**; do not rename or stop existing live task without separate approval |
| Dedicated database | `BaoGiangPostgres` running, TCP `127.0.0.1:5434`; protected Nội trú PostgreSQL 5433 is separate |
| Shared ingress | `Nginx Auto Start` running as SYSTEM; ports 80/443. Main config `C:\nginx\conf\nginx.conf` SHA-256 `ADF9F9FDFCE8E0F36B409421F62C3E7093C7981F264B2E11E98315813322CD07`; two hostnames' HTTP/HTTPS vhosts are inline in the main config |
| Nginx managed boundary | Only MIME include was observed; `C:\nginx\conf\managed-baogiang.conf` absent; managed include activation not proven. The repo's P6-010/P6-020D planners cannot be presumed compatible with today's inline vhost |
| Public cert | Official HTTPS certificate for `baogiang.dtnt-damsan.edu.vn` already issued by Let's Encrypt; separate win-acme renewal task observed; renewal-to-Nginx activation hook not proven |
| SSH | `sshd` running; port 22 listening. This does not establish that GitHub's deploy key, pinned host fingerprint or noninteractive PowerShell/SFTP works |
| Capacity | Approximately 12.05 GiB RAM and 22.64 GiB C: free at the read-only audit time |
| Backups | Five files observed recursively under Báo giảng backups; freshness, PostgreSQL custom-format integrity, SHA-256, ownership and restore rehearsal **NOT VERIFIED** |

**Do not print env files, credentials, private SSH keys, certificates' private keys, DSNs or backup payloads.** No secret values were collected for this report.

## 2. GitHub controls and mismatch

- `.github/workflows/ci.yml`: main/PR CI runs lint, typecheck, tests, isolated PostgreSQL/migrations, builds and Playwright. CI run #713 was successful for exact `main@b9d0d68...`.
- `.github/workflows/deploy-production.yml` is **manual `workflow_dispatch` only**, requires an exact first-parent main commit and successful `main` push CI, `production` environment, reviewed SSH identity and value-free `PROD_*` variable contract. Not automatically triggered by PR merge.
- GitHub `branches/main` reports `protected=false` and GET `rulesets` returned `[]` as of the audit. P0-004 is `BLOCKED_DECISION`. Server-side merge/CI gates are not enforced yet; request explicit authorization for any settings mutation.
- The GitHub connector cannot read the repository's Environment/secret metadata via its supported read endpoints. Actual presence/adequacy of `production` Environment, secrets and vars is **NOT VERIFIED**, not automatically considered missing.
- Workflow currently checks `[[ "$RUN_MIGRATIONS" == "true" ]]` even though the input is a boolean. This rejects **code-only deploy with `run_migrations=false`**. `invoke-production-deploy.ps1` already has a conditional migration branch, so reconcile workflow validation and test contracts rather than silently forcing an unnecessary DB migration.
- `Read-DeploymentIdentity`/startup bundle verifier and the exact Scheduled Task runtime identity are strict prerequisites. Production lacks the required marker, immutable startup pair, current/previous pointers and expected task binding; attempting CD now is a predictable **fail-closed** outcome before transfer.
- `production-nginx-plan.ps1` expects the dedicated managed file/include boundary and fails on domain collision with a foreign inline server block. The live official Báo giảng vhost resides directly in the shared main config. **Never add a second 443 vhost for the same domain or overwrite the shared main config automatically.**
- Earlier `CURRENT-PROJECT-STATUS.md`, P6-020 runbook and open PR #217 describe pre-activation state. They must be updated through reviewed governance, preserving historic dates; do not merge stale instructions that assume DNS/TLS/service are missing.

## 3. Design decision to be reviewed by Codex + independent reviewer

**Recommended target:** preserve the existing live application as the accepted initial release and perform an explicit, reversible adoption to the canonical CD authority *before* running the first GitHub workflow on the host. Never treat a successful public HTTP probe as authority for task, DB, Nginx or source provenance.

### Gate A — GitHub control plane (READ ONLY)

1. Recheck canonical `origin/main`, head CI, branch protection/rulesets and open PRs.
2. Verify `production` Environment existence, required variables and secret names **by presence only** using an authorized repository admin/operator view; inspect effective reviewer/approval settings. No values or material exported.
3. Verify host key/SSH client-to-server authentication with pinned public fingerprint and a non-mutating PowerShell handshake; test SFTP read-only capability and command encoding, without creating deploy directories.
4. Independently review a minimum code-only CD test case with `run_migrations=false` and explicit refusal when unapplied migrations exist; preserve backup/catalog synchronization and no migration side effects.

### Gate B — VPS inventory and preservation (READ ONLY)

1. Run the canonical P6-020 PASS 1 / reviewed PASS 2 from an explicitly selected source commit under an approved bounded evidence location; reconcile former "no port 3100" assumptions with the actual live service.
2. Record exact server side identity, ACL SID/account separation, Node/npm/npx source and signatures, real Nginx prefix/config binding, SSH key public fingerprint, dedicated PostgreSQL role/database and tenant isolation.
3. Prove the compiled release at `releases\b9d0d68...` maps to the exact GitHub commit using reproducible or reviewed archive/binary fingerprints; do not infer provenance solely from directory naming.
4. Verify a current backup and a **separate** restore/list drill (never restore to live DB); check migrations and capability catalog read-only.
5. Explicitly check certificate renewal hook and protected Nội trú TLS monitor; renewal reload must retain both domains and must be safe for the shared Nginx master.

### Gate C — Review-only cutover design

1. Define immutable startup bundle/marker and exact `current`/`previous` pointer adoption **without copying or deleting** the sole healthy release.
2. Specify exact Scheduled Task transition from `BaoGiangBackendPreDomain` to the canonical service identity, including `bg_api` runtime and (127.0.0.1:3100) proof. Do not run two APIs on the same port.
3. Decide whether canonical CD needs a **read-only compatibility adaptor** for the existing inline official Nginx vhost or a **separately reviewed** one-time managed-include migration. Don't weaken neighbour protection or the effective-config parser.
4. Document safe code-only release and DB-migration release cases, maintenance/quiescence, database backup, schema compatibility, rollback posture and exact health and task-ownership criteria.
5. Reconcile outdated P6-020/P6-030 statuses and PR #217 only after human review. Do not declare formal PASS 1/PASS 2 CLOSED from informal inventory.

### Gate D — Separate operator approval / exercise

- Dry-run/static Windows fixture tests with no production writes first.
- Obtain separate operator approval for each VPS marker/ACL/task/pointer/Nginx change, any database migration and the controlled first CD dispatch.
- In an authorized window, perform a tightly bounded adoption preserving the active site and neighbour; no full VPS restart, no broad `node.exe` kill, no PostgreSQL restart, no unapproved shared Nginx reload.
- Execute one reviewed no-op/code-only release via GitHub CD, demonstrate exact SHA, 200/200 for both public sites, API health, 0 secret leakage, and rollback drill to previous compatible release.
- Stop at first unexpected identity, path, port, migration or Nginx collision; retain the functioning currently deployed service as the fallback if safe, and report exact failure.

## 4. Acceptance checklist

- [ ] GitHub Environment, vars, secrets names, branch gates, SSH host/keys and SFTP/PowerShell contract verified
- [ ] Main and on-VPS source provenance cryptographically bound (not just matching directory names)
- [ ] Actual runtime/DB/ACL/marker/startup bundle/pointer authoritative PASS, not manual assumption
- [ ] Nginx managed/inline strategy accepted; dual-domain TLS, renewal and protected neighbours preserved
- [ ] Workflow code-only deploy supported safely, with migration drift fail-closed and Windows CI coverage
- [ ] Strictly reviewed compatibility bootstrap and single-task transition with prior-version recovery
- [ ] CI green; independent review; approved merge; post-merge CI provenance checked
- [ ] Separate authorized CD run SUCCESS and rollback exercise completed with evidence
- [ ] Governance task register/current status/traceability and operator runbook synchronized through `SYNC-P6-025`

## 5. Out of scope / relationship to next work

No changes to identity/capabilities, users, production business data, Nội trú, live Nginx, secrets or app typography under P6-025. The later **position-based capability templates with manual per-user exceptions** and **Vietnamese UI / typography design decision** require separately registered AUTH-POS/UI tasks after CD readiness.

**Current decision: CD is NO-GO until gates above are fulfilled.** Existing official website continues serving users.
## 6. Whole-repository branch/PR reconciliation (2026-10-14)

**Method:** Enumerated every repository branch through the GitHub branch API and compared each branch tip against `main@b9d0d68fb4affa74545272e18525f8950c2ec4f6` via commit-ancestry comparisons. Comparison is about commit graph membership, not the semantic value of an old diff. The repository has **234 branches including main**: **213 branches have zero unmerged commits**; **20 branches have commits outside main**. Do not confuse an existing branch with unmerged work, and do not merge old commits to clear a count.

| Remaining branch (20) | Ahead of main | Behind main | Disposition |
| --- | ---: | ---: | --- |
| `docs/p6-025-live-cd-reconciliation` | 4 | 0 | **Current task; PR #219 DRAFT; wait independent review and full gate** |
| `docs/p6-020d-vps-provenance-nginx-include-bootstrap` | 2 | 5 | **Historical 2026-10-13 inventory; PR #217 closed, superseded by live P6-025** |
| `docs/hosting-portability-consolidation-plan` | 7 | 1062 | **Old Linux migration direction; PR #11 closed as superseded by P6-005 SHARED_VPS** |
| `audit/p5-040-predeploy-consistency` | 1 | 105 | Rejected/older audit baseline; retain historical evidence, no blind merge |
| `archive/ops-production-protected-neighbor-discovery-local-20260809` | 2 | 1063 | Archived legacy operations implementation; no merge |
| `docs/reporting-statement-release-readiness` | 1 | 789 | Older release-readiness text; assess only if re-entry needs evidence |
| `docs/tkb-native-workbook-architecture-030-clean-v2` | 1 | 631 | Old parallel TKB architecture; P2-030/P2-040 have current accepted closures |
| `docs/tkb-native-workbook-architecture-030` | 4 | 631 | Old parallel TKB architecture; do not supersede accepted TKB model |
| `fix/operational-start-authority-continuity-031a` | 2 | 513 | Superseded by `fix/operational-start-authority-continuity-031a-v2` and P1-031A closure |
| `fix/production-preflight-powershell-automatic-vars-gh` | 2 | 1064 | Historic alternate fix; verify against current hardened verifier before any selective port |
| `ops/phase-01-cd-first-deploy` | 14 | 1066 | Historic CD implementation; main has later hardened production workflow |
| `ops/production-protected-neighbor-discovery` | 3 | 1063 | Historic alternate discovery implementation |
| `ops/production-security-gate` | 5 | 1065 | Historic security gate, main contains newer controls |
| `phase/00-foundation` | 11 | 1072 | Original phase branch; merged functionally through subsequent commits, no reintroduction |
| `phase/01-auth-session-runtime` | 6 | 1069 | Original phase branch; newer auth and security authority on main |
| `phase/01-capability-authorization-runtime` | 3 | 1068 | Original phase branch; newer authorization authority on main |
| `phase/01-identity-access` | 4 | 1071 | Original phase branch; newer identity authority on main |
| `phase/01-schema-migration-foundation` | 4 | 1070 | Original phase branch; newer migration chain on main |
| `phase/01-ui-design-system-foundation` | 11 | 1067 | Original phase branch; `DESIGN.md` is current UI authority |
| `rescue/ppct-component-aware-allocation-projections-003` | 19 | 563 | Historical rescue branch; current P2-003 official closure and regression required for selective inspection |

**PR dispositions actually performed:** #11 and #217 were closed **without merging** and have top-level comments explaining supersession. Their branches, commits and PR discussion remain recoverable. #219 remains open/draft; green CI alone does not authorize merge because its change requires independent architecture/governance review. At this point no branch was force-updated or deleted, and `main` was not changed.

**Local workstation synchronization:** canonical user laptop repository is separate from the VPS (`D:\baogiang-damsan` vs `C:\baogiang`). Only the VPS was connected to remote desktop during audit. Do not run `git pull` in the VPS release directory, do not reset the laptop repository remotely or assume it has been synchronized. An operator-verified local fetch/status/fast-forward of `main` is a separate step with a clean-tracked-tree guard, while preserving local-only untracked files and prior task branches.
