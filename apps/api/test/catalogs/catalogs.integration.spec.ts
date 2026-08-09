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
    process.env['NODE_ENV'] = 'test'; process.env['CORS_ORIGINS'] = origin; process.env['AUTH_COOKIE_SECURE'] = 'false';
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

  async function actor(capability?: 'SUBJECT_GROUP_MANAGE' | 'SUBJECT_MANAGE' | 'SYSTEM_ADMIN'): Promise<{ agent: Agent; id: string }> {
    const user = await prisma.user.create({ data: { username: `catalog-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await passwords.hash(password), status: UserStatus.ACTIVE, mustChangePassword: false } });
    if (capability) await prisma.capabilityGrant.create({ data: { userId: user.id, capabilityKey: capability, scopeType: 'SCHOOL_WIDE', validFrom: new Date(Date.now() - 1000) } });
    const agent = request.agent(app.getHttpServer()); expect((await agent.post('/api/auth/login').send({ username: user.username, password })).status).toBe(200); return { agent, id: user.id };
  }

  it('enforces separate capabilities and CSRF', async () => {
    expect((await request(app.getHttpServer()).get('/api/subjects')).status).toBe(401);
    const groups = await actor('SUBJECT_GROUP_MANAGE');
    expect((await groups.agent.get('/api/subject-groups')).status).toBe(200); expect((await groups.agent.get('/api/subjects')).status).toBe(403);
    expect((await groups.agent.post('/api/subject-groups').send({ code: 'TOAN', name: 'Toán' })).status).toBe(403);
    expect((await groups.agent.post('/api/subject-groups').set('Origin', origin).send({ code: 'TOAN', name: 'Toán' })).status).toBe(201);
    expect((await (await actor('SYSTEM_ADMIN')).agent.get('/api/subjects')).status).toBe(403);
  });

  it('normalizes, updates, transitions and writes audit atomically', async () => {
    const manager = await actor('SUBJECT_MANAGE');
    const created = await manager.agent.post('/api/subjects').set('Origin', origin).set('X-Request-Id', 'subject-create').send({ code: '  geo  ', name: '  Địa lý  ' });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ code: 'GEO', name: 'Địa lý', status: 'ACTIVE' });
    const id = created.body.id as string;
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).set('X-Request-Id', 'subject-update').send({ code: ' ly ', name: ' Lịch sử ' })).status).toBe(200);
    expect((await manager.agent.post(`/api/subjects/${id}/deactivate`).set('Origin', origin).set('X-Request-Id', 'subject-deactivate')).status).toBe(200);
    expect((await manager.agent.post(`/api/subjects/${id}/deactivate`).set('Origin', origin)).status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { entityId: id, result: 'SUCCESS', action: { in: ['SUBJECT_CREATED', 'SUBJECT_UPDATED', 'SUBJECT_DEACTIVATED'] } } })).toBe(4);
    expect((await manager.agent.patch(`/api/subjects/${id}`).set('Origin', origin).send({ status: 'ACTIVE' })).status).toBe(400);
  });
});
