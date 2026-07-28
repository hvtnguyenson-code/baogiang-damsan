import { Controller, Get, Logger, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthLiveResponse, HealthReadyResponse } from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CURRENT_PHASE } from '@baogiang/config';

const APP_VERSION = '0.0.1';

/**
 * HealthController provides liveness and readiness endpoints.
 *
 * GET /api/health/live  - Process liveness (no DB dependency)
 * GET /api/health/ready - Readiness including PostgreSQL check
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe.
   * Returns 200 as long as the Node.js process is alive.
   * Does NOT check database connectivity.
   */
  @Get('live')
  getLive(): HealthLiveResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: APP_VERSION,
      phase: CURRENT_PHASE,
    };
  }

  /**
   * Readiness probe.
   * Checks PostgreSQL connectivity via SELECT 1.
   * Returns 200 if ready, 503 if not.
   */
  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response): Promise<HealthReadyResponse> {
    const dbStart = Date.now();
    let dbStatus: HealthReadyResponse['checks']['database'];

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = {
        status: 'ok',
        latencyMs: Date.now() - dbStart,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database connection failed';
      this.logger.warn(`Readiness check - DB not ready: ${message}`);
      dbStatus = {
        status: 'error',
        message,
        latencyMs: Date.now() - dbStart,
      };
    }

    const overallStatus = dbStatus.status === 'ok' ? 'ok' : 'error';

    if (overallStatus !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }
}
