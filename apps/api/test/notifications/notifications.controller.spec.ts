import { BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { NotificationsService } from '../../src/notifications/notifications.service';

describe('NotificationsController (unit)', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const req = {
    auth: {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
      },
    },
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    service = {
      listNotifications: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
      getPushConfig: jest.fn().mockReturnValue({ enabled: false, maxSubscriptionsPerUser: 5 }),
      listSubscriptions: jest.fn().mockResolvedValue({ items: [] }),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      revokeSubscription: jest.fn().mockResolvedValue({ success: true }),
      markRead: jest.fn().mockResolvedValue({ success: true, readAt: new Date().toISOString() }),
      resolveAction: jest.fn().mockResolvedValue({ targetUrl: '/thong-bao' }),
    } as unknown as jest.Mocked<NotificationsService>;

    controller = new NotificationsController(service);
  });

  it('lists notifications for current authenticated user', async () => {
    await controller.listNotifications(req, { limit: '10' });
    expect(service.listNotifications).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      undefined,
      '10',
    );
  });

  it('gets unread count for current authenticated user', async () => {
    await controller.getUnreadCount(req);
    expect(service.getUnreadCount).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('rejects invalid UUIDs on markRead with 400 Bad Request', async () => {
    await expect(controller.markRead(req, 'not-a-uuid')).rejects.toThrow(BadRequestException);
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it('calls markRead with valid UUID', async () => {
    const validUuid = '22222222-2222-2222-2222-222222222222';
    await controller.markRead(req, validUuid);
    expect(service.markRead).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', validUuid);
  });

  it('rejects invalid UUIDs on resolveAction', async () => {
    await expect(controller.resolveAction(req, 'invalid')).rejects.toThrow(BadRequestException);
    expect(service.resolveAction).not.toHaveBeenCalled();
  });

  it('calls resolveAction with valid UUID', async () => {
    const validUuid = '33333333-3333-3333-3333-333333333333';
    await controller.resolveAction(req, validUuid);
    expect(service.resolveAction).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', validUuid);
  });

  it('calls createSubscription with dto', async () => {
    const dto = {
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'k', auth: 'a' },
    };
    await controller.createSubscription(req, dto);
    expect(service.createSubscription).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', dto);
  });

  it('rejects invalid UUID on revokeSubscription', async () => {
    await expect(controller.revokeSubscription(req, 'bad-id')).rejects.toThrow(BadRequestException);
  });
});

