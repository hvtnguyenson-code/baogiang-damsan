import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { B1RoleCommandWriter } from '../../src/capabilities/b1-role-command-writer';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';

const testDatabaseUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = testDatabaseUrl ? describe : describe.skip;

/**
 * Real B1RoleCommandWriter concurrency on separate Prisma connection pools.
 *
 * CRITICAL: The successful writer commits append-only retained evidence.
 * Therefore this test migrates a unique schema in the CI-certified test DB
 * and drops ONLY that generated schema after disconnecting every client.
 * It does not touch public, B1_GLOBAL in public, production or CI/CD config.
 */
integration('P5-057 WS1 B1 — isolated real two-writer APPOINT/TRANSFER races', () => {
  const schemaName = `b1race_${randomUUID().replaceAll('-', '')}`;
  let rootClient: PrismaClient | null = null;
  let client: PrismaClient | null = null;
  let scratchUrl = '';

  beforeAll(async () => {
    if (!testDatabaseUrl || process.env.NODE_ENV !== 'test') {
      throw new Error('B1_RACE_REQUIRES_CERTIFIED_ISOLATED_TEST_DB');
    }
    const url = new URL(testDatabaseUrl);
    if (url.pathname !== '/baogiang_test') {
      throw new Error('B1_RACE_REQUIRES_EXACT_BAOGIANG_TEST_DB');
    }
    rootClient = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await rootClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    url.searchParams.set('schema', schemaName);
    scratchUrl = url.toString();

    const root = resolve(__dirname, '../../../..');
    const cli = resolve(root, 'node_modules/prisma/build/index.js');
    const migrated = spawnSync(process.execPath,
      [cli, 'migrate', 'deploy', '--schema', resolve(root, 'prisma/schema.prisma')],
      {
        cwd: root,
        env: { ...process.env, DATABASE_URL: scratchUrl },
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    if (migrated.status !== 0) {
      // Never print a URL or credential from migration subprocess output.
      throw new Error(`B1_SCRATCH_SCHEMA_MIGRATION_FAILED: status=${migrated.status}, signal=${migrated.signal ?? 'none'}`);
    }
    client = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
    await client.$connect();
  }, 150_000);

  afterAll(async () => {
    try {
      await client?.$disconnect();
      // The name is internally generated and contains only [a-z0-9_].
      if (rootClient && /^b1race_[0-9a-f]{32}$/.test(schemaName)) {
        await rootClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      }
    } finally {
      await rootClient?.$disconnect();
    }
  }, 60_000);

  async function fixture(db: PrismaClient) {
    const person = (label: string) => db.user.create({ data: {
      username: `b1-race-${label}-${randomUUID()}`,
      passwordHash: 'test-only', status: UserStatus.ACTIVE, mustChangePassword: false,
    } });
    const issuer = await person('issuer');
    const actor = await person('admin');
    const candidates = await Promise.all([
      person('candidate1'), person('candidate2'), person('candidate3'), person('candidate4'),
    ]);
    for (const candidate of candidates) {
      await db.staffProfile.create({ data: {
        userId: candidate.id, displayName: 'Isolated B1 race staff', isTeachingStaff: true,
      } });
    }
    for (const key of [
      'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'AUDIT_VIEW',
    ]) {
      await db.capabilityDefinition.create({ data: {
        key, description: 'B1 race fixture', allowedScopeTypes: ['SCHOOL_WIDE'],
        isActive: true, isSystem: true,
      } });
    }
    const techSeat = await db.authoritySeat.create({ data: {
      key: 'TECHNICAL_ACCOUNT_ADMIN', enabled: true, policyVersion: 1n,
    } });
    const principalSeat = await db.authoritySeat.create({ data: {
      key: 'PRINCIPAL', enabled: true, policyVersion: 1n,
    } });
    const before = new Date(Date.now() - 3_600_000);
    const origin = await db.accessCommand.create({ data: {
      actorUserId: issuer.id, targetUserId: actor.id,
      commandType: 'B1_SYNTHETIC_TECHNICAL_APPOINTMENT',
      requestKey: randomUUID(), fingerprint: 'a'.repeat(64),
      effectiveAt: before, result: {},
    } });
    await db.roleAppointment.create({ data: {
      userId: actor.id, seatId: techSeat.id, templateKey: techSeat.key,
      templateVersion: 'B1-TEST', templateSnapshot: {}, validFrom: before,
      createdCommandId: origin.id,
    } });
    for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT']) {
      await db.capabilityGrant.create({ data: {
        userId: actor.id, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
        grantedByUserId: issuer.id, validFrom: before,
      } });
    }
    await db.authorizationState.create({ data: { id: 'B1_GLOBAL', epoch: 0n } });
    return { actor, candidates, principalSeat };
  }

  async function race<T>(
    left: (writer: B1RoleCommandWriter) => Promise<T>,
    right: (writer: B1RoleCommandWriter) => Promise<T>,
  ): Promise<PromiseSettledResult<T>[]> {
    let arrived = 0;
    let release!: () => void;
    let timer!: ReturnType<typeof setTimeout>;
    const gate = new Promise<void>((resolveGate, rejectGate) => {
      timer = setTimeout(() => rejectGate(new Error('B1_TWO_TX_BARRIER_TIMEOUT')), 7000);
      release = () => { clearTimeout(timer); resolveGate(); };
    });
    const makeWriter = (db: PrismaClient): B1RoleCommandWriter =>
      new B1RoleCommandWriter({
        $transaction: async <R>(
          callback: (tx: Prisma.TransactionClient) => Promise<R>,
          options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
        ): Promise<R> => db.$transaction(async (tx) => {
          arrived += 1;
          if (arrived === 2) release();
          await gate; // both real SERIALIZABLE transactions are already open
          return callback(tx);
        }, options),
      } as unknown as PrismaClient);

    const urls = [scratchUrl, scratchUrl];
    const leftClient = new PrismaClient({ datasources: { db: { url: urls[0] } } });
    const rightClient = new PrismaClient({ datasources: { db: { url: urls[1] } } });
    try {
      await Promise.all([leftClient.$connect(), rightClient.$connect()]);
      return await Promise.allSettled([
        left(makeWriter(leftClient)), right(makeWriter(rightClient)),
      ]);
    } finally {
      clearTimeout(timer);
      await Promise.all([leftClient.$disconnect(), rightClient.$disconnect()]);
    }
  }

  it('commits exactly one APPOINT and one TRANSFER across two simultaneous writers', async () => {
    if (!client) throw new Error('B1_SCRATCH_DB_NOT_READY');
    const f = await fixture(client);
    const actor = { userId: f.actor.id, requestId: 'b1-two-writer-concurrency' };
    const expectedSeatVersion = f.principalSeat.policyVersion.toString();

    const appointment = await race(
      (writer) => writer.execute({
        operation: 'APPOINT', role: 'PRINCIPAL',
        targetUserId: f.candidates[0].id, expectedSeatVersion,
        expectedAuthorizationEpoch: '0', requestKey: randomUUID(),
      }, actor),
      (writer) => writer.execute({
        operation: 'APPOINT', role: 'PRINCIPAL',
        targetUserId: f.candidates[1].id, expectedSeatVersion,
        expectedAuthorizationEpoch: '0', requestKey: randomUUID(),
      }, actor),
    );
    const appliedAppointment = appointment.filter((r) => r.status === 'fulfilled');
    expect(appliedAppointment).toHaveLength(1);
    expect(appointment.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const successfulAppointment = (appliedAppointment[0] as PromiseFulfilledResult<Awaited<ReturnType<B1RoleCommandWriter['execute']>>>).value;
    expect(successfulAppointment.state).toBe('APPLIED');
    expect(await client.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } })).toBe(1);
    expect(await client.roleAppointment.count({
      where: { seatId: f.principalSeat.id, cancelledAt: null, validUntil: null },
    })).toBe(1);
    expect((await client.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(1n);

    const transferPayload = {
      operation: 'TRANSFER' as const, role: 'PRINCIPAL' as const,
      previousUserId: successfulAppointment.targetUserId,
      expectedAppointmentId: successfulAppointment.appointmentId!,
      expectedSeatVersion, expectedAuthorizationEpoch: '1',
    };
    const transfers = await race(
      (writer) => writer.execute({
        ...transferPayload, targetUserId: f.candidates[2].id,
        requestKey: randomUUID(),
      }, actor),
      (writer) => writer.execute({
        ...transferPayload, targetUserId: f.candidates[3].id,
        requestKey: randomUUID(),
      }, actor),
    );
    expect(transfers.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(transfers.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await client.accessCommand.count({ where: { commandType: 'B1_TRANSFER_ROLE' } })).toBe(1);
    expect(await client.roleAppointment.count({
      where: { seatId: f.principalSeat.id, cancelledAt: null, validUntil: null },
    })).toBe(1);
    const old = await client.roleAppointment.findUniqueOrThrow({
      where: { id: successfulAppointment.appointmentId! },
    });
    expect(old.validUntil).not.toBeNull();
    expect((await client.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(2n);

    // Seed a second, independently evidenced TECHNICAL_DIRECT source on the
    // succeeding Principal's AUDIT_VIEW coordinate. This is a fixture confined
    // to the disposable schema, never the real generic grant ingress.
    const winner = transfers.find((r) => r.status === 'fulfilled') as
      PromiseFulfilledResult<Awaited<ReturnType<B1RoleCommandWriter['execute']>>>;
    const successor = winner.value;
    const independent = await client.$transaction(async (tx) => {
      const auditGrant = await tx.capabilityGrant.findFirstOrThrow({ where: {
        userId: successor.targetUserId, capabilityKey: 'AUDIT_VIEW',
        scopeType: 'SCHOOL_WIDE', revokedAt: null, coordinateId: { not: null },
      } });
      const coordinateId = auditGrant.coordinateId!;
      const coordinate = await tx.accessCoordinate.findUniqueOrThrow({
        where: { id: coordinateId },
      });
      const roleSource = await tx.grantSource.findFirstOrThrow({ where: {
        appointmentId: successor.appointmentId!, coordinateId, kind: 'ROLE_TEMPLATE',
      } });
      const roleRev = await tx.grantSourceRevision.findFirstOrThrow({
        where: { sourceId: roleSource.id }, orderBy: { revision: 'desc' },
      });
      const at = new Date();
      const evidence = await tx.accessCommand.create({ data: {
        actorUserId: f.actor.id, targetUserId: successor.targetUserId,
        commandType: 'B1_TECHNICAL_DIRECT_GRANT', requestKey: randomUUID(),
        fingerprint: 'b'.repeat(64), effectiveAt: at, result: {},
      } });
      const direct = await tx.grantSource.create({ data: {
        coordinateId, userId: successor.targetUserId,
        kind: 'TECHNICAL_DIRECT', createdCommandId: evidence.id,
      } });
      const directRev = await tx.grantSourceRevision.create({ data: {
        sourceId: direct.id, coordinateId, revision: 1n,
        validFrom: at, validUntil: null, disposition: 'ACCEPTED',
        commandId: evidence.id,
      } });
      const updated = await tx.accessCoordinate.updateMany({
        where: { id: coordinateId, version: coordinate.version },
        data: { version: { increment: 1n } },
      });
      expect(updated.count).toBe(1);
      const projection = await tx.grantProjectionRevision.create({ data: {
        coordinateId, version: coordinate.version + 1n,
        commandId: evidence.id, effectiveAt: at,
      } });
      const slice = await tx.grantProjectionSlice.create({ data: {
        projectionRevisionId: projection.id, coordinateId, grantId: auditGrant.id,
        validFromSnapshot: auditGrant.validFrom,
        validUntilSnapshot: auditGrant.validUntil,
      } });
      await tx.grantSupport.createMany({ data: [
        {
          sliceId: slice.id, coordinateId, sourceRevisionId: roleRev.id,
          coveredFrom: roleRev.validFrom, coveredUntil: roleRev.validUntil,
        },
        {
          sliceId: slice.id, coordinateId, sourceRevisionId: directRev.id,
          coveredFrom: directRev.validFrom, coveredUntil: null,
        },
      ] });
      await tx.authorizationState.update({
        where: { id: 'B1_GLOBAL' }, data: { epoch: { increment: 1n } },
      });
      return { grantId: auditGrant.id, coordinateId, directRevisionId: directRev.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const dismissal = await new B1RoleCommandWriter(client).execute({
      operation: 'DISMISS', role: 'PRINCIPAL',
      targetUserId: successor.targetUserId,
      expectedAppointmentId: successor.appointmentId!,
      expectedSeatVersion, expectedAuthorizationEpoch: '3',
      requestKey: randomUUID(),
    }, actor);
    expect(dismissal).toMatchObject({
      state: 'APPLIED', sourcesClosed: 2, grantsRevoked: 1,
    });
    expect((await client.capabilityGrant.findUniqueOrThrow({
      where: { id: independent.grantId },
    })).revokedAt).toBeNull();
    const coordinate = await client.accessCoordinate.findUniqueOrThrow({
      where: { id: independent.coordinateId },
    });
    const latest = await client.grantProjectionRevision.findUniqueOrThrow({
      where: { coordinateId_version: {
        coordinateId: independent.coordinateId, version: coordinate.version,
      } }, include: { slices: { include: { supports: true } } },
    });
    expect(latest.slices).toHaveLength(1);
    expect(latest.slices[0].supports.map((s) => s.sourceRevisionId))
      .toEqual([independent.directRevisionId]);
    expect(await client.roleAppointment.count({
      where: { seatId: f.principalSeat.id, cancelledAt: null, validUntil: null },
    })).toBe(0);
    expect((await client.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(4n);
  }, 70_000);
});
