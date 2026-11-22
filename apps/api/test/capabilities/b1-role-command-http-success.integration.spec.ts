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
    const legacyPreview = await agent.post('/api/users/' + target.id + '/responsibility-templates/preview')
      .set('Origin', testOrigin).send({ templateKey: 'PRINCIPAL' });
    expect(legacyPreview.status).toBe(200);
    expect(legacyPreview.body.eligibility.isEligible).toBe(false);
    expect(legacyPreview.body.eligibility.reason).toContain('không còn được áp dụng trực tiếp');
    const teacherPreview = await agent.post('/api/users/' + target.id + '/responsibility-templates/preview')
      .set('Origin', testOrigin).send({ templateKey: 'TEACHER' });
    expect(teacherPreview.status).toBe(200);
    expect(teacherPreview.body.eligibility.isEligible).toBe(true);
    const beforeContext = await agent.get('/api/role-appointments/command-context').query({ role: 'PRINCIPAL' });
    expect(beforeContext.status).toBe(200);
    expect(beforeContext.body).toMatchObject({
      role: 'PRINCIPAL', mode: 'READ_ONLY', canConfirm: false,
      commandSubmissionReady: true, verifiedTechnicalSeat: true, activeAppointments: [],
      expectedSeatVersion: '1', expectedAuthorizationEpoch: '0',
    });
    const applied = await agent.post(endpoint).set('Origin', testOrigin).send(input);
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({
      state: 'APPLIED', role: 'PRINCIPAL', operation: 'APPOINT',
      targetUserId: target.id, sourcesOpened: principalKeys.size, grantsCreated: principalKeys.size,
    });
    const namedContext = await agent.get('/api/role-appointments/command-context').query({ role: 'PRINCIPAL' });
    expect(namedContext.status).toBe(200);
    expect(namedContext.body).toMatchObject({
      canConfirm: false, commandSubmissionReady: true, expectedAuthorizationEpoch: '1',
      activeAppointments: [{ appointmentId: applied.body.appointmentId, userId: target.id,
        username: target.username, displayName: 'Synthetic B1 staff' }],
    });
    const replay = await agent.post(endpoint).set('Origin', testOrigin).send(input);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(applied.body);
    // The applied idempotency key must not be reused for a different payload.
    const conflictingTargetReplay = await agent.post(endpoint).set('Origin', testOrigin)
      .send({ ...input, targetUserId: successor.id });
    expect(conflictingTargetReplay.status).toBe(409);
    expect(conflictingTargetReplay.body.message).toBe('IDEMPOTENCY_KEY_CONFLICT');
    const conflictingEpochReplay = await agent.post(endpoint).set('Origin', testOrigin)
      .send({ ...input, expectedAuthorizationEpoch: '1' });
    expect(conflictingEpochReplay.status).toBe(409);
    expect(conflictingEpochReplay.body.message).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(await db.roleAppointment.count({
      where: { userId: successor.id, templateKey: 'PRINCIPAL' },
    })).toBe(0);
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

    // Two separate B1 office sources legitimately support the same
    // SCHOOL_WIDE coordinate in this disposable synthetic test schema.
    // This is NOT authorization for production dual office holding.
    await new Promise((done) => setTimeout(done, 30));
    const overlappingVp = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC',
      targetUserId: vice.id,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '5',
      requestKey: `b1-dual-vp-${randomUUID()}`,
    });
    expect(overlappingVp.status).toBe(200);
    expect(overlappingVp.body.sourcesOpened).toBe(vpKeys.size);

    await new Promise((done) => setTimeout(done, 30));
    const overlappingPrincipal = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'APPOINT', role: 'PRINCIPAL', targetUserId: vice.id,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: '6',
      requestKey: `b1-dual-principal-${randomUUID()}`,
    });
    expect(overlappingPrincipal.status).toBe(200);
    expect(overlappingPrincipal.body.sourcesOpened).toBe(principalKeys.size);

    const shared = await db.capabilityGrant.findFirstOrThrow({ where: {
      userId: vice.id, capabilityKey: 'TIMETABLE_MANAGE',
      scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } });
    expect(shared.coordinateId).not.toBeNull();
    const originalSources = await db.grantSource.findMany({ where: {
      coordinateId: shared.coordinateId!,
      appointmentId: { in: [
        overlappingVp.body.appointmentId, overlappingPrincipal.body.appointmentId,
      ] },
    } });
    expect(originalSources).toHaveLength(2);
    const dualProjection = await db.grantProjectionRevision.findFirstOrThrow({
      where: { coordinateId: shared.coordinateId! },
      orderBy: { version: 'desc' },
      include: { slices: { include: { supports: true } } },
    });
    expect(dualProjection.slices).toHaveLength(1);
    expect(dualProjection.slices[0].supports).toHaveLength(2);

    await new Promise((done) => setTimeout(done, 30));
    const endVp = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'DISMISS', role: 'VICE_PRINCIPAL_ACADEMIC',
      targetUserId: vice.id, expectedAppointmentId: overlappingVp.body.appointmentId,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '7',
      requestKey: `b1-dual-vp-dismiss-${randomUUID()}`,
    });
    expect(endVp.status).toBe(200);
    expect(endVp.body.sourcesClosed).toBe(vpKeys.size);
    expect((await db.capabilityGrant.findUniqueOrThrow({
      where: { id: shared.id },
    })).revokedAt).toBeNull();
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
      scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } })).toBe(0);
    const retainedProjection = await db.grantProjectionRevision.findFirstOrThrow({
      where: { coordinateId: shared.coordinateId! },
      orderBy: { version: 'desc' },
      include: { slices: { include: { supports: true } } },
    });
    expect(retainedProjection.slices).toHaveLength(1);
    expect(retainedProjection.slices[0].supports).toHaveLength(1);
    const principalSource = originalSources.find((source) =>
      source.appointmentId === overlappingPrincipal.body.appointmentId);
    expect(principalSource).toBeDefined();
    const retainedRevision = await db.grantSourceRevision.findFirstOrThrow({
      where: { sourceId: principalSource!.id }, orderBy: { revision: 'desc' },
    });
    expect(retainedProjection.slices[0].supports[0].sourceRevisionId).toBe(retainedRevision.id);

    await new Promise((done) => setTimeout(done, 30));
    const endPrincipal = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'DISMISS', role: 'PRINCIPAL', targetUserId: vice.id,
      expectedAppointmentId: overlappingPrincipal.body.appointmentId,
      expectedSeatVersion: principal.policyVersion.toString(),
      expectedAuthorizationEpoch: '8',
      requestKey: `b1-dual-principal-dismiss-${randomUUID()}`,
    });
    expect(endPrincipal.status).toBe(200);
    expect(endPrincipal.body.sourcesClosed).toBe(principalKeys.size);
    expect((await db.capabilityGrant.findUniqueOrThrow({
      where: { id: shared.id },
    })).revokedAt).not.toBeNull();
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, scopeType: 'PERSONAL', revokedAt: null,
    } })).toBe(personalKeys.length);
    expect((await db.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(9n);

    // Opt-in local continuation of this existing fixture with real Chromium/Nest/PG.
    // The default CI suite stays independent of local browser setup.
    if (process.env.B1_LOCAL_BROWSER_ACCEPTANCE === '1') {
      const { runB1LocalBrowserAcceptance } = await import('../helpers/b1-local-browser-acceptance');
      await runB1LocalBrowserAcceptance({
        app, db, schema, admin, issuer, principal: target, pht: vice, person,
      });
    }

    // G4 independent-source regression: an authorized technical source is
    // emulated ONLY in this disposable schema. This does not approve any
    // production technical-direct issuance or revocation.
    const directG4 = await db.$transaction(async (tx) => {
      const at = new Date();
      const evidence = await tx.accessCommand.create({ data: {
        actorUserId: admin.id, targetUserId: vice.id,
        commandType: 'B1_TECHNICAL_DIRECT_GRANT',
        requestKey: randomUUID(), fingerprint: 'c'.repeat(64),
        effectiveAt: at, result: {},
      } });
      // A prior PHT dismissal has already created the coordinate. Reuse its
      // history and monotonic version, never create a duplicate identity.
      const coordinate = await tx.accessCoordinate.findFirstOrThrow({ where: {
        userId: vice.id, capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
        scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
      } });
      const grant = await tx.capabilityGrant.create({ data: {
        userId: vice.id, capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
        scopeType: 'SCHOOL_WIDE', scopeResourceId: null, coordinateId: coordinate.id,
        validFrom: at, grantedByUserId: admin.id,
      } });
      const source = await tx.grantSource.create({ data: {
        coordinateId: coordinate.id, userId: vice.id, kind: 'TECHNICAL_DIRECT',
        createdCommandId: evidence.id,
      } });
      const revision = await tx.grantSourceRevision.create({ data: {
        sourceId: source.id, coordinateId: coordinate.id,
        revision: 1n, validFrom: at, validUntil: null,
        disposition: 'ACCEPTED', commandId: evidence.id,
      } });
      const projection = await tx.grantProjectionRevision.create({ data: {
        coordinateId: coordinate.id, version: coordinate.version + 1n,
        commandId: evidence.id, effectiveAt: at,
      } });
      const slice = await tx.grantProjectionSlice.create({ data: {
        projectionRevisionId: projection.id, coordinateId: coordinate.id,
        grantId: grant.id, validFromSnapshot: at, validUntilSnapshot: null,
      } });
      await tx.grantSupport.create({ data: {
        sliceId: slice.id, coordinateId: coordinate.id,
        sourceRevisionId: revision.id, coveredFrom: at, coveredUntil: null,
      } });
      const coordinateCas = await tx.accessCoordinate.updateMany({
        where: { id: coordinate.id, version: coordinate.version },
        data: { version: { increment: 1n } },
      });
      expect(coordinateCas.count).toBe(1);
      await tx.authorizationState.update({ where: { id: 'B1_GLOBAL' },
        data: { epoch: { increment: 1n } } });
      return { grantId: grant.id, coordinateId: coordinate.id, revisionId: revision.id };
    });
    const g4Appointment = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'APPOINT', role: 'VICE_PRINCIPAL_ACADEMIC',
      targetUserId: vice.id, expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '10', requestKey: 'b1-http-g4-' + randomUUID(),
    });
    expect(g4Appointment.status).toBe(200);
    expect(g4Appointment.body.sourcesOpened).toBe(vpKeys.size);
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
      scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } })).toBe(1);
    const dualG4 = await db.grantProjectionRevision.findFirstOrThrow({
      where: { coordinateId: directG4.coordinateId }, orderBy: { version: 'desc' },
      include: { slices: { include: { supports: true } } },
    });
    expect(dualG4.slices).toHaveLength(1);
    expect(dualG4.slices[0].supports).toHaveLength(2);

    await new Promise((done) => setTimeout(done, 30));
    const g4Dismissal = await agent.post(endpoint).set('Origin', testOrigin).send({
      operation: 'DISMISS', role: 'VICE_PRINCIPAL_ACADEMIC',
      targetUserId: vice.id, expectedAppointmentId: g4Appointment.body.appointmentId,
      expectedSeatVersion: academic.policyVersion.toString(),
      expectedAuthorizationEpoch: '11', requestKey: 'b1-http-g4-end-' + randomUUID(),
    });
    expect(g4Dismissal.status).toBe(200);
    expect(g4Dismissal.body.sourcesClosed).toBe(vpKeys.size);
    expect((await db.capabilityGrant.findUniqueOrThrow({
      where: { id: directG4.grantId },
    })).revokedAt).toBeNull();
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, scopeType: 'SCHOOL_WIDE', revokedAt: null,
    } })).toBe(1);
    const survivingG4 = await db.grantProjectionRevision.findFirstOrThrow({
      where: { coordinateId: directG4.coordinateId }, orderBy: { version: 'desc' },
      include: { slices: { include: { supports: true } } },
    });
    expect(survivingG4.slices).toHaveLength(1);
    expect(survivingG4.slices[0].supports.map((support) =>
      support.sourceRevisionId)).toEqual([directG4.revisionId]);
    expect(await db.capabilityGrant.count({ where: {
      userId: vice.id, scopeType: 'PERSONAL', revokedAt: null,
    } })).toBe(personalKeys.length);
    expect((await db.authorizationState.findUniqueOrThrow({
      where: { id: 'B1_GLOBAL' },
    })).epoch).toBe(12n);
  }, 300_000);
});
