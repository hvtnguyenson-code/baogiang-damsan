# P6-020 — Preliminary Read-Only Host Evidence (2026-10-12)

**Evidence class:** PRELIMINARY METADATA SNAPSHOT ONLY — **NOT** the formal PASS 1 or PASS 2 report; **NO-GO** for P6-030, deployment, migration, or any host mutation.

**Exact candidate approved by Product Owner for read-only P6-020:** `main@6cea05ab1b952994ceed3dbb5e3b6f320593a7d6` (after PR #208; post-merge main CI run `38203229334` SUCCESS).

**Source:** Authorised connected Windows Server via Desktop Commander, using non-mutating PowerShell inventory commands. Actual host identity and operator-reviewed foreign roots require the formal PASS 1/PASS 2 authority steps. All values are a point-in-time snapshot, not a capacity guarantee.

## 1. Read-only host observations

| Area | Observed metadata | Authority/verdict |
|---|---|---|
| Operating system | Windows Server 2022 Datacenter, build 20348 | Observed |
| CPU/memory | 6 logical processors, 16 GiB RAM; approximately 12.51 GiB free at observation | Snapshot only; not peak evidence |
| Storage | C: approximately 29.6 GiB free | Snapshot only; backup/build headroom unverified |
| Protected project path | `C:\damsan` exists | Root identity/canonical non-reparse chain NOT VERIFIED |
| Protected Scheduled Task | `DamSanV5` Running; action executable `node.exe`; SYSTEM principal | Protected neighbour; NO MUTATION |
| Node TCP listener | Port 3000 bound (IPv6 any), attributable to a `node.exe` command line referencing the DamSan root | Observed process identity only |
| Nginx | `C:\nginx\nginx.exe` running; ports 80 and 443 bound to Nginx process | **Effective prefix/config NOT VERIFIED**; executable path alone is not authority |
| Nginx arguments | Running process metadata did not expose explicit absolute `-p` or `-c` bindings | **NGINX_DISCOVERY_PREFIX_NOT_PROVEN** policy; must be reviewed before PASS 2 |
| PostgreSQL 16 | Service running; loopback listeners 5432 | Present; instance ownership and usage NOT VERIFIED |
| PostgreSQL 17 | Service running; loopback listeners 5433 | Present; protected database, role and CONNECT isolation NOT VERIFIED |
| Reserved Báo giảng API port | No listener observed on 3100 | Does not reserve the port |
| Remote source workspace | `D:\baogiang-damsan` not present | No repo sync or script execution on VPS |
| Sample report sink | `C:\ProgramData\BaoGiang-Audit` did not exist | Merely an inspected candidate; no directory created |

Other Node processes exist; not all were classified. Do not assume every unidentified Node PID is disposable, related to Báo giảng or free to restart.

## 2. Executed operations and exclusions

Read-only operations: Windows CIM operating system/computer/process metadata, filtered TCP listener enumeration, filtered Windows Scheduled Task/service metadata, file-system drive free-space metadata, `Test-Path`, and remote connector configuration inspection. These launched short-lived read-only PowerShell inspection processes.

**Not executed:** Git checkout/file sync to VPS, `production-protected-neighbor-discovery.ps1`, `production-preflight-readonly.ps1`, psql/pg_dump/pg_restore, nginx executable or test/reload, public HTTP/TLS requests, database authentication or SQL, Scheduled Task changes, service/process stop/restart, report file writes, root/ACL creation, migration, deployment, bot/TLS configuration.

No raw process command line, secrets, connection strings, full Nginx configuration, PostgreSQL content or protected database data are included in this document.

## 3. Decision and outstanding formal gates

The Product Owner's P6-020 authorization is valid **for passive read-only discovery of the exact candidate only**. The repository's runbook `docs/operations/PRODUCTION-CD-FIRST-DEPLOY-RUNBOOK.md` remains mandatory.

1. Independently verify exact provenance of both PASS 1 and PASS 2 scripts from the approved commit, and select/review an existing operator-owned ordinary report sink outside all protected roots, repository, Nginx prefix and PostgreSQL data directory, with non-reparse ancestor chain. **NOT VERIFIED**.
2. Execute formal PASS 1 with reviewed script and report sink. It must not authenticate database, invoke tools discovered from PATH, or probe public endpoints. **NOT RUN**.
3. Review PASS 1; derive exact protected roots, process/task/database/role identifiers and authoritative Nginx executable/prefix/config without guessing from the executable directory. Current Nginx `-p` evidence is **NOT VERIFIED**.
4. Execute PASS 2 only with explicit reviewed exact inputs and fail-closed flags. Optional database and public endpoint probes require separate review/authorization. **NOT RUN**.
5. Confirm no root/port/task/account/database/role/config/log/backup/TLS overlaps with protected neighbour before any P6-030 plan. **NOT VERIFIED**.
6. Independently review any PASS 1/PASS 2 redacted outputs and obtain **separate Product Owner approval for P6-030** before any infrastructure mutation.

## 4. Isolation boundary / architecture decision to preserve

No code, data, configuration or service of DamSanV5 may be modified under P6-020. Báo giảng needs separate application root, runtime PID/task, port 3100, secrets, database and role, backup/log lifecycle, domain and TLS ownership. Sharing a PostgreSQL *server process* or a Nginx ingress *instance* is still a shared technical dependency even when databases/roles or server blocks are isolated. Existing P6-005/P6-010 architecture permits a shared-host ingress model; the Product Owner's phrase “only the VPS is shared” must not be silently reinterpreted as proof of physically independent network/DB infrastructure. Resolve any stronger isolation requirement before P6-030 without changing architecture during PASS 1.

**Decision:** Repository candidate **CONDITIONAL GO for P6-020 read-only evidence collection**; **NO-GO** for production bootstrap, migration, first deploy, or teacher pilot at this checkpoint.
