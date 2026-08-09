import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { CatalogsService } from '../../src/catalogs/catalogs.service';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const integration = testDatabaseUrl ? describe : describe.skip;
const origin = 'http://127.0.0.1:5173';
const password = 'CatalogIntegrationPassword9';
const domainActions = [
  'SUBJECT_GROUP_CREATED', 'SUBJECT_GROUP_UPDATED', 'SUBJECT_GROUP_ACTIVATED', 'SUBJECT_GROUP_DEACTIVATED',
  'SUBJECT_CREATED', 'SUBJECT_UPDATED', 'SUBJECT_ACTIVATED', 'SUBJECT_DEACTIVATED',
];

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) collectObjectKeys(item, keys);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    keys.add(key.toLowerCase()); collectObjectKeys(item, keys);
  }
  return keys;
}

integration('Catalog APIs (isolated PostgreSQL integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwords: PasswordService;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = testDatabaseUrl;
    process.env['NODE_ENV'] = 'test';
    process.env['CORS_ORIGINS'] = origin;
    process.env['AUTH_COOKIE_SECURE'] = 'false';
    process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '100';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    passwords = app.get(PasswordService);
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.capabilityGrant.deleteMany();
    await prisma.subjectGroupMembership.deleteMany();
    await prisma.staffSubject.deleteMany();
    await prisma.subjectGroup.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.staffProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.capabilityDefinition.deleteMany();
    await prisma.capabilityDefinition.createMany({ data: [
      { key: 'SUBJECT_GROUP_MANAGE', description: 'groups', allowedScopeTypes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', description: 'subjects', allowedScopeTypes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', description: 'admin', allowedScopeTypes: ['SCHOOL_WIDE'] },
    ] });
  });

  afterAll(async () => { await prisma?.$disconnect(); await app?.close(); });

  async function actor(options: { capabilities?: Array<'SUBJECT_GROUP_MANAGE' | 'SUBJECT_MANAGE' | 'SYSTEM_ADMIN'>; mustChangePassword?: boolean } = {}): Promise<{ agent: Agent; id: string }> {
    const user = await prisma.user.create({ data: {
      username: `catalog-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: await passwords.hash(password), status: UserStatus.ACTIVE,
      mustChangePassword: options.mustChangePassword ?? false,
    } });
    for (const capability of options.capabilities ?? []) await prisma.capabilityGrant.create({ data: {
      userId: user.id, capabilityKey: capability, scopeType: 'SCHOOL_WIDE', validFrom: new Date(Date.now() - 1_000),
    } });
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ username: user.username, password })).status).toBe(200);
    return { agent, id: user.id };
  }

  it('enforces authorization matrix, denial audit and CSRF', async () => {
    expect((await request(app.getHttpServer()).get('/api/subject-groups')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/subjects')).status).toBe(401);
    const none = await actor();
    expect((await none.agent.get('/api/subject-groups')).status).toBe(403);
    expect((await none.agent.get('/api/subjects')).status).toBe(403);
    expect(await prisma.auditEvent.count({ where: { action: 'AUTHORIZATION_DENIED', actorUserId: none.id } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { actorUserId: none.id, result: 'SUCCESS', action: { in: domainActions } } })).toBe(0);
    const admin = await actor({ capabilities: ['SYSTEM_ADMIN'] });
    expect((await admin.agent.get('/api/subject-groups')).status).toBe(403);
    expect((await admin.agent.get('/api/subjects')).status).toBe(403);
    const groupOnly = await actor({ capabilities: ['SUBJECT_GROUP_MANAGE'] });
    expect((await groupOnly.agent.get('/api/subject-groups')).status).toBe(200);
    expect((await groupOnly.agent.get('/api/subjects')).status).toBe(403);
    const subjectOnly = await actor({ capabilities: ['SUBJECT_MANAGE'] });
    expect((await subjectOnly.agent.get('/api/subjects')).status).toBe(200);
    expect((await subjectOnly.agent.get('/api/subject-groups')).status).toBe(403);
    const both = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    expect((await both.agent.get('/api/subjects')).status).toBe(200);
    expect((await both.agent.get('/api/subject-groups')).status).toBe(200);
    expect((await (await actor({ capabilities: ['SUBJECT_MANAGE'], mustChangePassword: true })).agent.get('/api/subjects')).status).toBe(403);
    expect((await groupOnly.agent.post('/api/subject-groups').send({ code: 'CSRF', name: 'CSRF' })).status).toBe(403);
    expect((await groupOnly.agent.post('/api/subject-groups').set('Origin', origin).send({ code: 'CSRF', name: 'CSRF' })).status).toBe(201);
  });

  it('creates normalized independent catalogs and rejects invalid payloads', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const group = await manager.agent.post('/api/subject-groups').set('Origin', origin).send({ code: '  van  ', name: '  Ngữ văn  ' });
    expect(group.status).toBe(201); expect(group.body).toMatchObject({ code: 'VAN', name: 'Ngữ văn', status: 'ACTIVE' }); expect(group.body).not.toHaveProperty('memberships');
    const subject = await manager.agent.post('/api/subjects').set('Origin', origin).send({ code: '  geo  ', name: '  Địa lý  ' });
    expect(subject.status).toBe(201); expect(subject.body).toMatchObject({ code: 'GEO', name: 'Địa lý', status: 'ACTIVE' }); expect(subject.body).not.toHaveProperty('staffSubjects');
    expect((await manager.agent.post('/api/subject-groups').set('Origin', origin).send({ code: 'GEO', name: 'Tổ GEO' })).status).toBe(201);
    const invalid = [{ code: ' ', name: 'x' }, { code: 'x', name: ' ' }, { code: null, name: 'x' }, { code: 'x', name: null }, { code: 'x'.repeat(51), name: 'x' }, { code: 'x', name: 'x'.repeat(151) }, { code: 'x', name: 'x', status: 'INACTIVE' }, { code: 'x', name: 'x', unknownField: true }];
    for (const body of invalid) expect((await manager.agent.post('/api/subjects').set('Origin', origin).send(body)).status).toBe(400);
    expect((await manager.agent.post('/api/subjects').set('Origin', origin).send({ code: ` ${'p'.repeat(50)} `, name: 'Padded' })).status).toBe(201);
  });

  it('rolls back duplicate creates without success audits for both models', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const originalSubject = await prisma.subject.create({ data: { code: 'DUP_SUBJECT', name: 'Original subject' } });
    const originalGroup = await prisma.subjectGroup.create({ data: { code: 'DUP_GROUP', name: 'Original group' } });
    const subjectCount = await prisma.subject.count(); const groupCount = await prisma.subjectGroup.count();
    expect((await manager.agent.post('/api/subjects').set('Origin', origin).set('X-Request-Id', 'duplicate-subject').send({ code: ' dup_subject ', name: 'Duplicate' })).status).toBe(409);
    expect((await manager.agent.post('/api/subject-groups').set('Origin', origin).set('X-Request-Id', 'duplicate-group').send({ code: ' dup_group ', name: 'Duplicate' })).status).toBe(409);
    expect(await prisma.subject.count()).toBe(subjectCount); expect(await prisma.subjectGroup.count()).toBe(groupCount);
    expect(await prisma.subject.findUniqueOrThrow({ where: { id: originalSubject.id } })).toMatchObject({ code: 'DUP_SUBJECT', name: 'Original subject', status: 'ACTIVE' });
    expect(await prisma.subjectGroup.findUniqueOrThrow({ where: { id: originalGroup.id } })).toMatchObject({ code: 'DUP_GROUP', name: 'Original group', status: 'ACTIVE' });
    expect(await prisma.auditEvent.count({ where: { action: 'SUBJECT_CREATED', requestId: 'duplicate-subject', result: 'SUCCESS' } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'SUBJECT_GROUP_CREATED', requestId: 'duplicate-group', result: 'SUCCESS' } })).toBe(0);
  });

  it('lists both catalogs with stable ordering, pagination and filtered totals', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    await prisma.subject.createMany({ data: [{ code: 'DELTA', name: 'D', status: 'INACTIVE' }, { code: 'ALPHA', name: 'A' }, { code: 'CHARLIE', name: 'C' }, { code: 'BRAVO', name: 'B', status: 'INACTIVE' }] });
    await prisma.subjectGroup.createMany({ data: [{ code: 'GROUP_B', name: 'B', status: 'INACTIVE' }, { code: 'GROUP_A', name: 'A' }] });
    const all = await manager.agent.get('/api/subjects');
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 4 }); expect(all.body.items.map((x: { code: string }) => x.code)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);
    const page = await manager.agent.get('/api/subjects?page=1&pageSize=2');
    expect(page.body).toMatchObject({ page: 1, pageSize: 2, total: 4 }); expect(page.body.items.map((x: { code: string }) => x.code)).toEqual(['ALPHA', 'BRAVO']);
    const active = await manager.agent.get('/api/subjects?status=ACTIVE'); expect(active.body.total).toBe(2); expect(active.body.items.every((x: { status: string }) => x.status === 'ACTIVE')).toBe(true);
    const inactive = await manager.agent.get('/api/subjects?status=INACTIVE'); expect(inactive.body.total).toBe(2); expect(inactive.body.items.every((x: { status: string }) => x.status === 'INACTIVE')).toBe(true);
    const groups = await manager.agent.get('/api/subject-groups?status=INACTIVE'); expect(groups.body.total).toBe(1); expect(groups.body.items.map((x: { code: string }) => x.code)).toEqual(['GROUP_B']);
    for (const query of ['page=0', 'pageSize=101', 'status=UNKNOWN', 'unknown=1']) expect((await manager.agent.get(`/api/subjects?${query}`)).status).toBe(400);
  });

  it('returns complete detail matrices without relation expansion', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const subject = await prisma.subject.create({ data: { code: 'DETAIL_SUBJECT', name: 'Subject' } });
    const group = await prisma.subjectGroup.create({ data: { code: 'DETAIL_GROUP', name: 'Group' } });
    const subjectResult = await manager.agent.get(`/api/subjects/${subject.id}`); expect(subjectResult.status).toBe(200); expect(subjectResult.body).not.toHaveProperty('staffSubjects');
    const groupResult = await manager.agent.get(`/api/subject-groups/${group.id}`); expect(groupResult.status).toBe(200); expect(groupResult.body).not.toHaveProperty('memberships');
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await manager.agent.get(`/api/subjects/${missing}`)).status).toBe(404); expect((await manager.agent.get(`/api/subject-groups/${missing}`)).status).toBe(404);
    expect((await manager.agent.get('/api/subjects/not-uuid')).status).toBe(400); expect((await manager.agent.get('/api/subject-groups/not-uuid')).status).toBe(400);
  });

  it('rejects the complete PATCH matrix for both catalogs', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const subject = await prisma.subject.create({ data: { code: 'PATCH_SUBJECT', name: 'Subject' } });
    const group = await prisma.subjectGroup.create({ data: { code: 'PATCH_GROUP', name: 'Group' } });
    const common = [{}, { code: null }, { name: null }, { status: 'INACTIVE' }, { id: subject.id }, { createdAt: 'x' }, { updatedAt: 'x' }];
    for (const body of [...common, { staffSubjects: [] }]) expect((await manager.agent.patch(`/api/subjects/${subject.id}`).set('Origin', origin).send(body)).status).toBe(400);
    for (const body of [...common, { memberships: [] }]) expect((await manager.agent.patch(`/api/subject-groups/${group.id}`).set('Origin', origin).send(body)).status).toBe(400);
  });

  it('rolls back duplicate PATCH atomically for both models', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const subjectA = await prisma.subject.create({ data: { code: 'SUBJECT_A', name: 'Original A' } }); await prisma.subject.create({ data: { code: 'SUBJECT_B', name: 'B' } });
    const groupA = await prisma.subjectGroup.create({ data: { code: 'GROUP_A', name: 'Original A' } }); await prisma.subjectGroup.create({ data: { code: 'GROUP_B', name: 'B' } });
    expect((await manager.agent.patch(`/api/subjects/${subjectA.id}`).set('Origin', origin).send({ code: 'SUBJECT_B', name: 'Should rollback' })).status).toBe(409);
    expect((await manager.agent.patch(`/api/subject-groups/${groupA.id}`).set('Origin', origin).send({ code: 'GROUP_B', name: 'Should rollback' })).status).toBe(409);
    expect(await prisma.subject.findUniqueOrThrow({ where: { id: subjectA.id } })).toMatchObject({ code: 'SUBJECT_A', name: 'Original A', status: 'ACTIVE' });
    expect(await prisma.subjectGroup.findUniqueOrThrow({ where: { id: groupA.id } })).toMatchObject({ code: 'GROUP_A', name: 'Original A', status: 'ACTIVE' });
  });

  it('preserves StaffSubject through the complete Subject status matrix', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE'] });
    const target = await prisma.subject.create({ data: { code: 'STATE_SUBJECT', name: 'Subject' } });
    const member = await prisma.user.create({ data: { username: 'subject-member', passwordHash: 'fixture' } });
    const relation = await prisma.staffSubject.create({ data: { userId: member.id, subjectId: target.id, validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: new Date('2026-12-31T00:00:00Z'), isPrimary: true } });
    for (const [route, expected] of [['deactivate', 'INACTIVE'], ['deactivate', 'INACTIVE'], ['activate', 'ACTIVE'], ['activate', 'ACTIVE']] as const) {
      const response = await manager.agent.post(`/api/subjects/${target.id}/${route}`).set('Origin', origin); expect(response.status).toBe(200); expect(response.body.status).toBe(expected);
    }
    expect(await prisma.subject.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'ACTIVE' });
    const after = await prisma.staffSubject.findUniqueOrThrow({ where: { id: relation.id } });
    expect(after).toMatchObject({ id: relation.id, userId: relation.userId, subjectId: relation.subjectId, validFrom: relation.validFrom, validUntil: relation.validUntil, isPrimary: relation.isPrimary });
  });

  it('preserves SubjectGroupMembership through the complete group status matrix', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_GROUP_MANAGE'] });
    const target = await prisma.subjectGroup.create({ data: { code: 'STATE_GROUP', name: 'Group' } });
    const member = await prisma.user.create({ data: { username: 'group-member', passwordHash: 'fixture' } });
    const relation = await prisma.subjectGroupMembership.create({ data: { userId: member.id, subjectGroupId: target.id, validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: new Date('2026-12-31T00:00:00Z'), isPrimary: true } });
    for (const [route, expected] of [['deactivate', 'INACTIVE'], ['deactivate', 'INACTIVE'], ['activate', 'ACTIVE'], ['activate', 'ACTIVE']] as const) {
      const response = await manager.agent.post(`/api/subject-groups/${target.id}/${route}`).set('Origin', origin); expect(response.status).toBe(200); expect(response.body.status).toBe(expected);
    }
    expect(await prisma.subjectGroup.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'ACTIVE' });
    const after = await prisma.subjectGroupMembership.findUniqueOrThrow({ where: { id: relation.id } });
    expect(after).toMatchObject({ id: relation.id, userId: relation.userId, subjectGroupId: relation.subjectGroupId, validFrom: relation.validFrom, validUntil: relation.validUntil, isPrimary: relation.isPrimary });
  });

  it('writes all eight deterministic, public-safe domain audits', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const groupCreate = await manager.agent.post('/api/subject-groups').set('Origin', origin).set('X-Request-Id', 'catalog-group-create-1').send({ code: 'AUDIT_GROUP', name: 'Group' }); const groupId = groupCreate.body.id as string;
    await manager.agent.patch(`/api/subject-groups/${groupId}`).set('Origin', origin).set('X-Request-Id', 'catalog-group-update-1').send({ code: 'AUDIT_GROUP_2', name: 'Group 2' });
    await manager.agent.post(`/api/subject-groups/${groupId}/deactivate`).set('Origin', origin).set('X-Request-Id', 'catalog-group-deactivate-1');
    await manager.agent.post(`/api/subject-groups/${groupId}/activate`).set('Origin', origin).set('X-Request-Id', 'catalog-group-activate-1');
    const subjectCreate = await manager.agent.post('/api/subjects').set('Origin', origin).set('X-Request-Id', 'catalog-subject-create-1').send({ code: 'AUDIT_SUBJECT', name: 'Subject' }); const subjectId = subjectCreate.body.id as string;
    await manager.agent.patch(`/api/subjects/${subjectId}`).set('Origin', origin).set('X-Request-Id', 'catalog-subject-update-1').send({ code: 'AUDIT_SUBJECT_2', name: 'Subject 2' });
    await manager.agent.post(`/api/subjects/${subjectId}/deactivate`).set('Origin', origin).set('X-Request-Id', 'catalog-subject-deactivate-1');
    await manager.agent.post(`/api/subjects/${subjectId}/activate`).set('Origin', origin).set('X-Request-Id', 'catalog-subject-activate-1');
    const specs = [
      ['SUBJECT_GROUP_CREATED', groupId, 'catalog-group-create-1', 'SubjectGroup'], ['SUBJECT_GROUP_UPDATED', groupId, 'catalog-group-update-1', 'SubjectGroup'], ['SUBJECT_GROUP_DEACTIVATED', groupId, 'catalog-group-deactivate-1', 'SubjectGroup'], ['SUBJECT_GROUP_ACTIVATED', groupId, 'catalog-group-activate-1', 'SubjectGroup'],
      ['SUBJECT_CREATED', subjectId, 'catalog-subject-create-1', 'Subject'], ['SUBJECT_UPDATED', subjectId, 'catalog-subject-update-1', 'Subject'], ['SUBJECT_DEACTIVATED', subjectId, 'catalog-subject-deactivate-1', 'Subject'], ['SUBJECT_ACTIVATED', subjectId, 'catalog-subject-activate-1', 'Subject'],
    ] as const;
    const events = [];
    for (const [action, entityId, requestId, entityType] of specs) {
      const event = await prisma.auditEvent.findFirstOrThrow({ where: { action, entityId, requestId } });
      expect(event).toMatchObject({ actorUserId: manager.id, entityType, entityId, requestId, result: 'SUCCESS' }); events.push(event);
    }
    expect(events[1]?.metadata).toEqual({ changedFields: ['code', 'name'] }); expect(events[5]?.metadata).toEqual({ changedFields: ['code', 'name'] });
    expect(events[2]?.metadata).toEqual({ previousStatus: 'ACTIVE', newStatus: 'INACTIVE' }); expect(events[3]?.metadata).toEqual({ previousStatus: 'INACTIVE', newStatus: 'ACTIVE' });
    expect(events[6]?.metadata).toEqual({ previousStatus: 'ACTIVE', newStatus: 'INACTIVE' }); expect(events[7]?.metadata).toEqual({ previousStatus: 'INACTIVE', newStatus: 'ACTIVE' });
    const forbidden = new Set(['password', 'passwordhash', 'token', 'cookie', 'secret', 'credential', 'apikey', 'database_url']);
    for (const event of events) { for (const key of collectObjectKeys(event.metadata)) expect(forbidden.has(key)).toBe(false); expect(JSON.stringify(event.metadata)).not.toContain(password); }
  });

  it('rolls back both catalog creates when the PostgreSQL transaction audit fails', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const service = new CatalogsService(prisma as never, { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) } as never);
    await expect(service.create('subjectGroup', { code: 'ROLLBACK_GROUP', name: 'Rollback Group' }, manager.id, { requestId: 'rollback-group' })).rejects.toThrow('audit unavailable');
    await expect(service.create('subject', { code: 'ROLLBACK_SUBJECT', name: 'Rollback Subject' }, manager.id, { requestId: 'rollback-subject' })).rejects.toThrow('audit unavailable');
    expect(await prisma.subjectGroup.count({ where: { code: 'ROLLBACK_GROUP' } })).toBe(0); expect(await prisma.auditEvent.count({ where: { requestId: 'rollback-group' } })).toBe(0);
    expect(await prisma.subject.count({ where: { code: 'ROLLBACK_SUBJECT' } })).toBe(0); expect(await prisma.auditEvent.count({ where: { requestId: 'rollback-subject' } })).toBe(0);
  });
});
