import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { UsersService } from '../../src/users/users.service';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const integration = testDatabaseUrl ? describe : describe.skip;
const origin = 'http://127.0.0.1:5173';
const password = 'UsersIntegrationPassword9';

integration('Users API (isolated PostgreSQL integration)', () => {
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
    await prisma.staffProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.capabilityDefinition.deleteMany();
    await prisma.capabilityDefinition.createMany({ data: [
      { key: 'USER_MANAGE', description: 'manage', allowedScopeTypes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', description: 'technical', allowedScopeTypes: ['SCHOOL_WIDE'] },
    ] });
  });

  afterAll(async () => { await prisma?.$disconnect(); await app?.close(); });

  async function actor(options: { capability?: 'USER_MANAGE' | 'SYSTEM_ADMIN'; mustChangePassword?: boolean } = {}): Promise<{ agent: Agent; user: { id: string } }> {
    const user = await prisma.user.create({ data: {
      username: `manager-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: await passwords.hash(password), status: UserStatus.ACTIVE,
      mustChangePassword: options.mustChangePassword ?? false,
      profile: { create: { displayName: 'Manager' } },
    } });
    if (options.capability) await prisma.capabilityGrant.create({ data: {
      userId: user.id, capabilityKey: options.capability, scopeType: 'SCHOOL_WIDE', validFrom: new Date(Date.now() - 1_000),
    } });
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ username: user.username, password })).status).toBe(200);
    return { agent, user };
  }

  const createPayload = (suffix: string, profile = true) => ({
    username: `  user-${suffix}  `, password,
    ...(profile ? { profile: { staffCode: ` st-${suffix} `, displayName: `User ${suffix}`, isTeachingStaff: false } } : {}),
  });

  it('enforces session, capability, password-change and CSRF boundaries', async () => {
    expect((await request(app.getHttpServer()).get('/api/users')).status).toBe(401);
    const denied = await actor();
    expect((await denied.agent.get('/api/users')).status).toBe(403);
    expect(await prisma.auditEvent.count({ where: { action: 'AUTHORIZATION_DENIED', actorUserId: denied.user.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: { in: ['USER_CREATED', 'USER_UPDATED', 'USER_ACTIVATED', 'USER_DISABLED', 'USER_UNLOCKED'] }, actorUserId: denied.user.id } })).toBe(0);
    expect((await (await actor({ capability: 'SYSTEM_ADMIN' })).agent.get('/api/users')).status).toBe(403);
    expect((await (await actor({ capability: 'USER_MANAGE', mustChangePassword: true })).agent.get('/api/users')).status).toBe(403);
    const manager = await actor({ capability: 'USER_MANAGE' });
    expect((await manager.agent.get('/api/users')).status).toBe(200);
    expect((await manager.agent.post('/api/users').send(createPayload('csrf'))).status).toBe(403);
    expect((await manager.agent.post('/api/users').set('Origin', origin).send(createPayload('csrf'))).status).toBe(201);
  });

  it('creates normalized, public-safe users and rolls back duplicate profile creation', async () => {
    const manager = await actor({ capability: 'USER_MANAGE' });
    const created = await manager.agent.post('/api/users').set('Origin', origin).set('X-Request-Id', 'users-create-1').send(createPayload('one'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: 'user-one', status: 'PENDING', mustChangePassword: true, profile: { staffCode: 'ST-ONE', isTeachingStaff: false } });
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|password|failedLoginCount/i);
    const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'user-one' } });
    expect(stored.passwordHash).toContain('$argon2id$');
    expect(stored.passwordHash).not.toContain(password);
    expect((await manager.agent.post('/api/users').set('Origin', origin).send(createPayload('one'))).status).toBe(409);
    const before = await prisma.user.count();
    const duplicateCode = await manager.agent.post('/api/users').set('Origin', origin).send({ ...createPayload('two'), profile: { displayName: 'Two', staffCode: 'st-one' } });
    expect(duplicateCode.status).toBe(409);
    expect(await prisma.user.count()).toBe(before);
    expect((await manager.agent.post('/api/users').set('Origin', origin).send(createPayload('no-profile', false))).status).toBe(201);
    expect((await manager.agent.post('/api/users').set('Origin', origin).send({ ...createPayload('null-boolean'), profile: { displayName: 'Valid', isTeachingStaff: null } })).status).toBe(400);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'USER_CREATED', entityId: stored.id } });
    expect(audit).toMatchObject({ actorUserId: manager.user.id, entityType: 'User', entityId: stored.id, requestId: 'users-create-1', result: 'SUCCESS' });
  });

  it('rolls back User, StaffProfile and audit when the in-transaction audit fails', async () => {
    const service = new UsersService(prisma as never, passwords, { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) } as never);
    await expect(service.create(createPayload('audit-fail') as never, 'actor', {})).rejects.toThrow('audit unavailable');
    expect(await prisma.user.count({ where: { username: 'user-audit-fail' } })).toBe(0);
    expect(await prisma.staffProfile.count({ where: { staffCode: 'ST-AUDIT-FAIL' } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'USER_CREATED' } })).toBe(0);
  });

  it('lists and gets users with validation, stable ordering and safe profile data', async () => {
    const manager = await actor({ capability: 'USER_MANAGE' });
    await prisma.user.createMany({ data: ['zulu', 'alpha', 'bravo'].map((username) => ({ username, passwordHash: 'not-exposed', status: UserStatus.PENDING })) });
    const list = await manager.agent.get('/api/users?page=1&pageSize=2');
    expect(list.status).toBe(200); expect(list.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
    expect(list.body.items.map((item: { username: string }) => item.username)).toEqual(['alpha', 'bravo']);
    expect((await manager.agent.get('/api/users?page=0')).status).toBe(400);
    expect((await manager.agent.get('/api/users?pageSize=101')).status).toBe(400);
    expect((await manager.agent.get('/api/users?unknown=true')).status).toBe(400);
    const alpha = await prisma.user.findUniqueOrThrow({ where: { username: 'alpha' } });
    expect((await manager.agent.get(`/api/users/${alpha.id}`)).status).toBe(200);
    expect((await manager.agent.get('/api/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await manager.agent.get('/api/users/not-a-uuid')).status).toBe(400);
  });

  it('patches the nested aggregate without recreating profiles and rejects invalid patches', async () => {
    const manager = await actor({ capability: 'USER_MANAGE' });
    const target = await prisma.user.create({ data: { username: 'patch-target', passwordHash: await passwords.hash(password), profile: { create: { displayName: 'Before', staffCode: 'BEFORE' } } } });
    const profile = await prisma.staffProfile.findUniqueOrThrow({ where: { userId: target.id } });
    const patch = await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).set('X-Request-Id', 'users-update-1').send({ username: ' PATCHED ', profile: { displayName: 'After', staffCode: ' after ' } });
    expect(patch.status).toBe(200); expect(patch.body).toMatchObject({ username: 'patched', profile: { id: profile.id, displayName: 'After', staffCode: 'AFTER' } });
    const updateAudit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'USER_UPDATED', entityId: target.id } });
    expect(updateAudit).toMatchObject({ actorUserId: manager.user.id, entityType: 'User', entityId: target.id, requestId: 'users-update-1', result: 'SUCCESS', metadata: { changedFields: ['username', 'profile'], profileCreated: false } });
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({})).status).toBe(400);
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ profile: null })).status).toBe(400);
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ profile: { displayName: null } })).status).toBe(400);
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ profile: { isTeachingStaff: null } })).status).toBe(400);
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ status: 'ACTIVE' })).status).toBe(400);
    for (const field of ['password', 'passwordHash', 'mustChangePassword', 'failedLoginCount', 'lockedUntil', 'lastLoginAt', 'capabilityGrants']) {
      expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ [field]: 'unsafe' })).status).toBe(400);
    }
    const bare = await prisma.user.create({ data: { username: 'bare', passwordHash: await passwords.hash(password) } });
    expect((await manager.agent.patch(`/api/users/${bare.id}`).set('Origin', origin).send({ profile: { displayName: 'Now present' } })).status).toBe(200);
    const missing = await prisma.user.create({ data: { username: 'missing', passwordHash: await passwords.hash(password) } });
    expect((await manager.agent.patch(`/api/users/${missing.id}`).set('Origin', origin).send({ profile: { phone: '1' } })).status).toBe(400);
    const duplicate = await prisma.user.create({ data: { username: 'duplicate', passwordHash: await passwords.hash(password), profile: { create: { displayName: 'Duplicate', staffCode: 'DUPLICATE' } } } });
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ username: duplicate.username })).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).username).toBe('patched');
    expect((await manager.agent.patch(`/api/users/${target.id}`).set('Origin', origin).send({ username: 'should-rollback', profile: { staffCode: 'duplicate' } })).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).username).toBe('patched');
  });

  it('manages state, revokes sessions and preserves authorization data', async () => {
    const manager = await actor({ capability: 'USER_MANAGE' });
    const target = await prisma.user.create({ data: { username: 'state-target', passwordHash: await passwords.hash(password), status: UserStatus.PENDING, mustChangePassword: true, profile: { create: { displayName: 'State target' } } } });
    expect((await manager.agent.post(`/api/users/${target.id}/activate`).set('Origin', origin).set('X-Request-Id', 'users-activate-1')).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(UserStatus.ACTIVE);
    expect((await manager.agent.post(`/api/users/${target.id}/activate`).set('Origin', origin)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).mustChangePassword).toBe(true);
    expect(await prisma.capabilityGrant.count({ where: { userId: target.id } })).toBe(0);
    await prisma.capabilityGrant.create({ data: { userId: target.id, capabilityKey: 'USER_MANAGE', scopeType: 'SCHOOL_WIDE', validFrom: new Date(Date.now() - 1_000) } });
    const targetAgent = request.agent(app.getHttpServer());
    expect((await targetAgent.post('/api/auth/login').send({ username: 'state-target', password })).status).toBe(200);
    await prisma.user.update({ where: { id: target.id }, data: { mustChangePassword: false } });
    expect((await manager.agent.post(`/api/users/${target.id}/disable`).set('Origin', origin).set('X-Request-Id', 'users-disable-1')).status).toBe(200);
    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(disabled.status).toBe(UserStatus.DISABLED);
    expect(await prisma.authSession.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.authSession.count({ where: { userId: target.id, revokedAt: { not: null } } })).toBe(1);
    expect(await prisma.staffProfile.count({ where: { userId: target.id } })).toBe(1);
    expect(await prisma.capabilityGrant.count({ where: { userId: target.id } })).toBe(1);
    expect((await targetAgent.get('/api/auth/me')).status).toBe(401);
    expect((await manager.agent.post(`/api/users/${target.id}/activate`).set('Origin', origin)).status).toBe(200);
    expect((await targetAgent.get('/api/auth/me')).status).toBe(401);
    const disabledAudit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'USER_DISABLED', entityId: target.id } });
    expect(disabledAudit).toMatchObject({ actorUserId: manager.user.id, entityType: 'User', entityId: target.id, requestId: 'users-disable-1', result: 'SUCCESS', metadata: { previousStatus: 'ACTIVE', newStatus: 'DISABLED', revokedSessionCount: 1 } });
    await prisma.user.update({ where: { id: target.id }, data: { lockedUntil: new Date(Date.now() + 60_000), failedLoginCount: 4 } });
    const passwordHashBeforeUnlock = (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect((await manager.agent.post(`/api/users/${target.id}/unlock`).set('Origin', origin).set('X-Request-Id', 'users-unlock-1')).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ lockedUntil: null, failedLoginCount: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash).toBe(passwordHashBeforeUnlock);
    expect(await prisma.capabilityGrant.count({ where: { userId: target.id } })).toBe(1);
    const actions = await prisma.auditEvent.findMany({ where: { entityId: target.id }, select: { action: true } });
    expect(actions.map((item) => item.action)).toEqual(expect.arrayContaining(['USER_ACTIVATED', 'USER_DISABLED', 'USER_UNLOCKED']));
    const stateAudits = await prisma.auditEvent.findMany({ where: { action: { in: ['USER_ACTIVATED', 'USER_DISABLED', 'USER_UNLOCKED'] }, entityId: target.id } });
    expect(stateAudits.find((event) => event.action === 'USER_ACTIVATED')).toMatchObject({ actorUserId: manager.user.id, entityType: 'User', entityId: target.id, requestId: 'users-activate-1', result: 'SUCCESS' });
    expect(stateAudits.find((event) => event.action === 'USER_UNLOCKED')).toMatchObject({ actorUserId: manager.user.id, entityType: 'User', entityId: target.id, requestId: 'users-unlock-1', result: 'SUCCESS' });
    const sensitive = /password|token|cookie|secret|credential|apikey|database_url/i;
    expect(JSON.stringify((await prisma.auditEvent.findMany({ where: { action: { in: ['USER_CREATED', 'USER_UPDATED', 'USER_ACTIVATED', 'USER_DISABLED', 'USER_UNLOCKED'] } }, select: { metadata: true } })).map((event) => event.metadata))).not.toMatch(sensitive);
    expect((await manager.agent.post(`/api/users/${target.id}/unlock`).set('Origin', origin)).status).toBe(200);
    await prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.PENDING } });
    expect((await manager.agent.post(`/api/users/${target.id}/unlock`).set('Origin', origin)).status).toBe(409);
    await prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.DISABLED } });
    expect((await manager.agent.post(`/api/users/${target.id}/unlock`).set('Origin', origin)).status).toBe(409);
    await prisma.user.update({ where: { id: target.id }, data: { status: UserStatus.LOCKED } });
    expect((await manager.agent.post(`/api/users/${target.id}/activate`).set('Origin', origin)).status).toBe(409);
  });
});
