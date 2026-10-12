# P6-020 — Telegram operator restart notification, phase 1

**Status:** PROPOSED / REVIEW REQUIRED — repo implementation only. **Do not activate on VPS** before separate P6-030 approval.
**Baseline:** `main@a895f4363084865d14a0ee68b512a25ab39ec480`.
**Related:** ADR-058 (dedicated Telegram bot), `P6-020-ISOLATED-SHARED-VPS-ARCHITECTURE.md`, `P6-020-ISOLATION-OPERATIONS-ACCEPTANCE-RUNBOOK.md`.

## Goal and exact scope

Send **one operator notification** only after a **controlled Báo giảng deploy-triggered restart** is verified successful by the deployment controller. In this phase, the operator alert is **one-way**; there are no Telegram commands, user/teacher content, database migrations, schema changes or chat-derived permissions.

A separate **startup observer** is required later to cover boot after Windows restart, manual task restart and unexpected process recovery. **Do not claim coverage of those events from phase 1.** The production environment remains pre-operational and no Telegram bot has been provisioned by this task.

## Reuse the existing bot, separate the operator authority

- **Bot identity** uses Báo giảng's dedicated `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ENABLED` in its reviewed server-side production env; **never** use Nội trú bot secrets.
- **Operator recipient** is configured *outside* the app env allowlist as the file `<PROD_BAOGIANG_ROOT>\shared\operator-telegram-recipient.json`. Exact schema: `{"schemaVersion":1,"enabled":true,"chatId":"12345678"}`. **The chat ID above is a format example, not the operator's actual ID.** Only a verified operator private-chat numeric ID is accepted; no group/channel IDs for this phase.
- This file **must** be provisioned only after separate approval and verified operator authentication. Protect with exact runtime/deploy principal ACL; do not allow Everyone/Users/Authenticated Users write, inherited broad permissions, symlinks/junctions or unexpected extra fields. No chat ID/token in GitHub repo.
- Absence of config => `NOT_CONFIGURED`; `enabled=false` => `DISABLED`. Do not send and do not load the application secret in these cases. Do not add `TELEGRAM_OPERATOR_CHAT_ID` to the strict `.env` contract without a separate reviewed task.

## Ordering and evidence

`invoke-production-deploy.ps1` first restarts **only** `BaoGiangBackend` and executes existing `test-production-health.ps1` (two local API and four HTTPS checks). It sets `overallState='succeeded'` and persists `logs\deploy-report-<sha>.json`.

Only **after** the success report is persisted, `notify-operator-telegram.ps1` verifies:
1. exact `control-<run>-<attempt>-<40hex sha>` event identity and matching report SHA;
2. success state, Scheduled Task restart state `enabled-running`, runtimeRunning, expected port 3100;
3. all **six** required local/API/public HTTPS health results were reported passed;
4. dedicated root and report/recipient/journal are ordinary paths, with ancestor reparse checks.

If any proof is absent or malformed, it **fails closed without sending**. The original deployment result remains authoritative; Telegram failure must never trigger application rollback.

## Idempotency and delivery semantics

The notifier atomically reserves `logs\operator-telegram-<event-id>.json` with `FileMode.CreateNew` and a flushed `PENDING` intent **before** contacting Telegram. Existing journal => `ALREADY_RESERVED` (no resend). A process crash before/after provider delivery or uncertain API acknowledgement remains `PENDING` or `UNKNOWN` and is **not automatically retried**. This prioritizes no duplicate/spam over guaranteed delivery in uncertain outcomes, aligned with ADR-058.

Provider HTTP 4xx (definite rejection) => `REJECTED`; verified HTTP-success body with positive integer Telegram `message_id` => `SENT`; timeout, malformed success ack, 5xx or network failure => `UNKNOWN`. Secrets and untrusted provider errors are never logged. Journal update uses atomic file replacement; if it fails, keep the existing `PENDING` record.

A recipient notification contains only Vietnamese system name, time in Asia/Ho_Chi_Minh, the fact the **deploy restart** succeeded, short commit SHA, `BaoGiangBackend`, API/HTTPS health summary and a safe event ID. No passwords, token, private command line, teacher/student identifiers or raw database error.

## Operating procedure, test gates and limits

1. Keep operator recipient file absent until deployment/bot approval. Prepare exact principal ACL and verify it independently.
2. After HTTPS, API, bot and production environment are approved, enable only the real operator's private chat ID; ensure `TELEGRAM_ENABLED=true` and pre-existing Telegram secrets validation PASS.
3. Run the controlled reviewed deploy, then independently verify the redacted `deploy-report-<sha>.json`, operator delivery journal, GitHub run SHA and receipt on Telegram.
4. Simulate provider denial, timeout and ambiguous ACK in nonproduction before GO. Confirm no duplicate notification on repeat event ID and no coupling to `DamSanV5` task, Node, PostgreSQL 17 or Nginx restart.
5. No notification during unrelated runtime startup unless a separately reviewed observer detects and proves a *new* ready boot identity. No Telegram `/restart`, shell, SQL or control commands in this phase.

**Implementation files:** `scripts/deploy/windows/notify-operator-telegram.ps1`, the verified-success tail of `invoke-production-deploy.ps1`, exact transfer list in `deploy-production.yml`, static/workflow/Windows contract tests. Notifier is best effort and records its delivery disposition independently; deployment success remains based on existing postflight checks.

**NO-GO:** P6-020 PASS 2 has not completed, P6-030 has not been authorized. This PR does not touch VPS, DNS, Nginx, TLS, Windows Task Scheduler, PostgreSQL, or existing Nội trú runtime.
