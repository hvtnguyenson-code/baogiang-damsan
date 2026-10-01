# P6-010 — Shared VPS HTTP-01 / TLS Authority

## Status

`IN_PROGRESS`

## Canonical start

- task: `P6-010` Pre-deploy TLS/HTTP-01 authority
- traceability: `T34`
- dependency: `P6-005` — `CLOSED` by `SYNC-P6-005`
- topology: `SHARED_VPS`
- canonical start: `main@2c09969ebd338af6574d9466d4f07dff415f37a4`
- branch: `feat/p6-010-shared-http01-tls-authority`

## Objective

Define and test the repository-side authority required to obtain and renew the independent Báo giảng certificate on the shared Windows Server 2022 host without taking ownership of DamSanV5 / Quản lí nội trú Nginx, certificate, renewal, task, database or application resources.

This task creates **authority and verification tooling only**. It does not access or mutate the production VPS.

## Fixed identity

- domain: `baogiang.dtnt-damsan.edu.vn`
- HTTP validation: ACME HTTP-01 through shared Nginx port 80
- final HTTPS/API authority: existing reviewed Báo giảng Nginx 443 authority
- API upstream remains `127.0.0.1:3100`
- ACME renewal id: `baogiang-damsan`
- dedicated win-acme client name: `baogiang-win-acme`

## Dedicated Báo giảng TLS boundary

Under the reviewed Báo giảng production root, P6-010 reserves:

- `shared\acme-webroot` — HTTP-01 filesystem validation root;
- `shared\tls\baogiang-chain.pem` — certificate + chain consumed by Nginx;
- `shared\tls\baogiang-key.pem` — private key consumed by Nginx;
- `shared\tls\production-tls-renewal-hook.ps1` — stable reviewed post-issuance/renewal hook;
- `shared\win-acme\wacs.exe` — dedicated win-acme executable;
- `shared\win-acme\settings.json` — dedicated client settings;
- `shared\win-acme-config` — dedicated win-acme configuration/renewal/account state;
- `logs\win-acme` — dedicated win-acme logs.

No path above may alias the Nội trú/DamSanV5 application roots, Nginx certificates, renewal state, task state or logs.

## Nginx split authority

P6-010 deliberately does **not** replace the existing reviewed 443 generator/verifier.

### Port 80 — persistent HTTP-01 include

A dedicated managed include owns the exact Báo giảng domain on port 80:

- `/.well-known/acme-challenge/` is served from the dedicated `shared\acme-webroot`;
- all other requests redirect to `https://$host$request_uri`;
- no API proxy, certificate directive or port-443 listener is permitted in this include;
- the include remains active after first issuance so future renewal HTTP-01 challenges do not require temporary Nginx mutation.

The planner/verifier fails closed if the exact domain is already claimed on port 80 by another Nginx server block.

### Port 443 — existing authority retained

The final HTTPS server remains generated and verified by:

- `production-nginx-plan.ps1`;
- `production-nginx-verify.ps1`.

P6-010 does not fork or weaken that authority. Before first issuance, the final Báo giảng 443 managed include must be absent and the exact domain must not already be claimed on port 443. After the certificate exists, the normal 443 plan is generated using the dedicated `baogiang-chain.pem` and `baogiang-key.pem` paths and applied only through its existing reviewed/manual sequence.

## win-acme authority

The unattended first-issue command is generated, not executed, by repository code. It uses:

- manual source for exactly `baogiang.dtnt-damsan.edu.vn`;
- filesystem HTTP-01 validation against the dedicated webroot;
- PEM-file storage with prefix `baogiang`;
- a dedicated post-certificate PowerShell hook;
- explicit renewal id `baogiang-damsan`;
- operator-reviewed ACME account email;
- `--notaskscheduler`.

`--notaskscheduler` is mandatory. P6-010 must not create, update or reuse win-acme's global scheduled task because that task could become shared authority with Nội trú.

The dedicated win-acme `settings.json` must bind:

- `Client.ClientName = baogiang-win-acme`;
- `Client.ConfigurationPath = <Báo giảng root>\shared\win-acme-config`;
- `Client.LogPath = <Báo giảng root>\logs\win-acme`.

The exact installed win-acme version and executable identity remain Stage-1/Stage-2 reviewed evidence; P6-010 does not download or install a binary.

## Renewal and reload lifecycle

The renewal hook receives the exact reviewed Nginx paths plus an exact versioned `deployment-common.ps1` path and SHA-256.

Before consuming that shared authority, the hook:

1. opens the authority file as bytes;
2. hashes those bytes;
3. rejects any SHA mismatch;
4. decodes strict UTF-8 and creates the trusted ScriptBlock from those exact bytes;
5. only then imports the shared Nginx/path authority.

### First issuance

When win-acme has produced the dedicated PEM files but the final Báo giảng 443 managed include is still absent:

- the hook verifies certificate/private-key **metadata/path only**;
- it returns `FIRST_ISSUE_CERT_READY_NO_RELOAD`;
- it does not reload Nginx.

The operator then uses the already-reviewed 443 plan/verifier/manual reload sequence under a separate production approval.

### Later renewal

When the final 443 managed include exists, the hook reloads Nginx only when all of these pass:

- exact dedicated certificate/key leaves exist and are non-reparse;
- the managed 443 file is byte-for-byte equal to the canonical existing Báo giảng Nginx authority for the reviewed request-size value;
- exactly one exact-domain port-443 claim exists and belongs to that managed file;
- the reviewed Nginx syntax test succeeds for the exact executable/prefix/config binding.

Only then may the hook execute the exact shared Nginx reload vector. It never writes Nginx configuration and never reads/hashes private-key contents.

A shared Nginx reload re-reads all server blocks, so collision and exact-authority verification are mandatory immediately before reload.

## Dedicated renewal task contract

The eventual renewal task is reserved as:

- task path: `\BaoGiang\`;
- task name: `BaoGiangTlsRenewal`;
- action: exact dedicated `wacs.exe --renew --id baogiang-damsan --notaskscheduler` vector;
- schedule: **not chosen by P6-010**.

The exact schedule/account/task creation is intentionally deferred to `P6-030` after protected-neighbour discovery so the project does not invent a schedule that may collide with existing host maintenance/renewal jobs.

P6-010 code only describes this task contract; it does not create or change any Scheduled Task.

## Protected-neighbour invariants

P6-010 must not:

- modify the active main Nginx configuration;
- modify any existing Nội trú server block/include;
- read or alter an Nội trú certificate/private key;
- reuse Nội trú ACME configuration/account/renewal state implicitly;
- create/update a global win-acme task;
- create/update any Windows Scheduled Task;
- reload Nginx during planning or verification;
- access PostgreSQL;
- create the Báo giảng production root/directories;
- issue a real certificate;
- access the VPS.

## Repository deliverables

- `scripts/deploy/windows/p6-010-http01-tls-common.ps1`
- `scripts/deploy/windows/production-http01-plan.ps1`
- `scripts/deploy/windows/production-http01-verify.ps1`
- `scripts/deploy/windows/production-tls-renewal-hook.ps1`
- `scripts/ci/test-p6-010-http01-windows.ps1`
- Windows CI wiring through the existing `test:deploy:windows` command
- this contract and the P6-010 operator runbook

## Required regression evidence

Before review/merge:

- all PowerShell files parse and do not write reserved/constant variables;
- canonical HTTP-01 include contains port 80 challenge + HTTPS redirect only;
- exact-domain port-80 and port-443 collisions fail closed, including normalized case/trailing-dot identity;
- dedicated win-acme settings reject foreign client/config/log identity;
- first-issue vector uses filesystem HTTP-01, PEM files, pinned renewal hook and `--notaskscheduler`;
- renew vector targets only renewal id `baogiang-damsan` and still uses `--notaskscheduler`;
- hook verifies authority hash before ScriptBlock creation;
- hook verifies Nginx syntax before reload;
- planner/verifier remain read-only;
- hook has no Nginx-config or Scheduled-Task mutation path and never reads private-key contents;
- existing Windows deployment fixtures remain green;
- full canonical CI succeeds on exact PR head.

## Closure boundary

A green P6-010 repository task establishes **how** shared-host first certificate and renewal are to be performed safely. It is not evidence that the production host currently satisfies those assumptions.

Actual protected-neighbour discovery, exact Nginx/win-acme/port/path inventory and read-only production preflight remain the separately gated P6 production-evidence path. No certificate issuance, Nginx mutation/reload, task mutation or deployment is authorized by merging P6-010.
