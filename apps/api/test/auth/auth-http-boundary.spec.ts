import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import { configureTrustProxy, readCookie, requestMeta } from '../../src/auth/auth-http';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { AppConfig } from '../../src/config/app.config';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { AuthController } from '../../src/auth/auth.controller';
import { Response } from 'express';

const config = {
  auth: {
    cookieName: 'test_session', cookiePath: '/api', cookieSecure: false,
    cookieSameSite: 'lax', cookieDomain: undefined,
  },
} as AppConfig;

describe('auth HTTP boundary', () => {
  it.each([
    { hops: 0, expected: '127.0.0.1' },
    { hops: 1, expected: '203.0.113.10' },
  ])('uses Express request.ip with trust proxy $hops', async ({ hops, expected }) => {
    const app = express();
    configureTrustProxy(app, hops);
    app.get('/ip', (req, res) => res.json(requestMeta(req)));
    const response = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.10');
    expect(response.body.ipAddress).toBe(expected);
  });

  it('does not parse raw forwarding headers inside requestMeta', () => {
    const meta = requestMeta({
      ip: '::ffff:127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.25', 'user-agent': 'test' },
    } as unknown as AuthenticatedRequest);
    expect(meta.ipAddress).toBe('127.0.0.1');
  });

  it('uses the normalized Express IP for both rate limiting and session metadata', async () => {
    const auth = {
      login: jest.fn().mockResolvedValue({
        rawToken: 'abcdefghijklmnopqrstuvwxyzABCDEFGH_1234567',
        expiresAt: new Date('2026-08-04T01:00:00Z'),
        user: { id: 'user-id', username: 'user', displayName: 'User', mustChangePassword: false },
      }),
    };
    const rateLimit = { consume: jest.fn() };
    const controller = new AuthController(auth as never, rateLimit as never, config);
    const httpRequest = {
      ip: '::ffff:127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.25' },
    } as unknown as AuthenticatedRequest;
    const response = { cookie: jest.fn() } as unknown as Response;
    await controller.login({ username: 'user', password: 'Password9' }, httpRequest, response);
    expect(rateLimit.consume).toHaveBeenCalledWith('127.0.0.1');
    expect(auth.login).toHaveBeenCalledWith(
      'user',
      'Password9',
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
  });

  it('treats malformed percent-encoding as a missing cookie', () => {
    const parsed = readCookie({ headers: { cookie: 'test_session=%E0%A4%A' } } as AuthenticatedRequest, 'test_session');
    expect(parsed).toBeUndefined();
  });

  it('keeps the raw token out of authenticated request context', async () => {
    const auth = {
      authenticate: jest.fn().mockResolvedValue({
        sessionId: 'session-id',
        user: { id: 'user-id', username: 'user', displayName: 'User', mustChangePassword: false },
      }),
    };
    const httpRequest = {
      ip: '127.0.0.1', headers: { cookie: 'test_session=abcdefghijklmnopqrstuvwxyzABCDEFGH_1234567' },
    } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => httpRequest }),
    } as unknown as ExecutionContext;
    const guard = new SessionAuthGuard(auth as never, config);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(httpRequest.auth).toEqual({
      sessionId: 'session-id',
      user: { id: 'user-id', username: 'user', displayName: 'User', mustChangePassword: false },
    });
    expect(JSON.stringify(httpRequest.auth)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('returns 401 for a malformed cookie before authentication', async () => {
    const auth = { authenticate: jest.fn() };
    const httpRequest = { ip: '127.0.0.1', headers: { cookie: 'test_session=%E0%A4%A' } } as AuthenticatedRequest;
    const context = { switchToHttp: () => ({ getRequest: () => httpRequest }) } as unknown as ExecutionContext;
    const guard = new SessionAuthGuard(auth as never, config);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
});
