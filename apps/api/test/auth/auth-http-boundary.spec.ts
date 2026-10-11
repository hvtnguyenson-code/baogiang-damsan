import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import http from 'http';
import { AddressInfo } from 'net';
import { configureTrustProxy, readCookie, requestMeta } from '../../src/auth/auth-http';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { AppConfig } from '../../src/config/app.config';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { AuthController } from '../../src/auth/auth.controller';
import { Response } from 'express';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';

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
    const leaseRelease = jest.fn();
    const rateLimit = { acquireSlot: jest.fn().mockResolvedValue({ release: leaseRelease }) };
    const controller = new AuthController(auth as never, rateLimit as never, { listEffectiveCapabilities: jest.fn() } as never, config);
    const httpRequest = {
      ip: '::ffff:127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.25' },
    } as unknown as AuthenticatedRequest;
    const response = { cookie: jest.fn() } as unknown as Response;
    await controller.login({ username: 'user', password: 'Password9' }, httpRequest, response);
    expect(rateLimit.acquireSlot).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '127.0.0.1', username: 'user' }),
    );
    expect(leaseRelease).toHaveBeenCalledWith({ isFailure: false });
    expect(auth.login).toHaveBeenCalledWith(
      'user',
      'Password9',
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
  });

  it('rejects login with 400 Bad Request when client IP cannot be resolved', async () => {
    const auth = { login: jest.fn() };
    const rateLimit = { acquireSlot: jest.fn() };
    const controller = new AuthController(auth as never, rateLimit as never, { listEffectiveCapabilities: jest.fn() } as never, config);
    const httpRequest = {
      ip: 'invalid-ip-string',
      headers: {},
    } as unknown as AuthenticatedRequest;
    const response = { cookie: jest.fn() } as unknown as Response;
    await expect(controller.login({ username: 'user', password: 'Password9' }, httpRequest, response)).rejects.toThrow(
      'Địa chỉ IP máy khách không hợp lệ.',
    );
    expect(rateLimit.acquireSlot).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
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

  function createTestAuthHttpApp(options?: {
    rateLimitConfig?: Partial<AppConfig['auth']>;
    authLoginDelayMs?: number;
  }) {
    const fullConfig: AppConfig = {
      ...config,
      auth: {
        ...config.auth,
        loginRateLimitInFlightIp: 3,
        loginRateLimitMaxQueuePerIp: 60,
        loginRateLimitMaxQueueGlobal: 120,
        loginRateLimitIpTotalMax: 150,
        loginRateLimitQueueTimeoutMs: 10_000,
        ...options?.rateLimitConfig,
      },
    };

    const rateLimitService = new LoginRateLimitService(fullConfig);

    const authService = {
      login: jest.fn().mockImplementation(async (username: string) => {
        if (options?.authLoginDelayMs) {
          await new Promise((r) => setTimeout(r, options.authLoginDelayMs));
        }
        return {
          rawToken: 'mock_token_' + username,
          expiresAt: new Date(Date.now() + 3600_000),
          user: { id: 'user_' + username, username, displayName: 'Teacher ' + username, mustChangePassword: false },
        };
      }),
    };

    const controller = new AuthController(
      authService as never,
      rateLimitService,
      { listEffectiveCapabilities: jest.fn().mockResolvedValue([]) } as never,
      fullConfig,
    );

    const app = express();
    app.use(express.json());
    app.post('/api/auth/login', async (req, res) => {
      try {
        const result = await controller.login(req.body, req, res);
        res.status(200).json(result);
      } catch (err: unknown) {
        if (!res.headersSent && !res.writableEnded && !res.destroyed) {
          const error = err as { getStatus?: () => number; status?: number; message?: string; name?: string };
          const status = typeof error.getStatus === 'function' ? error.getStatus() : (error.status ?? 500);
          res.status(status).json({ message: error.message, error: error.name });
        }
      }
    });

    return { app, controller, rateLimitService, authService };
  }

  it('does not falsely abort queued HTTP POST login when request body stream ends normally', async () => {
    let unblockFirstLogin!: () => void;
    const firstLoginBlocked = new Promise<void>((r) => { unblockFirstLogin = r; });

    const { app, authService, rateLimitService } = createTestAuthHttpApp({
      rateLimitConfig: { loginRateLimitInFlightIp: 1 },
    });

    try {
      (authService.login as jest.Mock).mockImplementationOnce(async (username: string) => {
        await firstLoginBlocked;
        return {
          rawToken: 'mock_token_' + username,
          expiresAt: new Date(Date.now() + 3600_000),
          user: { id: 'u1', username, displayName: 'User 1', mustChangePassword: false },
        };
      });

      // Request 1 takes slot
      const req1Promise = request(app)
        .post('/api/auth/login')
        .send({ username: 'user1', password: 'Password9' });

      await new Promise((r) => setTimeout(r, 20));

      // Request 2 sends full POST body and is queued behind req1
      const req2Promise = request(app)
        .post('/api/auth/login')
        .send({ username: 'user2', password: 'Password9' });

      // Ensure req2's JSON body has been read by body-parser (req 'close' fired) while waiting in queue
      await new Promise((r) => setTimeout(r, 50));

      // Unblock request 1
      unblockFirstLogin();

      const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res2.body.user.username).toBe('user2');
    } finally {
      if (typeof unblockFirstLogin === 'function') {
        unblockFirstLogin();
      }
      rateLimitService.onModuleDestroy();
    }
  });

  it('rejects waiter and creates no session when real HTTP client disconnects while queued', async () => {
    let unblockFirstLogin!: () => void;
    const firstLoginBlocked = new Promise<void>((r) => { unblockFirstLogin = r; });

    const { app, authService, rateLimitService } = createTestAuthHttpApp({
      rateLimitConfig: {
        loginRateLimitInFlightGlobal: 1,
        loginRateLimitInFlightIp: 1,
      },
    });

    let onFirstLoginStarted!: () => void;
    const firstLoginStarted = new Promise<void>((r) => { onFirstLoginStarted = r; });

    (authService.login as jest.Mock).mockImplementationOnce(async (username: string) => {
      onFirstLoginStarted();
      await firstLoginBlocked;
      return {
        rawToken: 'mock_token_' + username,
        expiresAt: new Date(Date.now() + 3600_000),
        user: { id: 'u1', username, displayName: 'User 1', mustChangePassword: false },
      };
    });

    const server = http.createServer(app);
    const sockets = new Set<import('net').Socket>();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      // 1. Occupy slot 1 (eagerly dispatched so the HTTP request is actually sent over the socket)
      const req1Promise = (async () => {
        return await request(server)
          .post('/api/auth/login')
          .send({ username: 'user1', password: 'Password9' });
      })();
      req1Promise.catch(() => {});

      await Promise.race([
        firstLoginStarted,
        new Promise((_, reject) => setTimeout(() => reject(new Error('firstLoginStarted timed out')), 2500)),
      ]);
      expect(rateLimitService.globalInFlightCount).toBe(1);

      // 2. Client 2 connects via raw http.request and enters queue
      const client2Req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      client2Req.on('error', () => {
        // Expected ECONNRESET / abort error when destroyed
      });
      client2Req.write(JSON.stringify({ username: 'user2', password: 'Password9' }));
      client2Req.end();

      // Wait until client 2 enters the queue
      for (let i = 0; i < 50; i += 1) {
        if (rateLimitService.activeQueueLength === 1) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(rateLimitService.activeQueueLength).toBe(1);

      // Client 2 destroys socket prematurely
      client2Req.destroy();

      // Wait until client 2 is removed from the queue
      for (let i = 0; i < 50; i += 1) {
        if (rateLimitService.activeQueueLength === 0) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(rateLimitService.activeQueueLength).toBe(0);

      // Release request 1
      unblockFirstLogin();
      const res1 = await req1Promise;
      expect(res1.status).toBe(200);

      // Verify no session was created for user2
      expect(authService.login).not.toHaveBeenCalledWith('user2', expect.anything(), expect.anything());

      // Subsequent legitimate request 3 succeeds normally
      const res3 = await request(server)
        .post('/api/auth/login')
        .send({ username: 'user3', password: 'Password9' });
      expect(res3.status).toBe(200);
      expect(res3.body.user.username).toBe('user3');
    } finally {
      if (typeof unblockFirstLogin === 'function') {
        unblockFirstLogin();
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      const closeableServer = server as unknown as { closeAllConnections?: () => void };
      if (typeof closeableServer.closeAllConnections === 'function') {
        closeableServer.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      rateLimitService.onModuleDestroy();
    }
  });

  it('serves 50 concurrent valid HTTP login requests from the same IP with 50/50 HTTP 200 success (NAT test)', async () => {
    const { app, rateLimitService } = createTestAuthHttpApp({
      authLoginDelayMs: 5,
      rateLimitConfig: {
        loginRateLimitInFlightIp: 3,
        loginRateLimitMaxQueuePerIp: 60,
        loginRateLimitIpTotalMax: 150,
      },
    });

    try {
      const requests = Array.from({ length: 50 }, (_, i) => {
        const username = `teacher_${i + 1}`;
        return request(app)
          .post('/api/auth/login')
          .send({ username, password: 'StrongPassword9' });
      });

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(50);
      for (let i = 0; i < 50; i += 1) {
        const res = responses[i]!;
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe(`teacher_${i + 1}`);
        expect(res.headers['set-cookie']).toBeDefined();
      }

      expect(rateLimitService.getInFlightCountForIp('127.0.0.1')).toBe(0);
      expect(rateLimitService.getQueueLengthForIp('127.0.0.1')).toBe(0);
    } finally {
      rateLimitService.onModuleDestroy();
    }
  });
});
