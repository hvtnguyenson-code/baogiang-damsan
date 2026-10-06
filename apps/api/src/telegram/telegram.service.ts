import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  TelegramDeliveryResultStatus,
  TelegramIntegrationStatusResponse,
  TelegramLinkChallengeResponse,
  TelegramTestNotificationResponse,
  TelegramUnlinkResponse,
} from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import { TELEGRAM_TRANSPORT_PORT, TelegramTransportPort } from './telegram-transport.port';
import { TelegramProviderParser } from './telegram-provider.parser';

const CANONICAL_NOTIFICATION_TEXT = 'Báo giảng Đam San đã kết nối Telegram thành công.';
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CANONICAL_UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WEBHOOK_SECRET_CHARSET_REGEX = /^[A-Za-z0-9_-]{1,256}$/;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('APP_CONFIG') private readonly config: AppConfig,
    @Inject(TELEGRAM_TRANSPORT_PORT) private readonly transport: TelegramTransportPort,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.telegram.enabled) {
      await this.reconcileAttemptingOnStartup().catch((err) => {
        this.logger.error('Failed to reconcile pre-existing attempting deliveries on startup', err);
      });
    }
  }

  /**
   * Reconciles all pre-existing ATTEMPTING deliveries on module startup.
   * Any delivery left in ATTEMPTING without terminal evidence when the process restarts
   * is marked UNKNOWN with ZERO 60-second exemption.
   * NO AUTO-RETRY.
   */
  async reconcileAttemptingOnStartup(): Promise<number> {
    const result = await this.prisma.telegramNotificationDelivery.updateMany({
      where: {
        deliveryStatus: 'ATTEMPTING',
      },
      data: {
        deliveryStatus: 'UNKNOWN',
        sanitizedErrorCode: 'PROCESS_RESTARTED_DURING_ATTEMPT',
      },
    });
    return result.count;
  }

  /**
   * Reconciles orphan ATTEMPTING deliveries on restart or recovery.
   * Transition durable status from ATTEMPTING to UNKNOWN.
   * NO AUTO-RETRY.
   */
  async reconcileStaleDeliveries(olderThanMs: number = 60000): Promise<number> {
    const threshold = new Date(Date.now() - olderThanMs);
    const result = await this.prisma.telegramNotificationDelivery.updateMany({
      where: {
        deliveryStatus: 'ATTEMPTING',
        attemptStartedAt: { lte: threshold },
      },
      data: {
        deliveryStatus: 'UNKNOWN',
        sanitizedErrorCode: 'ORPHAN_ATTEMPT_STALE',
      },
    });
    return result.count;
  }

  /**
   * GET /api/integrations/telegram/me
   */
  async getIntegrationStatus(userId: string): Promise<TelegramIntegrationStatusResponse> {
    if (!this.config.telegram.enabled) {
      return {
        enabled: false,
        linked: false,
      };
    }

    const activeLink = await this.prisma.telegramAccountLink.findFirst({
      where: { userId, status: 'ACTIVE' },
    });

    const pendingChallenge = await this.prisma.telegramLinkChallenge.findFirst({
      where: {
        userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    return {
      enabled: true,
      linked: !!activeLink,
      linkedAt: activeLink?.linkedAt?.toISOString(),
      pendingChallenge: pendingChallenge
        ? { expiresAt: pendingChallenge.expiresAt.toISOString() }
        : undefined,
    };
  }

  /**
   * POST /api/integrations/telegram/link-challenge
   */
  async createLinkChallenge(userId: string): Promise<TelegramLinkChallengeResponse> {
    if (!this.config.telegram.enabled) {
      throw new BadRequestException('Tính năng tích hợp Telegram đang tắt.');
    }

    const activeLink = await this.prisma.telegramAccountLink.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (activeLink) {
      throw new ConflictException('Tài khoản đã được liên kết với Telegram.');
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      // Invalidate existing pending challenges for this user
      await tx.telegramLinkChallenge.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      await tx.telegramLinkChallenge.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
          status: 'PENDING',
        },
      });
    });

    const botUsername = this.config.telegram.botUsername ?? '';
    const deepLink = `https://t.me/${botUsername}?start=${rawToken}`;

    return {
      deepLink,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * DELETE /api/integrations/telegram/link
   */
  async unlink(userId: string): Promise<TelegramUnlinkResponse> {
    if (!this.config.telegram.enabled) {
      throw new BadRequestException('Tính năng tích hợp Telegram đang tắt.');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const activeLink = await tx.telegramAccountLink.findFirst({
        where: { userId, status: 'ACTIVE' },
      });
      if (!activeLink) {
        throw new NotFoundException('Không tìm thấy liên kết Telegram đang hoạt động.');
      }

      await tx.telegramAccountLink.update({
        where: { id: activeLink.id },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });

      await tx.telegramLinkChallenge.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      return {
        unlinked: true,
        revokedAt: now.toISOString(),
      };
    });

    return result;
  }

  /**
   * POST /api/integrations/telegram/webhook
   */
  async handleWebhook(payload: unknown, secretTokenHeader: string | undefined): Promise<{ ok: boolean }> {
    if (!this.config.telegram.enabled) {
      throw new UnauthorizedException('Tính năng tích hợp Telegram đang tắt.');
    }

    const expectedSecret = this.config.telegram.webhookSecret;
    if (!expectedSecret || !secretTokenHeader) {
      throw new UnauthorizedException('Thiếu secret token xác thực.');
    }

    if (!WEBHOOK_SECRET_CHARSET_REGEX.test(secretTokenHeader)) {
      throw new UnauthorizedException('Secret token không hợp lệ về định dạng.');
    }

    // Timing-safe fixed-length digest comparison to prevent 500 error or timing leaks
    const expectedDigest = crypto.createHash('sha256').update(expectedSecret).digest();
    const providedDigest = crypto.createHash('sha256').update(secretTokenHeader).digest();
    if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
      throw new UnauthorizedException('Secret token không khớp.');
    }

    const parsed = TelegramProviderParser.parseUpdate(payload);
    if (!parsed) {
      throw new BadRequestException('Dữ liệu webhook không hợp lệ.');
    }

    // Deduplicate update_id
    const existingReceipt = await this.prisma.telegramWebhookReceipt.findUnique({
      where: { updateId: parsed.updateId },
    });
    if (existingReceipt) {
      if (
        existingReceipt.status === 'PROCESSED' &&
        parsed.isSupportedStart &&
        parsed.telegramUserId &&
        parsed.telegramChatId
      ) {
        // Recover crash window: DB committed receipt/link/delivery, but process died before provider call.
        const activeLink = await this.prisma.telegramAccountLink.findFirst({
          where: {
            telegramUserId: parsed.telegramUserId,
            telegramChatId: parsed.telegramChatId,
            status: 'ACTIVE',
          },
        });
        if (activeLink) {
          const commandKey = `link-success:${activeLink.id}`;
          const delivery = await this.prisma.telegramNotificationDelivery.findUnique({
            where: { commandKey },
          });
          if (delivery && delivery.deliveryStatus === 'RESERVED') {
            await this.executeDelivery(delivery.id, CANONICAL_NOTIFICATION_TEXT);
          }
        }
      }
      return { ok: true };
    }

    // If update is not a valid /start linking message in private chat, mark receipt IGNORED
    if (!parsed.isSupportedStart || !parsed.rawToken || !parsed.telegramUserId || !parsed.telegramChatId) {
      try {
        await this.prisma.telegramWebhookReceipt.create({
          data: {
            updateId: parsed.updateId,
            status: 'IGNORED',
          },
        });
      } catch {
        // Concurrent duplicate receipt created
      }
      return { ok: true };
    }

    const tokenHash = crypto.createHash('sha256').update(parsed.rawToken).digest('hex');
    const challenge = await this.prisma.telegramLinkChallenge.findUnique({
      where: { tokenHash },
    });

    const now = new Date();
    const isChallengeValid =
      challenge &&
      challenge.status === 'PENDING' &&
      challenge.expiresAt > now;

    if (!isChallengeValid) {
      try {
        await this.prisma.telegramWebhookReceipt.create({
          data: {
            updateId: parsed.updateId,
            status: 'IGNORED',
          },
        });
      } catch {}
      return { ok: true };
    }

    // Takeover prevention: verify neither telegramUserId nor telegramChatId is already ACTIVE for another user
    const existingActiveIdentity = await this.prisma.telegramAccountLink.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { telegramUserId: parsed.telegramUserId },
          { telegramChatId: parsed.telegramChatId },
        ],
      },
    });

    if (existingActiveIdentity) {
      try {
        await this.prisma.telegramWebhookReceipt.create({
          data: {
            updateId: parsed.updateId,
            status: 'IGNORED',
          },
        });
      } catch {}
      return { ok: true };
    }

    // Check if the user already has an active link
    const existingUserActiveLink = await this.prisma.telegramAccountLink.findFirst({
      where: {
        userId: challenge.userId,
        status: 'ACTIVE',
      },
    });

    if (existingUserActiveLink) {
      try {
        await this.prisma.telegramWebhookReceipt.create({
          data: {
            updateId: parsed.updateId,
            status: 'IGNORED',
          },
        });
      } catch {}
      return { ok: true };
    }

    // Atomic transaction for linking + welcome reservation
    const payloadDigest = crypto.createHash('sha256').update(CANONICAL_NOTIFICATION_TEXT).digest('hex');
    let deliveryIdToExecute: string | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Receipt PROCESSED
        await tx.telegramWebhookReceipt.create({
          data: {
            updateId: parsed.updateId,
            status: 'PROCESSED',
            processedAt: now,
          },
        });

        // 2. Consume challenge
        const updateCount = await tx.telegramLinkChallenge.updateMany({
          where: {
            id: challenge.id,
            status: 'PENDING',
            expiresAt: { gt: now },
          },
          data: {
            status: 'CONSUMED',
            consumedAt: now,
          },
        });

        if (updateCount.count !== 1) {
          throw new Error('CHALLENGE_CONSUME_FAILED');
        }

        // 3. Create TelegramAccountLink ACTIVE
        const link = await tx.telegramAccountLink.create({
          data: {
            userId: challenge.userId,
            telegramUserId: parsed.telegramUserId!,
            telegramChatId: parsed.telegramChatId!,
            status: 'ACTIVE',
            linkedAt: now,
          },
        });

        // 4. Reserve LINK_SUCCESS delivery
        const commandKey = `link-success:${link.id}`;
        const fingerprint = crypto
          .createHash('sha256')
          .update(`${challenge.userId}:${link.id}:LINK_SUCCESS:${payloadDigest}`)
          .digest('hex');

        const delivery = await tx.telegramNotificationDelivery.create({
          data: {
            commandKey,
            actorUserId: challenge.userId,
            accountLinkId: link.id,
            telegramChatId: parsed.telegramChatId!,
            notificationType: 'LINK_SUCCESS',
            commandFingerprint: fingerprint,
            payloadDigest,
            deliveryStatus: 'RESERVED',
          },
        });

        deliveryIdToExecute = delivery.id;
      });
    } catch (txError) {
      // Distinguish deterministic business race vs unexpected storage/infrastructure failure.
      // 1. Did another request commit a receipt for this updateId?
      const racedReceipt = await this.prisma.telegramWebhookReceipt.findUnique({
        where: { updateId: parsed.updateId },
      });
      if (racedReceipt) {
        if (
          racedReceipt.status === 'PROCESSED' &&
          parsed.isSupportedStart &&
          parsed.telegramUserId &&
          parsed.telegramChatId
        ) {
          const activeLink = await this.prisma.telegramAccountLink.findFirst({
            where: {
              telegramUserId: parsed.telegramUserId,
              telegramChatId: parsed.telegramChatId,
              status: 'ACTIVE',
            },
          });
          if (activeLink) {
            const commandKey = `link-success:${activeLink.id}`;
            const delivery = await this.prisma.telegramNotificationDelivery.findUnique({
              where: { commandKey },
            });
            if (delivery && delivery.deliveryStatus === 'RESERVED') {
              await this.executeDelivery(delivery.id, CANONICAL_NOTIFICATION_TEXT);
            }
          }
        }
        return { ok: true };
      }

      // 2. Did the challenge get consumed or expired by a concurrent race?
      const ch = await this.prisma.telegramLinkChallenge.findUnique({
        where: { tokenHash },
      });
      if (ch && (ch.status !== 'PENDING' || ch.expiresAt <= now)) {
        try {
          await this.prisma.telegramWebhookReceipt.create({
            data: {
              updateId: parsed.updateId,
              status: 'IGNORED',
            },
          });
        } catch {}
        return { ok: true };
      }

      // 3. Did a concurrent active link get established?
      const concurrentActiveLink = await this.prisma.telegramAccountLink.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [
            { userId: challenge.userId },
            { telegramUserId: parsed.telegramUserId },
            { telegramChatId: parsed.telegramChatId },
          ],
        },
      });
      if (concurrentActiveLink) {
        try {
          await this.prisma.telegramWebhookReceipt.create({
            data: {
              updateId: parsed.updateId,
              status: 'IGNORED',
            },
          });
        } catch {}
        return { ok: true };
      }

      // Unexpected infrastructure failure: rethrow so HTTP returns 5xx and Telegram can redeliver!
      throw txError;
    }

    // Network send occurs POST-COMMIT outside any DB transaction
    if (deliveryIdToExecute) {
      await this.executeDelivery(deliveryIdToExecute, CANONICAL_NOTIFICATION_TEXT);
    }

    return { ok: true };
  }

  /**
   * POST /api/integrations/telegram/test
   */
  async sendTestNotification(actorUserId: string, requestKey: string): Promise<TelegramTestNotificationResponse> {
    if (!this.config.telegram.enabled) {
      throw new BadRequestException('Tính năng tích hợp Telegram đang tắt.');
    }

    if (!CANONICAL_UUID_V4_REGEX.test(requestKey)) {
      throw new BadRequestException('requestKey phải là UUID v4 chữ thường chuẩn.');
    }

    const activeLink = await this.prisma.telegramAccountLink.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
    if (!activeLink) {
      throw new NotFoundException('Tài khoản chưa có liên kết Telegram đang hoạt động.');
    }

    const payloadDigest = crypto.createHash('sha256').update(CANONICAL_NOTIFICATION_TEXT).digest('hex');
    const commandKey = `self-test:${actorUserId}:${requestKey}`;
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${actorUserId}:${activeLink.id}:SELF_TEST:${payloadDigest}`)
      .digest('hex');

    let deliveryRecord = await this.prisma.telegramNotificationDelivery.findUnique({
      where: { commandKey },
    });

    if (deliveryRecord) {
      if (deliveryRecord.commandFingerprint !== fingerprint) {
        throw new ConflictException('Khóa yêu cầu xung đột với thông số gửi tin khác.');
      }
    } else {
      try {
        deliveryRecord = await this.prisma.telegramNotificationDelivery.create({
          data: {
            commandKey,
            actorUserId,
            requestKey,
            accountLinkId: activeLink.id,
            telegramChatId: activeLink.telegramChatId,
            notificationType: 'SELF_TEST',
            commandFingerprint: fingerprint,
            payloadDigest,
            deliveryStatus: 'RESERVED',
          },
        });
      } catch (err) {
        // Concurrent insertion with same commandKey
        deliveryRecord = await this.prisma.telegramNotificationDelivery.findUnique({
          where: { commandKey },
        });
        if (!deliveryRecord) throw err;
        if (deliveryRecord.commandFingerprint !== fingerprint) {
          throw new ConflictException('Khóa yêu cầu xung đột với thông số gửi tin khác.');
        }
      }
    }

    // If delivery is RESERVED, attempt atomic claim & send
    if (deliveryRecord.deliveryStatus === 'RESERVED') {
      await this.executeDelivery(deliveryRecord.id, CANONICAL_NOTIFICATION_TEXT);
    }

    const finalDelivery = await this.prisma.telegramNotificationDelivery.findUniqueOrThrow({
      where: { id: deliveryRecord.id },
    });

    return {
      deliveryStatus: finalDelivery.deliveryStatus as TelegramDeliveryResultStatus,
      sentAt: finalDelivery.sentAt?.toISOString(),
      error: finalDelivery.sanitizedErrorCode ?? undefined,
    };
  }

  /**
   * Atomic CAS send claim:
   * 1. Resolves delivery and ensures associated accountLink is still ACTIVE.
   *    If link was REVOKED before send claim: zero provider call, delivery marked FAILED (LINK_NOT_ACTIVE).
   * 2. CAS claim: UPDATE WHERE id = :id AND deliveryStatus = 'RESERVED'
   *    SET deliveryStatus = 'ATTEMPTING', attemptStartedAt = now
   *    Only affectedRows == 1 calls provider.
   * 3. Network call uses destination chatId from durable DB record, never from client input.
   */
  private async executeDelivery(deliveryId: string, text: string): Promise<void> {
    const targetDelivery = await this.prisma.telegramNotificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { accountLink: true },
    });

    if (!targetDelivery || targetDelivery.deliveryStatus !== 'RESERVED') {
      return;
    }

    // Link must still be ACTIVE before claiming to send
    if (targetDelivery.accountLink.status !== 'ACTIVE') {
      await this.prisma.telegramNotificationDelivery.updateMany({
        where: {
          id: deliveryId,
          deliveryStatus: 'RESERVED',
        },
        data: {
          deliveryStatus: 'FAILED',
          sanitizedErrorCode: 'LINK_NOT_ACTIVE',
        },
      });
      return;
    }

    const claim = await this.prisma.telegramNotificationDelivery.updateMany({
      where: {
        id: deliveryId,
        deliveryStatus: 'RESERVED',
      },
      data: {
        deliveryStatus: 'ATTEMPTING',
        attemptStartedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      // Not claimed by this worker
      return;
    }

    const destinationChatId = targetDelivery.accountLink.telegramChatId;
    const sendResult = await this.transport.sendMessage(destinationChatId, text);

    if (sendResult.success) {
      await this.prisma.telegramNotificationDelivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: 'SENT',
          providerMessageId: sendResult.providerMessageId,
          sentAt: new Date(),
        },
      });
    } else if (sendResult.uncertainOutcome) {
      await this.prisma.telegramNotificationDelivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: 'UNKNOWN',
          sanitizedErrorCode: sendResult.sanitizedErrorCode ?? 'UNKNOWN_OUTCOME',
        },
      });
    } else {
      await this.prisma.telegramNotificationDelivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: 'FAILED',
          sanitizedErrorCode: sendResult.sanitizedErrorCode ?? 'FAILED',
        },
      });
    }
  }
}
