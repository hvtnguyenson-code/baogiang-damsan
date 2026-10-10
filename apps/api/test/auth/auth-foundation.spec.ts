import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../src/audit/audit.service';
import { cookieOptions } from '../../src/auth/auth-http';
import { CsrfOriginGuard } from '../../src/auth/csrf-origin.guard';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';
import { PasswordService } from '../../src/auth/password.service';
import { SessionTokenService } from '../../src/auth/session-token.service';
import { AuthPolicyService } from '../../src/auth/auth-policy.service';
import { AppConfig } from '../../src/config/app.config';
import { UserStatus } from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';

const config: AppConfig = {
  nodeEnv: 'test', timeZone: 'Asia/Ho_Chi_Minh', host: '127.0.0.1', port: 3100,
  corsOrigins: ['http://127.0.0.1:5173'], aiEnabled: false,
  aiActiveModeEnabled: false, aiPassiveModeEnabled: false, webPushEnabled: false,
  logLevel: 'error', databaseUrl: 'postgresql://placeholder',
  httpTrustProxyHops: 0,
  auth: {
    sessionTtlSeconds: 3600, lastSeenUpdateSeconds: 300,
    cookieName: 'test_session', cookiePath: '/api', cookieSecure: false, cookieSameSite: 'lax',
    lockoutThreshold: 3, lockoutDurationSeconds: 60, passwordMinLength: 12,
    loginRateLimitMax: 2, loginRateLimitWindowSeconds: 60, loginRateLimitMaxKeys: 2,
    loginRateLimitUserMax: 10,
    loginRateLimitIpTotalMax: 150,
    loginRateLimitIpFailedDegradedThreshold: 25,
    loginRateLimitMaxIpKeys: 10_000,
    loginRateLimitMaxUserKeys: 10_000,
    loginRateLimitInFlightIp: 3,
    loginRateLimitInFlightIpDegraded: 1,
    loginRateLimitInFlightGlobal: 8,
    loginRateLimitQueueTimeoutMs: 10_000,
    loginRateLimitMaxQueuePerIp: 60,
    loginRateLimitMaxQueueGlobal: 120,
    loginRateLimitDegradedPaceMs: 1_000,
  },
  telegram: {
    enabled: false,
  },
};

describe('auth security foundations', () => {
  it('hashes and verifies Argon2id passwords and enforces policy', async () => {
    const service = new PasswordService(config);
    service.validatePolicy('StrongPassword9');
    expect(() => service.validatePolicy('weak')).toThrow();
    const hash = await service.hash('StrongPassword9');
    expect(hash).toContain('$argon2id$');
    expect(await service.verify(hash, 'StrongPassword9')).toBe(true);
    expect(await service.verify(hash, 'wrong')).toBe(false);
  });

  it('creates high-entropy opaque tokens and stores a deterministic hash only', () => {
    const service = new SessionTokenService();
    const first = service.generate();
    const second = service.generate();
    expect(first).not.toEqual(second);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(service.isValid(first)).toBe(true);
    expect(service.isValid('not-a-session-token')).toBe(false);
    expect(service.isValid(`${first}extra`)).toBe(false);
    expect(service.hash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash(first)).not.toContain(first);
  });

  it('rejects invalid token shape before hashing or database lookup', async () => {
    const prisma = { authSession: { findUnique: jest.fn() } };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      {} as never,
      new SessionTokenService(),
      audit as never,
      new AuthPolicyService(config),
      config,
    );
    await expect(service.authenticate('invalid-token-shape', {})).rejects.toThrow('Phiên đăng nhập không hợp lệ');
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reasonCode: 'INVALID_FORMAT' } }));
  });

  it('redacts sensitive audit keys recursively by default', () => {
    const service = new AuditService({} as never);
    const input = {
      reasonCode: 'INVALID',
      password: 'x',
      nested: { tokenHash: 'x', safe: true, items: [{ credential: 'x', label: 'safe' }, ['ok', { apiKey: 'x' }]] },
    };
    expect(service.sanitize(input)).toEqual({
      reasonCode: 'INVALID',
      nested: { safe: true, items: [{ label: 'safe' }, ['ok', {}]] },
    });
    expect(input.nested.tokenHash).toBe('x');
  });

  it('handles cyclic and excessive-depth audit metadata without throwing', () => {
    const service = new AuditService({} as never);
    const cyclic: Record<string, unknown> = { safe: 'value' };
    cyclic['self'] = cyclic;
    let deep: Record<string, unknown> = { leaf: 'kept-until-limit' };
    for (let index = 0; index < 12; index += 1) deep = { child: deep };
    expect(() => service.sanitize({ cyclic, deep })).not.toThrow();
    expect(service.sanitize({ cyclic })).toEqual({ cyclic: { safe: 'value' } });
  });

  it('uses HttpOnly cookie options with configured environment attributes', () => {
    expect(cookieOptions(config)).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax', path: '/api' });
    expect(cookieOptions({ ...config, auth: { ...config.auth, cookieSecure: true } }).secure).toBe(true);
  });

  it('rejects unsafe authenticated requests from an unapproved or missing origin', () => {
    const guard = new CsrfOriginGuard(config);
    const context = (origin?: string) => ({
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST', headers: origin ? { origin } : {} }) }),
    }) as unknown as ExecutionContext;
    expect(guard.canActivate(context('http://127.0.0.1:5173'))).toBe(true);
    expect(() => guard.canActivate(context('https://attacker.invalid'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('limits repeated login attempts per window', () => {
    const service = new LoginRateLimitService(config);
    service.consume('client', 0);
    service.consume('client', 1);
    expect(() => service.consume('client', 2)).toThrow();
    expect(() => service.consume('client', 60_001)).not.toThrow();
  });

  it('prunes expired keys at capacity and fails closed while active keys fill capacity', () => {
    const service = new LoginRateLimitService(config);
    service.consume('first', 0);
    service.consume('second', 30_000);
    expect(service.trackedKeyCount).toBe(2);
    service.consume('third', 60_001);
    expect(service.trackedKeyCount).toBe(2);
    expect(() => service.consume('fourth', 60_002)).toThrow();
    expect(service.trackedKeyCount).toBe(2);
  });

  it('applies lockout threshold and configured duration', () => {
    const policy = new AuthPolicyService(config);
    const now = new Date('2026-08-03T00:00:00Z');
    expect(policy.lockUntil(2, now)).toBeNull();
    expect(policy.lockUntil(3, now)).toEqual(new Date(now.getTime() + 60_000));
  });

  it('evaluates session status and throttles lastSeen writes', () => {
    const policy = new AuthPolicyService(config);
    const now = new Date('2026-08-03T00:10:00Z');
    const valid = { revokedAt: null, expiresAt: new Date('2026-08-03T01:00:00Z'), user: { status: UserStatus.ACTIVE, lockedUntil: null } };
    expect(policy.sessionRejection(valid, now)).toBeUndefined();
    expect(policy.sessionRejection({ ...valid, revokedAt: now }, now)).toBe('REVOKED');
    expect(policy.sessionRejection({ ...valid, expiresAt: now }, now)).toBe('EXPIRED');
    expect(policy.sessionRejection({ ...valid, user: { ...valid.user, status: UserStatus.DISABLED } }, now)).toBe('USER_INACTIVE');
    expect(policy.sessionRejection({ ...valid, user: { ...valid.user, lockedUntil: new Date(now.getTime() + 1000) } }, now)).toBe('USER_LOCKED');
  });

  describe('AUD-02B: NAT-Aware Two-Tier Login Rate Limiter & Concurrency Queue', () => {
    let service: LoginRateLimitService;

    beforeEach(() => {
      service = new LoginRateLimitService(config);
    });

    afterEach(() => {
      service.onModuleDestroy();
    });

    it('TC-01: serves 50 different teacher accounts concurrently from the same IP (NAT test)', async () => {
      const ip = '103.20.100.5'; // School NAT public IP
      const leases: Array<{ release: (outcome?: { isFailure?: boolean }) => void }> = [];

      // Launch 50 concurrent login requests for 50 different teachers from the same IP
      const promises = Array.from({ length: 50 }, (_, i) =>
        service.acquireSlot({
          ipAddress: ip,
          username: `teacher_${i + 1}`,
        }),
      );

      // In-flight slots are limited to 3 initially, remaining 47 are placed in the queue
      expect(service.getInFlightCountForIp(ip)).toBeLessThanOrEqual(3);
      expect(service.getQueueLengthForIp(ip)).toBe(47);

      // Progressively drain all 50 requests
      const drainPromise = Promise.all(
        promises.map(async (p) => {
          const lease = await p;
          leases.push(lease);
          // Simulate short password verification delay then release
          await new Promise((r) => setImmediate(r));
          lease.release({ isFailure: false });
        }),
      );

      await drainPromise;
      expect(leases).toHaveLength(50);
      expect(service.getInFlightCountForIp(ip)).toBe(0);
      expect(service.getQueueLengthForIp(ip)).toBe(0);
    });

    it('TC-02: allows legitimate user to log in even after IP accumulated 25 failed attempts (degraded mode)', async () => {
      const ip = '103.20.100.6';

      // Simulate 25 failed attempts on this IP
      for (let i = 0; i < 25; i += 1) {
        service.recordFailedAttempt(ip);
      }
      expect(service.isIpDegraded(ip)).toBe(true);

      // Now a legitimate teacher with correct password logs in
      const lease = await service.acquireSlot({
        ipAddress: ip,
        username: 'legitimate_teacher',
      });
      expect(lease).toBeDefined();
      expect(service.getInFlightCountForIp(ip)).toBe(1);

      // Degraded mode enforces in-flight = 1
      const secondAttemptPromise = service.acquireSlot({
        ipAddress: ip,
        username: 'another_teacher',
      });
      // Second attempt is queued because degraded mode limits concurrency to 1
      expect(service.getQueueLengthForIp(ip)).toBe(1);

      // Release first legitimate login as successful
      lease.release({ isFailure: false });

      // Second attempt gets admitted
      const secondLease = await secondAttemptPromise;
      expect(secondLease).toBeDefined();
      secondLease.release({ isFailure: false });
    });

    it('TC-03: enforces per-account rate limit of 10 attempts per window regardless of IP', async () => {
      const username = 'victim_user';

      // 10 attempts from 10 different IPs
      for (let i = 1; i <= 10; i += 1) {
        const lease = await service.acquireSlot({
          ipAddress: `198.51.100.${i}`,
          username,
        });
        lease.release({ isFailure: true });
      }

      // 11th attempt from yet another IP is rejected due to account-level rate limit
      await expect(
        service.acquireSlot({
          ipAddress: '198.51.100.99',
          username,
        }),
      ).rejects.toThrow('Quá nhiều lần đăng nhập cho tài khoản này.');
    });

    it('TC-04: enforces IP total request ceiling of 150 requests per window', async () => {
      const customConfig: AppConfig = {
        ...config,
        auth: {
          ...config.auth,
          loginRateLimitIpTotalMax: 5, // Set low ceiling for quick test
        },
      };
      const testService = new LoginRateLimitService(customConfig);
      const ip = '203.0.113.88';

      // First 5 requests pass
      for (let i = 1; i <= 5; i += 1) {
        const lease = await testService.acquireSlot({
          ipAddress: ip,
          username: `user_${i}`,
        });
        lease.release();
      }

      // 6th request exceeds IP total ceiling
      await expect(
        testService.acquireSlot({
          ipAddress: ip,
          username: 'user_6',
        }),
      ).rejects.toThrow('Quá nhiều lần đăng nhập từ địa chỉ mạng này.');
    });

    it('TC-05: normalizes usernames consistently across casing and whitespace', async () => {
      const customConfig: AppConfig = {
        ...config,
        auth: { ...config.auth, loginRateLimitUserMax: 2 },
      };
      const testService = new LoginRateLimitService(customConfig);

      const lease1 = await testService.acquireSlot({ ipAddress: '127.0.0.1', username: 'TeacherOne' });
      lease1.release();

      const lease2 = await testService.acquireSlot({ ipAddress: '127.0.0.1', username: '  teacherone  ' });
      lease2.release();

      // 3rd attempt on same normalized account is rejected
      await expect(
        testService.acquireSlot({ ipAddress: '127.0.0.1', username: 'TEACHERONE' }),
      ).rejects.toThrow('Quá nhiều lần đăng nhập cho tài khoản này.');
    });

    it('TC-06: rejects requests with invalid or missing IP with 400 Bad Request', async () => {
      await expect(
        service.acquireSlot({ ipAddress: '', username: 'user1' }),
      ).rejects.toThrow('Địa chỉ IP máy khách không hợp lệ.');

      await expect(
        service.acquireSlot({ ipAddress: 'not-an-ip', username: 'user1' }),
      ).rejects.toThrow('Địa chỉ IP máy khách không hợp lệ.');
    });

    it('TC-07: enforces queue capacity limit per IP and fails closed with 429', async () => {
      const customConfig: AppConfig = {
        ...config,
        auth: {
          ...config.auth,
          loginRateLimitInFlightIp: 1,
          loginRateLimitMaxQueuePerIp: 2,
        },
      };
      const testService = new LoginRateLimitService(customConfig);
      const ip = '192.0.2.1';

      // Slot 1 occupied
      const lease1 = await testService.acquireSlot({ ipAddress: ip, username: 'u1' });

      // Slot 2 and 3 in queue
      testService.acquireSlot({ ipAddress: ip, username: 'u2' }).catch(() => {});
      testService.acquireSlot({ ipAddress: ip, username: 'u3' }).catch(() => {});

      // 4th request exceeds maxQueuePerIp (2)
      await expect(
        testService.acquireSlot({ ipAddress: ip, username: 'u4' }),
      ).rejects.toThrow('Quá nhiều yêu cầu đang chờ từ mạng này.');

      lease1.release();
      testService.onModuleDestroy();
    });

    it('TC-08: removes aborted request from queue when client closes connection', async () => {
      const customConfig: AppConfig = {
        ...config,
        auth: { ...config.auth, loginRateLimitInFlightIp: 1 },
      };
      const testService = new LoginRateLimitService(customConfig);
      const ip = '192.0.2.2';

      // Hold slot 1
      const lease1 = await testService.acquireSlot({ ipAddress: ip, username: 'u1' });

      // Mock request close listener
      let closeListener: (() => void) | undefined;
      const mockReq = {
        on: (event: string, fn: () => void) => {
          if (event === 'close') closeListener = fn;
        },
      };

      // Queue request 2
      void testService.acquireSlot({ ipAddress: ip, username: 'u2', request: mockReq });
      expect(testService.getQueueLengthForIp(ip)).toBe(1);

      // Client closes connection while in queue
      closeListener?.();
      expect(testService.getQueueLengthForIp(ip)).toBe(0);

      lease1.release();
      testService.onModuleDestroy();
    });

    it('TC-09: prunes expired keys and preserves active keys without eviction bypass', async () => {
      const customConfig: AppConfig = {
        ...config,
        auth: {
          ...config.auth,
          loginRateLimitMaxUserKeys: 2,
          loginRateLimitWindowSeconds: 60,
        },
      };
      const testService = new LoginRateLimitService(customConfig);

      // User 1 at t=0
      const l1 = await testService.acquireSlot({ ipAddress: '1.1.1.1', username: 'u1', now: 0 });
      l1.release();

      // User 2 at t=30s
      const l2 = await testService.acquireSlot({ ipAddress: '1.1.1.2', username: 'u2', now: 30_000 });
      l2.release();
      expect(testService.trackedUserKeyCount).toBe(2);

      // At t=61s, u1 is expired, so u3 can take its place after pruning
      const l3 = await testService.acquireSlot({ ipAddress: '1.1.1.3', username: 'u3', now: 60_001 });
      l3.release();
      expect(testService.trackedUserKeyCount).toBe(2);

      // At t=62s, both u2 (expires 90s) and u3 (expires 120s) are active, so capacity is filled
      // u4 must be rejected (fail-closed) and u2/u3 must NOT be evicted!
      await expect(
        testService.acquireSlot({ ipAddress: '1.1.1.4', username: 'u4', now: 60_002 }),
      ).rejects.toThrow('Quá nhiều yêu cầu đăng nhập.');

      expect(testService.trackedUserKeyCount).toBe(2);
      testService.onModuleDestroy();
    });
  });
});
