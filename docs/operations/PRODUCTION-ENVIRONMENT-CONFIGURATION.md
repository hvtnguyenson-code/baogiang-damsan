# Production Environment Configuration

This is a contract for the `production` GitHub Environment. It contains no production values. Do not paste secrets, connection strings, private keys, or database dumps into this repository.

## Required secrets

`PROD_SSH_HOST`, `PROD_SSH_PORT`, `PROD_SSH_USER`, `PROD_SSH_PRIVATE_KEY`, and `PROD_SSH_HOST_KEY` are required. `PROD_SSH_HOST_KEY` must be a pinned known-hosts entry obtained through the approved inventory process. `StrictHostKeyChecking=yes` is mandatory.

## Required variables

`PROD_BAOGIANG_ROOT`, `PROD_SERVICE_KIND` (`scheduled-task` or `service`), `PROD_SERVICE_NAME`, `PROD_ENV_FILE`, `PROD_NGINX_EXE`, `PROD_NGINX_CONFIG`, `PROD_PG_DUMP_EXE`, and `PROD_BASE_URL` are required. The workflow accepts only the exact official base URL and validates Windows absolute paths. Service/task names and paths must match the reviewed read-only inventory.

The server-side environment file is the only location for `DATABASE_URL` and runtime secrets. It must have an ACL granting access only to the approved Báo giảng runtime identity and deployment operator. It must contain `NODE_ENV=production`, loopback API binding on port `3100`, `HTTP_TRUST_PROXY_HOPS=1`, secure cookies, the exact domain CORS origin, and AI/Web Push flags set to `false`.

No GitHub secret or variable may contain a database dump, production password in a loggable command, or private key other than the dedicated SSH key secret. Configuration is incomplete until the inventory report identifies every value and confirms isolation from DamSanV5 and boarding-management.
