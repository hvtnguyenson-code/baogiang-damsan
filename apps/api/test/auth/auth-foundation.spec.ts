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
  nodeEnv: 'test', host: '127.0.0.1', port: 3100,
  corsOrigins: ['http://127.0.0.1:5173'], aiEnabled: false,
  aiActiveModeEnabled: false, aiPassiveModeEnabled: false, webPushEnabled: false,
  logLevel: 'error', databaseUrl: 'postgresql://placeholder',
  httpTrustProxyHops: 0,
  auth: {
    sessionTtlSeconds: 3600, lastSeenUpdateSeconds: 300,
    cookieName: 'test_session', cookiePath: '/api', cookieSecure: false, cookieSameSite: 'lax',
    lockoutThreshold: 3, lockoutDurationSeconds: 60, passwordMinLength: 12,
    loginRateLimitMax: 2, loginRateLimitWindowSeconds: 60, loginRateLimitMaxKeys: 2,
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
    expect(policy.shouldUpdateLastSeen(new Date(now.getTime() - 299_000), now)).toBe(false);
    expect(policy.shouldUpdateLastSeen(new Date(now.getTime() - 300_000), now)).toBe(true);
  });
});
