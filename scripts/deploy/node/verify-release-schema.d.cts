import type { Prisma } from '@prisma/client';

export declare function verifyReleaseSchema(
  db: Prisma.TransactionClient,
  inspect: (db: Prisma.TransactionClient) => Promise<{
    fingerprintMatches: boolean;
    enforced: boolean;
    inventoryMatches: boolean;
  }>,
): Promise<void>;
