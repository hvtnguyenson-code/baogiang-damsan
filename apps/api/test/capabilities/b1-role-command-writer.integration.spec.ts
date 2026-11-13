import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { B1RoleCommandWriter } from '../../src/capabilities/b1-role-command-writer';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';

const testDatabaseUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = testDatabaseUrl ? describe : describe.skip;

/**
 * Uses an outer SERIALIZABLE transaction for all real PostgreSQL writes.
 * The scoped Prisma facade forwards the writer's transaction to that outer
 * transaction, so the fixture (including append-only B1 evidence) is always
 * rolled back. NEVER run against production or a non-certified test DB.
 *
 * Covers the actual database's append-only/FK/exclusion invariants; separate
 * multi-connection race testing remains a distinct acceptance gate.
 */
integration('P5-057 WS1 staged B1 writer — real PostgreSQL transaction', () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const rollback = new Error('B1 writer isolated fixture rollback');
  afterAll(async () => db.$disconnect());

  async function isolated(run: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    try {
      await db.$transaction(async (tx) => {
        await run(tx);
        throw rollback;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function fixture(tx: Prisma.TransactionClient) {
    const user = async (label: string) => tx.user.create({ data: {
      username: `b1-writer-int-${label}-${randomUUID()}`,
      passwordHash: 'synthetic-fixture-only', status: UserStatus.ACTIVE,
      mustChangePassword: false,
    } });
    const issuer = await user('issuer');
    const actor = await user('actor');
    const target = await user('target');
    const vice = await user('vice');
    for (const person of [target, vice]) {
      await tx.staffProfile.create({ data: {
        userId: person.id, displayName: 'Synthetic teaching staff',
        isTeachingStaff: true,
      } });
    }
    for (const key of [
      'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'AUDIT_VIEW',
      'APPROVAL_VICE_PRINCIPAL', 'ADDITIONAL_DUTY_CATALOG_MANAGE',
    ]) {
      await tx.capabilityDefinition.upsert({
        where: { key }, update: {},
        create: { key, description: 'B1 synthetic integration',
          allowedScopeTypes: ['SCHOOL_WIDE'], isActive: true, isSystem: true },
      });
    }
    const seat = async (key: string) => tx.authoritySeat.upsert({
      where: { key }, update: { enabled: true },
      create: { key, enabled: true, policyVersion: 1n },
    });
    const technical = await seat('TECHNICAL_ACCOUNT_ADMIN');
    const principal = await seat('PRINCIPAL');
    const academic = await seat('VICE_PRINCIPAL_ACADEMIC');
    const now = new Date(Date.now() - 3600_000);
    const seed = await tx.accessCommand.create({ data: {
      actorUserId: issuer.id, targetUserId: actor.id,
      commandType: 'B1_FIXTURE_ADMIN_SEAT', requestKey: randomUUID(),
      fingerprint: 'a'.repeat(64), effectiveAt: now, result: {},
    } });
    await tx.roleAppointment.create({ data: {
      userId: actor.id, seatId: technical.id, templateKey: technical.key,
      templateVersion: 'FIXTURE', templateSnapshot: {}, validFrom: now,
      createdCommandId: seed.id,
    } });
    for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT']) {
      await tx.capabilityGrant.create({ data: {
        userId: actor.id, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
        validFrom: now, grantedByUserId: issuer.id,
      } });
    }
    const state = await tx.authorizationState.findUnique({ where: { id: 'B1_GLOBAL' } });
    return { actor, target, vice, principal, academic, epoch: state?.epoch ?? 0n };
  }

  it('writes immutable Principal command/receipt on actual B1 constraints and rolls back fixtures', () =>
    isolated(async tx => {
      const f = await fixture(tx);
      const prismaFacade = {
        $transaction: async <T>(fn: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> => fn(tx),
      } as unknown as PrismaClient;
      const writer = new B1RoleCommandWriter(prismaFacade);
      const cmd = {
        operation: 'APPOINT' as const, role: 'PRINCIPAL' as const,
        targetUserId: f.target.id, expectedSeatVersion: f.principal.policyVersion.toString(),
        expectedAuthorizationEpoch: f.epoch.toString(), requestKey: randomUUID(),
      };
      const trusted = { userId: f.actor.id, requestId: 'isolated-B1-integration' };
      const receipt = await writer.execute(cmd, trusted);
      expect(receipt).toMatchObject({
        state: 'APPLIED', operation: 'APPOINT',
        sourcesOpened: 2, grantsCreated: 2, sourcesClosed: 0, grantsRevoked: 0,
      });
      const stored = await tx.accessCommand.findUniqueOrThrow({ where: { id: receipt.commandId } });
      expect(stored.result).toEqual(receipt);
      expect(await writer.execute(cmd, trusted)).toEqual(receipt);
      expect(await tx.roleAppointment.count({
        where: { seatId: f.principal.id, validUntil: null, cancelledAt: null },
      })).toBe(1);
      const supports = await tx.grantSupport.count({
        where: { slice: { projection: { commandId: receipt.commandId } } },
      });
      expect(supports).toBe(2);
    }));

  it('allows two distinct vice-principals under the new exclusion constraint', () =>
    isolated(async tx => {
      const f = await fixture(tx);
      const writer = new B1RoleCommandWriter({
        $transaction: async <T>(fn: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> => fn(tx),
      } as unknown as PrismaClient);
      const expectedSeatVersion = f.academic.policyVersion.toString();
      const trusted = { userId: f.actor.id, requestId: 'isolated-vice-test' };
      const one = await writer.execute({
        operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC',
        targetUserId: f.target.id, expectedSeatVersion,
        expectedAuthorizationEpoch: f.epoch.toString(), requestKey: randomUUID(),
      }, trusted);
      expect(one.sourcesOpened).toBe(2);
      const two = await writer.execute({
        operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC',
        targetUserId: f.vice.id, expectedSeatVersion,
        expectedAuthorizationEpoch: (f.epoch + 1n).toString(), requestKey: randomUUID(),
      }, trusted);
      expect(two.sourcesOpened).toBe(2);
      expect(await tx.roleAppointment.count({
        where: { seatId: f.academic.id, validUntil: null, cancelledAt: null },
      })).toBe(2);
      expect(await tx.grantSource.count({
        where: { createdCommandId: { in: [one.commandId, two.commandId] } },
      })).toBe(4);
    }));
});
