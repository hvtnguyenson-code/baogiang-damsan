import { Prisma } from '@prisma/client';

// Update the subscription first: its row lock serializes with endpoint rebind.
// Retain delivery history while fencing late transport completions with lease CAS.
export async function revokePushSubscriptions(
  tx: Prisma.TransactionClient,
  where: Prisma.WebPushSubscriptionWhereInput,
  reason: string,
) {
  await tx.webPushSubscription.updateMany({ where: { ...where, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.webPushDelivery.updateMany({
    where: { subscription: where, status: { in: ['PENDING', 'LEASED', 'RETRY_WAIT'] } },
    data: { status: 'DEAD', lastErrorCode: reason, leaseOwner: null, leaseUntil: null },
  });
}
