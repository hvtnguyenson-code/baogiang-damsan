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
  jest.setTimeout(30000);

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
    await prisma.teachingAssignment.deleteMany();
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

  function createBarrier() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {
      wait: () => promise,
      signal: () => resolve(),
      abort: (err: unknown) => reject(err),
    };
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
    const login = await agent.post('/api/auth/login').set('X-Forwarded-For', '198.51.100.25').send({ username: 'SESSION-USER', password: originalPassword });
    expect(login.status).toBe(200);
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Lax');
    expect(setCookie[0]).toContain('Path=/api');
    const rawToken = /baogiang_session=([^;]+)/.exec(setCookie[0])![1];
    const stored = await prisma.authSession.findFirstOrThrow();
    expect(stored.ipAddress).not.toBe('198.51.100.25');
    expect(stored.tokenHash).not.toContain(rawToken);
    expect(JSON.stringify(await prisma.auditEvent.findMany())).not.toContain(rawToken);
    expect((await agent.get('/api/auth/me')).body.user).toMatchObject({ username: 'session-user', mustChangePassword: true });
    const csrfDenied = await agent.post('/api/auth/logout');
    expect(csrfDenied.status).toBe(403);
    expect((await agent.post('/api/auth/logout').set('Origin', origin)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects malformed and invalid-format session cookies without leaking or returning 500', async () => {
    const malformed = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', 'baogiang_session=%E0%A4%A');
    expect(malformed.status).toBe(401);
    const invalidValue = 'invalid-session-shape';
    const invalid = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `baogiang_session=${invalidValue}`);
    expect(invalid.status).toBe(401);
    expect(JSON.stringify(invalid.body)).not.toContain(invalidValue);
    expect(await prisma.authSession.count()).toBe(0);
    const events = await prisma.auditEvent.findMany({ where: { action: 'AUTH_SESSION_REJECTED' } });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(invalidValue);
  });

  it('rejects expired and revoked sessions consistently and throttles lastSeen writes', async () => {
    await createUser('validity-user');
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'validity-user', password: originalPassword });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const session = await prisma.authSession.findFirstOrThrow();
    const originalSeen = session.lastSeenAt;
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).lastSeenAt).toEqual(originalSeen);
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      },
    });
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

  it('enforces Invariant A/C/F: stale credential proof delayed past rotation fails closed without issuing session or success audit', async () => {
    const userId = await createUser('stale-race-user');
    const agentActive = request.agent(app.getHttpServer());
    const initialLogin = await agentActive
      .post('/api/auth/login')
      .send({ username: 'stale-race-user', password: originalPassword });
    expect(initialLogin.status).toBe(200);

    const activeSession = await prisma.authSession.findFirstOrThrow({
      where: { userId, revokedAt: null },
    });

    const verifyStarted = createBarrier();
    const rotationCommitted = createBarrier();
    const realVerify = passwords.verify.bind(passwords);

    let pauseInflightLogin = true;
    const verifySpy = jest.spyOn(passwords, 'verify').mockImplementation(async (hash, plain) => {
      const ok = await realVerify(hash, plain);
      if (pauseInflightLogin && ok && plain === originalPassword) {
        pauseInflightLogin = false;
        verifyStarted.signal();
        await rotationCommitted.wait();
      }
      return ok;
    });

    try {
      const delayedLoginPromise = request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'stale-race-user', password: originalPassword })
        .then((res) => res);

      await verifyStarted.wait();

      const rotationRes = await agentActive
        .post('/api/auth/change-password')
        .set('Origin', origin)
        .send({ currentPassword: originalPassword, newPassword: 'NewRotatedPassword9' });
      expect(rotationRes.status).toBe(200);

      const userAfterRotation = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(await realVerify(userAfterRotation.passwordHash, 'NewRotatedPassword9')).toBe(true);
      expect(await realVerify(userAfterRotation.passwordHash, originalPassword)).toBe(false);

      rotationCommitted.signal();

      const delayedLoginRes = await delayedLoginPromise;
      expect(delayedLoginRes.status).toBe(401);
      expect(delayedLoginRes.body.message).toBe('Tên đăng nhập hoặc mật khẩu không hợp lệ.');

      const sessions = await prisma.authSession.findMany({ where: { userId } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(activeSession.id);

      const successEvents = await prisma.auditEvent.findMany({
        where: { actorUserId: userId, action: 'AUTH_LOGIN_SUCCESS' },
      });
      expect(successEvents).toHaveLength(1);

      const failureEvents = await prisma.auditEvent.findMany({
        where: { actorUserId: userId, action: 'AUTH_LOGIN_FAILURE' },
      });
      expect(failureEvents.length).toBeGreaterThanOrEqual(1);

      const userFinal = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(userFinal.failedLoginCount).toBe(1);

      const newLoginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'stale-race-user', password: 'NewRotatedPassword9' });
      expect(newLoginRes.status).toBe(200);

      const oldLoginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'stale-race-user', password: originalPassword });
      expect(oldLoginRes.status).toBe(401);

      expect((await agentActive.get('/api/auth/me')).status).toBe(200);
    } finally {
      verifySpy.mockRestore();
    }
  }, 30000);

  it('enforces Invariant B: login committed before password rotation is revoked upon rotation commit', async () => {
    const userId = await createUser('prior-login-user');
    const agentPrior = request.agent(app.getHttpServer());
    const agentChanger = request.agent(app.getHttpServer());

    const priorLogin = await agentPrior
      .post('/api/auth/login')
      .send({ username: 'prior-login-user', password: originalPassword });
    expect(priorLogin.status).toBe(200);

    const changerLogin = await agentChanger
      .post('/api/auth/login')
      .send({ username: 'prior-login-user', password: originalPassword });
    expect(changerLogin.status).toBe(200);

    expect((await agentPrior.get('/api/auth/me')).status).toBe(200);
    expect((await agentChanger.get('/api/auth/me')).status).toBe(200);

    const changeRes = await agentChanger
      .post('/api/auth/change-password')
      .set('Origin', origin)
      .send({ currentPassword: originalPassword, newPassword: 'NewRotatedPassword8' });
    expect(changeRes.status).toBe(200);

    expect((await agentPrior.get('/api/auth/me')).status).toBe(401);
    expect((await agentChanger.get('/api/auth/me')).status).toBe(200);

    const priorSessions = await prisma.authSession.findMany({
      where: { userId, revokedAt: { not: null } },
    });
    expect(priorSessions.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('enforces Requirement 7: concurrent password change race allows only one authoritative change and rejects stale rotation', async () => {
    const userId = await createUser('double-change-user');
    const loginResA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'double-change-user', password: originalPassword });
    const cookieA = (loginResA.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    const loginResB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'double-change-user', password: originalPassword });
    const cookieB = (loginResB.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    const aVerified = createBarrier();
    const bVerified = createBarrier();
    const aCanCommit = createBarrier();
    const bCanCommit = createBarrier();

    const realVerify = passwords.verify.bind(passwords);
    let aIntercepted = false;
    let bIntercepted = false;

    const verifySpy = jest.spyOn(passwords, 'verify').mockImplementation(async (hash, plain) => {
      const ok = await realVerify(hash, plain);
      if (ok && plain === originalPassword) {
        if (!aIntercepted) {
          aIntercepted = true;
          aVerified.signal();
          await aCanCommit.wait();
        } else if (!bIntercepted) {
          bIntercepted = true;
          bVerified.signal();
          await bCanCommit.wait();
        }
      }
      return ok;
    });

    try {
      const promiseA = request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ currentPassword: originalPassword, newPassword: 'FirstReplacementPass8' })
        .then((res) => res);

      await aVerified.wait();

      const promiseB = request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Origin', origin)
        .set('Cookie', cookieB)
        .send({ currentPassword: originalPassword, newPassword: 'SecondReplacementPass8' })
        .then((res) => res);

      await bVerified.wait();

      aCanCommit.signal();
      bCanCommit.signal();
      const [resA, resB] = await Promise.all([promiseA, promiseB]);

      // Exactly one must succeed (200) and the other must fail (401)
      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 401]);

      const failedRes = resA.status === 401 ? resA : resB;
      const succeededRes = resA.status === 200 ? resA : resB;
      expect(failedRes.body.message).toBe('Mật khẩu hiện tại không hợp lệ.');

      const winningPassword = succeededRes === resA ? 'FirstReplacementPass8' : 'SecondReplacementPass8';
      const losingPassword = winningPassword === 'FirstReplacementPass8' ? 'SecondReplacementPass8' : 'FirstReplacementPass8';

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(await realVerify(user.passwordHash, winningPassword)).toBe(true);
      expect(await realVerify(user.passwordHash, losingPassword)).toBe(false);

      const loginWinner = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'double-change-user', password: winningPassword });
      expect(loginWinner.status).toBe(200);

      const loginLoser = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'double-change-user', password: losingPassword });
      expect(loginLoser.status).toBe(401);
    } finally {
      verifySpy.mockRestore();
    }
  }, 30000);
});
