import { ForbiddenException } from '@nestjs/common';
import { TelegramPersonalController } from './telegram-personal.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';
import { AuthenticatedUser } from '../auth/auth.types';

describe('Telegram Controllers (Auth, CSRF & MustChangePassword)', () => {
  let personalController: TelegramPersonalController;
  let webhookController: TelegramWebhookController;
  let mockTelegramService: jest.Mocked<TelegramService>;

  const activeUser: AuthenticatedUser = {
    id: 'user-normal',
    username: 'teacher1',
    displayName: 'Thầy Giáo A',
    mustChangePassword: false,
  };

  const restrictedUser: AuthenticatedUser = {
    id: 'user-restricted',
    username: 'teacher2',
    displayName: 'Cô Giáo B',
    mustChangePassword: true,
  };

  beforeEach(() => {
    mockTelegramService = {
      getIntegrationStatus: jest.fn().mockResolvedValue({ enabled: true, linked: false }),
      createLinkChallenge: jest.fn().mockResolvedValue({ deepLink: 'https://t.me/...', expiresAt: '...' }),
      unlink: jest.fn().mockResolvedValue({ unlinked: true, revokedAt: '...' }),
      sendTestNotification: jest.fn().mockResolvedValue({ deliveryStatus: 'SENT' }),
      handleWebhook: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<TelegramService>;

    personalController = new TelegramPersonalController(mockTelegramService);
    webhookController = new TelegramWebhookController(mockTelegramService);
  });

  // -------------------------------------------------------------
  // Case 23: mustChangePassword fail-closed on ALL personal endpoints
  // -------------------------------------------------------------
  it('23a. GET /me fails closed when mustChangePassword is true', async () => {
    await expect(personalController.getStatus(restrictedUser)).rejects.toThrow(ForbiddenException);
    expect(mockTelegramService.getIntegrationStatus).not.toHaveBeenCalled();
  });

  it('23b. POST /link-challenge fails closed when mustChangePassword is true', async () => {
    await expect(personalController.createLinkChallenge(restrictedUser)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockTelegramService.createLinkChallenge).not.toHaveBeenCalled();
  });

  it('23c. DELETE /link fails closed when mustChangePassword is true', async () => {
    await expect(personalController.unlink(restrictedUser)).rejects.toThrow(ForbiddenException);
    expect(mockTelegramService.unlink).not.toHaveBeenCalled();
  });

  it('23d. POST /test fails closed when mustChangePassword is true', async () => {
    await expect(
      personalController.sendTestNotification(restrictedUser, {
        requestKey: 'c3d9a182-3580-4824-912a-387b9264fa01',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockTelegramService.sendTestNotification).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // Personal endpoints use actorUserId from session
  // -------------------------------------------------------------
  it('extracts actorUserId from authenticated session', async () => {
    await personalController.getStatus(activeUser);
    expect(mockTelegramService.getIntegrationStatus).toHaveBeenCalledWith('user-normal');

    await personalController.createLinkChallenge(activeUser);
    expect(mockTelegramService.createLinkChallenge).toHaveBeenCalledWith('user-normal');

    await personalController.unlink(activeUser);
    expect(mockTelegramService.unlink).toHaveBeenCalledWith('user-normal');

    await personalController.sendTestNotification(activeUser, {
      requestKey: 'c3d9a182-3580-4824-912a-387b9264fa01',
    });
    expect(mockTelegramService.sendTestNotification).toHaveBeenCalledWith(
      'user-normal',
      'c3d9a182-3580-4824-912a-387b9264fa01',
    );
  });

  // -------------------------------------------------------------
  // Case 22: Webhook endpoint does not depend on browser session
  // -------------------------------------------------------------
  it('22. Webhook controller forwards payload and secret header without session', async () => {
    const payload = { update_id: 12345 };
    const secret = 'custom_secret_123';

    const res = await webhookController.handleWebhook(payload, secret);
    expect(res).toEqual({ ok: true });
    expect(mockTelegramService.handleWebhook).toHaveBeenCalledWith(payload, secret);
  });
});
