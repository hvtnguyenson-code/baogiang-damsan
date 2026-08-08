# ADR-010 — Hosting portability and 2027 consolidation plan

- **Status:** Accepted as architectural direction; production execution deferred
- **Date:** 2026-08-08
- **Scope:** Hosting portability, runtime isolation, future consolidation of Báo giảng and Quản lí nội trú

## Context

Báo giảng is being completed locally before production bootstrap resumes. The current production VPS hosts the existing Quản lí nội trú workload and is therefore a protected foreign workload for Báo giảng deployment.

Read-only production discovery on 2026-08-08 established the following current Quản lí nội trú characteristics:

- Windows Server host;
- application root `C:\damsan`;
- Scheduled Task `\DamSanV5` running as `SYSTEM`;
- global Node.js 20 runtime at `C:\Program Files\nodejs\node.exe`;
- application listener on TCP 3000;
- shared Nginx on TCP 80/443;
- Quản lí nội trú has established connections to PostgreSQL 17 on loopback TCP 5433;
- candidate Báo giảng TCP 3100 was verified free.

The current Quản lí nội trú VPS is expected to reach the end of its rental term around **May 2027**. A likely operational strategy is therefore:

1. run Báo giảng independently first, preferably on a small Linux VPS;
2. keep the current Quản lí nội trú VPS unchanged while it remains operationally sensitive;
3. around May 2027, evaluate a controlled migration of Quản lí nội trú to the Báo giảng VPS after capacity upgrade and portability validation;
4. retire the old VPS only after a successful migration and rollback window.

This is a planning direction, not authorization to purchase a VPS, migrate Quản lí nội trú, change firewall rules, bootstrap production, or deploy.

## Decision

### 1. One application codebase, multiple deployment profiles

Báo giảng must remain host-portable. Business/application code must not depend on the identity of the current VPS, Quản lí nội trú, or any current shared infrastructure.

Do not hard-code in application/business code:

- `C:\damsan`;
- `DamSanV5`;
- TCP 3000;
- the current VPS hostname or public IP;
- PostgreSQL port 5433 as an application invariant;
- the current Nginx path;
- Windows Scheduled Task semantics.

Deployment-specific values belong to environment or infrastructure adapters.

### 2. Báo giảng owns its own namespace

A deployment profile must give Báo giảng its own:

- application root;
- runtime identity;
- Node.js runtime;
- listener port;
- database and database role;
- environment/secrets;
- logs;
- backups;
- service/task identity;
- release and rollback directories.

For the current Windows deployment profile, `C:\baogiang` and TCP 3100 remain candidate defaults, not business-code assumptions.

For a future Linux profile, a candidate layout is:

```text
/opt/baogiang/
  current/
  releases/
  runtime/
  logs/
  backups/
```

with a dedicated service such as `baogiang-api.service` and a configurable loopback listener.

### 3. Standalone Linux VPS is a supported target

A future standalone Báo giảng VPS may use:

- Ubuntu Server or another supported Linux distribution;
- private/dedicated Node.js 22 runtime;
- PostgreSQL;
- Nginx or another reverse proxy;
- systemd for runtime supervision;
- a web administration layer such as Cockpit for operator visibility, provided administrative access is restricted and not exposed broadly to the Internet.

Linux is an infrastructure choice. It must not require a rewrite of the React frontend, NestJS backend, Prisma schema, business rules, or API contracts.

### 4. Shared-host profile remains supported

Báo giảng must also remain deployable on a host that runs other applications, provided explicit isolation is established.

On the current Windows VPS, shared Nginx and PostgreSQL 17 are foreign/shared infrastructure and Báo giảng does not own their service lifecycle.

Therefore a Báo giảng deployment on that VPS must not:

- restart or stop PostgreSQL 17;
- restart or stop PostgreSQL 16;
- stop or restart Quản lí nội trú;
- mutate `\DamSanV5`;
- replace or upgrade the global Node.js runtime used by Quản lí nội trú;
- stop/restart the entire Nginx service/process as a normal application deployment action.

Any shared Nginx change requires dedicated review, `nginx -t`, protected-workload pre/post checks, and only an explicitly approved graceful reload.

### 5. Future 2027 consolidation profile

If Quản lí nội trú passes portability audit and is migrated to Linux, a preferred consolidated layout is:

```text
Linux VPS
├── /opt/baogiang
│   └── baogiang-api.service → configurable loopback port, e.g. 3100
├── /opt/damsan
│   └── damsan-api.service   → configurable loopback port, e.g. 3000
├── PostgreSQL
│   ├── database: baogiang / role: baogiang_app
│   └── database: damsan   / role: damsan_app
└── Nginx
    ├── baogiang.dtnt-damsan.edu.vn → Báo giảng upstream
    └── dtnt-damsan.edu.vn          → Quản lí nội trú upstream
```

The applications may share the PostgreSQL server process and Nginx daemon, but must retain separate databases, roles, directories, services, ports, logs, backups, release histories, and secrets.

Cross-database application access is not allowed by default.

### 6. Quản lí nội trú Linux compatibility is not assumed

Before any 2027 migration, audit the Quản lí nội trú source and runtime for Windows-specific dependencies, including at least:

- hard-coded `C:\...` paths;
- PowerShell or `cmd.exe` execution;
- Scheduled Task assumptions;
- Windows Service assumptions;
- path separator assumptions;
- Windows-only native Node modules;
- COM/Office automation;
- file-system permissions or case-sensitivity assumptions.

If significant Windows-only dependencies exist, migration must either remediate them in a separate reviewed project task or keep Quản lí nội trú on Windows. Consolidation is not mandatory.

### 7. Capacity planning

For Báo giảng alone at the expected school scale, a small Linux VPS in the approximate class of **2 vCPU / 2 GB RAM / 30 GB SSD/NVMe / dedicated IPv4** is a reasonable initial candidate, subject to provider quality and production measurement.

If Quản lí nội trú is later consolidated onto the same host, the target should be reviewed and is expected to require at least roughly:

- 2 vCPU;
- 4 GB RAM;
- 50 GB or more storage.

These are planning baselines, not immutable application requirements. Capacity decisions must use actual monitoring data before migration.

### 8. Backups must survive VPS loss

Application records are expected to be relatively small, but database dumps, attachments, logs and release history accumulate over time.

Each application must have separate backup policy and naming. At least one recoverable backup copy must live outside the same VPS; a backup stored only on the production VPS does not satisfy disaster-recovery requirements.

### 9. Firewall policy remains least-privilege

The existing production practice of restricting network exposure is intentional. A new Linux VPS must not default to broad inbound/outbound access merely for deployment convenience.

Prefer build/package outside production and transfer reviewed artifacts to the VPS. Production should not depend on unrestricted Internet access for `npm install`, `git pull`, Node.js downloads or similar dependency retrieval.

Any administration panel such as Cockpit must be constrained by explicit network/access-control policy.

## 2027 migration gate

A future Quản lí nội trú move to the new VPS must be performed as a separate project/release and must include at minimum:

1. source/runtime portability audit;
2. capacity review from real Báo giảng monitoring;
3. target namespace, port, database/role and reverse-proxy design;
4. non-production rehearsal with a copy of the Quản lí nội trú database;
5. functional verification;
6. final production backup;
7. maintenance window;
8. final database transfer and application cutover;
9. DNS/TLS switch as required;
10. post-cutover health verification for both applications;
11. a documented rollback procedure;
12. retention of the old VPS unchanged for an agreed rollback window before retirement.

No step above is authorized merely by this ADR.

## Consequences

### Positive

- Báo giảng can move between VPS providers/hosts without rewriting business logic.
- A dedicated VPS can remove the current blast-radius coupling with Quản lí nội trú.
- The May 2027 VPS expiry becomes a planned consolidation opportunity rather than an emergency migration.
- Shared infrastructure, where used, has explicit ownership boundaries.
- Linux can be adopted without requiring the operator to rely primarily on terminal-only administration.

### Costs / trade-offs

- Windows and Linux deployment adapters may both need maintenance for some period.
- Quản lí nội trú requires a separate portability audit before Linux migration.
- Shared PostgreSQL/Nginx after consolidation still create host-level coupling and therefore require careful lifecycle operations.
- Off-site backup and controlled administration access add operational work.

## Non-goals

This ADR does not:

- select or purchase a specific VPS provider/plan;
- authorize production deployment;
- authorize migration of Quản lí nội trú;
- require Docker or Kubernetes;
- require Linux if Quản lí nội trú cannot be safely migrated;
- change the current protected-workload rules on the existing VPS.
