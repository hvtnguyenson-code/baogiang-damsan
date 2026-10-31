import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  InAppNotificationCategory,
  InAppNotificationPriority,
  WebPushDeliveryStatus,
} from '@prisma/client';
import {
  deriveEncryptionKey,
  encryptAtRest,
} from '../../src/notifications/web-push-encryption.util';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { NotificationActionRegistry } from '../../src/notifications/notification-action.registry';
import { WebPushTransportPort } from '../../src/notifications/web-push-transport.port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AppConfig } from '../../src/config/app.config';

type MockPrisma = {
  inAppNotification: Record<string, jest.Mock>;
  webPushSubscription: Record<string, jest.Mock>;
  webPushDelivery: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

describe('NotificationsService (unit)', () => {
  let service: NotificationsService;
  let prisma: MockPrisma;
  let actionRegistry: jest.Mocked<NotificationActionRegistry>;
  let transport: jest.Mocked<WebPushTransportPort>;

  const config = {
    webPushEnabled: true,
    webPush: {
      enabled: true,
      vapidPublicKey: 'test-public-key',
      vapidPrivateKey: 'test-private-key',
      vapidSubject: 'mailto:admin@damsan.edu.vn',
      encryptionKey: 'test-32-byte-encryption-key-for-unit-test!!',
    },
  } as unknown as AppConfig;

  beforeEach(() => {
    prisma = {
      inAppNotification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      webPushSubscription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      webPushDelivery: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };

    actionRegistry = {
      resolveAction: jest.fn(),
      isNotificationVisible: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<NotificationActionRegistry>;

    transport = {
      sendNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    service = new NotificationsService(
      prisma as unknown as PrismaService,
      actionRegistry,
      config,
      transport,
    );
  });

  describe('listNotifications', () => {
    it('returns empty list when user has no notifications', async () => {
      prisma.inAppNotification.findMany.mockResolvedValue([]);
      const res = await service.listNotifications('user-1');
      expect(res.items).toHaveLength(0);
      expect(res.nextCursor).toBeNull();
    });

    it('filters out notifications that lost current authorization (N04)', async () => {
      const now = new Date();
      prisma.inAppNotification.findMany.mockResolvedValue([
        {
          id: 'n-1',
          recipientUserId: 'user-1',
          eventType: 'REPORTING_SUBMITTED',
          category: InAppNotificationCategory.ACTION_REQUIRED,
          priority: InAppNotificationPriority.HIGH,
          title: 'Review required',
          bodySafe: 'Check statement',
          actionKey: 'REPORTING_APPROVAL',
          createdAt: now,
          readAt: null,
          resolvedAt: null,
        },
        {
          id: 'n-2',
          recipientUserId: 'user-1',
          eventType: 'REPORTING_DECIDED',
          category: InAppNotificationCategory.INFORMATION,
          priority: InAppNotificationPriority.NORMAL,
          title: 'Statement approved',
          bodySafe: 'Approved',
          actionKey: 'REPORTING_VIEW',
          createdAt: now,
          readAt: null,
          resolvedAt: null,
        },
      ]);

      actionRegistry.isNotificationVisible.mockImplementation(async (_u, item) => {
        return item.eventType !== 'REPORTING_SUBMITTED';
      });

      const res = await service.listNotifications('user-1');
      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe('n-2');
    });

    it('computes nextCursor when more items exist', async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `n-${i}`,
        recipientUserId: 'user-1',
        eventType: 'INFO',
        category: InAppNotificationCategory.INFORMATION,
        priority: InAppNotificationPriority.NORMAL,
        title: `Notification ${i}`,
        bodySafe: `Body ${i}`,
        actionKey: null,
        createdAt: now,
        readAt: null,
        resolvedAt: null,
      }));
      prisma.inAppNotification.findMany.mockResolvedValue(items);

      const res = await service.listNotifications('user-1', undefined, '2');
      expect(res.items).toHaveLength(2);
      expect(res.nextCursor).toBeDefined();
    });
  });

  describe('markRead', () => {
    it('marks unread notification as read', async () => {
      const now = new Date();
      prisma.inAppNotification.findFirst.mockResolvedValue({
        id: 'n-1',
        recipientUserId: 'user-1',
        readAt: null,
      });
      prisma.inAppNotification.update.mockResolvedValue({
        id: 'n-1',
        readAt: now,
      });

      const res = await service.markRead('user-1', 'n-1');
      expect(res.success).toBe(true);
      expect(res.readAt).toBe(now.toISOString());
    });

    it('is idempotent if already marked as read', async () => {
      const readDate = new Date('2026-10-31T10:00:00Z');
      prisma.inAppNotification.findFirst.mockResolvedValue({
        id: 'n-1',
        recipientUserId: 'user-1',
        readAt: readDate,
      });

      const res = await service.markRead('user-1', 'n-1');
      expect(res.success).toBe(true);
      expect(res.readAt).toBe(readDate.toISOString());
      expect(prisma.inAppNotification.update).not.toHaveBeenCalled();
    });

    it('throws 404 if notification belongs to another user', async () => {
      prisma.inAppNotification.findFirst.mockResolvedValue(null);
      await expect(service.markRead('user-1', 'n-other')).rejects.toThrow(NotFoundException);
    });

    it('throws 404 if notification lost visibility', async () => {
      prisma.inAppNotification.findFirst.mockResolvedValue({
        id: 'n-1',
        recipientUserId: 'user-1',
        eventType: 'REPORTING_SUBMITTED',
      });
      actionRegistry.isNotificationVisible.mockResolvedValue(false);

      await expect(service.markRead('user-1', 'n-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveAction', () => {
    it('returns targetUrl when authorized', async () => {
      prisma.inAppNotification.findFirst.mockResolvedValue({
        id: 'n-1',
        recipientUserId: 'user-1',
        actionKey: 'TIMETABLE_VIEW',
        actionParamsJson: null,
      });
      actionRegistry.resolveAction.mockResolvedValue({
        allowed: true,
        targetUrl: '/lich-day',
      });

      const res = await service.resolveAction('user-1', 'n-1');
      expect(res.targetUrl).toBe('/lich-day');
    });

    it('throws ForbiddenException when action registry denies access', async () => {
      prisma.inAppNotification.findFirst.mockResolvedValue({
        id: 'n-1',
        recipientUserId: 'user-1',
        actionKey: 'REPORTING_APPROVAL',
      });
      actionRegistry.resolveAction.mockResolvedValue({
        allowed: false,
        reason: 'Không còn quyền duyệt.',
      });

      await expect(service.resolveAction('user-1', 'n-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('web push subscription management', () => {
    it('rejects non-HTTPS endpoints outside localhost', async () => {
      await expect(
        service.createSubscription('user-1', {
          endpoint: 'http://insecure-push-service.com/sub/1',
          keys: { p256dh: 'key1', auth: 'auth1' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts loopback HTTP in development/test', async () => {
      prisma.webPushSubscription.findUnique.mockResolvedValue(null);
      prisma.webPushSubscription.findMany.mockResolvedValue([]);
      prisma.webPushSubscription.create.mockResolvedValue({
        id: 'sub-1',
        deviceLabel: 'Local Device',
        createdAt: new Date(),
        lastSeenAt: new Date(),
      });

      const res = await service.createSubscription('user-1', {
        endpoint: 'http://127.0.0.1:8080/push/test',
        keys: { p256dh: 'key1', auth: 'auth1' },
        deviceLabel: 'Local Device',
      });
      expect(res.id).toBe('sub-1');
    });

    it('reassigns subscription safely on shared-device account switch', async () => {
      prisma.webPushSubscription.findUnique.mockResolvedValue({
        id: 'sub-shared',
        userId: 'old-user',
        deviceLabel: 'Tablet',
      });
      prisma.webPushSubscription.update.mockResolvedValue({
        id: 'sub-shared',
        userId: 'new-user',
        deviceLabel: 'Tablet',
        createdAt: new Date(),
        lastSeenAt: new Date(),
      });

      const res = await service.createSubscription('new-user', {
        endpoint: 'https://push.example.com/shared',
        keys: { p256dh: 'k', auth: 'a' },
      });
      expect(res.id).toBe('sub-shared');
      expect(prisma.webPushSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-shared' },
          data: expect.objectContaining({
            userId: 'new-user',
            revokedAt: null,
            invalidatedAt: null,
          }),
        }),
      );
    });

    it('enforces 5-active device limit by revoking the oldest active subscription', async () => {
      prisma.webPushSubscription.findUnique.mockResolvedValue(null);
      const activeSubs = Array.from({ length: 5 }, (_, i) => ({
        id: `sub-${i}`,
        createdAt: new Date(Date.now() - (5 - i) * 1000),
      }));
      prisma.webPushSubscription.findMany.mockResolvedValue(activeSubs);
      prisma.webPushSubscription.update.mockResolvedValue({} as never);
      prisma.webPushSubscription.create.mockResolvedValue({
        id: 'sub-new',
        deviceLabel: 'New Device',
        createdAt: new Date(),
        lastSeenAt: new Date(),
      });

      const res = await service.createSubscription('user-1', {
        endpoint: 'https://push.example.com/device6',
        keys: { p256dh: 'k', auth: 'a' },
      });
      expect(res.id).toBe('sub-new');
      expect(prisma.webPushSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-0' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('revokes subscription successfully for owner', async () => {
      prisma.webPushSubscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        revokedAt: null,
      });
      prisma.webPushSubscription.update.mockResolvedValue({} as never);

      const res = await service.revokeSubscription('user-1', 'sub-1');
      expect(res.success).toBe(true);
      expect(prisma.webPushSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws 404 when trying to revoke subscription of another user', async () => {
      prisma.webPushSubscription.findFirst.mockResolvedValue(null);
      await expect(service.revokeSubscription('user-1', 'sub-other')).rejects.toThrow(NotFoundException);
    });
  });

  describe('outbox delivery worker and retries', () => {
    const encKey = deriveEncryptionKey('test-32-byte-encryption-key-for-unit-test!!');
    const validEndpointCipher = encryptAtRest('https://push.example.com/test', encKey);
    const validP256dhCipher = encryptAtRest('p256dh-key', encKey);
    const validAuthCipher = encryptAtRest('auth-key', encKey);

    it('processes pending delivery and marks SENT on 200', async () => {
      prisma.webPushDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          status: WebPushDeliveryStatus.PENDING,
          attemptCount: 0,
          notification: { id: 'n-1', bodySafe: 'Hello' },
          subscription: {
            id: 'sub-1',
            endpointCiphertext: validEndpointCipher,
            p256dhCiphertext: validP256dhCipher,
            authCiphertext: validAuthCipher,
            revokedAt: null,
            invalidatedAt: null,
          },
        },
      ]);
      prisma.webPushDelivery.updateMany.mockResolvedValue({ count: 1 });
      transport.sendNotification.mockResolvedValue({ success: true, statusCode: 201 });

      const stats = await service.processPendingDeliveries(1);
      expect(stats.sent).toBe(1);
      expect(prisma.webPushDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({ status: WebPushDeliveryStatus.SENT }),
        }),
      );
    });

    it('invalidates subscription on 410 Gone', async () => {
      prisma.webPushDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          status: WebPushDeliveryStatus.PENDING,
          attemptCount: 0,
          notification: { id: 'n-1', bodySafe: 'Hello' },
          subscription: {
            id: 'sub-1',
            endpointCiphertext: validEndpointCipher,
            p256dhCiphertext: validP256dhCipher,
            authCiphertext: validAuthCipher,
            revokedAt: null,
            invalidatedAt: null,
          },
        },
      ]);
      prisma.webPushDelivery.updateMany.mockResolvedValue({ count: 1 });
      transport.sendNotification.mockResolvedValue({
        success: false,
        statusCode: 410,
        sanitizedErrorCode: 'SUBSCRIPTION_EXPIRED',
      });

      const stats = await service.processPendingDeliveries(1);
      expect(stats.failed).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('marks DEAD after exceeding max retry attempts (5)', async () => {
      prisma.webPushDelivery.findMany.mockResolvedValue([
        {
          id: 'del-1',
          status: WebPushDeliveryStatus.RETRY_WAIT,
          attemptCount: 4,
          notification: { id: 'n-1', bodySafe: 'Hello' },
          subscription: {
            id: 'sub-1',
            endpointCiphertext: validEndpointCipher,
            p256dhCiphertext: validP256dhCipher,
            authCiphertext: validAuthCipher,
            revokedAt: null,
            invalidatedAt: null,
          },
        },
      ]);
      prisma.webPushDelivery.updateMany.mockResolvedValue({ count: 1 });
      transport.sendNotification.mockResolvedValue({
        success: false,
        statusCode: 500,
        sanitizedErrorCode: 'PROVIDER_SERVER_ERROR',
      });

      const stats = await service.processPendingDeliveries(1);
      expect(stats.failed).toBe(1);
      expect(prisma.webPushDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({
            status: WebPushDeliveryStatus.DEAD,
            attemptCount: 5,
          }),
        }),
      );
    });
  });
});

