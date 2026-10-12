# P6-020 — Đối chiếu VPS trước bootstrap Stage 2 (12/10/2026)

**Status: PASSIVE READ-ONLY EVIDENCE / PARTIAL — NOT PROVISIONED.** This document is an operator evidence handoff, not authorization for production mutation or a successful PASS 2.
**Repository baseline:** main at eacee5dd20cbef11bdc7c6688d785e1f2c3fe56a (merged PR #213).
**Related reports (preserved on VPS):**
- Original PASS 1: C:\Users\Administrator\Documents\P6-020\reports\p6-020-pass1-protected-neighbor-20261012.json; SHA-256 0FA400C017257F25CF5F6EB6D92E5ABEB3BAFCED9C0F4571A4BC2B28D768E9AC.
- Corrected PASS 1: C:\Users\Administrator\Documents\P6-020\reports\p6-020-pass1-corrected-20261012.json; SHA-256 9495494908A6FD037FE5C107A5F9A997A5CE571ABC016F9D3BC6B45DB4388C33.
- Both reports revalidated unchanged on 12/10. PASS 1 overall verdict remains REQUIRES_REVIEW; Nginx remains NOT_VERIFIED.

## 1. Passive host evidence

Read-only PowerShell/CIM/Get-ScheduledTask/Get-NetTCPConnection/filesystem metadata inspection occurred on 12/10/2026, UTC 15:38–15:52. These observations are transient; reconfirm before any infrastructure change.

| Surface | Observed value | Authority / remaining limits |
|---|---|---|
| Operating system | Windows Server 2022 Datacenter | CIM, observation only |
| C: disk | 49.9 GiB total; 29.6 GiB free | Snapshot, **not** production storage budget approval |
| Free physical memory | 12.5 GiB | Snapshot, not peak headroom |
| Candidate Báo giảng root | C:\baogiang MISSING | Not created or reserved |
| Candidate isolated PG data | C:\baogiang-data MISSING | Not created or reserved |
| Alternate BG runtime path | C:\baogiang-runtime MISSING | Existing Node22 design instead uses root\shared\runtimes |
| Candidate task | BaoGiangBackend MISSING | Requires exact runtime principal/action/trigger approval |
| Candidate port 3100 | FREE at observation | No reservation; only 127.0.0.1 should bind when installed |
| Candidate port 3180 | FREE at observation | Not required by current shared-Nginx approach |
| Candidate port 5434 | FREE at observation | Proposed separate PostgreSQL cluster port, not yet allocated |
| Protected Nội trú root | C:\damsan exists | Never modify, stop, move, or reset |
| Other protected roots | C:\damsan-data; C:\damsan-local-artifacts exist | Never modify |
| DamSanV5 task | Running, Windows identity SYSTEM, working directory C:\damsan | Existing production authority: do not modify |
| DamSan Node | C:\Program Files\nodejs\node.exe, port 3000 | PID is transient; observed PID 5400 later on 12/10 (earlier 7992) |
| DamSan PostgreSQL | PostgreSQL17 port 5433, data C:\Program Files\PostgreSQL\17\data | Active connection observed; protected |
| Existing PostgreSQL16 | port 5432, service identity NT AUTHORITY\NetworkService | Presence does not confer permission to reuse or remove |
| Existing PostgreSQL17 | port 5433, service identity NT AUTHORITY\NetworkService | Protected |
| Nginx | Task Nginx Auto Start Running as SYSTEM, C:\nginx\nginx.exe, working directory C:\nginx | Serves shared TCP 80/443; no explicit absolute -p in task arguments |
| DNS | Existing domain NS ns1.matbao.vn / ns2.matbao.vn; public IPv4 observed 103.116.104.44 | DNS snapshot only; future A record baogiang requires explicit operator action |

**Nginx hard stop:** Task working directory, executable directory, a PID file, and the file C:\nginx\conf\nginx.conf **do not prove** the running Nginx effective -p/-c authority under the strict existing contract. Do not change the PASS 1 outcome to VERIFIED from these hints. Nginx current process or task must NOT be modified to force evidence. Plan a separately approved, independently reviewed remediation/change window or alternate supported authority; until then, Nginx plan/verify and fully verified PASS 2 are blocked.

**Protected-neighbour identity note:** PID 5400 differs from an earlier PID 7992. At the later inspection PID 5400 owned TCP 3000, ran the global Node binary and held six established connections to PostgreSQL17/5433; DamSanV5 task was Running. No cause for the PID change has been established; PID drift alone must never authorize process termination or shared task restart.

**Operator safety:** PowerShell commands used for this baseline queried Windows metadata only; no backup, SQL, postgres binary invocation, Nginx executable invocation, port mutation, task restart, DNS change, certificate operation, env/secret read or writes to the protected system. No Báo giảng runtime files were created.

## 2. Evidence classification

**Already demonstrated:** target root absent; candidate task absent; candidate ports currently free; existing protected roots/services/tasks exist; Node 20 shared and PostgreSQL17/5433 are protected; report checksums unchanged.

**Not demonstrated:** compatible private Node22 binary/checksum; dedicated OS identities and exact SIDs; PostgreSQL release package/cluster credentials and restore; effective Nginx runtime prefix/config; ACME renewal impact; admin DNS permission/record contents; TLS; complete foreign roots/roles; GitHub Environment SSH private key/host-key proof; target database/roles/extension; production log ACL; backup/restore viability.

These must remain MISSING, NOT_VERIFIED or NOT_RUN in the formal gate; neither CI green nor this baseline implies a PASS result for them.

## 3. Existing implementation authorities

Use existing scripts rather than a new broad installer:
- Stage 1: production-protected-neighbor-discovery.ps1; production-preflight-readonly.ps1.
- Stage 2 planning: production-root-acl-plan.ps1; production-startup-bundle-plan.ps1; production-nginx-plan.ps1.
- Read-only verification: production-root-acl-verify.ps1; production-startup-bundle-verify.ps1; production-nginx-verify.ps1.
- Canonical schemas, identity, path safety: deployment-common.ps1 and docs/operations/PRODUCTION-ENVIRONMENT-CONFIGURATION.md.
- Deploy and release: invoke-production-deploy.ps1, production GitHub workflow. It must stay disabled/not dispatched until P6-030 authorization.

All of these scripts have strict exact-path/report-sink safety contracts. A generic script or ad-hoc PowerShell to create everything at once is specifically NOT authorized.

## 4. Decision

**P6-020 = IN PROGRESS / evidence collected. PASS 2 = NOT YET RUN IN VERIFIED MODE. P6-030 = NO-GO.**

The next task is a separately reviewed Stage 2 operator input/ACL/identity/Node/PG/Nginx plan. No executable production bootstrap is approved by this file.
