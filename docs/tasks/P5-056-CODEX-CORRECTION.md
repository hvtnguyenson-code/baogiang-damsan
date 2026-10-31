CÔNG CỤ THỰC THI: CODEX

# P5-056 / T55 — PR #257 consolidated takeover correction

User-authorized escalation of the existing implementation, following reviews
5722373124, 5722618883 and 5722773426. One existing branch only:
`feat/p5-056-notification-center-webpush`. Starting HEAD:
`39b60d6026b093629ebcafc93750b04be93180f2`; canonical main fetched directly:
`088041952796e9628ae7aeed1026393525e35705`. Working tree was clean.
Dependency P5-056A is CLOSED through SYNC; ADR-059 is accepted architecture.
T55 is not CLOSED; P5-057/T56 and P6-050 remain gated.

Allowed surfaces: notification API/service/registry/transport/PWA worker; minimal
auth session integration and transaction-aware use of the existing capability
evaluator; additive Prisma migration; deletion schema proof and FK inventory
verification; isolated tests; minimal deployment schema verifier and its
control-plane transfer manifests; task/status/traceability and release evidence.
The user's takeover explicitly permits the minimal deploy-script/workflow
changes needed to enforce the gate, superseding the original implementation
prompt's prohibition for this bounded correction.

Invariants: RESTRICT FKs and fail-closed user deletion stay intact. No wildcard
notification authority; validate registered event/action/source and current
resource access at publication/read/count/action/send. Ordinary logout affects
only the authenticated session installation; logout-all affects only that user.
The server cannot retract a provider request already in flight; Push and its
worker must expose fixed generic content only. No secrets/endpoints in logs.
Preserve other devices and retained domain history; no second worker process.

Required evidence: diagnose fingerprint, enforcement and FK inventory separately
on clean migration replays of PG16 and PG17; full API/Web unit, lint/type/build,
Prisma validation/static checks; isolated API integration on both versions;
source/auth/logout/expiry/cross-account/concurrency/pagination negatives;
real loopback Web Push cryptography fixture; PWA static/privacy tests; Windows
release gate fixtures; backup/migration/schema/health/rollback plan and isolated
backup/restore evidence. Tests must not hide failed assertions or fake PASS.

Compatibility/rollback: add nullable session binding and generation columns;
revoke unbound subscriptions while retaining history and requiring fresh opt-in.
Auto-CD remains code-only and must stop on pending migration or unverified
schema before switching release or starting the API. A separately authorized
maintenance deployment must back up, quiesce only Báo giảng, migrate, verify,
switch and health-check. On code rollback keep additive tables and retained
records; do not automatically reverse schema or restore over new data.

Before review synchronize task register/current status/T55 and report actual
gates and exact new HEAD. Commit/push one consolidated checkpoint to PR #257.
Stop for independent GitHub/CI review. No new branch/PR, merge, deploy, production
migration, VPS/Nginx/PostgreSQL service change or Nội trú mutation is authorized.
