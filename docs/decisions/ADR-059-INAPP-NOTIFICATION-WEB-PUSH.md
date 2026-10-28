# ADR-059 — Durable per-account in-app notifications and independent Web Push

**Status:** ACCEPTED for architecture only — effective when SYNC-P5-056A merges, not a runtime implementation.  
**Task:** P5-056A; **Traceability:** T55; **Depends on:** P5-050 CLOSED.  
**Baseline:** main@1a90f05b08b2ae189628e2a501dc4e5dc30c1af5.  
**Accepted architecture contract for P5-056 after SYNC merge:** docs/requirements/P5-056A-NOTIFICATION-CENTER-WEB-PUSH-ARCHITECTURE.md.

## Context

PA-B v1.2 requires an enduring account-owned inbox and Web Push. P5-020 supplies installable PWA/service worker but explicitly not Push. P5-030/ADR-058 supplies separate Telegram integration; its TelegramNotificationDelivery is channel-specific, not the inbox. P5-050/T55 reopens the requirement. Existing service-side NotificationPublisherPort and PushGatewayPort are inert contracts, not an implemented product.

## Accepted architecture decision (after SYNC merge)

1. Introduce one **PostgreSQL-persisted InAppNotification per recipient and canonical domain event** as the sole business notification record. Add a database unique recipient+dedupe key; retain source identity, category, safely templated text, readAt and source-confirmed resolvedAt.
2. Keep WebPushSubscription (encrypted endpoint/keys; one per browser installation) and WebPushDelivery outbox/attempt state separate. Web Push/Telegram only deliver reminders; failure, opt-out or inability to install PWA cannot remove/corrupt inbox data.
3. Derive recipients and trusted event contracts server-side from actual committed domain events. Authorize at publication time **and** each list/count/detail/action read based on current capability/resource; do not expose revoked data. Never make notification click approve or change a domain object.
4. Implement durable enqueue/idempotent outbox. Lease workers and bounded retries/dead-letter, while acknowledging ambiguous transport errors may deliver duplicates. Expired subscriptions are revoked without losing notifications.
5. Resolve actions by server-controlled same-origin route allowlist. Push payload is generic without sensitive business data; API uses authenticated same-origin session, CSRF/origin protection and no-store. Service worker must keep /api network-only and P5-020 update semantics.
6. VAPID, endpoint-encryption keys and configuration are **technical runtime secrets**, excluded from Business Configuration. Startup must fail safely on invalid enabled config; feature disabled must not disable inbox. No shared VPS/Telegram/Nội trú keys or services.
7. Retention, audit and deletion follow the bounded P5-056A requirement contract; **unresolved ACTION_REQUIRED notifications must not disappear via fixed TTL** without source-confirmed resolution/cancellation or audited disposition. Authoritative historical/approval records remain in their original business domains, not in the notification ledger. Fail-closed authorization applies when source evidence is missing.
8. Browser notification permission/support is client-owned state, never asserted by a server configuration endpoint. Shared-device logout/account-switch must revoke the old account's subscription server-side for that installation, independent of browser unsubscribe success, without affecting other devices.

## Rejected alternatives

- Reuse Telegram delivery rows for inbox — channel coupling, insufficient per-account read/handled semantics.
- Client-only or browser-storage inbox — data loss on logout/device change and cross-user leakage.
- Send Push first then create notification — notification loss on provider failure.
- Use notification arrival as proof that work was approved/completed — violates domain authority.
- Store Web Push secrets in business configuration or hardcode push endpoints — violates technical-secret isolation.
- Cache /api or queue offline business mutations in service worker — violates P5-020.

## Consequences and implementation dependency

P5-056 will add Prisma migration and audited backend/worker/frontend pieces, requiring exact source event mapping, authorization negative/race tests, retry/cleanup probes, Workbox/PWA compatibility, and user/device acceptance. P5-057 persona E2E and P6-050 teacher pilot remain separate mandatory gates. This ADR **creates no runtime implementation** and is not authorization to migrate or deploy.

## Governance

Parent PR #255 merged at `da6b4f42ac091d4d707ca6eb3e7fbed5f8136835`; exact-head CI #849 and authoritative main CI #850 SUCCESS, reviewer COMMENT `5676503379` by the same document author (not a third-party review). This ADR is accepted as an architecture decision via the one non-recursive SYNC-P5-056A, not as deployed notification functionality. New semantics beyond T55 need separate task registration.
