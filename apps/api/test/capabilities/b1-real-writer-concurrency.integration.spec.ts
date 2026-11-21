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
  }, 60_000);
});
