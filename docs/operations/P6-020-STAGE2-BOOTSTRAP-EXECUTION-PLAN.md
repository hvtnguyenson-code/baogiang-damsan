# P6-020 — Kế hoạch bootstrap có cổng bảo vệ VPS dùng chung

**Status:** REVIEW CANDIDATE / MANUAL OPERATOR PREPARATION. Not a deployment authorization.
**Product Owner requirements:** independent application release/restart/rollback, Mắt Bão DNS-only hostname baogiang.dtnt-damsan.edu.vn, free auto-renewing HTTPS, own operator Telegram bot. No need to purchase any new domain.
**Baseline:** merge commit eacee5dd20cbef11bdc7c6688d785e1f2c3fe56a; read-only host report P6-020-VPS-READONLY-BASELINE-20261012.md.
**Compatible with:** existing PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md, PRODUCTION-STAGE2-BOOTSTRAP-READINESS.md, PRODUCTION-ENVIRONMENT-CONFIGURATION.md, P6-020-ISOLATED-SHARED-VPS-ARCHITECTURE.md and ADR-058.

## 1. Bootstrap allocations (proposals, NOT existing resources)

| Resource | Proposal | Precise owner / gate |
|---|---|---|
| Báo giảng root | C:\baogiang | New root + existing six required subdirectories releases, staging, incoming, shared, logs, backups; no reparse points |
| App deploy identity | Dedicated non-admin Windows account, provisional name bg_deploy | Separate from SYSTEM, DamSanV5 and PostgreSQL identities. Name/SID **must be resolved and reviewed** before ACL planning |
| API runtime identity | Dedicated non-admin Windows account, provisional name bg_api | May read server-side env and immutable code, write only intended API logs; no write permission to protected foreign roots |
| Web/static identity | REVIEW_REQUIRED, do not invent a physical account | Shared Nginx currently runs as SYSTEM; existing ACL planner requires a WebRuntimeIdentity. The actual static-file reader and ACL policy must be reconciled with this observed Nginx identity before assigning a value. The web identity field must not falsely claim Nginx was moved to a private account |
| Dedicated API task | BaoGiangBackend, scheduled-task only | Exact startup wrapper/action/account/working dir, boot trigger, failure/restart behavior. No task exists yet |
| Node distribution | Stable pinned Node 22: C:\baogiang\shared\runtimes\<reviewed-version>\node.exe plus sibling npm.cmd/npx.cmd | Exact SHA-256/vendor provenance, approved account ACL and executable checks; do not change C:\Program Files\nodejs |
| App bind | 127.0.0.1:3100 | Only private API; no public listener on 3100 |
| PostgreSQL | One independent PostgreSQL cluster, candidate loopback port 5434 | Separate service identity, binary installation, data, logs, ACLs, credentials and backup retention. Do **not** reuse running PG16/5432, PG17/5433, shared NetworkService identity or protected data |
| PG filesystem | Dedicated proposed C:\baogiang-pg for binaries and C:\baogiang-data for data/logs/backups | Both currently unprovisioned in this design; must be checked for collision/reparse and assigned exact ACLs. NOT covered automatically by the Báo giảng root ACL generator |
| Dedicated DB role | Proposed baogiang_app, database baogiang | NO superuser, createdb, createrole, replication or bypassrls; separate from Nội trú roles, minimal CONNECT/CREATE permissions; backup/restore evidence |
| Static release | apps/web/dist versioned release under C:\baogiang | Nginx must serve SPA assets; API reverse proxy alone does not suffice |
| HTTPS hostname | baogiang.dtnt-damsan.edu.vn | New DNS A host baogiang in existing Mắt Bão zone only; existing NS, A/MX and other records unchanged |
| HTTPS ingress | Managed server block under shared Nginx, no change to default Nội trú server | One separately approved Nginx change/reload; app-only restart and code deploy must not reload shared Nginx |
| TLS | Dedicated free Let's Encrypt certificate and renew identifier, separate from Nội trú | Current win-acme task/hook and challenge routing must be reviewed before any cert issuance/renewal; automatic renewal must not restart DamSanV5 |
| Telegram | Existing Báo giảng bot integration, new one-way deploy-success operator notifier from PR #213 | Disabled/not configured by default; operator recipient and bot secrets only after explicit provisioning; no Telegram commands yet |

**Account names and paths above are design candidates, not actual Windows users or installed files.** Do not write candidate values into GitHub production secrets/vars or a deployment marker until independently reviewed and actually available.

## 2. Two-step Stage 1/Stage 2 sequencing, avoiding a circular gate

The existing full PASS 2 -RequireReviewedIsolation/-RequireVerifiedIdentity validates concrete absolute tool paths, task, deployment-identity marker, Nginx binding and PostgreSQL root. Those **do not exist yet** for Báo giảng. Thus a *fully verified* PASS 2 is not possible before a tightly authorized initial provisioning of certain dedicated resources. Do not fabricate placeholders or reuse Nội trú's tool paths to obtain PASS.

The existing Get-ProductionAclPolicy resolves SID for DeploymentIdentity, ApiRuntimeIdentity and WebRuntimeIdentity. Actual ACL planning requires real identities/SIDs; a not-yet-created account name cannot be presented as a verified SID. Resolve and review the web-runtime/Nginx shared-SYSTEM tension before first ACL plan.

Order:

**Gate A — preparation, strictly read-only (authorized now)**
1. Preserve both PASS 1 originals and hashes. Recheck protection of C:\damsan, C:\nginx, certs, PG17/5433 and existing SYSTEM/NetworkService tasks.
2. Review exact Windows identities and relevant foreign roots/task/role names, ports, resources and report directory.
3. Resolve the **running Nginx effective prefix/config authority**. Existing task workingDirectory=C:\nginx, executable=C:\nginx\nginx.exe, but no explicit absolute -p. This evidence is NOT_VERIFIED. Do not derive authority from config file presence or run arbitrary Nginx commands to prove it.
4. Review private PostgreSQL version/distribution, service account, storage forecast, backup/restore and exact installer provenance. C: is 49.9 GiB total/29.6 GiB free at the latest snapshot; require a measured capacity/retention floor and verify disk trend before creating another PG cluster.
5. Review Node22 approved binary SHA-256 and folder ownership, no global PATH/Node/registry modifications.
6. Review Mắt Bão subdomain record availability; do not change DNS, NS, ACME, Nginx or cert in Gate A.
7. Decide which preliminary Stage 1 PASS 2 fields can honestly be marked MISSING/NOT_RUN; do not use such a report as a gate-clearance certificate.

**Gate B — initial isolated Windows resource provisioning (NOT AUTHORIZED HERE)**
Only after Product Owner approves exact change set and independent reviewer signs off:
1. Confirm no overlap with the protected Nội trú roots/processes/tls/account boundaries, resource free-space floor and rollback.
2. Create only reviewed dedicated identities, no new admin or broad rights; collect SIDs, prohibit all access to foreign protected roots. Creating Windows accounts is a production mutation: approval is needed.
3. Re-run canonical read-only ACL plan and review exactly generated SIDs, paths and rights. Provision C:\baogiang and required dirs using the reviewed ACL plan; run read-only ACL verifier.
4. Install pinned private Node22 binary under the immutable approved directory, validate hashes and runtime version; do not modify system Node20.
5. Set up independent PostgreSQL distribution/cluster on approved loopback port only after independent PG ACL/OS service/backup plan; do not execute ad-hoc initialize/pg_ctl or reuse PG16/17 automatically.
6. Generate startup-bundle provenance plan for an exact merged first-parent main SHA. Copy exact verified blobs to the reviewed shared\startup-bundles\<SHA> directory and verify hashes/ACL using existing tools. No partial/overwrite on conflict.
7. Create server-side production environment/marker with exact reviewed paths and no secrets in GitHub files; validate marker, startup identity and env values; create the **BaoGiangBackend task only** with exact action/working directory and account after manual approval. No activation or app deploy as part of this bootstrap gate.
8. Run PASS 2 with exact real Node22, PostgreSQL, Nginx and foreign identity evidence; accept only verified sections, explicitly opt in to DB evidence separately; public HTTP/TLS probe must wait for reviewed ingress/domain approval.
9. Prepare Nginx plan/Desired/Restored verification and separate Mắt Bão DNS/ACME runbook. Shared Nginx config mutation + syntax test + reload is a separate change window, with Nội trú health, TLS and rollback evidence. No automatic global reload during ordinary Báo giảng deploy.
10. Independently approve readiness and only then propose P6-030 first deployment.

A task or runtime should NOT be created solely because an account name is listed in this plan. A new PG service on 5434 or new Nginx include is not a PASS 2 read-only step.

## 3. Required preflight forms before any authorized Windows mutation

The operator review package MUST contain verified literal values and hashes for:
- Dedicated identities: exact account names/SIDs; task action/workingDirectory, script/executable paths, boot trigger, service permissions.
- Node/npm/npx: exact same private versioned directory, signatures, SHA-256, official distribution origin.
- PostgreSQL: installer origin/hash, fully separate binary/service account/data/role, listener loopback, port, version, resource ceiling, cleanup/rollback and independent restore test.
- Root policy: deterministic output of production-root-acl-plan.ps1 plus policy hash, protected neighbors, ordinary non-reparse ancestry, reviewed bootstrap report sink.
- Startup bundle: reviewed main commit SHA, two blob IDs + SHA-256, immutable destination, positive startup-bundle-verify result.
- Marker: schemaVersion 1 exact keys/foreignIsolation/startupBundle/task bindings; no lenient migration of marker schema.
- Nginx: effective prefix/config authority proven, exact active include graph, rollback snapshot, managed server block, separate TLS files/renew hooks, HTTP-01 challenge and no domain collisions.
- DNS: Mắt Bão existing zone ownership, no A/AAAA/CNAME conflict, exact change for host baogiang only, TTL and propagation verification.
- SSH/GitHub: exact pinned host key, least-privilege deployment identity, environment approval, protected production secrets/vars, post-deploy checks.
- Operator Telegram: disabled until exact verified chat recipient, private bot token, journal ACL and successful dry-run without real provider.
- Recovery: versioned release pointer, rollback-compatible DB schema, fail-safe stop exact task, post-restart six endpoint checks, no touch to DamSanV5.

**No credentials or private process/task arguments in reports, PRs or audit logs.** Store secrets only in the separately approved server-side environment, with restrictive ACLs.

## 4. Stop conditions

NO-GO on any of these:
- Main/PR/CI status not independently verified for the reviewed exact SHA.
- Target identity, OS principal SID, Node executable hash, PG cluster or Nginx runtime binding is MISSING, NOT_VERIFIED, AMBIGUOUS, PARTIAL or CONFLICT at a required gate.
- New account would be granted Administrator, SYSTEM rights without explicit exception, or could write C:\damsan, C:\nginx, protected PG17 data or private TLS resources.
- Independent PostgreSQL cannot fit into a storage budget with backup/rollback reserves.
- Current Nginx runtime authority cannot be independently proven; no production config mutation allowed to fabricate that evidence.
- Stage 2 files/marker/task are only candidate names, not verified actual resources.
- A plan requires restart or migration of Nội trú, generic node.exe kill, broad Windows Service restart, shared Node update, Nginx/ACME task overwrite or DNS NS transfer.
- Code deploy may trigger shared Nginx reload or app-only restart is not proven isolated.
- Telegram sends a success alert before the independent health results or enables privileged chat commands.

## 5. Handoff and next PR/task boundaries

- This PR: **documentation + passive evidence only**; no VPS mutation.
- P6-020-B: exact identity/ACL/Node22/PG distribution + capacity decision and read-only PASS 2 preflight parameter freeze.
- P6-020-C: separately authorized safe Nginx runtime authority and ingress/TLS plan, Mắt Bão DNS A, ACME auto-renew review.
- P6-020-D: Stage 2 account/root/runtime bootstrap **after explicit approval**, using existing ACL and startup bundle verifiers.
- P6-030: first application deploy after all release, DNS/TLS, migration, rollback, security and independent operation gates PASS.
- Telegram phase 2: verified restart observer for manual/Windows-boot restarts, separate from the first-phase controlled-deploy notifier.

**Current verdict: PREPARATION DONE IN DOCUMENTATION, BOOTSTRAP NOT EXECUTED, PASS 2 UNVERIFIED, P6-030 NO-GO.**
