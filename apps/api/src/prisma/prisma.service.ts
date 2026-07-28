import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService wraps the PrismaClient with NestJS lifecycle hooks.
 * - Connects on module init
 * - Disconnects gracefully on shutdown
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Kết nối PostgreSQL thành công');
    } catch (error) {
      this.logger.warn(
        `Không kết nối được PostgreSQL khi khởi động: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - allow app to start; readiness check will report not ready
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Đã ngắt kết nối PostgreSQL');
  }
}
