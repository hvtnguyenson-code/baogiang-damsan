import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
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
    'B1_ROLE_COMMANDS_ENABLED', 'B1_REJECT_GENERIC_SENSITIVE_WRITES',
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
    await db.staffProfile.create({ data: {
      userId: target.id, displayName: 'Synthetic B1 staff', isTeachingStaff: true,
    } });
    for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'AUDIT_VIEW']) {
      await db.capabilityDefinition.create({ data: {
        key, description: 'Isolated B1 HTTP fixture', allowedScopeTypes: ['SCHOOL_WIDE'],
        isActive: true, isSystem: true,
      } });
    }
    const technical = await db.authoritySeat.create({ data: {
      key: 'TECHNICAL_ACCOUNT_ADMIN', enabled: true, policyVersion: 1n,
    } });
    const principal = await db.authoritySeat.create({ data: {
      key: 'PRINCIPAL', enabled: true, policyVersion: 1n,
    } });
    const before = new Date(Date.now() - 3_600_000);
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
      targetUserId: target.id, sourcesOpened: 2, grantsCreated: 2,
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
  }, 60_000);
});
