# Production Environment Configuration Contract

This file is a value-free contract. Configure it only after the read-only VPS inventory has been reviewed. Never commit a secret, connection string, private key, database dump, or server-side environment file.

## GitHub Environment

The workflow uses the protected GitHub Environment `production`. Required secrets are:

- `PROD_SSH_HOST`
- `PROD_SSH_PORT`
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`
- `PROD_SSH_HOST_KEY`

`PROD_SSH_HOST_KEY` is exactly one non-wildcard known-hosts entry for the configured host and port, with one supported public-key blob type (`ssh-ed25519`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, or `ssh-rsa`) and a valid base64 payload. Hashed hosts, `@cert-authority`, wildcard patterns, multiline values and mismatched ports are rejected. `ssh-rsa` here names the pinned RSA public-key blob representation; the workflow does not enable SHA-1 `ssh-rsa` signature negotiation or add `HostKeyAlgorithms`/`PubkeyAcceptedAlgorithms` overrides.

Construct this value only after PASS 1 discovery and PASS 2 review have identified the effective `sshd_config`, every configured `HostKey` public companion, its algorithm/SHA256 fingerprint, the actual sshd listening port, and a firewall rule whose protocol/local-port filter matches the agreed configured/listening port set. An active unresolved `Include`, port-set mismatch, missing or malformed `.pub`, unresolved firewall port filter, or private-key-only path remains `PARTIAL`/`NOT_VERIFIED` or `CONFLICT`; never read, copy or report private-key contents and never substitute Internet `ssh-keyscan` for server-side evidence.

Required non-secret variables, all copied from the reviewed inventory, are:

- `PROD_BAOGIANG_ROOT`
- `PROD_SERVICE_KIND` — `scheduled-task` or `service`
- `PROD_SERVICE_NAME`
- `PROD_ENV_FILE`
- `PROD_STARTUP_WRAPPER`
- `PROD_API_ENTRYPOINT`
- `PROD_NODE_EXE`
- `PROD_NPM_EXE`
- `PROD_NPX_EXE`
- `PROD_PSQL_EXE`
- `PROD_PG_DUMP_EXE`
- `PROD_PG_RESTORE_EXE`
- `PROD_NGINX_EXE`
- `PROD_NGINX_CONFIG`
- `PROD_BASE_URL` — exactly `https://baogiang.dtnt-damsan.edu.vn`

Every executable and file path must be an existing Windows absolute leaf path on the VPS. Bare `node`, `npm`, `npx`, `psql`, `pg_dump`, `pg_restore`, or `nginx` values are invalid. The workflow validates safe host/user/service-name syntax, numeric SSH port, dedicated root paths, and exact domain.

PASS 1 tool paths are discovery candidates only. Authenticated PASS 2 database evidence must use the separately reviewed exact absolute `PsqlExe` whose leaf is `psql.exe`; it never resolves the verifier through `PATH`. `PROD_PSQL_EXE` is configured from that reviewed evidence only.

## Dedicated identity marker

Bootstrap must create `<PROD_BAOGIANG_ROOT>\shared\deployment-identity.json` before any workflow mutation. It contains no secret and must conform to this exact versioned schema: no unknown top-level or nested properties are accepted, every displayed field is required, and strings must be non-empty. `schemaVersion` is exactly integer `1`.

```json
{
  "schemaVersion": 1,
  "systemId": "baogiang-damsan",
  "canonicalRoot": "<reviewed absolute root>",
  "domain": "https://baogiang.dtnt-damsan.edu.vn",
  "apiPort": 3100,
  "nodeExe": "<reviewed absolute node.exe>",
  "envFile": "<reviewed server-side env path>",
  "startupWrapper": "<reviewed start-baogiang-api.ps1 path>",
  "entryPoint": "<root>\current\apps\api\dist\apps\api\src\main.js",
  "nginxExe": "<reviewed nginx.exe path>",
  "nginxConfig": "<reviewed nginx config path>",
  "foreignIsolation": {
    "reviewedNginxPrefix": "<reviewed nginx prefix>",
    "reviewedNginxConfig": "<reviewed nginx config>",
    "foreignRoots": ["<reviewed DamSanV5 root>", "<reviewed boarding root>"],
    "bootstrapReportReference": "<redacted reviewed inventory report>"
  },
  "startupBundle": {
    "wrapperPath": "<immutable shared start-baogiang-api.ps1 path>",
    "wrapperSha256": "<reviewed SHA-256>",
    "commonPath": "<immutable shared deployment-common.ps1 path>",
    "commonSha256": "<reviewed SHA-256>"
  },
  "service": {
    "kind": "scheduled-task",
    "name": "BaoGiangBackend",
    "taskPath": "<exact task path>",
    "account": "<exact account>",
    "execute": "<exact PowerShell executable>",
    "arguments": "<exact wrapper arguments>",
    "workingDirectory": "<exact working directory>"
  }
}
```

`foreignIsolation` has exactly `reviewedNginxPrefix`, `reviewedNginxConfig`, `foreignRoots`, and `bootstrapReportReference`. `foreignRoots` is a non-empty JSON array of distinct absolute paths that do not overlap the dedicated root; the reviewed Nginx prefix also must not overlap it. `reviewedNginxConfig` binds exactly to top-level `nginxConfig`. The report reference is never emitted in errors.

`startupBundle` has exactly `wrapperPath`, `wrapperSha256`, `commonPath`, and `commonSha256`; both hashes are 64-character hexadecimal SHA-256 values. The bundle paths bind to the approved wrapper and sibling `deployment-common.ps1` and both files are hash-verified.

For `service.kind: "scheduled-task"`, the exact shape is `kind`, `name`, `taskPath`, `account`, `execute`, `arguments`, and `workingDirectory`. For `service.kind: "service"`, it is exactly `kind`, `name`, `account`, and `pathName`; `account` corresponds to Windows Service `StartName`. The shapes are discriminated and cannot carry each other's fields. A PowerShell script alone is not a Windows Service. The workflow and every mutating script refuse a missing marker, schema mismatch, root mismatch, bundle hash mismatch, path mismatch, service/task mismatch, port conflict, protected root, or missing pre-created directory.

## Server-side environment

`PROD_ENV_FILE` is readable only by the approved runtime/deployment identities. It is the sole authority: inherited Process, User, or Machine environment values never satisfy missing fields. The exact required runtime fields are `NODE_ENV`, `TZ`, `API_HOST`, `API_PORT`, `HTTP_TRUST_PROXY_HOPS`, `DATABASE_URL`, `CORS_ORIGINS`, `AUTH_SESSION_TTL_SECONDS`, `AUTH_LAST_SEEN_UPDATE_SECONDS`, `AUTH_COOKIE_NAME`, `AUTH_COOKIE_PATH`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`, `AUTH_LOCKOUT_THRESHOLD`, `AUTH_LOCKOUT_DURATION_SECONDS`, `AUTH_PASSWORD_MIN_LENGTH`, `AUTH_LOGIN_RATE_LIMIT_MAX`, `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_LOGIN_RATE_LIMIT_MAX_KEYS`, `AI_ENABLED`, `AI_ACTIVE_MODE_ENABLED`, `AI_PASSIVE_MODE_ENABLED`, `WEB_PUSH_ENABLED`, and `LOG_LEVEL`. `AUTH_COOKIE_DOMAIN` is allowed but optional. `TEST_DATABASE_URL` and all `BOOTSTRAP_ADMIN_*` fields are forbidden.

The shared contract parses and validates the complete file before any Process environment change. Unknown, duplicate (including case variants), malformed, missing, blank-required, or invariant-violating assignments fail closed without partial application. Runtime callers restore their prior Process values in `finally` after use; values and snapshots are never reported.

The auth numeric fields are positive integers. Cookie values are validated with the API runtime semantics: `AUTH_COOKIE_NAME` uses the runtime-safe name syntax, `AUTH_COOKIE_PATH` begins with `/`, and `AUTH_COOKIE_SAME_SITE` is `lax`, `strict`, or `none` (case-insensitive). The validated file's `DATABASE_URL` is the only database runtime authority.

Run `scripts\deploy\windows\validate-production-environment.ps1` for Stage 2 validation. It requires only the reviewed env-file path and approved base URL, does not require `current`, marker, Node, PostgreSQL, Nginx, task, or service, and returns only a value-free validation state. Never provide the environment file or its values to ChatGPT, Codex, GitHub, or a report.

The workflow never receives `DATABASE_URL`. Backup/migration scripts parse it in memory and pass non-secret PostgreSQL fields as arguments with the password only in short-lived `PGPASSWORD` process environment, cleared in `finally` blocks. Reports contain no URL or credential.
