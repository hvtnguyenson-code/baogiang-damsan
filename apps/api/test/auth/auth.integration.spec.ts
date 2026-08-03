import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';
import { bootstrapAdmin, BOOTSTRAP_TECHNICAL_CAPABILITIES } from '../../src/bootstrap/bootstrap-admin';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const integration = testDatabaseUrl ? describe : describe.skip;

integration('Auth API (isolated PostgreSQL integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwords: PasswordService;
  const origin = 'http://127.0.0.1:5173';
  const originalPassword = 'OriginalPassword9';

  beforeAll(async () => {
    process.env['DATABASE_URL'] = testDatabaseUrl;
    process.env['NODE_ENV'] = 'test';
    process.env['CORS_ORIGINS'] = origin;
    process.env['AUTH_COOKIE_SECURE'] = 'false';
    process.env['AUTH_LOCKOUT_THRESHOLD'] = '3';
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
    await prisma.capabilityDefinition.createMany({
      data: BOOTSTRAP_TECHNICAL_CAPABILITIES.map((key) => ({ key, description: key, allowedScopeTypes: ['SCHOOL_WIDE'] })),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  async function createUser(username: string, status: UserStatus = UserStatus.ACTIVE, mustChangePassword = true): Promise<string> {
    const user = await prisma.user.create({
      data: {
        username, passwordHash: await passwords.hash(originalPassword), status, mustChangePassword,
        profile: { create: { displayName: `Test ${username}`, isTeachingStaff: true } },
      },
    });
    return user.id;
  }

  it('uses a generic failure response and applies transaction-safe temporary lockout', async () => {
    await createUser('known');
    const unknown = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'unknown', password: 'WrongPassword9' });
    const wrong = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'KNOWN', password: 'WrongPassword9' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toEqual(wrong.body.message);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'known', password: 'WrongPassword9' });
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'known', password: 'WrongPassword9' });
    const locked = await prisma.user.findUniqueOrThrow({ where: { username: 'known' } });
    expect(locked.failedLoginCount).toBe(3);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const eventActions = (await prisma.auditEvent.findMany()).map((event) => event.action);
    expect(eventActions).toContain('AUTH_LOGIN_FAILURE');
    expect(eventActions).toContain('AUTH_LOGIN_LOCKED');
  });

  it.each([UserStatus.PENDING, UserStatus.DISABLED, UserStatus.LOCKED])('does not authenticate a %s account', async (status) => {
    await createUser(status.toLowerCase(), status);
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ username: status.toLowerCase(), password: originalPassword });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Tên đăng nhập hoặc mật khẩu không hợp lệ.');
  });

  it('sets a safe cookie, authenticates /me, and logout revokes the session', async () => {
    await createUser('session-user');
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/login').send({ username: 'SESSION-USER', password: originalPassword });
    expect(login.status).toBe(200);
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Lax');
    expect(setCookie[0]).toContain('Path=/api');
    const rawToken = /baogiang_session=([^;]+)/.exec(setCookie[0])![1];
    const stored = await prisma.authSession.findFirstOrThrow();
    expect(stored.tokenHash).not.toContain(rawToken);
    expect(JSON.stringify(await prisma.auditEvent.findMany())).not.toContain(rawToken);
    expect((await agent.get('/api/auth/me')).body.user).toMatchObject({ username: 'session-user', mustChangePassword: true });
    const csrfDenied = await agent.post('/api/auth/logout');
    expect(csrfDenied.status).toBe(403);
    expect((await agent.post('/api/auth/logout').set('Origin', origin)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects expired and revoked sessions consistently and throttles lastSeen writes', async () => {
    await createUser('validity-user');
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'validity-user', password: originalPassword });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const session = await prisma.authSession.findFirstOrThrow();
    const originalSeen = session.lastSeenAt;
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).lastSeenAt).toEqual(originalSeen);
    await prisma.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    await prisma.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } });
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('changes first-login password, keeps the current session, and revokes all other sessions', async () => {
    await createUser('password-user');
    const first = request.agent(app.getHttpServer());
    const second = request.agent(app.getHttpServer());
    await first.post('/api/auth/login').send({ username: 'password-user', password: originalPassword });
    await second.post('/api/auth/login').send({ username: 'password-user', password: originalPassword });
    expect((await first.post('/api/auth/change-password').set('Origin', origin).send({ currentPassword: 'wrong', newPassword: 'ReplacementPassword8' })).status).toBe(401);
    expect((await first.post('/api/auth/change-password').set('Origin', origin).send({ currentPassword: originalPassword, newPassword: 'ReplacementPassword8' })).status).toBe(200);
    expect((await first.get('/api/auth/me')).body.user.mustChangePassword).toBe(false);
    expect((await second.get('/api/auth/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'password-user', password: originalPassword })).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'password-user', password: 'ReplacementPassword8' })).status).toBe(200);
  });

  it('bootstraps once with technical capabilities only and never overwrites', async () => {
    const input = { username: ' ADMIN ', displayName: 'Technical Admin', password: 'BootstrapPassword9' };
    const userId = await bootstrapAdmin(prisma, passwords, input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { capabilityGrants: true } });
    expect(user.username).toBe('admin');
    expect(user.mustChangePassword).toBe(true);
    expect(user.capabilityGrants.map((grant) => grant.capabilityKey).sort()).toEqual([...BOOTSTRAP_TECHNICAL_CAPABILITIES].sort());
    expect(user.capabilityGrants.some((grant) => grant.capabilityKey.startsWith('APPROVAL_'))).toBe(false);
    await expect(bootstrapAdmin(prisma, passwords, input)).rejects.toThrow('no data was overwritten');
    expect(await prisma.user.count({ where: { username: 'admin' } })).toBe(1);
  });
});
