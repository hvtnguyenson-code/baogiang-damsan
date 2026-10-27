# P5-056 — In-App Notification Center & Web Push Implementation

**Status:** PLANNED (gated; no implementation before SYNC-P5-056A)  
**Depends on:** P5-056A  
**Traceability:** T55

## Objective

Implement the accepted P5-056A architecture end-to-end.

## Minimum product surfaces

1. Notification center reachable from the signed-in app shell.
2. Unread/read status.
3. Handled/resolved status where defined by notification type.
4. Direct navigation to the authoritative related task.
5. Web Push opt-in/out and multi-device subscription management.
6. Clear delivery status/fallback behavior without exposing provider internals.
7. Accessible empty/loading/error/offline states.

## Minimum backend evidence

- retained notification persistence;
- authorization/data isolation;
- deterministic deduplication;
- idempotent delivery handling;
- subscription expiration/removal;
- retry/dead-letter behavior;
- action target validation;
- audit where business-sensitive;
- no coupling to Telegram account state.

## Acceptance evidence

A user can receive a durable in-app notification, close the browser, log in again, find the same notification, mark it read, navigate to the related authorized task, and optionally receive Web Push on an eligible device. Disabling Push must leave the in-app record intact.


## Handoff contract from P5-056A (proposal; pending acceptance)

P5-056 must implement the accepted versions of ADR-059 and P5-056A requirement. Do not assume they are accepted while the architecture task is IN_REVIEW. The exact module/event mapping is to be verified against domain sources at task start; draft type names do not authorize publishing fictitious events.

Implement **on one P5-056 task branch** through (A) transactional canonical inbox + Prisma migration and dedupe/outbox; (B) multi-device encrypted subscriptions, delivery retry/dead-letter; (C) signed-in Vietnamese inbox and Workbox-safe Push handlers; (D) PostgreSQL isolated, capability negative/race, Playwright and physical device acceptance evidence. Backend writes and schema/migration require MCP/CI execution and an explicit task scope. Keep Telegram integration independent. No production data migration without separate deployment authority.
