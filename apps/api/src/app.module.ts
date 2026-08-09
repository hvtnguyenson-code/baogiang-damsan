import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/app-config.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogsModule } from './catalogs/catalogs.module';

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
    AuthModule,
    UsersModule,
    CatalogsModule,
  ],
})
export class AppModule {}
