import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TelegramPersonalController } from '../../src/telegram/telegram-personal.controller';
import { TelegramWebhookController } from '../../src/telegram/telegram-webhook.controller';
import { TelegramService } from '../../src/telegram/telegram.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TELEGRAM_TRANSPORT_PORT } from '../../src/telegram/telegram-transport.port';
import { AuthService } from '../../src/auth/auth.service';

describe('Telegram Routing Integration (Global Prefix Regression)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mockPrisma = {
      telegramAccountLink: { findFirst: jest.fn() },
      telegramLinkChallenge: { findUnique: jest.fn(), findFirst: jest.fn() },
      telegramWebhookReceipt: { findUnique: jest.fn() },
      telegramNotificationDelivery: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const mockTransport = {
      sendMessage: jest.fn().mockResolvedValue({ success: true, providerMessageId: '123' }),
    };

    const mockConfig = {
      nodeEnv: 'test',
      auth: { cookieName: 'baogiang_session' },
      corsOrigins: ['http://localhost:5173'],
      telegram: {
        enabled: true,
        botToken: '123456:ABC-DEF_ghi',
        botUsername: 'baogiang_test_bot',
        webhookSecret: 'Valid_Secret-123',
      },
    };

    const mockAuthService = {
      authenticate: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TelegramPersonalController, TelegramWebhookController],
      providers: [
        TelegramService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'APP_CONFIG', useValue: mockConfig },
        { provide: TELEGRAM_TRANSPORT_PORT, useValue: mockTransport },
        { provide: 'AuthService', useValue: mockAuthService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // System-wide global prefix
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Section C Routing Invariants', () => {
    it('1. /api/integrations/telegram/me route exists (unauthenticated returns 401, NOT 404)', async () => {
      const res = await request(app.getHttpServer()).get('/api/integrations/telegram/me');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('2. /api/integrations/telegram/webhook route exists (missing/invalid secret returns 401, NOT 404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/integrations/telegram/webhook')
        .send({ update_id: 12345 });
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('3. /api/api/integrations/telegram/me returns 404 (no double prefix)', async () => {
      const res = await request(app.getHttpServer()).get('/api/api/integrations/telegram/me');
      expect(res.status).toBe(404);
    });

    it('4. /api/api/integrations/telegram/webhook returns 404 (no double prefix)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/api/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'Valid_Secret-123')
        .send({ update_id: 12345 });
      expect(res.status).toBe(404);
    });

    it('5. other personal mutation routes exist under /api/integrations/telegram/* (return 401, NOT 404)', async () => {
      const postChallenge = await request(app.getHttpServer())
        .post('/api/integrations/telegram/link-challenge')
        .send({});
      expect(postChallenge.status).toBe(401);
      expect(postChallenge.status).not.toBe(404);

      const deleteLink = await request(app.getHttpServer()).delete('/api/integrations/telegram/link');
      expect(deleteLink.status).toBe(401);
      expect(deleteLink.status).not.toBe(404);

      const postTest = await request(app.getHttpServer())
        .post('/api/integrations/telegram/test')
        .send({ requestKey: 'c3d9a182-3580-4824-912a-387b9264fa01' });
      expect(postTest.status).toBe(401);
      expect(postTest.status).not.toBe(404);

      // Verify no double prefix on mutations
      const doublePost = await request(app.getHttpServer())
        .post('/api/api/integrations/telegram/link-challenge')
        .send({});
      expect(doublePost.status).toBe(404);

      const doubleDelete = await request(app.getHttpServer())
        .delete('/api/api/integrations/telegram/link');
      expect(doubleDelete.status).toBe(404);
    });
  });
});
