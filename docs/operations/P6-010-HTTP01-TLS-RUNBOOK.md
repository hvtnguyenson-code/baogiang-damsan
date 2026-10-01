# P6-010 HTTP-01 / TLS Operator Runbook

## Status

Repository-side authority only. **Do not execute this runbook on production until P6-010 is reviewed, merged, post-merge CI is green, and the applicable production evidence/approval gate authorizes the exact operation.**

Topology: `SHARED_VPS`. DamSanV5 / Quản lí nội trú is a protected neighbour.

## Authority

- requirement: `P6-010-SHARED-VPS-HTTP01-TLS-AUTHORITY.md`
- domain: `baogiang.dtnt-damsan.edu.vn`
- existing final 443 authority remains `production-nginx-plan.ps1` + `production-nginx-verify.ps1`
- P6-010 owns only the additional persistent HTTP-01 include and independent Báo giảng ACME/PEM lifecycle

## Required reviewed inputs

Do not infer these values on production. Obtain them from the later PASS1/PASS2 protected-neighbour inventory and independent review:

- exact Báo giảng production root;
- exact Nginx executable;
- exact Nginx prefix;
- exact main Nginx config;
- exact managed HTTP-01 include path;
- exact managed final TLS include path;
- exact reviewed `ClientMaxBodySize`;
- exact versioned `deployment-common.ps1` authority path and SHA-256;
- operator ACME account email;
- operator-owned evidence/report directory outside all protected roots;
- reviewed win-acme executable/version and dedicated settings/config/log paths.

Any ambiguity is a STOP.

## Phase A — dedicated filesystem/bootstrap plan

Under the separately reviewed Báo giảng root, later Stage 2 bootstrap must create or verify, with isolated ACLs:

- `shared\acme-webroot`;
- `shared\tls`;
- `shared\win-acme`;
- `shared\win-acme-config`;
- `logs\win-acme`.

Install only reviewed Báo giảng-owned bytes:

- reviewed `wacs.exe` under `shared\win-acme`;
- dedicated `settings.json` under the same directory;
- exact repository `production-tls-renewal-hook.ps1` bytes under `shared\tls`.

Do not copy/reuse the Nội trú win-acme config, renewal database, logs, PEM files or scheduled task.

Required `settings.json` identity:

```text
Client.ClientName        = baogiang-win-acme
Client.ConfigurationPath = <root>\shared\win-acme-config
Client.LogPath           = <root>\logs\win-acme
```

This repository task does not create those files/directories on production.

## Phase B — read-only HTTP-01 plan

Run `production-http01-plan.ps1` only with the exact reviewed inputs. It writes a JSON evidence file only.

Acceptable plan states before first issue:

- `READY_FOR_MANUAL_HTTP01_APPLY`; or
- `HTTP01_ALREADY_APPLIED` when the existing managed file is byte-identical.

Stop for any:

- `CONFLICT`;
- domain claim on port 80 or 443 outside the designated Báo giảng files;
- inactive include boundary;
- foreign/invalid win-acme settings;
- renewal-hook hash mismatch;
- authority-common hash mismatch.

Review the exact desired HTTP-01 bytes and plan SHA-256 before any production mutation.

## Phase C — manual HTTP-01 include apply

Under a separate explicit production approval:

1. manually write only the exact planned Báo giảng HTTP-01 managed include;
2. do not edit the main Nginx config or neighbour include files;
3. run `production-http01-verify.ps1` against the reviewed plan SHA;
4. require `PASS / EXACT_HTTP01_AUTHORITY_VERIFIED`;
5. require the exact reviewed Nginx syntax test to pass;
6. only then manually execute the exact Nginx reload vector reviewed in the plan.

After reload, verify the protected neighbour remains healthy before proceeding.

## Phase D — first certificate issuance

Only after DNS for `baogiang.dtnt-damsan.edu.vn` points to the reviewed host and the persistent HTTP-01 include is verified/reloaded:

1. execute only the reviewed win-acme first-issue vector from the P6-010 plan;
2. the command must contain `--notaskscheduler`;
3. it must target only renewal id `baogiang-damsan`;
4. filesystem validation must use the dedicated Báo giảng webroot;
5. PEM storage must use the dedicated Báo giảng TLS directory;
6. the post-certificate hook must be the exact reviewed installed hook.

Expected PEM leaves:

- `baogiang-chain.pem`;
- `baogiang-key.pem`.

On this first issuance, the 443 Báo giảng managed include is intentionally still missing. The hook must return:

`FIRST_ISSUE_CERT_READY_NO_RELOAD`

A reload at this point is unexpected and is a STOP.

## Phase E — final 443 activation

After the dedicated PEM files exist:

1. generate the existing `production-nginx-plan.ps1` using the dedicated cert/key paths;
2. obtain independent review of its exact bytes, collision evidence, rollback material and command vectors;
3. manually apply only the planned Báo giảng final 443 include;
4. run `production-nginx-verify.ps1 -Mode Desired`;
5. require `EXACT_NGINX_AUTHORITY_VERIFIED` and passing exact syntax test;
6. under explicit approval, manually execute the exact reviewed reload vector;
7. verify Báo giảng HTTPS/API and protected-neighbour health.

P6-010 does not replace or weaken this existing 443 procedure.

## Phase F — recurring renewal

A dedicated task may be created only later under the production bootstrap task after host task inventory is reviewed.

Reserved identity:

```text
TaskPath: \BaoGiang\
TaskName: BaoGiangTlsRenewal
Action:   <dedicated wacs.exe> --renew --id baogiang-damsan --notaskscheduler
```

The schedule and execution account are not selected in P6-010. They must be chosen only after protected-neighbour discovery proves no collision.

During a due renewal, win-acme performs HTTP-01 using the persistent include, writes the dedicated PEM files, then invokes the pinned hook. The hook reloads the shared Nginx instance only after:

- exact `deployment-common.ps1` path + SHA authority is validated before execution;
- exact final 443 file bytes match the existing canonical Báo giảng generator;
- the exact domain has one and only one 443 owner, the designated Báo giảng file;
- exact Nginx syntax test passes.

Expected successful renewal hook category:

`RENEWED_CERTIFICATE_RELOAD_VERIFIED`

Because Nginx is shared, any hook failure is a fail-closed renewal/reload event and must not be bypassed with a broad manual reload before review.

## Rollback / incident boundary

- P6-010 HTTP-01 include is independent from the final 443 include.
- Do not delete or alter neighbour files during rollback.
- A certificate renewal failure does not authorize replacing/removing the existing working certificate.
- A failed reload attempt does not authorize service restart, host reboot, process kill or Nginx main-config edit.
- Existing TLS monitoring remains unchanged until the registered multi-certificate monitor task is reached.

## Evidence to retain

Retain only redacted/non-secret evidence:

- exact reviewed Git SHA;
- plan/verifier SHA and result categories;
- Nginx syntax-test PASS;
- dedicated win-acme version/path identity;
- dedicated renewal id;
- certificate public metadata/expiry (never private-key contents);
- reload result;
- Báo giảng and protected-neighbour health result.

Never send or commit private keys, ACME account secrets, environment files, passwords, raw connection strings or unrelated neighbour configuration.
