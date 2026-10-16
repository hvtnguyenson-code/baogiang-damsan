# P5-056 — In-App Notification Center & Web Push Implementation

**Status:** PLANNED  
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
