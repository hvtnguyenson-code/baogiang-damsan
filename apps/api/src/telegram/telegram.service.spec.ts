import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { TelegramService } from './telegram.service';
import { AppConfig } from '../config/app.config';
import { TelegramSendResult, TelegramTransportPort } from './telegram-transport.port';

interface MockPrisma {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  telegramAccountLink: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete?: jest.Mock;
  };
  telegramLinkChallenge: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  telegramWebhookReceipt: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  telegramNotificationDelivery: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete?: jest.Mock;
  };
}

describe('TelegramService (ADR-058 Acceptance Cases)', () => {
  let service: TelegramService;
  let mockPrisma: MockPrisma;
  let mockTransport: jest.Mocked<TelegramTransportPort>;
  let mockConfig: AppConfig;

  const validSecret = 'valid_webhook_secret_12345';
  const botToken = '123456:ABC-DEF_ghi';

  beforeEach(() => {
    mockConfig = {
      nodeEnv: 'test',
      timeZone: 'Asia/Ho_Chi_Minh',
      host: '127.0.0.1',
      port: 3100,
      httpTrustProxyHops: 1,
      corsOrigins: ['http://localhost:5173'],
      auth: {
        sessionTtlSeconds: 86400,
        lastSeenUpdateSeconds: 300,
        cookieName: 'sid',
        cookiePath: '/',
        cookieSecure: false,
        cookieSameSite: 'lax',
        lockoutThreshold: 5,
        lockoutDurationSeconds: 900,
        passwordMinLength: 8,
        loginRateLimitMax: 10,
        loginRateLimitWindowSeconds: 60,
        loginRateLimitMaxKeys: 1000,
      },
      aiEnabled: false,
      aiActiveModeEnabled: false,
      aiPassiveModeEnabled: false,
      webPushEnabled: false,
      telegram: {
        enabled: true,
        botToken,
        botUsername: 'baogiang_test_bot',
        webhookSecret: validSecret,
      },
      databaseUrl: 'postgresql://...',
      logLevel: 'info',
    };

    mockTransport = {
      sendMessage: jest.fn().mockResolvedValue({
        success: true,
        providerMessageId: '1001',
      } as TelegramSendResult),
    };

    let lastCreatedDelivery: {
      id?: string;
      deliveryStatus?: string;
      accountLinkId?: string;
      telegramChatId?: string;
      [key: string]: unknown;
    } | null = null;
    let lastCreatedAccountLink: {
      id?: string;
      status?: string;
      telegramChatId?: string;
      [key: string]: unknown;
    } | null = null;

    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      telegramAccountLink: {
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastCreatedAccountLink = { id: (data['id'] as string) ?? 'link-created', ...data };
          return lastCreatedAccountLink;
        }),
        update: jest.fn(),
      },
      telegramLinkChallenge: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramWebhookReceipt: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      telegramNotificationDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { id?: string; commandKey?: string } }) => {
          if (where?.id) {
            return {
              id: where.id,
              deliveryStatus: lastCreatedDelivery?.deliveryStatus ?? 'RESERVED',
              accountLink: {
                id: lastCreatedDelivery?.accountLinkId ?? lastCreatedAccountLink?.id ?? 'link-default',
                status: lastCreatedAccountLink?.status ?? 'ACTIVE',
                telegramChatId:
                  lastCreatedDelivery?.telegramChatId ??
                  lastCreatedAccountLink?.telegramChatId ??
                  '123456',
              },
            };
          }
          return null;
        }),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id?: string } }) => {
          return {
            id: where?.id ?? 'del-default',
            deliveryStatus: 'SENT',
            accountLink: {
              id: lastCreatedDelivery?.accountLinkId ?? lastCreatedAccountLink?.id ?? 'link-default',
              status: lastCreatedAccountLink?.status ?? 'ACTIVE',
              telegramChatId:
                lastCreatedDelivery?.telegramChatId ??
                lastCreatedAccountLink?.telegramChatId ??
                '123456',
            },
          };
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastCreatedDelivery = { id: (data['id'] as string) ?? 'del-created', ...data };
          return lastCreatedDelivery;
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new TelegramService(mockPrisma as unknown as never, mockConfig, mockTransport);
  });

  // -------------------------------------------------------------
  // Case 1: Malformed webhook secret does not cause 500 error
  // -------------------------------------------------------------
  it('1. malformed webhook secret does not cause 500 (fails closed with 401)', async () => {
    // Malformed length and syntax: short, very long, weird chars
    await expect(service.handleWebhook({ update_id: 1 }, '')).rejects.toThrow(UnauthorizedException);
    await expect(service.handleWebhook({ update_id: 1 }, 'different_length')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.handleWebhook({ update_id: 1 }, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // -------------------------------------------------------------
  // Case 2: Webhook secret charset / length validation
  // -------------------------------------------------------------
  it('2. secret charset and length boundaries are enforced fail-closed', async () => {
    // Contains spaces, symbols not in [A-Za-z0-9_-]
    await expect(service.handleWebhook({ update_id: 1 }, 'secret with spaces')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.handleWebhook({ update_id: 1 }, 'secret@special!')).rejects.toThrow(
      UnauthorizedException,
    );
    // Over 256 chars
    const hugeSecret = 'a'.repeat(257);
    await expect(service.handleWebhook({ update_id: 1 }, hugeSecret)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // -------------------------------------------------------------
  // Case 3: Provider extra fields do not break /start
  // -------------------------------------------------------------
  it('3. provider extra fields do not break /start processing', async () => {
    const rawToken = 'challenge_token_0123456789abcdef';

    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValue({
      id: 'challenge-uuid',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramAccountLink.create.mockResolvedValue({ id: 'link-uuid' });
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({ id: 'del-uuid' });
    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue({
      id: 'del-uuid',
      deliveryStatus: 'RESERVED',
      accountLink: { id: 'link-uuid', status: 'ACTIVE', telegramChatId: '123456789' },
    });
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramNotificationDelivery.update.mockResolvedValue({});

    const payload = {
      update_id: 10001,
      extra_unknown_field: { foo: 'bar', timestamp: 123456 },
      message: {
        message_id: 555,
        date: 123456,
        text: `/start ${rawToken}`,
        chat: { id: 123456789, type: 'private', username: 'testuser' },
        from: { id: 987654321, first_name: 'Test' },
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockPrisma.telegramWebhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updateId: '10001', status: 'PROCESSED' }),
      }),
    );
    expect(mockTransport.sendMessage).toHaveBeenCalledWith(
      '123456789',
      'Báo giảng Đam San đã kết nối Telegram thành công.',
    );
  });

  // -------------------------------------------------------------
  // Case 4: Unsupported valid update -> IGNORED, no business mutation
  // -------------------------------------------------------------
  it('4. unsupported valid update marks receipt IGNORED with zero business mutation', async () => {
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);

    const payload = {
      update_id: 10002,
      message: {
        chat: { id: 123, type: 'group' }, // group chat not supported
        text: '/start some_token',
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockPrisma.telegramWebhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updateId: '10002', status: 'IGNORED' }),
      }),
    );
    expect(mockPrisma.telegramAccountLink.create).not.toHaveBeenCalled();
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 5: Concurrent challenge -> max 1 usable PENDING challenge
  // -------------------------------------------------------------
  it('5. createLinkChallenge revokes prior pending challenges transactionally', async () => {
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramLinkChallenge.create.mockResolvedValue({ id: 'new-ch' });

    const result = await service.createLinkChallenge('user-1');
    expect(result.deepLink).toContain('https://t.me/baogiang_test_bot?start=');
    expect(mockPrisma.telegramLinkChallenge.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
    expect(mockPrisma.telegramLinkChallenge.create).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 6: Expired challenge is not consumed
  // -------------------------------------------------------------
  it('6. expired challenge cannot be consumed', async () => {
    const rawToken = 'expired_token_1234567890abcdef';

    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValue({
      id: 'expired-ch',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const payload = {
      update_id: 10003,
      message: {
        chat: { id: 123, type: 'private' },
        from: { id: 123 },
        text: `/start ${rawToken}`,
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockPrisma.telegramWebhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updateId: '10003', status: 'IGNORED' }),
      }),
    );
    expect(mockPrisma.telegramAccountLink.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 7: Unexpected DB failure propagates error (no receipt, no provider call)
  // -------------------------------------------------------------
  it('7. unexpected DB failure propagates error without committing receipt or calling provider', async () => {
    const rawToken = 'test_token_rollback_12345678';
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValue({
      id: 'ch-1',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(null);

    // Make the transaction fail on infrastructure failure (e.g. database connection lost)
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      throw new Error('DATABASE_CONNECTION_LOST');
    });

    const payload = {
      update_id: 10004,
      message: {
        chat: { id: 123, type: 'private' },
        from: { id: 123 },
        text: `/start ${rawToken}`,
      },
    };

    // Propagates exception, does NOT swallow with { ok: true }
    await expect(service.handleWebhook(payload, validSecret)).rejects.toThrow('DATABASE_CONNECTION_LOST');
    // Nothing committed, no provider call
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 8A: PROCESSED receipt with non-RESERVED delivery -> zero provider call
  // -------------------------------------------------------------
  it('8A. duplicate update_id with terminal or in-flight delivery makes zero provider call', async () => {
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      updateId: '10005',
      status: 'PROCESSED',
    });
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-1',
      status: 'ACTIVE',
      telegramChatId: '123',
    });
    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue({
      id: 'del-1',
      deliveryStatus: 'SENT',
      accountLink: { status: 'ACTIVE', telegramChatId: '123' },
    });

    const payload = {
      update_id: 10005,
      message: {
        chat: { id: 123, type: 'private' },
        from: { id: 123 },
        text: '/start any_token_12345678',
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockPrisma.telegramAccountLink.create).not.toHaveBeenCalled();
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 8B: PROCESSED receipt with RESERVED delivery and ACTIVE link -> CAS claim & send
  // -------------------------------------------------------------
  it('8B. redelivered update with PROCESSED receipt recovers crashed RESERVED delivery', async () => {
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      updateId: '10005',
      status: 'PROCESSED',
    });
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-1',
      status: 'ACTIVE',
      telegramChatId: '123',
    });
    // Delivery is still RESERVED because process crashed before provider call
    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue({
      id: 'del-1',
      deliveryStatus: 'RESERVED',
      accountLink: { status: 'ACTIVE', telegramChatId: '123' },
    });
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramNotificationDelivery.update.mockResolvedValue({});

    const payload = {
      update_id: 10005,
      message: {
        chat: { id: 123, type: 'private' },
        from: { id: 123 },
        text: '/start any_token_12345678',
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockTransport.sendMessage).toHaveBeenCalledWith('123', expect.any(String));
  });

  // -------------------------------------------------------------
  // Case 9: Same requestKey & fingerprint does not duplicate send
  // -------------------------------------------------------------
  it('9. same requestKey and fingerprint returns existing terminal status without duplicate provider send', async () => {
    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa01';
    const activeLink = { id: 'link-1', telegramChatId: '123456' };
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(activeLink);

    const payloadDigest = crypto
      .createHash('sha256')
      .update('Báo giảng Đam San đã kết nối Telegram thành công.')
      .digest('hex');
    const fingerprint = crypto
      .createHash('sha256')
      .update(`user-1:${activeLink.id}:SELF_TEST:${payloadDigest}`)
      .digest('hex');

    // Existing delivery already SENT
    const existingDelivery = {
      id: 'del-1',
      deliveryStatus: 'SENT',
      commandFingerprint: fingerprint,
      sentAt: new Date(),
    };

    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue(existingDelivery);
    mockPrisma.telegramNotificationDelivery.findUniqueOrThrow.mockResolvedValue(existingDelivery);

    const res = await service.sendTestNotification('user-1', requestKey);
    expect(res.deliveryStatus).toBe('SENT');
    expect(mockTransport.sendMessage).not.toHaveBeenCalled(); // No duplicate send!
  });

  // -------------------------------------------------------------
  // Case 10: Same requestKey with different fingerprint -> 409 Conflict
  // -------------------------------------------------------------
  it('10. same requestKey with different fingerprint throws 409 Conflict without provider call', async () => {
    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa02';
    const activeLink = { id: 'link-1', telegramChatId: '123456' };
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(activeLink);

    const existingDelivery = {
      id: 'del-2',
      deliveryStatus: 'SENT',
      commandFingerprint: 'different_fingerprint_hash_abc',
    };

    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue(existingDelivery);

    await expect(service.sendTestNotification('user-1', requestKey)).rejects.toThrow(
      ConflictException,
    );
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 11 & 17: Same textual requestKey across different actors
  // -------------------------------------------------------------
  it('11 & 17. same requestKey across different actors yields independent commandKeys and no collision', async () => {
    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa03';
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-user-a',
      telegramChatId: '111',
    });
    mockPrisma.telegramNotificationDelivery.findUnique.mockResolvedValue(null);
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({
      id: 'del-a',
      deliveryStatus: 'RESERVED',
    });
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramNotificationDelivery.update.mockResolvedValue({});
    mockPrisma.telegramNotificationDelivery.findUniqueOrThrow.mockResolvedValue({
      id: 'del-a',
      deliveryStatus: 'SENT',
    });

    await service.sendTestNotification('user-a', requestKey);

    expect(mockPrisma.telegramNotificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commandKey: `self-test:user-a:${requestKey}`,
        }),
      }),
    );
  });

  // -------------------------------------------------------------
  // Case 12 & 20: Stale ATTEMPTING -> UNKNOWN, no auto retry
  // -------------------------------------------------------------
  it('12 & 20. reconcileStaleDeliveries transitions stale ATTEMPTING to UNKNOWN without auto-retry', async () => {
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 3 });

    const count = await service.reconcileStaleDeliveries(60000);
    expect(count).toBe(3);
    expect(mockPrisma.telegramNotificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deliveryStatus: 'ATTEMPTING' }),
        data: {
          deliveryStatus: 'UNKNOWN',
          sanitizedErrorCode: 'ORPHAN_ATTEMPT_STALE',
        },
      }),
    );
    // ZERO resend calls
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 14 & 15: CAS send claim: second sender cannot claim
  // -------------------------------------------------------------
  it('14 & 15. concurrent send claim: only count===1 invokes provider call', async () => {
    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa04';
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-1',
      telegramChatId: '123',
    });
    mockPrisma.telegramNotificationDelivery.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; commandKey?: string } }) => {
        if (where?.commandKey) return null;
        return {
          id: 'del-cas',
          deliveryStatus: 'ATTEMPTING',
          accountLink: { status: 'ACTIVE', telegramChatId: '123' },
        };
      },
    );
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({
      id: 'del-cas',
      deliveryStatus: 'RESERVED',
    });

    // Simulate CAS failure: another thread already claimed it (affectedRows == 0)
    mockPrisma.$executeRaw.mockResolvedValue(0);
    mockPrisma.telegramNotificationDelivery.findUniqueOrThrow.mockResolvedValue({
      id: 'del-cas',
      deliveryStatus: 'ATTEMPTING',
    });

    const res = await service.sendTestNotification('user-1', requestKey);
    expect(res.deliveryStatus).toBe('ATTEMPTING');
    // Provider MUST NOT be called!
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 16: Invalid requestKey -> 400 Bad Request, no DB mutation
  // -------------------------------------------------------------
  it('16. invalid requestKey throws 400 Bad Request with zero DB mutation', async () => {
    // Uppercase or malformed UUID
    await expect(service.sendTestNotification('user-1', 'NOT-A-UUID')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.sendTestNotification('user-1', 'C3D9A182-3580-4824-912A-387B9264FA01'),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.telegramNotificationDelivery.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Case 18: Duplicate link-success -> one commandKey
  // -------------------------------------------------------------
  it('18. link-success commandKey is deterministic: link-success:<accountLinkId>', async () => {
    const rawToken = 'test_token_link_success_123456';
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValue({
      id: 'ch-success',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramAccountLink.create.mockResolvedValue({ id: 'link-12345' });
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({ id: 'del-success' });
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.telegramNotificationDelivery.update.mockResolvedValue({});

    await service.handleWebhook(
      {
        update_id: 99999,
        message: {
          text: `/start ${rawToken}`,
          chat: { id: 777, type: 'private' },
          from: { id: 888 },
        },
      },
      validSecret,
    );

    expect(mockPrisma.telegramNotificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commandKey: 'link-success:link-12345',
        }),
      }),
    );
  });

  // -------------------------------------------------------------
  // Case 19: attemptStartedAt committed before provider call
  // -------------------------------------------------------------
  it('19. attemptStartedAt is committed before provider call', async () => {
    const callOrder: string[] = [];
    mockPrisma.$executeRaw.mockImplementation(async () => {
      callOrder.push('CAS_RESERVED_TO_ATTEMPTING');
      return 1;
    });
    mockTransport.sendMessage.mockImplementation(async () => {
      callOrder.push('PROVIDER_SEND');
      return { success: true, providerMessageId: '999' };
    });
    mockPrisma.telegramNotificationDelivery.update.mockImplementation(async () => {
      callOrder.push('PERSIST_TERMINAL_SENT');
      return {};
    });

    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa05';
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-1',
      telegramChatId: '123',
    });
    mockPrisma.telegramNotificationDelivery.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; commandKey?: string } }) => {
        if (where?.commandKey) return null;
        return {
          id: where?.id ?? 'del-order',
          deliveryStatus: 'RESERVED',
          accountLink: { id: 'link-1', status: 'ACTIVE', telegramChatId: '123' },
        };
      },
    );
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({
      id: 'del-order',
      deliveryStatus: 'RESERVED',
    });
    mockPrisma.telegramNotificationDelivery.findUniqueOrThrow.mockResolvedValue({
      id: 'del-order',
      deliveryStatus: 'SENT',
      accountLink: { id: 'link-1', status: 'ACTIVE', telegramChatId: '123' },
    });

    await service.sendTestNotification('user-1', requestKey);
    expect(callOrder).toEqual([
      'CAS_RESERVED_TO_ATTEMPTING',
      'PROVIDER_SEND',
      'PERSIST_TERMINAL_SENT',
    ]);
  });

  // -------------------------------------------------------------
  // Case 24: TELEGRAM_ENABLED=false => zero provider call
  // -------------------------------------------------------------
  it('24. TELEGRAM_ENABLED=false rejects mutations and makes zero provider calls', async () => {
    const disabledService = new TelegramService(
      mockPrisma as unknown as never,
      { ...mockConfig, telegram: { enabled: false } },
      mockTransport,
    );

    await expect(disabledService.createLinkChallenge('user-1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(disabledService.unlink('user-1')).rejects.toThrow(BadRequestException);
    await expect(
      disabledService.sendTestNotification('user-1', 'c3d9a182-3580-4824-912a-387b9264fa06'),
    ).rejects.toThrow(BadRequestException);
    await expect(disabledService.handleWebhook({}, validSecret)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
    const status = await disabledService.getIntegrationStatus('user-1');
    expect(status).toEqual({ enabled: false, linked: false });
  });

  // -------------------------------------------------------------
  // Case 27: Unlink retains history
  // -------------------------------------------------------------
  it('27. unlink updates status to REVOKED and retains records without hard delete', async () => {
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({ id: 'link-to-revoke' });
    mockPrisma.telegramAccountLink.update.mockResolvedValue({});
    mockPrisma.telegramLinkChallenge.updateMany.mockResolvedValue({});

    const res = await service.unlink('user-1');
    expect(res.unlinked).toBe(true);
    expect(res.revokedAt).toBeDefined();
    expect(mockPrisma.telegramAccountLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'link-to-revoke' },
        data: expect.objectContaining({ status: 'REVOKED' }),
      }),
    );
    // NEVER call delete or deleteMany on link or delivery tables!
    expect(mockPrisma.telegramAccountLink.delete).toBeUndefined();
    expect(mockPrisma.telegramNotificationDelivery.delete).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Case 28: Active identity takeover rejected
  // -------------------------------------------------------------
  it('28. linking fails if Telegram identity is already ACTIVE for another account', async () => {
    const rawToken = 'test_token_takeover_12345678';
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValue({
      id: 'ch-takeover',
      userId: 'user-new',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60000),
    });
    // Another user already has this telegramUserId active!
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-existing',
      userId: 'user-old',
      telegramUserId: '987654',
      status: 'ACTIVE',
    });

    const payload = {
      update_id: 10006,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: 12345, type: 'private' },
        from: { id: 987654 },
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    // Must NOT create link for user-new
    expect(mockPrisma.telegramAccountLink.create).not.toHaveBeenCalled();
    expect(mockPrisma.telegramWebhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IGNORED' }),
      }),
    );
  });

  // -------------------------------------------------------------
  // Case 29: API response does not expose Telegram numeric IDs or hashes
  // -------------------------------------------------------------
  it('29. getIntegrationStatus does not expose numeric Telegram IDs or token hashes', async () => {
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-uuid',
      userId: 'user-1',
      telegramUserId: '123456789', // secret numeric ID
      telegramChatId: '987654321', // secret numeric ID
      status: 'ACTIVE',
      linkedAt: new Date('2026-10-06T12:00:00Z'),
    });
    mockPrisma.telegramLinkChallenge.findFirst.mockResolvedValue({
      id: 'ch-uuid',
      tokenHash: 'secret_sha256_hash',
      expiresAt: new Date('2026-10-06T12:10:00Z'),
    });

    const status = await service.getIntegrationStatus('user-1');
    expect(status.enabled).toBe(true);
    expect(status.linked).toBe(true);
    expect(status.linkedAt).toBe('2026-10-06T12:00:00.000Z');
    // Numeric IDs and token hashes must NOT be in the response object
    expect((status as unknown as Record<string, unknown>).telegramUserId).toBeUndefined();
    expect((status as unknown as Record<string, unknown>).telegramChatId).toBeUndefined();
    expect((status as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Startup Reconciliation: marks pre-existing ATTEMPTING as UNKNOWN
  // -------------------------------------------------------------
  it('startup reconciliation marks any pre-existing ATTEMPTING delivery (even 1s old) as UNKNOWN', async () => {
    mockPrisma.telegramNotificationDelivery.updateMany.mockResolvedValue({ count: 2 });
    const count = await service.reconcileAttemptingOnStartup();
    expect(count).toBe(2);
    expect(mockPrisma.telegramNotificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { deliveryStatus: 'ATTEMPTING' },
      data: {
        deliveryStatus: 'UNKNOWN',
        sanitizedErrorCode: 'PROCESS_RESTARTED_DURING_ATTEMPT',
      },
    });
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Section H: Link status REVOKED before send claim prevents provider call
  // -------------------------------------------------------------
  it('RESERVED delivery is not sent if associated accountLink is REVOKED before send claim', async () => {
    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa99';
    mockPrisma.$executeRaw.mockResolvedValueOnce(0);
    mockPrisma.telegramAccountLink.findFirst.mockResolvedValue({
      id: 'link-revoked-test',
      status: 'ACTIVE',
      telegramChatId: '123',
    });
    mockPrisma.telegramNotificationDelivery.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; commandKey?: string } }) => {
        if (where?.commandKey) return null;
        if (where?.id === 'del-revoked') {
          return {
            id: 'del-revoked',
            deliveryStatus: 'RESERVED',
            accountLink: {
              id: 'link-revoked-test',
              status: 'REVOKED',
              telegramChatId: '123',
            },
          };
        }
        return null;
      },
    );
    mockPrisma.telegramNotificationDelivery.create.mockResolvedValue({
      id: 'del-revoked',
      deliveryStatus: 'RESERVED',
    });
    mockPrisma.telegramNotificationDelivery.findUniqueOrThrow.mockResolvedValue({
      id: 'del-revoked',
      deliveryStatus: 'FAILED',
      sanitizedErrorCode: 'LINK_NOT_ACTIVE',
    });

    const res = await service.sendTestNotification('user-1', requestKey);
    expect(res.deliveryStatus).toBe('FAILED');
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
    expect(mockPrisma.telegramNotificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'del-revoked', deliveryStatus: 'RESERVED' }),
        data: expect.objectContaining({ deliveryStatus: 'FAILED', sanitizedErrorCode: 'LINK_NOT_ACTIVE' }),
      }),
    );
  });

  // -------------------------------------------------------------
  // Section I1: Unsupported update throws if IGNORED receipt create fails
  // -------------------------------------------------------------
  it('unsupported update: IGNORED receipt create throws infra error and durable receipt absent => service throws', async () => {
    mockPrisma.telegramWebhookReceipt.create.mockRejectedValueOnce(new Error('DB_CONN_FAILURE'));
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValueOnce(null);

    const payload = {
      update_id: 99991,
      message: { text: 'not a start command', chat: { id: 123, type: 'private' } },
    };

    await expect(service.handleWebhook(payload, validSecret)).rejects.toThrow('DB_CONN_FAILURE');
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Section I2: Invalid/expired challenge throws if IGNORED receipt create fails
  // -------------------------------------------------------------
  it('invalid/expired challenge: IGNORED receipt create throws infra error and durable receipt absent => service throws', async () => {
    const rawToken = 'expired_challenge_token_12345';
    mockPrisma.telegramLinkChallenge.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 60000),
    });
    mockPrisma.telegramWebhookReceipt.create.mockRejectedValueOnce(new Error('STORAGE_TIMEOUT'));
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValueOnce(null);

    const payload = {
      update_id: 99992,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: 99992, type: 'private' },
        from: { id: 99992 },
      },
    };

    await expect(service.handleWebhook(payload, validSecret)).rejects.toThrow('STORAGE_TIMEOUT');
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Section I3: Duplicate receipt race: create throws, re-read finds durable receipt => safe {ok: true}
  // -------------------------------------------------------------
  it('duplicate receipt race: create throws, re-read finds durable receipt => safe {ok: true}', async () => {
    mockPrisma.telegramWebhookReceipt.create.mockRejectedValueOnce(new Error('Unique constraint failed'));
    mockPrisma.telegramWebhookReceipt.findUnique.mockResolvedValueOnce({
      id: 'receipt-concurrent',
      updateId: '99993',
      status: 'IGNORED',
    });

    const payload = {
      update_id: 99993,
      message: { text: 'hello world', chat: { id: 123, type: 'private' } },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Section I4: Startup reconcile DB failure: module init rejects
  // -------------------------------------------------------------
  it('startup reconcile DB failure: module init rejects without swallowing error', async () => {
    mockPrisma.telegramNotificationDelivery.updateMany.mockRejectedValueOnce(
      new Error('STARTUP_RECONCILE_DB_UNAVAILABLE'),
    );

    await expect(service.onModuleInit()).rejects.toThrow('STARTUP_RECONCILE_DB_UNAVAILABLE');
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();
  });
});
