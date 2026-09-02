# Production Stage 2 Bootstrap Readiness

## Current repository verdict

- **REPOSITORY STAGE 2 AUTHORITY = CLOSED**
- **OPERATOR EVIDENCE TOOLING = CLOSED CANDIDATE**
- **PRODUCTION STAGE 2 = NO-GO / ACTUAL VPS EVIDENCE REQUIRED**

This verdict is repository-only. No VPS, production filesystem, Nginx, PostgreSQL, Scheduled Task, public endpoint, deployment, or migration was accessed by O1. Green CI does not prove the production host is ready.

## Canonical authority now present

The repository has one strict `deployment-identity.json` schema (`schemaVersion: 1`) and one shared executable reader. Unknown, missing, empty, wrong-type, wrong-layout, hash-mismatched, or reparse-routed authority fails closed. Marker validation binds exact Node, Nginx, environment, entry point, service/task, foreign isolation, and immutable startup-bundle paths/hashes.

The standalone environment validator performs value-free validation without requiring `current`, the marker, Node, Nginx, PostgreSQL, or runtime activation. Production variables cannot be satisfied by inherited ambient state.

Scheduled Task first-deploy authority is closed: verify exact task contract, explicitly authorize enable, re-verify, start, prove exact runtime/port, and fail-safe disable/stop on failure. Current first deploy supports `scheduled-task` only; generic Windows Service code is not accepted as first-deploy authority.

Root/ACL, immutable startup bundle, Nginx plan/verify, deployment controller, rollback, and P2 pre-transfer handshake consume shared authorities. The handshake verifies exact reviewed common bytes before in-memory execution, validates the full marker with Node/Nginx bindings, and revalidates before creating a transfer directory.

## Operator evidence closure candidate

PASS 1 (`production-protected-neighbor-discovery.ps1`) is passive discovery only:

- shared report-sink and reparse authority;
- no database authentication and no public endpoint request;
- discovered binaries (node, psql, pg_dump, pg_restore, nginx) are not executed (`NOT_EXECUTED`);
- running Nginx executable/`-p`/`-c` candidate derivation; missing `-p` or relative `-p` is reported as `NOT_VERIFIED` (`NGINX_DISCOVERY_PREFIX_NOT_PROVEN` / `NGINX_DISCOVERY_RELATIVE_PREFIX_UNPROVEN`) without inferring prefix from executable directory or reading configuration;
- mixed running Nginx candidates (e.g. 1 proven and 1 unproven) fail closed as `AMBIGUOUS` or `NOT_VERIFIED` without representing any active configuration as uniquely authoritative;
- ambiguity reported instead of selecting a root hint;
- Nginx include and PostgreSQL config reads stop at junction/reparse boundaries;
- final report authorization includes roots discovered during collection;
- conclusion remains `REQUIRES_REVIEW` and Nginx remains `DISCOVERY/PARTIAL` or `NOT_VERIFIED`.

PASS 2 (`production-preflight-readonly.ps1`) records reviewed authority:

- exact absolute Node/npm/npx/psql/pg_dump/pg_restore/Nginx snapshots, separate from PATH-only `discoveryTools`;
- `NginxPrefix` is an exact reviewed input and never derived from `nginx.exe` directory;
- marker verification receives exact `NodeExe`, `NginxExe`, `NginxPrefix`, and `NginxConfig`;
- listener evidence uses the reviewed `ExpectedPostgresPort`;
- database authentication and public HTTP/TLS probing are independent opt-in operations;
- full ambient `libpq` process environment variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGOPTIONS`, `PGSERVICE`, `PGSSLMODE`, `PGSSLNEGOTIATION`, `PGSSLCERTMODE`, `PGGSSENCMODE`, `PGKRBSRVNAME`, `PGLOADBALANCEHOSTS`, etc.) are snapshotted, cleared, and restored in `finally`;
- authenticated database evidence uses structured JSON object output (`json_build_object`) with strict schema and fail-closed property checking;
- foreign database isolation query results are bound to the exact requested database name via `ConvertTo-ReviewedForeignDatabaseEvidence`;
- proves exact identity, extensions/migrations, safe cluster-role flags (`rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, `rolbypassrls`), zero direct role memberships via `pg_auth_members` (`directMembershipCount = 0`), and requested protected-database `CONNECT=false` isolation without connecting to foreign databases;
- final report authorization protects candidate root, repository, Nginx prefix, foreign roots, leaves, and `ReviewedPostgresDataDirectory` after privacy validation and before write.

The executable OPE-P1…OPE-P33 fixtures cover safe sinks, candidate/foreign/discovered-root collisions, junction and target rejection, PATH decoys, marker binding, dynamic PostgreSQL port, probe/DB opt-in, cluster-role and foreign isolation, Nginx include reparse, ambiguous bindings, discovery non-overclaim, Nginx unproven prefix without `-p`, explicit `-p` discovery, passive binaries, zero direct role membership enforcement, structured psql parsing, duplicate/malformed JSON rejection, full `libpq` ambient environment snapshot/restoration, mixed Nginx candidate fail-closed, PASS 2 exact NginxPrefix marker binding, foreign database request/result binding, and PostgreSQL data directory report protection. Existing ACL, PATH, SB, RPT, NGX, XFER, SSH, migration, rollback, and workflow fixtures remain enabled.

## Historical findings — resolved

The following findings described older repository states and are now resolved:

| Historical finding | Exact closure |
|---|---|
| Marker lacked `schemaVersion` and rejected-property semantics | Strict version-1 discriminated schema and fixtures |
| `foreignIsolation` could be empty or weakly typed | Exact nested schema, non-empty reviewed roots, overlap checks |
| Node/Nginx marker bindings were optional | Exact `Read-DeploymentIdentity` inputs and marker comparisons |
| No standalone environment validator | `validate-production-environment.ps1` with isolated value-free validation |
| Scheduled Task activation/recovery was incomplete | Shared authorization, verify-enable-reverify-start, health and safe-stop lifecycle |
| Nginx P1 lacked deterministic authority | Shared effective graph, plan/Desired/Restored verify, neighbor/snapshot/reparse gates |
| P2 handshake used a weaker marker model | Verified common bytes plus shared marker validation before transfer mutation |
| Operator reports trusted parent existence only | Shared full ancestor/target/protected-root report-sink authority |
| PASS 2 treated PATH as reviewed tool authority | Exact reviewed snapshots; PATH is separately labeled discovery only |
| Public endpoint and PostgreSQL evidence could run as initial inventory | Independent explicit opt-in switches; defaults are `NOT_RUN` |

## Remaining operator-only evidence

Before any Stage 2 production mutation, an authorized operator and independent reviewer must establish:

1. stable protected Nội trú state and exact protected roots/task/service/database/role identities;
2. reviewed script provenance from an approved green commit;
3. PASS 1 report from a safe external sink;
4. PASS 2 report with exact reviewed executable, Nginx, runtime and isolation inputs;
5. separately approved database evidence, if required;
6. separately approved public DNS/TLS/HTTP evidence only after exact Nginx/domain review;
7. actual root/ACL, startup bundle, marker, Scheduled Task, environment, Nginx plan/verify, backup and migration evidence.

Any `MISSING`, `NOT_VERIFIED`, `PARTIAL`, `AMBIGUOUS`, or `CONFLICT` affecting a required gate is a stop condition. Do not infer production readiness from repository closure.

## Decision

The code authority required to collect and review Stage 2 evidence is closed in the repository. Actual Production Stage 2 remains **NO-GO** until all operator-only VPS evidence is collected, independently reviewed, and explicitly approved. No deployment or production mutation is authorized by this document.
