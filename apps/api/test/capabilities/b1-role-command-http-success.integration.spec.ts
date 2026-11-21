import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { materializeTemplateGrants } from '../../src/capabilities/responsibility-template-catalog';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';
import { testOrigin, testPassword } from '../helpers/phase01-test-harness';

const safeUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = safeUrl ? describe : describe.skip;

/** Successful B1 evidence is append-only. The whole test runs on a generated,
 * separately migrated schema, never on public or production. */
integration('P5-057 B1 — authenticated HTTP successful appointment and replay', () => {
  const schema = `b1http_${randomUUID().replaceAll('-', '')}`;
  const flags = [
    'B1_ROLE_COMMANDS_ENABLED', 'B1_FULL_ROLE_SOURCE_CUTOVER_APPROVED', 'B1_REJECT_GENERIC_SENSITIVE_WRITES',
    'B1_LEGACY_PROVENANCE_RECONCILED', 'B1_PRINCIPAL_POLICY_APPROVED',
    'B1_AUDIT_SOURCE_POLICY_APPROVED', 'B1_PHT_CATALOG_POLICY_APPROVED',
  ] as const;
  const previous = new Map<string, string | undefined>(flags.map((key): [string, string | undefined] => [key, process.env[key]]));
  const httpEnvBefore = new Map<string, string | undefined>(['AUTH_COOKIE_SECURE', 'CORS_ORIGINS'].map((key): [string, string | undefined] => [key, process.env[key]]));
  let rootDb: PrismaClient | null = null;
  let db: PrismaClient | null = null;
  let app: INestApplication | null = null;
  let created = false;

  beforeAll(async () => {
    if (!safeUrl || process.env.NODE_ENV !== 'test') throw new Error('B1_HTTP_CERTIFIED_TEST_DB_REQUIRED');
    const url = new URL(safeUrl);
    if (url.pathname !== '/baogiang_test') throw new Error('B1_HTTP_EXACT_TEST_DB_REQUIRED');
    rootDb = new PrismaClient({ datasources: { db: { url: safeUrl } } });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    const isolatedUrl = url.toString();
    const root = resolve(__dirname, '../../../..');
    const migrated = spawnSync(process.execPath,
      [resolve(root, 'node_modules/prisma/build/index.js'),
        'migrate', 'deploy', '--schema', resolve(root, 'prisma/schema.prisma')],
      { cwd: root, env: { ...process.env, DATABASE_URL: isolatedUrl },
        encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    if (migrated.status !== 0) throw new Error(`B1_SCRATCH_MIGRATION_FAILED:${migrated.status}`);
    for (const key of flags) process.env[key] = 'true';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.CORS_ORIGINS = testOrigin;
    db = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
    await db.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
  }, 160_000);

  afterAll(async () => {
    try {
      await app?.close();
      await db?.$disconnect();
      if (created && rootDb && /^b1http_[0-9a-f]{32}$/.test(schema)) {
        await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await rootDb?.$disconnect();
      for (const [key, value] of [...previous, ...httpEnvBefore]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 60_000);

  it('accepts verified technical issuer, idempotent replay, but rejects stale epoch', async () => {
    if (!app || !db) throw new Error('B1_SCRATCH_UNAVAILABLE');
    const hash = await app.get(PasswordService).hash(testPassword);
    const person = (label: string) => db!.user.create({ data: {
      username: `b1-http-${label}-${randomUUID()}`, passwordHash: hash,
      status: UserStatus.ACTIVE, mustChangePassword: false,
    } });
    const issuer = await person('issuer');
    const admin = await person('admin');
    const target = await person('target');
    const successor = await person('successor');
    const vice = await person('vice');
    const noBaseline = await person('no-baseline');
    for (const candidate of [target, successor, vice, noBaseline]) {
      await db.staffProfile.create({ data: {
        userId: candidate.id, displayName: 'Synthetic B1 staff', isTeachingStaff: true,
      } });
    }
    const principalSpecs = materializeTemplateGrants({ templateKey: 'PRINCIPAL' });
    const vpSpecs = materializeTemplateGrants({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });
    const principalKeys = new Set(principalSpecs
      .filter((spec) => spec.scopeType === 'SCHOOL_WIDE').map((spec) => spec.capabilityKey));
    const vpKeys = new Set(vpSpecs
      .filter((spec) => spec.scopeType === 'SCHOOL_WIDE').map((spec) => spec.capabilityKey));
    vpKeys.add('ADDITIONAL_DUTY_CATALOG_MANAGE');
    const personalKeys = [...new Set([...principalSpecs, ...vpSpecs]
      .filter((spec) => spec.scopeType === 'PERSONAL').map((spec) => spec.capabilityKey))];
    const catalogKeys = new Set([
      'USER_MANAGE', 'CAPABILITY_GRANT', ...principalKeys, ...vpKeys, ...personalKeys,
    ]);
    for (const key of catalogKeys) {
      await db.capabilityDefinition.create({ data: {
        key, description: 'Isolated B1 HTTP fixture', allowedScopeTypes: ['SCHOOL_WIDE', 'PERSONAL'],
        isActive: true, isSystem: true,
      } });
    }
    const technical = await db.authoritySeat.create({ data: {
      key: 'TECHNICAL_ACCOUNT_ADMIN', enabled: true, policyVersion: 1n,
    } });
    const principal = await db.authoritySeat.create({ data: {
      key: 'PRINCIPAL', enabled: true, policyVersion: 1n,
    } });
    const academic = await db.authoritySeat.create({ data: {
      key: 'VICE_PRINCIPAL_ACADEMIC', enabled: true, policyVersion: 1n,
    } });
    const before = new Date(Date.now() - 3_600_000);
    for (const candidate of [target, successor, vice]) {
      for (const key of personalKeys) {
        await db.capabilityGrant.create({ data: {
          userId: candidate.id, capabilityKey: key, scopeType: 'PERSONAL',
          validFrom: before, grantedByUserId: issuer.id,
        } });
      }
    }
    const seed = await db.accessCommand.create({ data: {
      actorUserId: issuer.id, targetUserId: admin.id,
      commandType: 'B1_SYNTHETIC_ADMIN_SEAT', requestKey: randomUUID(),
      fingerprint: 'a'.repeat(64), effectiveAt: before, result: {},
    } });
    await db.roleAppointment.create({ data: {
      userId: admin.id, seatId: technical.id, templateKey: technical.key,
      templateVersion: 'SYNTHETIC', templateSnapshot: {}, validFrom: before,
      createdCommandId: seed.id,
    } });
    for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT']) {
      await db.capabilityGrant.create({ data: {
        userId: admin.id, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
        validFrom: before, grantedByUserId: issuer.id,
      } });
    }
    await db.authorizationState.create({ data: { id: 'B1_GLOBAL', epoch: 0n } });
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ username: admin.username, password: testPassword });
    expect(login.status).toBe(200);
    const input = {
      operation: 'APPOINT', role: 'PRINCIPAL', targetUserId: target.id,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: '0', requestKey: `b1-http-${randomUUID()}`,
    };
    const endpoint = '/api/role-appointments/commands';
    const applied = await agent.post(endpoint).set('Origin', testOrigin).send(input);
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({
      state: 'APPLIED', role: 'PRINCIPAL', operation: 'APPOINT',
      targetUserId: target.id, sourcesOpened: principalKeys.size, grantsCreated: principalKeys.size,
    });
    const replay = await agent.post(endpoint).set('Origin', testOrigin).send(input);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(applied.body);
    expect(await db.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } })).toBe(1);
    expect((await db.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(1n);
    const stale = await agent.post(endpoint).set('Origin', testOrigin)
      .send({ ...input, requestKey: `stale-${randomUUID()}` });
    expect(stale.status).toBe(409);
    expect(await db.accessCommand.count({ where: { commandType: 'B1_APPOINT_ROLE' } })).toBe(1);

    // HTTP handover is a second real B1 transaction with a fresh target.
    await new Promise((done) => setTimeout(done, 30));
    const handover = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'TRANSFER', role: 'PRINCIPAL', targetUserId: successor.id,
      previousUserId: target.id, expectedAppointmentId: applied.body.appointmentId,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: '1', requestKey: `b1-http-transfer-${randomUUID()}`,
    });
    expect(handover.status).toBe(200);
    expect(handover.body).toMatchObject({
      state: 'APPLIED', operation: 'TRANSFER', previousUserId: target.id,
      targetUserId: successor.id, sourcesClosed: principalKeys.size, sourcesOpened: principalKeys.size,
    });
    expect((await db.roleAppointment.findUniqueOrThrow({
      where: { id: applied.body.appointmentId },
    })).validUntil).not.toBeNull();
    expect(await db.roleAppointment.count({ where: {
      seatId: principal.id, validUntil: null, cancelledAt: null,
    } })).toBe(1);

    await new Promise((done) => setTimeout(done, 30));
    const dismissal = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'DISMISS', role: 'PRINCIPAL', targetUserId: successor.id,
      expectedAppointmentId: handover.body.appointmentId,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: '2', requestKey: `b1-http-dismiss-${randomUUID()}`,
    });
    expect(dismissal.status).toBe(200);
    expect(dismissal.body).toMatchObject({
      state: 'APPLIED', operation: 'DISMISS', sourcesClosed: principalKeys.size,
    });
    expect(await db.roleAppointment.count({ where: {
      seatId: principal.id, validUntil: null, cancelledAt: null,
    } })).toBe(0);
    expect(await db.capabilityGrant.count({ where: {
      userId: successor.id, scopeType: 'PERSONAL', revokedAt: null,
    } })).toBe(personalKeys.length);
    expect(await db.capabilityGrant.count({ where: {
      userId: successor.id, scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } })).toBe(0);

    // Separate PO-gated Vice-Principal route (synthetic policies only).
    const vpAppointment = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: vice.id,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '3', requestKey: `b1-http-vp-${randomUUID()}`,
    });
    expect(vpAppointment.status).toBe(200);
    expect(vpAppointment.body).toMatchObject({
      state: 'APPLIED', role: 'VICE_PRINCIPAL_ACADEMIC', sourcesOpened: vpKeys.size,
    });
    await new Promise((done) => setTimeout(done, 30));
    const vpDismissal = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'DISMISS', role: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: vice.id,
      expectedAppointmentId: vpAppointment.body.appointmentId,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '4', requestKey: `b1-http-vp-end-${randomUUID()}`,
    });
    expect(vpDismissal.status).toBe(200);
    expect(vpDismissal.body).toMatchObject({ state: 'APPLIED', sourcesClosed: vpKeys.size });
    expect(await db.roleAppointment.count({ where: {
      seatId: academic.id, validUntil: null, cancelledAt: null,
    } })).toBe(0);
    expect((await db.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(5n);
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, scopeType: 'PERSONAL', revokedAt: null,
    } })).toBe(personalKeys.length);
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } })).toBe(0);
    const missingBaseline = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC',
      targetUserId: noBaseline.id,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '5', requestKey: `b1-http-missing-${randomUUID()}`,
    });
    expect(missingBaseline.status).toBe(409);
    expect(await db.roleAppointment.count({ where: {
      seatId: academic.id, validUntil: null, cancelledAt: null,
    } })).toBe(0);
    expect((await db.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(5n);
  }, 170_000);
});
