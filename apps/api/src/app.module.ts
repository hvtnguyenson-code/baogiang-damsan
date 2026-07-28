import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [
    // ---- Configuration ----
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      cache: true,
    }),

    // ---- App config (validation) ----
    AppConfigModule,

    // ---- Terminus health checks ----
    TerminusModule,

    // ---- Prisma ORM ----
    PrismaModule,

    // ---- Health endpoints ----
    HealthModule,
  ],
})
export class AppModule {}
