# P5-056A — In-App Notification Center & Web Push Architecture

**Status:** PLANNED  
**Depends on:** P5-050  
**Traceability:** T55  
**Type:** architecture closure before implementation

## Objective

Restore the original mandatory per-account notification requirement that is not satisfied by the dedicated Telegram integration.

## Required architecture decisions

P5-056A must define before code:

1. durable per-account notification aggregate and retention policy;
2. notification type/category and canonical business source reference;
3. read state;
4. handled/resolved state where meaningful;
5. action/deep-link contract to a real product route;
6. deduplication/idempotency;
7. Web Push subscription lifecycle for multiple devices;
8. delivery attempt/retry/dead-letter policy;
9. privacy/data minimization;
10. capability/scope filtering at creation and read time;
11. relationship to Telegram.

## Locked channel relationship

- In-app notification is the durable user-facing record.
- Web Push is a delivery/reminder channel.
- Telegram is a separate optional integration.
- Failure or disablement of Push/Telegram must not delete or corrupt the in-app notification.
- A notification never grants business authority; opening an action route is still guarded by the normal backend authorization contract.

## Forbidden behavior

- no reuse of Telegram delivery tables as the canonical in-app inbox;
- no secret/token storage in Business Configuration;
- no raw stack/error payload in notifications;
- no automatic approval/mutation merely because a notification was delivered.

## Closure

P5-056 implementation remains blocked until P5-056A architecture is reviewed, merged, post-merge CI passes and documentation sync closes this task.
