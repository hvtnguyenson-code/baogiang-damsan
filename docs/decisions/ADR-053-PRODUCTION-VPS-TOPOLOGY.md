# ADR-053 — Production VPS Topology

- **Status:** Accepted; `P6-005` CLOSED by `SYNC-P6-005`
- **Date:** 2026-10-01
- **Task:** `P6-005` Production VPS topology decision
- **Decision:** `SHARED_VPS`
- **Production OS:** Windows Server 2022
- **Target domain:** `baogiang.dtnt-damsan.edu.vn`

## Context

`P6-005` requires an explicit Product Owner choice between:

- `SHARED_VPS`: Báo giảng coexists on the existing Windows Server 2022 VPS currently hosting DamSanV5 / Quản lí nội trú, with strict neighbour isolation; or
- `DEDICATED_VPS`: a separately rented Windows Server 2022 VPS dedicated to Báo giảng.

No agent may infer this decision from the current infrastructure. On 2026-10-01 the Product Owner explicitly selected `SHARED_VPS` after a read-only capacity audit of the existing host.

## Decision evidence

Operator-held audit package: `VPS_AUDIT_20261001-203544.zip` (not committed because it contains host inventory evidence).

Sanitized decision evidence from that audit:

- host OS: Windows Server 2022 Datacenter;
- 6 logical processors;
- 16 GB RAM;
- system drive: 49.9 GB total, 31.07 GB free (62.3% free) at audit time;
- 120-second live sample at audit time:
  - host CPU average 6.99%, P95 32.5%, maximum 43.5%;
  - RAM used average 24.63%;
  - average free RAM about 12.35 GB;
  - disk queue effectively zero in the sample;
- retained Nginx access-log evidence for 2026-09-30 19:00–20:00:
  - 63,401 requests;
  - 1,842 requests/minute peak;
  - 2,431 login requests;
  - 461 change-password requests;
  - HTTP 429: 0;
  - HTTP 5xx: 10;
- retained PostgreSQL logs for the same hour:
  - FATAL: 0;
  - `too many clients`: 0;
  - remaining connection slot errors: 0;
  - statement cancellation: 0;
  - 6 ERROR lines, including 5 connection reset/receive errors;
- no historical PerfMon capture existed for the peak hour, so the audit does **not** claim measured historical CPU/RAM saturation values for 19:00–20:00.

The evidence supports sufficient current host headroom to proceed with a shared-host design, subject to the mandatory shared-host isolation/TLS/port/database preflight gates below. It does not waive any P6 safety gate.

## Repository closure evidence

- final reviewed parent head: `c9a56a7a3fff613f823c3540463d8bcfaa6442ee`;
- parent PR: #174 (`docs(production): select shared VPS topology`);
- exact-head PR CI: #557 / run `36877744658` — SUCCESS;
- normal merge/main: `5de8ba3b862405c7fcc215021bb5d2f3bb0122f7`;
- authoritative post-merge main CI: #558 / run `36880358944` — SUCCESS;
- parent scope: 8 changed files, all under `docs/**`;
- zero runtime/schema/migration/workflow/deploy-script or production-state mutation;
- no residual correction/re-entry task emerged from review or CI;
- administrative closure: `SYNC-P6-005`.

## Consequences

1. `P6-010` must use **shared-host / protected-neighbour semantics**.
2. Báo giảng must have separate application root, runtime port, Scheduled Task, environment file, logs, backups, database, and database role.
3. Existing DamSanV5 / Quản lí nội trú roots, processes, tasks/services, database resources, Nginx authority, TLS state, and monitoring are protected neighbours and must not be mutated implicitly.
4. Shared Nginx and PostgreSQL may be reused only after exact read-only inventory and isolation evidence proves the selected topology is safe.
5. The current capacity decision does not authorize production deployment, TLS issuance, Nginx reload, database creation/migration, task creation, ACL mutation, or application restart.
6. Storage retention for Báo giảng releases/backups/logs must be bounded so the shared host preserves operating headroom.
7. Quản lí nội trú peak-auth performance (single Node process / bcrypt-heavy login and first-password-change workload, plus observed 404/499 traffic) is a separate optimization concern; it is not treated as proof that the 6-core/16-GB host lacks aggregate capacity.

## Required next gate

`P6-005` is formally CLOSED. `P6-010` is therefore eligible to start on a dedicated branch under the shared-host/protected-neighbour authority above.

`READY` does not itself authorize VPS mutation. P6-010 remains subject to its own branch, review, CI and explicit operational boundaries.

No production mutation is authorized by this ADR.