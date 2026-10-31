import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InAppNotificationCategory,
  InAppNotificationPriority,
  Prisma,
  WebPushDeliveryStatus,
} from '@prisma/client';
import { AppConfig } from '../config/app.config';
import { ECDH } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { revokePushSubscriptions } from './push-revocation';
import { CreateWebPushSubscriptionDto } from './dto';
import { NotificationActionRegistry } from './notification-action.registry';
import {
  computeEndpointDigest,
  decryptAtRest,
  deriveEncryptionKey,
  encryptAtRest,
} from './web-push-encryption.util';
import {
  WebPushSendParams,
  WebPushTransportPort,
} from './web-push-transport.port';
import { validatePushEndpoint, WebPushHttpAdapter } from './web-push-http.adapter';

export interface PublishNotificationParams {
  recipientUserId: string;
  eventType: string;
  category: InAppNotificationCategory;
  priority?: InAppNotificationPriority;
  sourceKind: string;
  sourceId: string;
  sourceVersion?: string | null;
  sourceEventId: string;
  dedupeKey: string;
  title: string;
  bodySafe: string;
  actionKey?: string | null;
  actionParamsJson?: Record<string, unknown> | null;
}

const MAX_ACTIVE_SUBSCRIPTIONS_PER_USER = 5;
const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600];

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly encryptionKey: Buffer;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionRegistry: NotificationActionRegistry,
    @Inject('APP_CONFIG') private readonly config: AppConfig,
    @Inject(WebPushHttpAdapter) private readonly transport: WebPushTransportPort,
  ) {
    if (this.config.webPush.enabled) {
      if (
        !this.config.webPush.encryptionKey ||
        (this.config.nodeEnv === 'production' &&
          this.config.webPush.encryptionKey.startsWith('dev-insecure-'))
      ) {
        throw new Error(
          'WEB_PUSH_ENCRYPTION_KEY must be properly configured when web push is enabled in production.',
        );
      }
    }

    this.encryptionKey = this.config.webPush.encryptionKey
      ? deriveEncryptionKey(this.config.webPush.encryptionKey)
      : Buffer.alloc(32);
  }

  onModuleInit() {
    if (this.config.webPush.enabled) {
      this.pollTimer = setInterval(() => {
        this.processPendingDeliveries().catch(() => { this.logger.error('WEB_PUSH_WORKER_FAILED'); });
      }, 30_000);
      if (this.pollTimer.unref) {
        this.pollTimer.unref();
      }
    }
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async listNotifications(
    userId: string,
    cursor?: string,
    limitStr?: string,
  ) {
    let limit = limitStr ? parseInt(limitStr, 10) : 20;
    if (Number.isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    let cursorCreatedAt: Date | undefined;
    let cursorId: string | undefined;

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        const sepIndex = decoded.indexOf('_');
        if (sepIndex > 0) {
          const dateStr = decoded.substring(0, sepIndex);
          cursorId = decoded.substring(sepIndex + 1);
          cursorCreatedAt = new Date(dateStr);
          if (Number.isNaN(cursorCreatedAt.getTime()) || !cursorId) {
            cursorCreatedAt = undefined;
            cursorId = undefined;
          }
        }
      } catch {
        cursorCreatedAt = undefined;
        cursorId = undefined;
      }
    }

    const targetLimit = limit;
    const visibleItems: Prisma.InAppNotificationGetPayload<Record<string, never>>[] = [];
    let currentCursorCreatedAt = cursorCreatedAt;
    let currentCursorId = cursorId;
    let scannedCount = 0;
    const MAX_SCAN = 200;

    while (visibleItems.length < targetLimit && scannedCount < MAX_SCAN) {
      const fetchSize = Math.min(targetLimit - visibleItems.length + 5, 50, MAX_SCAN - scannedCount);
      const where: Prisma.InAppNotificationWhereInput = {
        recipientUserId: userId,
      };

      if (currentCursorCreatedAt && currentCursorId) {
        where.OR = [
          { createdAt: { lt: currentCursorCreatedAt } },
          { createdAt: currentCursorCreatedAt, id: { lt: currentCursorId } },
        ];
      }

      const batch = await this.prisma.inAppNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: fetchSize + 1,
      });

      if (batch.length === 0) {
        break;
      }

      const hasMoreInBatch = batch.length > fetchSize;
      const itemsToProcess = hasMoreInBatch ? batch.slice(0, fetchSize) : batch;
      scannedCount += itemsToProcess.length;

      let lastScannedItem: Prisma.InAppNotificationGetPayload<Record<string, never>> | null = null;
      for (const item of itemsToProcess) {
        lastScannedItem = item;
        const isVisible = await this.actionRegistry.isNotificationVisible(userId, item);
        if (isVisible) {
          visibleItems.push(item);
          if (visibleItems.length === targetLimit) {
            break;
          }
        }
      }

      if (lastScannedItem) {
        currentCursorCreatedAt = lastScannedItem.createdAt;
        currentCursorId = lastScannedItem.id;
      }

      if (visibleItems.length === targetLimit || !hasMoreInBatch) {
        break;
      }
    }

    let nextCursor: string | null = null;
    if (currentCursorCreatedAt && currentCursorId) {
      const probe = await this.prisma.inAppNotification.findFirst({
        where: {
          recipientUserId: userId,
          OR: [
            { createdAt: { lt: currentCursorCreatedAt } },
            { createdAt: currentCursorCreatedAt, id: { lt: currentCursorId } },
          ],
        },
        select: { id: true },
      });
      if (probe) {
        const cursorPlain = `${currentCursorCreatedAt.toISOString()}_${currentCursorId}`;
        nextCursor = Buffer.from(cursorPlain, 'utf8').toString('base64');
      }
    }

    return {
      items: visibleItems.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        category: item.category,
        priority: item.priority,
        title: item.title,
        body: item.bodySafe,
        actionKey: item.actionKey,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt ? item.readAt.toISOString() : null,
        resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
      })),
      nextCursor,
    };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const unreadItems = await this.prisma.inAppNotification.findMany({
      where: {
        recipientUserId: userId,
        readAt: null,
      },
      select: {
        id: true,
        eventType: true,
        sourceKind: true,
        sourceId: true,
        actionKey: true,
        actionParamsJson: true,
      },
    });

    let count = 0;
    for (const item of unreadItems) {
      const isVisible = await this.actionRegistry.isNotificationVisible(userId, item);
      if (isVisible) {
        count++;
      }
    }

    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.inAppNotification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    const isVisible = await this.actionRegistry.isNotificationVisible(userId, notification);
    if (!isVisible) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    if (notification.readAt) {
      return { success: true, readAt: notification.readAt.toISOString() };
    }

    const updated = await this.prisma.inAppNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return {
      success: true,
      readAt: updated.readAt!.toISOString(),
    };
  }

  async resolveAction(userId: string, notificationId: string) {
    const notification = await this.prisma.inAppNotification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    const isVisible = await this.actionRegistry.isNotificationVisible(userId, notification);
    if (!isVisible) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    const resolution = await this.actionRegistry.resolveAction(
      userId,
      notification.actionKey,
      notification.actionParamsJson as Record<string, unknown> | null,
    );

    if (!resolution.allowed || !resolution.targetUrl) {
      throw new ForbiddenException(resolution.reason ?? 'Không có quyền truy cập công việc này.');
    }

    return { targetUrl: resolution.targetUrl };
  }

  getPushConfig() {
    return {
      enabled: this.config.webPush.enabled,
      vapidPublicKey: this.config.webPush.vapidPublicKey,
      maxSubscriptionsPerUser: MAX_ACTIVE_SUBSCRIPTIONS_PER_USER,
    };
  }

  async listSubscriptions(userId: string) {
    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: {
        userId,
        revokedAt: null,
        invalidatedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });

    return {
      items: subscriptions.map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
      })),
    };
  }

  async createSubscription(userId: string, dto: CreateWebPushSubscriptionDto, sessionId: string) {
    if (!this.config.webPush.enabled) {
      throw new BadRequestException('Tính năng thông báo Web Push hiện chưa được bật.');
    }

    if (
      !this.config.webPush.encryptionKey ||
      (this.config.nodeEnv === 'production' &&
        this.config.webPush.encryptionKey.startsWith('dev-insecure-'))
    ) {
      throw new ServiceUnavailableException('Chưa cấu hình khóa mã hóa Web Push trên máy chủ.');
    }

    const isTestOrDev =
      this.config.nodeEnv === 'test' || this.config.nodeEnv === 'development';
    if (dto.endpoint.length > 4096 || !validatePushEndpoint(dto.endpoint, isTestOrDev)) {
      throw new BadRequestException(
        'Endpoint nhà cung cấp Push không hợp lệ hoặc không được hỗ trợ.',
      );
    }

    if (typeof dto.keys?.p256dh !== 'string' || typeof dto.keys?.auth !== 'string'
      || !dto.keys.p256dh || !dto.keys.auth || dto.keys.p256dh.length > 128 || dto.keys.auth.length > 128) {
      throw new BadRequestException('Khóa p256dh và auth là bắt buộc.');
    }
    try {
      if (!/^[A-Za-z0-9_-]{87}=?$/.test(dto.keys.p256dh) || !/^[A-Za-z0-9_-]{22}(==)?$/.test(dto.keys.auth)) throw new Error('INVALID_PUSH_KEY');
      const publicKey = Buffer.from(dto.keys.p256dh, 'base64url');
      if (publicKey.length !== 65 || publicKey[0] !== 4 || Buffer.from(dto.keys.auth, 'base64url').length !== 16) throw new Error('INVALID_PUSH_KEY');
      ECDH.convertKey(publicKey, 'prime256v1');
    } catch {
      throw new BadRequestException('Khóa đăng ký Web Push không hợp lệ.');
    }

    const endpointDigest = computeEndpointDigest(dto.endpoint);
    const endpointCiphertext = encryptAtRest(dto.endpoint, this.encryptionKey);
    const p256dhCiphertext = encryptAtRest(dto.keys.p256dh, this.encryptionKey);
    const authCiphertext = encryptAtRest(dto.keys.auth, this.encryptionKey);
    const vapidKeyVersion = this.config.webPush.vapidKeyVersion ?? 'v1';

    return this.prisma.$transaction(async (tx) => {
      // Serialize endpoint handoff across users and admission across endpoints.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${endpointDigest}, 0))::text`;
      await tx.$queryRaw`SELECT id FROM public.users WHERE id=${userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM public.auth_sessions WHERE id=${sessionId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
      const session = await tx.authSession.findFirst({ where: {
        id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
      } });
      if (!session) throw new ForbiddenException('Phiên đăng nhập không còn hợp lệ.');
      // Take the same row lock as logout/revocation before touching deliveries.
      await tx.$queryRaw`SELECT id FROM public.web_push_subscriptions WHERE endpoint_digest=${endpointDigest} FOR UPDATE`;
      const existing = await tx.webPushSubscription.findUnique({ where: { endpointDigest } });
      if (existing) {
        await tx.webPushDelivery.updateMany({
          where: { subscriptionId: existing.id, status: { in: ['PENDING', 'LEASED', 'RETRY_WAIT'] } },
          data: { status: 'DEAD', lastErrorCode: 'SUBSCRIPTION_REBOUND', leaseOwner: null, leaseUntil: null },
        });
      }
      const active = await tx.webPushSubscription.findMany({
        where: { userId, revokedAt: null, invalidatedAt: null, ...(existing ? { id: { not: existing.id } } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const sub of active.slice(0, Math.max(0, active.length - MAX_ACTIVE_SUBSCRIPTIONS_PER_USER + 1))) {
        await tx.webPushSubscription.update({ where: { id: sub.id }, data: { revokedAt: new Date() } });
        await tx.webPushDelivery.updateMany({
          where: { subscriptionId: sub.id, status: { in: ['PENDING', 'LEASED', 'RETRY_WAIT'] } },
          data: { status: 'DEAD', lastErrorCode: 'DEVICE_LIMIT', leaseOwner: null, leaseUntil: null },
        });
      }
      const data = { userId, authSessionId: sessionId, endpointCiphertext, p256dhCiphertext, authCiphertext,
        deviceLabel: dto.deviceLabel ?? null, vapidKeyVersion, revokedAt: null, invalidatedAt: null, lastSeenAt: new Date() };
      const sub = existing
        ? await tx.webPushSubscription.update({ where: { id: existing.id }, data: { ...data, generation: { increment: 1 } } })
        : await tx.webPushSubscription.create({ data: { ...data, endpointDigest } });
      return { id: sub.id, deviceLabel: sub.deviceLabel, createdAt: sub.createdAt.toISOString(), lastSeenAt: sub.lastSeenAt.toISOString() };
    }, { timeout: 15000, maxWait: 15000 });
  }

  async revokeSubscription(userId: string, subscriptionId: string) {
    return this.prisma.$transaction(async tx => {
      const sub = await tx.webPushSubscription.findFirst({ where: { id: subscriptionId, userId } });
      if (!sub) throw new NotFoundException('Không tìm thấy thiết bị thông báo.');
      await revokePushSubscriptions(tx, { id: subscriptionId, userId }, 'SUBSCRIPTION_REVOKED');
      return { success: true };
    });
  }

  async revokeByEndpoint(userId: string, endpoint: string) {
    await this.prisma.$transaction(tx => revokePushSubscriptions(tx,
      { userId, endpointDigest: computeEndpointDigest(endpoint) }, 'SUBSCRIPTION_REVOKED_LOGOUT'));
    return { success: true };
  }

  async publishInAppNotification(
    tx: Prisma.TransactionClient,
    params: PublishNotificationParams,
  ) {
    const {
      recipientUserId,
      eventType,
      category,
      priority = InAppNotificationPriority.NORMAL,
      sourceKind,
      sourceId,
      sourceVersion = null,
      sourceEventId,
      dedupeKey,
      title,
      bodySafe,
      actionKey = null,
      actionParamsJson = null,
    } = params;

    if (!await this.actionRegistry.isNotificationVisible(recipientUserId, params, tx)) return null;

    const notification = await tx.inAppNotification.upsert({
      where: { recipientUserId_dedupeKey: { recipientUserId, dedupeKey } },
      create: { recipientUserId, eventType, category, priority, sourceKind, sourceId, sourceVersion,
        sourceEventId, dedupeKey, title, bodySafe, actionKey,
        actionParamsJson: actionParamsJson ? actionParamsJson as Prisma.InputJsonValue : Prisma.JsonNull },
      update: {},
    });

    if (this.config.webPush.enabled) {
      const activeSubscriptions = await tx.webPushSubscription.findMany({
        where: {
          userId: recipientUserId,
          revokedAt: null,
          invalidatedAt: null,
        },
      });

      for (const sub of activeSubscriptions) {
        const deliveryDedupeKey = `${notification.id}_${sub.id}_1`;
        await tx.webPushDelivery.upsert({
          where: {
            notificationId_subscriptionId_payloadVersion: {
              notificationId: notification.id,
              subscriptionId: sub.id,
              payloadVersion: 1,
            },
          },
          create: {
            notificationId: notification.id,
            subscriptionId: sub.id,
            subscriptionGeneration: sub.generation,
            dedupeKey: deliveryDedupeKey,
            payloadVersion: 1,
            status: WebPushDeliveryStatus.PENDING,
          },
          update: {},
        });
      }
    }

    return notification;
  }

  async resolveNotificationBySource(
    tx: Prisma.TransactionClient,
    sourceKind: string,
    sourceId: string,
    eventType?: string,
  ) {
    const where: Prisma.InAppNotificationWhereInput = {
      sourceKind,
      sourceId,
      resolvedAt: null,
    };
    if (eventType) {
      where.eventType = eventType;
    }

    return tx.inAppNotification.updateMany({
      where,
      data: {
        resolvedAt: new Date(),
      },
    });
  }

  async processPendingDeliveries(
    batchSize = 10,
  ): Promise<{ processed: number; sent: number; failed: number }> {
    if (!this.config.webPush.enabled) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    // Expiry/revocation is checked even when the browser never calls logout.
    await this.prisma.$transaction(tx => revokePushSubscriptions(tx, {
      OR: [
        { authSessionId: null },
        { authSession: { is: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } },
          { user: { OR: [{ status: { not: 'ACTIVE' } }, { lockedUntil: { gt: new Date() } }] } }] } } },
      ],
    }, 'SESSION_NOT_ACTIVE'));

    const now = new Date();
    const leaseOwner = `worker_${process.pid}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // Query candidates recovering expired leases
    const candidates = await this.prisma.webPushDelivery.findMany({
      where: {
        OR: [
          { status: WebPushDeliveryStatus.PENDING },
          {
            status: WebPushDeliveryStatus.RETRY_WAIT,
            nextAttemptAt: { lte: now },
          },
          {
            status: WebPushDeliveryStatus.LEASED,
            leaseUntil: { lte: now },
          },
        ],
      },
      take: batchSize,
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        notification: true,
        subscription: true,
      },
    });

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const delivery of candidates) {
      // A slow earlier send must not give a later batch item an expired lease.
      const leaseUntil = new Date(Date.now() + 30_000);
      // Lease CAS
      const leased = await this.prisma.webPushDelivery.updateMany({
        where: {
          id: delivery.id,
          OR: [
            { status: WebPushDeliveryStatus.PENDING },
            {
              status: WebPushDeliveryStatus.RETRY_WAIT,
              nextAttemptAt: { lte: now },
            },
            {
              status: WebPushDeliveryStatus.LEASED,
              leaseUntil: { lte: now },
            },
          ],
        },
        data: {
          status: WebPushDeliveryStatus.LEASED,
          leaseOwner,
          leaseUntil,
        },
      });

      if (leased.count === 0) continue;
      processed++;

      const current = await this.prisma.webPushDelivery.findFirst({
        where: { id: delivery.id, leaseOwner, status: 'LEASED' }, include: { subscription: { include: { authSession: { include: { user: true } } } } },
      });
      if (!current) continue;
      const sub = current.subscription;
      const session = sub.authSession;
      const sessionValid = session && session.userId === sub.userId && !session.revokedAt
        && session.expiresAt > new Date() && session.user.status === 'ACTIVE'
        && (!session.user.lockedUntil || session.user.lockedUntil <= new Date());

      // CRITICAL: At-send-time cross-account and validity check
      if (
        !sessionValid || sub.generation !== delivery.subscriptionGeneration ||
        !await this.actionRegistry.isNotificationVisible(delivery.notification.recipientUserId, delivery.notification) ||
        sub.userId !== delivery.notification.recipientUserId ||
        sub.revokedAt !== null ||
        sub.invalidatedAt !== null
      ) {
        const lastErrorCode =
          sub.userId !== delivery.notification.recipientUserId
            ? 'RECIPIENT_MISMATCH'
            : 'SUBSCRIPTION_NOT_ACTIVE';

        await this.prisma.webPushDelivery.updateMany({
          where: { id: delivery.id, leaseOwner },
          data: {
            status: WebPushDeliveryStatus.DEAD,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode,
          },
        });
        failed++;
        continue;
      }

      let endpoint: string;
      let p256dh: string;
      let auth: string;
      try {
        endpoint = decryptAtRest(sub.endpointCiphertext, this.encryptionKey);
        p256dh = decryptAtRest(sub.p256dhCiphertext, this.encryptionKey);
        auth = decryptAtRest(sub.authCiphertext, this.encryptionKey);
      } catch {
        await this.prisma.webPushDelivery.updateMany({
          where: { id: delivery.id, leaseOwner },
          data: {
            status: WebPushDeliveryStatus.DEAD,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: 'DECRYPTION_FAILED',
          },
        });
        failed++;
        continue;
      }

      const params: WebPushSendParams = {
        endpoint,
        keys: { p256dh, auth },
        payload: {
          title: 'Báo giảng Đam San',
          body: 'Bạn có thông báo mới trong hệ thống.',
          clickUrl: '/thong-bao',
        },
        vapidPublicKey: this.config.webPush.vapidPublicKey,
        vapidPrivateKey: this.config.webPush.vapidPrivateKey,
        vapidSubject: this.config.webPush.vapidSubject,
      };

      const result = await this.transport.sendNotification(params);

      if (result.success) {
        const completed = await this.prisma.webPushDelivery.updateMany({
          where: { id: delivery.id, leaseOwner },
          data: {
            status: WebPushDeliveryStatus.SENT,
            sentAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
          },
        });
        sent += completed.count;
      } else if (result.statusCode === 404 || result.statusCode === 410) {
        await this.prisma.$transaction([
          this.prisma.webPushSubscription.updateMany({
            where: { id: sub.id, userId: sub.userId, authSessionId: sub.authSessionId, generation: sub.generation },
            data: { invalidatedAt: new Date() },
          }),
          this.prisma.webPushDelivery.updateMany({
            where: { id: delivery.id, leaseOwner },
            data: {
              status: WebPushDeliveryStatus.INVALID_SUBSCRIPTION,
              leaseOwner: null,
              leaseUntil: null,
              lastErrorCode: result.sanitizedErrorCode ?? 'SUBSCRIPTION_EXPIRED',
            },
          }),
        ]);
        failed++;
      } else {
        const nextAttemptCount = delivery.attemptCount + 1;
        if (nextAttemptCount >= 5) {
          await this.prisma.webPushDelivery.updateMany({
            where: { id: delivery.id, leaseOwner },
            data: {
              status: WebPushDeliveryStatus.DEAD,
              attemptCount: nextAttemptCount,
              leaseOwner: null,
              leaseUntil: null,
              lastErrorCode: result.sanitizedErrorCode ?? 'MAX_ATTEMPTS_EXCEEDED',
            },
          });
          failed++;
        } else {
          const jitterMs = Math.floor(Math.random() * 5000);
          const backoffSec =
            result.retryAfterSeconds ??
            RETRY_BACKOFF_SECONDS[nextAttemptCount - 1] ??
            3600;
          const nextAttemptAt = new Date(Date.now() + backoffSec * 1000 + jitterMs);
          await this.prisma.webPushDelivery.updateMany({
            where: { id: delivery.id, leaseOwner },
            data: {
              status: WebPushDeliveryStatus.RETRY_WAIT,
              attemptCount: nextAttemptCount,
              nextAttemptAt,
              leaseOwner: null,
              leaseUntil: null,
              lastErrorCode: result.sanitizedErrorCode ?? 'DELIVERY_FAILED',
            },
          });
          failed++;
        }
      }
    }

    return { processed, sent, failed };
  }
}
