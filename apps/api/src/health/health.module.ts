import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule - exposes /api/health/live and /api/health/ready
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
