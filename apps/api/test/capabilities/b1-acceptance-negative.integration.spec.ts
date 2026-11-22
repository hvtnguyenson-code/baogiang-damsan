import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { B1RoleCommandWriter } from '../../src/capabilities/b1-role-command-writer';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';

const testDatabaseUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = testDatabaseUrl ? describe : describe.skip;

/**
 * Real PostgreSQL negative-path acceptance using an OUTER transaction that is
 * ALWAYS rolled back. The facade deliberately delegates the writer callback
 * to the outer transaction; it does not independently prove nested rollback.
 * Never use against a live or unapproved database.
 */
integration('P5-057 WS1 B1 — real PostgreSQL negative authority invariants', () => {
  const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;
  const rollback = new Error('ISOLATED_B1_NEGATIVE_TEST_ROLLBACK');
  afterAll(async () => db?.$disconnect());

  async function isolated(run: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    if (!db) throw new Error("B1 integration requires certified TEST_DATABASE_URL");
    try {
      await db.$transaction(async (tx) => {
        await run(tx);
        throw rollback;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function fixture(tx: Prisma.TransactionClient, withVerifiedAdminSeat: boolean) {
    const user = (label: string) => tx.user.create({ data: {
      username: `b1-negative-${label}-${randomUUID()}`,
      passwordHash: 'isolated-test-only', status: UserStatus.ACTIVE,
      mustChangePassword: false,
    } });
    const issuer = await user('issuer');
    const actor = await user('actor');
    const target = await user('target');
    const another = await user('another');
    for (const candidate of [target, another]) {
      await tx.staffProfile.create({ data: {
        userId: candidate.id, displayName: 'B1 synthetic staff',
        isTeachingStaff: true,
      } });
    }
    for (const key of [
      'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'AUDIT_VIEW',
    ]) {
      await tx.capabilityDefinition.upsert({
        where: { key }, update: {},
        create: { key, description: 'B1 isolated acceptance fixture',
          allowedScopeTypes: ['SCHOOL_WIDE'], isActive: true, isSystem: true },
      });
    }
    const technical = await tx.authoritySeat.upsert({
      where: { key: 'TECHNICAL_ACCOUNT_ADMIN' },
      update: { enabled: true },
      create: { key: 'TECHNICAL_ACCOUNT_ADMIN', enabled: true, policyVersion: 1n },
    });
    const principal = await tx.authoritySeat.upsert({
      where: { key: 'PRINCIPAL' },
      update: { enabled: true },
      create: { key: 'PRINCIPAL', enabled: true, policyVersion: 1n },
    });
    const before = new Date(Date.now() - 60 * 60 * 1000);
    if (withVerifiedAdminSeat) {
      const issuerCommand = await tx.accessCommand.create({ data: {
        actorUserId: issuer.id, targetUserId: actor.id,
        commandType: 'B1_FIXTURE_TECHNICAL_SEAT', requestKey: randomUUID(),
        fingerprint: 'a'.repeat(64), effectiveAt: before, result: {},
      } });
      await tx.roleAppointment.create({ data: {
        userId: actor.id, seatId: technical.id,
        templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
        templateVersion: 'SYNTHETIC', templateSnapshot: {},
        validFrom: before, createdCommandId: issuerCommand.id,
      } });
    }
    for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT']) {
      await tx.capabilityGrant.create({ data: {
        userId: actor.id, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
        validFrom: before, grantedByUserId: issuer.id,
      } });
    }
    const auth = await tx.authorizationState.findUnique({ where: { id: 'B1_GLOBAL' } });
    const writer = new B1RoleCommandWriter({
      $transaction: async <T>(fn: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> => fn(tx),
    } as unknown as PrismaClient);
    const command = {
      operation: 'APPOINT' as const, role: 'PRINCIPAL' as const,
      targetUserId: target.id,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: (auth?.epoch ?? 0n).toString(),
      requestKey: randomUUID(),
    };
    return { actor, target, another, writer, command, before };
  }

  it('refuses legacy AUDIT_VIEW with coordinateId=NULL without changing grant or creating a B1 command', () =>
    isolated(async (tx) => {
      const f = await fixture(tx, true);
      const legacy = await tx.capabilityGrant.create({ data: {
        userId: f.target.id, capabilityKey: 'AUDIT_VIEW', scopeType: 'SCHOOL_WIDE',
        validFrom: f.before, grantedByUserId: f.actor.id,
      } });
      const grantBefore = await tx.capabilityGrant.findUniqueOrThrow({ where: { id: legacy.id } });
      await expect(f.writer.execute(f.command, { userId: f.actor.id }))
        .rejects.toThrow('LEGACY_OR_FOREIGN_GRANT_NEEDS_RECONCILIATION');
      expect(await tx.capabilityGrant.findUniqueOrThrow({ where: { id: legacy.id } }))
        .toEqual(grantBefore);
      expect(await tx.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } }))
        .toBe(0);
      expect(await tx.grantSource.count({ where: { userId: f.target.id } })).toBe(0);
    }));

  it('denies a technical-grant holder lacking a verifiable B1 Admin appointment', () =>
    isolated(async (tx) => {
      const f = await fixture(tx, false);
      await expect(f.writer.execute(f.command, { userId: f.actor.id }))
        .rejects.toThrow('Không có nguồn chức trách Admin hợp lệ');
      expect(await tx.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } }))
        .toBe(0);
      expect(await tx.grantSource.count({ where: { userId: f.target.id } })).toBe(0);
    }));

  it('rejects stale authorization epoch before writing role evidence', () =>
    isolated(async (tx) => {
      const f = await fixture(tx, true);
      await expect(f.writer.execute({
        ...f.command,
        expectedAuthorizationEpoch: (BigInt(f.command.expectedAuthorizationEpoch) + 1n).toString(),
      }, { userId: f.actor.id })).rejects.toThrow('STALE_AUTHORIZATION_EPOCH');
      expect(await tx.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } }))
        .toBe(0);
      expect(await tx.roleAppointment.count({
        where: { userId: f.target.id, templateKey: 'PRINCIPAL' },
      })).toBe(0);
    }));

  it('rejects a reused requestKey with different target while retaining only the original command', () =>
    isolated(async (tx) => {
      const f = await fixture(tx, true);
      const first = await f.writer.execute(f.command, { userId: f.actor.id });
      expect(first.state).toBe('APPLIED');
      await expect(f.writer.execute({
        ...f.command, targetUserId: f.another.id,
      }, { userId: f.actor.id })).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
      expect(await tx.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } }))
        .toBe(1);
      expect(await tx.grantSource.count({ where: { userId: f.target.id } }))
        .toBe(2);
      expect(await tx.grantSource.count({ where: { userId: f.another.id } }))
        .toBe(0);
    }));
});
