# P6-005 — Production VPS Topology Decision Closure

## Status

`IN_REVIEW`

## Canonical start

- `main@2d6cb02d4bf9bb4529e0e8eaf83e10d6a67ef043`
- branch: `docs/p6-005-shared-vps-topology`
- parent task: `P6-005`
- traceability: `T34`

## Product Owner decision

On 2026-10-01 the Product Owner explicitly selected:

`SHARED_VPS`

This means Báo giảng is intended to coexist on the existing Windows Server 2022 VPS that currently hosts DamSanV5 / Quản lí nội trú. This is an explicit Product Owner authority decision, not an agent inference.

## Read-only host evidence used for the decision

The operator ran a bounded read-only audit and retained the package `VPS_AUDIT_20261001-203544.zip` outside the repository. The package is intentionally not committed because it contains host inventory evidence.

Sanitized evidence:

- Windows Server 2022 Datacenter;
- 6 logical processors;
- 16 GB RAM;
- C: 49.9 GB total / 31.07 GB free at audit time;
- 120-second current sample: host CPU average 6.99%, P95 32.5%, max 43.5%; RAM used average 24.63%; average free RAM approximately 12.35 GB; disk queue effectively zero;
- Nginx retained log, 2026-09-30 19:00–20:00: 63,401 total requests, peak 1,842 requests/minute, 2,431 login requests, 461 change-password requests, zero HTTP 429, 10 HTTP 5xx;
- PostgreSQL retained log for the same window: zero FATAL, zero `too many clients`, zero remaining-connection-slot errors, zero statement cancellations;
- historical PerfMon CPU/RAM samples were not available for the peak hour, so no historical peak CPU/RAM utilization claim is made.

## Decision constraints

`SHARED_VPS` does **not** mean shared application authority.

Báo giảng must be isolated by at least:

- dedicated application root;
- dedicated Node/API port;
- dedicated Scheduled Task/startup authority;
- dedicated environment file and secrets boundary;
- dedicated logs and backups;
- dedicated PostgreSQL database;
- dedicated PostgreSQL application role;
- exact Nginx server-block/include authority for the Báo giảng domain;
- independent TLS certificate/renewal/reload lifecycle;
- explicit protected-neighbour evidence for DamSanV5 / Quản lí nội trú.

The existing Nội trú application roots, Node workloads, Scheduled Tasks/services, database resources, Nginx configuration, TLS state and monitoring are protected foreign resources.

## Scope boundary

This task is a topology decision only. It performs no:

- VPS mutation;
- Nginx mutation or reload;
- TLS issuance;
- PostgreSQL authentication, database creation or migration;
- filesystem/ACL/bootstrap mutation;
- Scheduled Task creation/change;
- deployment;
- application restart.

## Downstream effect

After parent merge, authoritative post-merge CI success, independent review and `SYNC-P6-005`:

- `P6-005` may become `CLOSED`;
- `P6-010` may move from `PLANNED` to `READY`;
- `P6-010` must proceed using the shared-host/protected-neighbour branch of the existing production authority;
- `P6-020` remains trigger-gated and must not be pulled forward merely because topology is selected.

## Closure evidence still required

Before `P6-005` can be recorded as `CLOSED`:

1. this docs-only parent task is independently reviewed;
2. exact-head PR CI succeeds;
3. the parent PR is merged normally;
4. authoritative post-merge main CI succeeds on the exact merge SHA;
5. `SYNC-P6-005` records those facts in canonical status surfaces.

Until then, `P6-010` remains non-startable.