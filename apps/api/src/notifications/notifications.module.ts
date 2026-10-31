import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationActionRegistry } from './notification-action.registry';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushHttpAdapter } from './web-push-http.adapter';

@Module({
  imports: [AuthModule, PrismaModule, AuthorizationModule, AppConfigModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationActionRegistry,
    WebPushHttpAdapter,
  ],
  exports: [NotificationsService, NotificationActionRegistry],
})
export class NotificationsModule {}

