import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const integration = testDatabaseUrl ? describe : describe.skip;
const origin = 'http://127.0.0.1:5173';
const password = 'CatalogIntegrationPassword9';

integration('Catalog APIs (isolated PostgreSQL integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwords: PasswordService;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = testDatabaseUrl;
    process.env['NODE_ENV'] = 'test'; process.env['CORS_ORIGINS'] = origin; process.env['AUTH_COOKIE_SECURE'] = 'false'; process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '100';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }); passwords = app.get(PasswordService);
  });
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany(); await prisma.capabilityGrant.deleteMany(); await prisma.subjectGroupMembership.deleteMany(); await prisma.staffSubject.deleteMany(); await prisma.subjectGroup.deleteMany(); await prisma.subject.deleteMany(); await prisma.staffProfile.deleteMany(); await prisma.authSession.deleteMany(); await prisma.user.deleteMany(); await prisma.capabilityDefinition.deleteMany();
    await prisma.capabilityDefinition.createMany({ data: [
      { key: 'SUBJECT_GROUP_MANAGE', description: 'groups', allowedScopeTypes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', description: 'subjects', allowedScopeTypes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', description: 'admin', allowedScopeTypes: ['SCHOOL_WIDE'] },
    ] });
  });
  afterAll(async () => { await prisma?.$disconnect(); await app?.close(); });

  async function actor(options: { capabilities?: Array<'SUBJECT_GROUP_MANAGE' | 'SUBJECT_MANAGE' | 'SYSTEM_ADMIN'>; mustChangePassword?: boolean } = {}): Promise<{ agent: Agent; id: string }> {
    const user = await prisma.user.create({ data: { username: `catalog-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await passwords.hash(password), status: UserStatus.ACTIVE, mustChangePassword: options.mustChangePassword ?? false } });
    for (const capability of options.capabilities ?? []) await prisma.capabilityGrant.create({ data: { userId: user.id, capabilityKey: capability, scopeType: 'SCHOOL_WIDE', validFrom: new Date(Date.now() - 1000) } });
    const agent = request.agent(app.getHttpServer()); expect((await agent.post('/api/auth/login').send({ username: user.username, password })).status).toBe(200); return { agent, id: user.id };
  }

  it('enforces separate capabilities and CSRF', async () => {
    expect((await request(app.getHttpServer()).get('/api/subjects')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/subject-groups')).status).toBe(401);
    const none = await actor();
    expect((await none.agent.get('/api/subjects')).status).toBe(403); expect((await none.agent.get('/api/subject-groups')).status).toBe(403);
    const denial = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'AUTHORIZATION_DENIED', actorUserId: none.id } });
    expect(denial.actorUserId).toBe(none.id); expect(await prisma.auditEvent.count({ where: { actorUserId: none.id, result: 'SUCCESS', action: { startsWith: 'SUBJECT' } } })).toBe(0);
    const groups = await actor({ capabilities: ['SUBJECT_GROUP_MANAGE'] });
    expect((await groups.agent.get('/api/subject-groups')).status).toBe(200); expect((await groups.agent.get('/api/subjects')).status).toBe(403);
    expect((await groups.agent.post('/api/subject-groups').send({ code: 'TOAN', name: 'Toán' })).status).toBe(403);
    expect((await groups.agent.post('/api/subject-groups').set('Origin', origin).send({ code: 'TOAN', name: 'Toán' })).status).toBe(201);
    expect((await (await actor({ capabilities: ['SYSTEM_ADMIN'] })).agent.get('/api/subjects')).status).toBe(403);
    expect((await (await actor({ capabilities: ['SYSTEM_ADMIN'] })).agent.get('/api/subject-groups')).status).toBe(403);
    const subjects = await actor({ capabilities: ['SUBJECT_MANAGE'] });
    expect((await subjects.agent.get('/api/subjects')).status).toBe(200); expect((await subjects.agent.get('/api/subject-groups')).status).toBe(403);
    const both = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    expect((await both.agent.get('/api/subjects')).status).toBe(200); expect((await both.agent.get('/api/subject-groups')).status).toBe(200);
    const forced = await actor({ capabilities: ['SUBJECT_MANAGE'], mustChangePassword: true });
    expect((await forced.agent.get('/api/subjects')).status).toBe(403);
  });

  it('creates both independent namespaces and rejects invalid or duplicate input', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const group = await manager.agent.post('/api/subject-groups').set('Origin', origin).set('X-Request-Id', 'catalog-group-create-1').send({ code: '  van  ', name: '  Ngữ văn  ' });
    expect(group.status).toBe(201); expect(group.body).toMatchObject({ code: 'VAN', name: 'Ngữ văn', status: 'ACTIVE' }); expect(group.body).not.toHaveProperty('memberships');
    expect((await manager.agent.post('/api/subjects').set('Origin', origin).send({ code: 'geo', name: 'Địa lý' })).status).toBe(201);
    expect((await manager.agent.post('/api/subject-groups').set('Origin', origin).send({ code: 'geo', name: 'Tổ GEO' })).status).toBe(201);
    const before = await prisma.subject.count();
    expect((await manager.agent.post('/api/subjects').set('Origin', origin).send({ code: 'GEO', name: 'Duplicate' })).status).toBe(409); expect(await prisma.subject.count()).toBe(before);
    for (const body of [{ code: ' ', name: 'x' }, { code: 'x', name: ' ' }, { code: null, name: 'x' }, { code: 'x', name: null }, { code: 'x'.repeat(51), name: 'x' }, { code: 'x', name: 'x'.repeat(151) }, { code: 'x', name: 'x', status: 'INACTIVE' }, { code: 'x', name: 'x', unknownField: true }]) expect((await manager.agent.post('/api/subjects').set('Origin', origin).send(body)).status).toBe(400);
    expect((await manager.agent.post('/api/subjects').set('Origin', origin).send({ code: ` ${'p'.repeat(50)} `, name: 'Padded' })).status).toBe(201);
  });

  it('lists, details, patches, transitions and preserves catalog records', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE', 'SUBJECT_GROUP_MANAGE'] });
    const subject = await prisma.subject.create({ data: { code: 'ZED', name: 'Zed' } }); const group = await prisma.subjectGroup.create({ data: { code: 'AAA', name: 'Aaa' } });
    const list = await manager.agent.get('/api/subjects?page=1&pageSize=2'); expect(list.status).toBe(200); expect(list.body).toMatchObject({ page: 1, pageSize: 2 });
    expect((await manager.agent.get('/api/subject-groups')).status).toBe(200); for (const q of ['page=0', 'pageSize=101', 'status=UNKNOWN', 'unknown=1']) expect((await manager.agent.get(`/api/subjects?${q}`)).status).toBe(400);
    expect((await manager.agent.get(`/api/subjects/${subject.id}`)).status).toBe(200); expect((await manager.agent.get('/api/subjects/not-uuid')).status).toBe(400); expect((await manager.agent.get('/api/subject-groups/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const patch = await manager.agent.patch(`/api/subjects/${subject.id}`).set('Origin', origin).send({ code: ' new ', name: ' New ' }); expect(patch.body).toMatchObject({ id: subject.id, code: 'NEW', name: 'New', status: 'ACTIVE' });
    for (const body of [{}, { status: 'INACTIVE' }, { id: subject.id }, { createdAt: 'x' }, { updatedAt: 'x' }, { staffSubjects: [] }]) expect((await manager.agent.patch(`/api/subjects/${subject.id}`).set('Origin', origin).send(body)).status).toBe(400);
    expect((await manager.agent.patch(`/api/subject-groups/${group.id}`).set('Origin', origin).send({ memberships: [] })).status).toBe(400);
    expect((await manager.agent.post(`/api/subjects/${subject.id}/deactivate`).set('Origin', origin)).status).toBe(200); expect((await manager.agent.post(`/api/subjects/${subject.id}/deactivate`).set('Origin', origin)).status).toBe(200); expect((await manager.agent.post(`/api/subjects/${subject.id}/activate`).set('Origin', origin)).status).toBe(200);
  });

  it('normalizes, updates, transitions and writes audit atomically', async () => {
    const manager = await actor({ capabilities: ['SUBJECT_MANAGE'] });
    const created = await manager.agent.post('/api/subjects').set('Origin', origin).set('X-Request-Id', 'subject-create').send({ code: '  geo  ', name: '  Địa lý  ' });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ code: 'GEO', name: 'Địa lý', status: 'ACTIVE' });
    const id = created.body.id as string;
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).set('X-Request-Id', 'subject-update').send({ code: ' ly ', name: ' Lịch sử ' })).status).toBe(200);
    expect((await manager.agent.post(`/api/subjects/${id}/deactivate`).set('Origin', origin).set('X-Request-Id', 'subject-deactivate')).status).toBe(200);
    expect((await manager.agent.post(`/api/subjects/${id}/deactivate`).set('Origin', origin)).status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { entityId: id, result: 'SUCCESS', action: { in: ['SUBJECT_CREATED', 'SUBJECT_UPDATED', 'SUBJECT_DEACTIVATED'] } } })).toBe(4);
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).send({ status: 'ACTIVE' })).status).toBe(400);
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).send({ code: null })).status).toBe(400);
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).send({ name: null })).status).toBe(400);
  });
});
