# ADR-010 — Hosting portability and staged consolidation

- **Status:** Accepted architectural direction; execution remains gate-controlled
- **Date:** 2026-08-08
- **Scope:** Hosting portability, standalone Linux production, staged Quản lí nội trú migration, future two-application consolidation

## Context

Báo giảng is being completed locally before production bootstrap resumes. The current Windows VPS runs Quản lí nội trú as an active protected production workload. That host must not be used as the experimentation surface for a Linux migration.

Read-only production discovery on 2026-08-08 established the current Quản lí nội trú characteristics, including:

- Windows Server host;
- application root `C:\damsan`;
- Scheduled Task `\DamSanV5` running as `SYSTEM`;
- global Node.js 20 runtime at `C:\Program Files\nodejs\node.exe`;
- application listener on TCP 3000;
- shared Nginx on TCP 80/443;
- established Quản lí nội trú connections to PostgreSQL 17 on loopback TCP 5433.

The project direction is now to create a clean Linux hosting target without forcing an immediate cutover date. The migration is **readiness-based, not calendar-based**.

## Decision

### 1. One Báo giảng codebase, multiple deployment profiles

Báo giảng must remain host-portable. Business/application code must not depend on a particular VPS, operating system, Quản lí nội trú instance, or shared infrastructure identity.

Do not hard-code in application/business code:

- `C:\damsan`;
- `DamSanV5`;
- TCP 3000 or TCP 3100 as immutable business constants;
- current/future VPS hostname or public IP;
- PostgreSQL port 5433 as an application invariant;
- a specific Nginx installation path;
- Windows Scheduled Task or Linux systemd semantics.

Deployment-specific values belong to environment configuration and infrastructure adapters.

### 2. Preferred target: a new standalone Linux VPS

The preferred hosting direction is:

1. provision a new Linux VPS with sufficient headroom and good operational features;
2. deploy Báo giảng there first as the first production workload;
3. operate and monitor Báo giảng independently;
4. keep the existing Windows VPS and Quản lí nội trú production unchanged during this period.

A Linux profile may use:

- Ubuntu Server or another supported Linux distribution;
- dedicated/private Node.js runtime;
- PostgreSQL;
- Nginx or another reverse proxy;
- systemd for service supervision;
- Cockpit or another restricted web administration layer for operator visibility.

Linux is an infrastructure choice. It must not require rewriting the React frontend, NestJS backend, Prisma schema, business rules, or API contracts.

### 3. Báo giảng owns its own namespace

The Báo giảng deployment must have its own:

- application root;
- runtime identity;
- Node.js runtime;
- listener port;
- database and database role;
- environment/secrets;
- logs;
- backups;
- service identity;
- release and rollback directories.

Candidate Linux layout:

```text
/opt/baogiang/
  current/
  releases/
  runtime/
  logs/
  backups/
```

with a dedicated service such as `baogiang-api.service` and a configurable loopback listener.

### 4. Quản lí nội trú remains production on the old VPS until proven ready

During migration preparation:

- the existing Windows Quản lí nội trú remains the canonical production/source of truth;
- the new Linux Quản lí nội trú instance is staging/test only;
- production data must not be independently edited in both instances;
- a copied database may be refreshed into staging for realistic tests;
- staging must disable or isolate production side effects such as real notifications, webhooks, external writes, or production credentials where applicable.

The old VPS must continue operating independently throughout audit, remediation, rehearsal, and acceptance testing.

### 5. Quản lí nội trú Linux compatibility is not assumed

Before staging migration, audit the Quản lí nội trú source and runtime for Windows-specific dependencies, including at least:

- hard-coded `C:\...` paths;
- PowerShell or `cmd.exe` execution;
- Scheduled Task assumptions;
- Windows Service assumptions;
- path separator assumptions;
- Windows-only native Node modules;
- COM/Office automation;
- file-system permission or case-sensitivity assumptions;
- runtime/version assumptions that are no longer supported.

If significant Windows-only dependencies exist, remediate them in a separate reviewed task before Linux acceptance. Consolidation must not be forced merely to satisfy a schedule.

### 6. Staged consolidation topology

After Quản lí nội trú passes portability audit and rehearsal, the preferred final topology is:

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
    └── noitru.dtnt-damsan.edu.vn   → Quản lí nội trú upstream
```

The applications may share the PostgreSQL server process and Nginx daemon, but must retain separate:

- databases and roles;
- directories;
- services;
- ports;
- logs;
- backups;
- release histories;
- secrets.

Cross-database application access is not allowed by default.

### 7. Domain/subdomain plan is established from the beginning

Use dedicated application hostnames so DNS cutover does not depend on application rewrites.

Preferred canonical application names:

- `baogiang.dtnt-damsan.edu.vn` → Báo giảng;
- `noitru.dtnt-damsan.edu.vn` → Quản lí nội trú after final cutover.

During rehearsal, use a clearly non-production hostname such as `noitru-test.dtnt-damsan.edu.vn` for the Linux staging instance.

The existing production Quản lí nội trú hostname remains unchanged until the formal cutover gate. DNS/TLS changes are separate reviewed infrastructure actions.

### 8. Migration timing is readiness-based, not date-locked

No month, year, VPS expiry date, or school calendar date authorizes migration by itself.

Cutover occurs only when all required gates are satisfied. A natural operational boundary such as the end/start of a school year may be preferred because it reduces data-continuity complexity, but it is not a hard-coded deadline.

The direction is fixed; the execution date remains flexible.

### 9. Quản lí nội trú school-year data policy reduces migration complexity

The current operating assumption is that Quản lí nội trú transactional data is primarily school-year scoped and does not need to remain active indefinitely after that school year.

Therefore a future cutover may prefer:

- archive/final-backup the old school-year production database;
- bootstrap a clean new school-year operational dataset on the accepted Linux deployment;
- carry forward only master/configuration data that is genuinely required.

Do not simply destroy the old database without a final recoverable archive. Retention/deletion must follow the confirmed school business policy at the time of cutover.

### 10. Capacity planning

Do not choose the new VPS only by headline CPU/RAM numbers. Prefer provider quality and operational capability, including:

- stable CPU and storage I/O;
- dedicated IPv4;
- rescue/console access;
- snapshot/reinstall capability;
- predictable network quality;
- ability to expand RAM/storage;
- acceptable backup/export options.

For Báo giảng alone, a small Linux VPS can be sufficient. For the final two-application topology, capacity must be chosen from actual Báo giảng monitoring plus Quản lí nội trú test measurements. A planning floor around 4 GB RAM and 50 GB storage may be reasonable, but it is not an immutable application requirement.

### 11. Backups must survive VPS loss

Each application must have separate backup policy and naming. At least one recoverable backup copy must live outside the production VPS.

Before Quản lí nội trú cutover, the backup set must include at minimum:

- database backup that has been restore-tested;
- application/configuration artifacts needed for reconstruction;
- any required uploaded files/data directories;
- DNS/TLS/reverse-proxy reconstruction information;
- documented rollback procedure.

A backup that has never been restore-tested is not sufficient migration evidence.

### 12. Firewall and administration remain least-privilege

A new Linux VPS must not default to broad inbound/outbound access merely for deployment convenience.

Prefer build/package outside production and transfer reviewed artifacts. Production should not depend on unrestricted Internet access for `npm install`, `git pull`, runtime downloads, or similar dependency retrieval.

Any administration panel such as Cockpit must be constrained by explicit network/access-control policy and must not be broadly exposed to the Internet by default.

## Readiness gates for Quản lí nội trú cutover

A final move of Quản lí nội trú to the new Linux VPS is a separate project/release and requires, at minimum:

1. source/runtime portability audit;
2. remediation of blocking Windows-specific dependencies;
3. target namespace, ports, database/role, service and reverse-proxy design;
4. non-production deployment on the new VPS;
5. restore of a copied database and realistic functional testing;
6. side-effect isolation during staging;
7. backup and restore rehearsal;
8. service restart/reboot recovery tests;
9. monitoring/capacity review while Báo giảng remains operational;
10. acceptance of both applications running concurrently on the new VPS;
11. final production archive/backup;
12. approved DNS/TLS cutover;
13. post-cutover verification of both applications;
14. documented rollback path;
15. retention of the old VPS unchanged for an agreed overlap/rollback window before retirement.

No calendar date substitutes for these gates.

## Consequences

### Positive

- Báo giảng gets a clean Linux production environment without risking Quản lí nội trú.
- Quản lí nội trú can be ported and tested for as long as needed while old production remains available.
- The final VPS can host both systems with explicit isolation and lower long-term hosting cost.
- Dedicated hostnames make cutover and future relocation cleaner.
- School-year-scoped Quản lí nội trú data can make the final cutover simpler than continuous dual-database synchronization.
- The migration plan is driven by evidence rather than a rental-expiry deadline.

### Costs / trade-offs

- Two VPSs must coexist during the transition period.
- Final consolidation creates one host-level failure domain for both systems.
- Shared PostgreSQL/Nginx require disciplined lifecycle operations.
- Quản lí nội trú may need portability remediation before Linux acceptance.
- Off-site backup, staging isolation and restore rehearsal add operational work.

## Non-goals

This ADR does not:

- select or purchase a specific VPS provider/plan;
- authorize production deployment;
- authorize Quản lí nội trú migration or cutover;
- lock a migration month/year;
- require Docker or Kubernetes;
- permit simultaneous divergent production writes to old and new Quản lí nội trú databases;
- change the current protected-workload rules on the existing VPS.
