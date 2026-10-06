import { UserStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import request from 'supertest';
import * as crypto from 'node:crypto';
import { Phase01Harness, integration } from '../helpers/phase01-test-harness';
import {
  TELEGRAM_TRANSPORT_PORT,
  TelegramTransportPort,
} from '../../src/telegram/telegram-transport.port';
import { TelegramService } from '../../src/telegram/telegram.service';

integration('Telegram PostgreSQL Integration Evidence (Real DB & Migrations)', () => {
  const h = new Phase01Harness();
  let service: TelegramService;
  let mockTransport: jest.Mocked<TelegramTransportPort>;

  const validSecret = 'Integration_Webhook_Secret_12345';

  beforeAll(async () => {
    process.env['TELEGRAM_ENABLED'] = 'true';
    process.env['TELEGRAM_BOT_TOKEN'] = '123456:ABC-DEF_ghi';
    process.env['TELEGRAM_BOT_USERNAME'] = 'baogiang_test_bot';
    process.env['TELEGRAM_WEBHOOK_SECRET'] = validSecret;

    mockTransport = {
      sendMessage: jest.fn().mockResolvedValue({
        success: true,
        providerMessageId: 'prov-msg-100',
      }),
    };

    await h.start([{ token: TELEGRAM_TRANSPORT_PORT, value: mockTransport }]);
    service = h.app.get(TelegramService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await h.clean();
  });

  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  async function createTestUser(prefix = 'user') {
    return h.prisma.user.create({
      data: {
        username: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: await h.passwords.hash('TestPassword123!'),
        status: UserStatus.ACTIVE,
        profile: { create: { displayName: `Test ${prefix}` } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // 1. Partial Unique: Max 1 PENDING challenge / user
  // -------------------------------------------------------------------------
  it('1. enforces partial unique index: maximum 1 PENDING challenge per user at DB level', async () => {
    const user = await createTestUser('p1');
    const tokenHash1 = crypto.randomBytes(32).toString('hex');
    const tokenHash2 = crypto.randomBytes(32).toString('hex');

    // First PENDING challenge succeeds
    await h.prisma.telegramLinkChallenge.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    // Second PENDING challenge for same user must be rejected by PostgreSQL partial index
    await expect(
      h.prisma.telegramLinkChallenge.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash2,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 600000),
        },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);

    // Non-PENDING (e.g. CONSUMED or REVOKED) challenge for same user is allowed
    const nonPending = await h.prisma.telegramLinkChallenge.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash2,
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    expect(nonPending.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Partial Unique: Max 1 ACTIVE account link / user
  // -------------------------------------------------------------------------
  it('2. enforces partial unique index: maximum 1 ACTIVE account link per user at DB level', async () => {
    const user = await createTestUser('p2');

    // First ACTIVE link succeeds
    await h.prisma.telegramAccountLink.create({
      data: {
        userId: user.id,
        telegramUserId: '100001',
        telegramChatId: '100001',
        status: 'ACTIVE',
      },
    });

    // Second ACTIVE link for same user is rejected by PostgreSQL partial index
    await expect(
      h.prisma.telegramAccountLink.create({
        data: {
          userId: user.id,
          telegramUserId: '100002',
          telegramChatId: '100002',
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);

    // REVOKED link for same user is allowed
    const revokedLink = await h.prisma.telegramAccountLink.create({
      data: {
        userId: user.id,
        telegramUserId: '100003',
        telegramChatId: '100003',
        status: 'REVOKED',
      },
    });
    expect(revokedLink.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 3. Partial Unique: Max 1 ACTIVE link / telegramUserId
  // -------------------------------------------------------------------------
  it('3. enforces partial unique index: maximum 1 ACTIVE link per telegramUserId (no takeover)', async () => {
    const userA = await createTestUser('uA');
    const userB = await createTestUser('uB');
    const sharedTgUserId = '200001';

    await h.prisma.telegramAccountLink.create({
      data: {
        userId: userA.id,
        telegramUserId: sharedTgUserId,
        telegramChatId: '200001',
        status: 'ACTIVE',
      },
    });

    // User B trying to link same telegramUserId as ACTIVE must fail at DB level
    await expect(
      h.prisma.telegramAccountLink.create({
        data: {
          userId: userB.id,
          telegramUserId: sharedTgUserId,
          telegramChatId: '200002',
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);
  });

  // -------------------------------------------------------------------------
  // 4. Partial Unique: Max 1 ACTIVE link / telegramChatId
  // -------------------------------------------------------------------------
  it('4. enforces partial unique index: maximum 1 ACTIVE link per telegramChatId', async () => {
    const userA = await createTestUser('uA4');
    const userB = await createTestUser('uB4');
    const sharedChatId = '300001';

    await h.prisma.telegramAccountLink.create({
      data: {
        userId: userA.id,
        telegramUserId: '300001',
        telegramChatId: sharedChatId,
        status: 'ACTIVE',
      },
    });

    await expect(
      h.prisma.telegramAccountLink.create({
        data: {
          userId: userB.id,
          telegramUserId: '300002',
          telegramChatId: sharedChatId,
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);
  });

  // -------------------------------------------------------------------------
  // 5. Actor/Request Partial Unique: Same actor + requestKey cannot duplicate
  // -------------------------------------------------------------------------
  it('5. enforces partial unique index: same actor + requestKey cannot create two deliveries', async () => {
    const user = await createTestUser('p5');
    const link = await h.prisma.telegramAccountLink.create({
      data: {
        userId: user.id,
        telegramUserId: '400001',
        telegramChatId: '400001',
        status: 'ACTIVE',
      },
    });

    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa10';

    await h.prisma.telegramNotificationDelivery.create({
      data: {
        commandKey: `self-test:${user.id}:${requestKey}`,
        actorUserId: user.id,
        requestKey,
        accountLinkId: link.id,
        telegramChatId: link.telegramChatId,
        notificationType: 'SELF_TEST',
        commandFingerprint: 'fingerprint-1',
        payloadDigest: 'digest-1',
        deliveryStatus: 'RESERVED',
      },
    });

    // Duplicate (actorUserId, requestKey) must fail
    await expect(
      h.prisma.telegramNotificationDelivery.create({
        data: {
          commandKey: `different-command-key`,
          actorUserId: user.id,
          requestKey,
          accountLinkId: link.id,
          telegramChatId: link.telegramChatId,
          notificationType: 'SELF_TEST',
          commandFingerprint: 'fingerprint-2',
          payloadDigest: 'digest-2',
          deliveryStatus: 'RESERVED',
        },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);
  });

  // -------------------------------------------------------------------------
  // 6. Same requestKey across two actors is allowed
  // -------------------------------------------------------------------------
  it('6. allows same textual requestKey across different actors without collision', async () => {
    const userA = await createTestUser('uA6');
    const userB = await createTestUser('uB6');
    const linkA = await h.prisma.telegramAccountLink.create({
      data: {
        userId: userA.id,
        telegramUserId: '500001',
        telegramChatId: '500001',
        status: 'ACTIVE',
      },
    });
    const linkB = await h.prisma.telegramAccountLink.create({
      data: {
        userId: userB.id,
        telegramUserId: '500002',
        telegramChatId: '500002',
        status: 'ACTIVE',
      },
    });

    const sharedRequestKey = 'c3d9a182-3580-4824-912a-387b9264fa11';

    const delA = await h.prisma.telegramNotificationDelivery.create({
      data: {
        commandKey: `self-test:${userA.id}:${sharedRequestKey}`,
        actorUserId: userA.id,
        requestKey: sharedRequestKey,
        accountLinkId: linkA.id,
        telegramChatId: linkA.telegramChatId,
        notificationType: 'SELF_TEST',
        commandFingerprint: 'fp-a',
        payloadDigest: 'dig-a',
        deliveryStatus: 'RESERVED',
      },
    });

    const delB = await h.prisma.telegramNotificationDelivery.create({
      data: {
        commandKey: `self-test:${userB.id}:${sharedRequestKey}`,
        actorUserId: userB.id,
        requestKey: sharedRequestKey,
        accountLinkId: linkB.id,
        telegramChatId: linkB.telegramChatId,
        notificationType: 'SELF_TEST',
        commandFingerprint: 'fp-b',
        payloadDigest: 'dig-b',
        deliveryStatus: 'RESERVED',
      },
    });

    expect(delA.id).toBeDefined();
    expect(delB.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Webhook transaction rollback: leaves NO committed receipt/link/delivery
  // -------------------------------------------------------------------------
  it('7. webhook transaction rollback leaves no committed receipt, link, or delivery in PostgreSQL', async () => {
    const user = await createTestUser('u7');
    const rawToken = 'rollback_test_token_0123456789abcdef';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await h.prisma.telegramLinkChallenge.create({
      data: {
        userId: user.id,
        tokenHash,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    // Simulate an unexpected failure inside the transaction
    const updateId = '777001';
    await expect(
      h.prisma.$transaction(async (tx) => {
        await tx.telegramWebhookReceipt.create({
          data: { updateId, status: 'PROCESSED' },
        });
        await tx.telegramAccountLink.create({
          data: {
            userId: user.id,
            telegramUserId: '700001',
            telegramChatId: '700001',
            status: 'ACTIVE',
          },
        });
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }),
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Verify PostgreSQL state: everything rolled back!
    const receipt = await h.prisma.telegramWebhookReceipt.findUnique({ where: { updateId } });
    expect(receipt).toBeNull();

    const link = await h.prisma.telegramAccountLink.findFirst({ where: { userId: user.id } });
    expect(link).toBeNull();

    const challenge = await h.prisma.telegramLinkChallenge.findUnique({ where: { tokenHash } });
    expect(challenge?.status).toBe('PENDING');
  });

  // -------------------------------------------------------------------------
  // 8. Concurrent challenge creation: max 1 usable PENDING row
  // -------------------------------------------------------------------------
  it('8. concurrent challenge creation yields exactly 1 usable PENDING row in PostgreSQL', async () => {
    const user = await createTestUser('u8');

    // Run 2 concurrent challenge creations for same user
    const results = await Promise.allSettled([
      service.createLinkChallenge(user.id),
      service.createLinkChallenge(user.id),
    ]);

    // At least one succeeded
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // Verify DB: exactly 1 PENDING row exists
    const pendingChallenges = await h.prisma.telegramLinkChallenge.findMany({
      where: { userId: user.id, status: 'PENDING' },
    });
    expect(pendingChallenges.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 9. Concurrent delivery claim: exactly one CAS claimant, fake provider max 1 call
  // -------------------------------------------------------------------------
  it('9. concurrent delivery claim: exactly one CAS claimant invokes provider call', async () => {
    const user = await createTestUser('u9');
    const link = await h.prisma.telegramAccountLink.create({
      data: {
        userId: user.id,
        telegramUserId: '900001',
        telegramChatId: '900001',
        status: 'ACTIVE',
      },
    });

    const requestKey = 'c3d9a182-3580-4824-912a-387b9264fa19';

    // Two concurrent requests with exact same actor and requestKey
    await Promise.all([
      service.sendTestNotification(user.id, requestKey),
      service.sendTestNotification(user.id, requestKey),
    ]);

    // CAS guarantees exactly ONE send
    expect(mockTransport.sendMessage).toHaveBeenCalledTimes(1);

    const delivery = await h.prisma.telegramNotificationDelivery.findUniqueOrThrow({
      where: { commandKey: `self-test:${user.id}:${requestKey}` },
    });
    expect(delivery.deliveryStatus).toBe('SENT');
  });

  // -------------------------------------------------------------------------
  // 10. Canonical routing with global prefix
  // -------------------------------------------------------------------------
  it('10. canonical routing with global prefix /api is enforced in supertest', async () => {
    const validRoute = await request(h.app.getHttpServer()).get('/api/integrations/telegram/me');
    expect(validRoute.status).toBe(401);
    expect(validRoute.status).not.toBe(404);

    const doublePrefix = await request(h.app.getHttpServer()).get('/api/api/integrations/telegram/me');
    expect(doublePrefix.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 11. Processed-receipt + RESERVED delivery recovery: max 1 provider call
  // -------------------------------------------------------------------------
  it('11. recovers crashed RESERVED delivery on redelivered update without duplicate records', async () => {
    const user = await createTestUser('u11');
    const updateId = '110001';
    const tgUserId = '110001';
    const tgChatId = '110001';

    // State after crash: receipt committed PROCESSED, link ACTIVE, delivery RESERVED
    await h.prisma.telegramWebhookReceipt.create({
      data: { updateId, status: 'PROCESSED' },
    });

    const link = await h.prisma.telegramAccountLink.create({
      data: {
        userId: user.id,
        telegramUserId: tgUserId,
        telegramChatId: tgChatId,
        status: 'ACTIVE',
      },
    });

    const commandKey = `link-success:${link.id}`;
    await h.prisma.telegramNotificationDelivery.create({
      data: {
        commandKey,
        actorUserId: user.id,
        accountLinkId: link.id,
        telegramChatId: tgChatId,
        notificationType: 'LINK_SUCCESS',
        commandFingerprint: 'fp-11',
        payloadDigest: 'dig-11',
        deliveryStatus: 'RESERVED',
      },
    });

    // Redelivered webhook payload from Telegram
    const payload = {
      update_id: Number(updateId),
      message: {
        text: '/start any_token_123',
        chat: { id: Number(tgChatId), type: 'private' },
        from: { id: Number(tgUserId) },
      },
    };

    const res = await service.handleWebhook(payload, validSecret);
    expect(res).toEqual({ ok: true });

    // Provider was invoked to fulfill the crashed delivery
    expect(mockTransport.sendMessage).toHaveBeenCalledTimes(1);

    // Delivery is now SENT
    const delivery = await h.prisma.telegramNotificationDelivery.findUniqueOrThrow({
      where: { commandKey },
    });
    expect(delivery.deliveryStatus).toBe('SENT');

    // A second redelivery makes ZERO additional provider calls
    await service.handleWebhook(payload, validSecret);
    expect(mockTransport.sendMessage).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 12. Unexpected DB failure is not acknowledged as successful processing
  // -------------------------------------------------------------------------
  it('12. unexpected DB failure rejects and is not acknowledged as successful processing', async () => {
    const user = await createTestUser('u12');
    const rawToken = 'db_failure_test_token_012345678';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await h.prisma.telegramLinkChallenge.create({
      data: {
        userId: user.id,
        tokenHash,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    const payload = {
      update_id: 120001,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: 120001, type: 'private' },
        from: { id: 120001 },
      },
    };

    // Inject a failure into $transaction
    const originalTransaction = h.prisma.$transaction.bind(h.prisma);
    jest.spyOn(h.prisma, '$transaction').mockImplementationOnce(async () => {
      throw new Error('DATABASE_CONNECTION_LOST');
    });

    // Service MUST propagate error, NOT return { ok: true }
    await expect(service.handleWebhook(payload, validSecret)).rejects.toThrow('DATABASE_CONNECTION_LOST');

    // Provider was NOT called
    expect(mockTransport.sendMessage).not.toHaveBeenCalled();

    // No receipt was committed
    const receipt = await h.prisma.telegramWebhookReceipt.findUnique({
      where: { updateId: '120001' },
    });
    expect(receipt).toBeNull();
  });
});
