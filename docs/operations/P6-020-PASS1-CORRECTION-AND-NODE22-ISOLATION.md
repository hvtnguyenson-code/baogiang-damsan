# P6-020 — PASS 1 correction and isolated Node 22 preparation

**Scope:** repository correction only; **NO VPS execution, production resource mutation, or change to the protected DamSanV5 application**.

## Grounded operator evidence (12 October 2026)

- Baseline approved application code: `main@6cea05ab1b952994ceed3dbb5e3b6f320593a7d6`; this is the previously pinned P6-020 candidate. Subsequent documentation merge `ef57bb3042bd995c61aae84f07991c3a1a2cee02` did not change runtime code.
- Formal PASS 1 executed using exact verified baseline Git blobs. Report: `C:\Users\Administrator\Documents\P6-020\reports\p6-020-pass1-protected-neighbor-20261012.json`; SHA-256 `0FA400C017257F25CF5F6EB6D92E5ABEB3BAFCED9C0F4571A4BC2B28D768E9AC`.
- PASS 1 conclusion: `REQUIRES_REVIEW`. Nginx `NOT_VERIFIED` (no explicit absolute runtime `-p`), PostgreSQL metadata `NOT_VERIFIED` with simultaneous 16/17 clusters, and candidate port 3100 `NOT_VERIFIED` despite separate Windows listener enumeration showing zero listeners at inspection time. Some discovered root strings incorrectly spanned multiple drive-qualified paths.
- Independent OS metadata confirms live DamSanV5 Node PID 7992, listening port 3000, and local PostgreSQL 17 connections on port 5433. `C:\Program Files\PostgreSQL\16\bin` and `...\17\bin` are both present. No PostgreSQL authentication or cross-database queries were performed.
- **Runtime version mismatch:** application `.nvmrc` requires **Node 22**; the shared installed `C:\Program Files\nodejs\node.exe` is **Node 20.18.0**. Replacing or upgrading the shared Node binary would risk DamSanV5 and is prohibited.

## PASS 1 correction contract

- Distinguish `FREE` from `NOT_VERIFIED` when a listener enumeration succeeds but has no matching candidate port. Retain `NOT_VERIFIED` on a failed enumeration.
- Bind a requested PostgreSQL port to exactly one listener owner PID and one matching `postgres.exe` process. Read only that process's quoted absolute `-D` data path, and only when it is safely contained and its config port agrees. With no unique mapping, preserve `NOT_VERIFIED` or `CONFLICT` rather than choosing the first PostgreSQL binary/cluster.
- Prevent concatenated drive-qualified substrings from being promoted to candidate roots.
- Preserve the existing strict Nginx `NGINX_DISCOVERY_PREFIX_NOT_PROVEN` policy: task working directory, PID file and config candidate are **corroborating clues only**, never proof of active effective Nginx prefix/config. No Nginx mutation, reload, or script policy downgrade.
- Preserve `PASS 1 = REQUIRES_REVIEW`. Tests must exercise both PostgreSQL 16 and 17 in the same Windows fixture, a free candidate port, a missing PostgreSQL listener, and existing Nginx fail-closed fixtures.

## Host-isolation decision to be made before P6-030

**Node 22:** acquire and verify a separately pinned Node 22 binary/distribution under a dedicated Báo giảng-controlled path, with isolated runtime/deployment account, task and immutable startup contract. Never upgrade or overwrite `C:\Program Files\nodejs`, never reuse `DamSanV5` Scheduled Task, and never change any protected neighbour runtime.

**PostgreSQL:** PostgreSQL 17/5433 is an actively used DamSanV5 dependency. PostgreSQL 16/5432 currently shows no established connections at selected inspection times but cannot be declared unused or allocated without a separate ownership, role, backup and permissions decision. Existing 16/17 services both run as `NetworkService`; independent process/port/data directory alone does not establish Windows identity isolation. No database creation, SQL or service changes under P6-020.

**Nginx/TLS:** Existing Nginx is shared infrastructure. The authoritative effective configuration is not proven under the strict operator contract. Keep `Nginx Auto Start`, ACME renewal and Dam San TLS Monitor unchanged. Without verified prefix/config and an independently reviewed rollback plan, P6-030 remains NO-GO.

**Backup/capacity:** Presence of DamSanV5 backup artifacts does not establish restore validity or current backup recency. Observed RAM/disk headroom is not load-test evidence; the current approximately 50-GB C drive also needs a backup/log retention budget.

## Acceptance and next gate

A passing PR CI and independent reviewer may authorize **a new PASS 1 script candidate**, but not immediate VPS execution. Stop until the exact revised Git commit/bytes, safe report sink, old/new evidence provenance and full script security diff are reviewed. **No PASS 2, deployment, Nginx reload, PostgreSQL operation, TLS issuance, Windows runtime installation or protected-neighbour modification is authorized by this note.**
