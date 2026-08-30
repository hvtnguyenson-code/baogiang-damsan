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

Bootstrap must create `<PROD_BAOGIANG_ROOT>\shared\deployment-identity.json` before any workflow mutation. It contains no secret and must record at least:

```json
{
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

The startup bundle is an immutable bootstrap prerequisite installed together from the reviewed commit, hash-verified and ACL-reviewed before the task/service is created. For a Windows Service, replace the task fields with the exact reviewed service-host executable, `pathName`, and `startName`. A PowerShell script alone is not a Windows Service. The workflow and every mutating script refuse a missing marker, root mismatch, bundle hash mismatch, path mismatch, service/task mismatch, port conflict, protected root, or missing pre-created directory.

## Server-side environment

`PROD_ENV_FILE` is readable only by the approved runtime/deployment identities. It must contain the production values required by `apps/api/.env.example`, including auth/session/lockout/rate-limit/cookie/log settings, but never bootstrap-admin or test-database variables. The startup wrapper rejects duplicate/unknown assignments and validates `NODE_ENV=production`, the explicitly present canonical business timezone `TZ=Asia/Ho_Chi_Minh`, loopback API port `3100`, `HTTP_TRUST_PROXY_HOPS=1`, exact CORS, `AUTH_COOKIE_SECURE=true`, non-empty `DATABASE_URL`, and AI/Web Push flags `false`. A missing, duplicate, or different `TZ` value fails closed; changing the Windows OS timezone is neither required nor authorized.

The workflow never receives `DATABASE_URL`. Backup/migration scripts parse it in memory and pass non-secret PostgreSQL fields as arguments with the password only in short-lived `PGPASSWORD` process environment, cleared in `finally` blocks. Reports contain no URL or credential.
