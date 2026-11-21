import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';

const testDatabaseUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = testDatabaseUrl ? describe : describe.skip;

/**
 * PostgreSQL multi-connection SERIALIZABLE race at the authorization-epoch
 * persistence boundary. This intentionally tests the DB CAS primitive,
 * NOT a full concurrent B1RoleCommandWriter APPOINT/TRANSFER.
 *
 * Uses a unique temporary AuthorizationState row (never B1_GLOBAL).
 * No retained append-only evidence, role appointments, or production rows.
 */
integration('P5-057 B1 — independent PostgreSQL authorization epoch race', () => {
  it('allows exactly one of two transactions that read the same initial epoch to commit', async () => {
    if (!testDatabaseUrl) throw new Error('Certified TEST_DATABASE_URL required');

    const setup = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const first = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const second = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const id = `B1_RACE_${randomUUID()}`;
    let created = false;

    try {
      await setup.authorizationState.create({ data: { id, epoch: 0n } });
      created = true;

      let readyCount = 0;
      let signalReady!: () => void;
      let barrierTimeout!: ReturnType<typeof setTimeout>;
      const bothRead = new Promise<void>((resolve, reject) => {
        barrierTimeout = setTimeout(() => reject(new Error('B1_RACE_BARRIER_TIMEOUT')), 8000);
        signalReady = () => {
          clearTimeout(barrierTimeout);
          resolve();
        };
      });

      const compete = (client: PrismaClient) => client.$transaction(async (tx) => {
        const original = await tx.authorizationState.findUniqueOrThrow({
          where: { id }, select: { epoch: true },
        });
        expect(original.epoch).toBe(0n);
        readyCount++;
        if (readyCount === 2) signalReady();
        await bothRead;
        await tx.authorizationState.update({
          where: { id }, data: { epoch: { increment: 1n } },
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 12000,
      });

      const results = await Promise.allSettled([compete(first), compete(second)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
      expect(failures).toHaveLength(1);
      expect(String(failures[0]?.reason)).toMatch(
        /P2034|serialization|could not serialize|write conflict|deadlock/i,
      );
      const state = await setup.authorizationState.findUniqueOrThrow({ where: { id } });
      expect(state.epoch).toBe(1n);
    } finally {
      if (created) await setup.authorizationState.delete({ where: { id } });
      await Promise.all([setup.$disconnect(), first.$disconnect(), second.$disconnect()]);
    }
  }, 30000);
});
