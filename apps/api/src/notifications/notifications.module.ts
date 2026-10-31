import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationActionRegistry } from './notification-action.registry';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushHttpAdapter } from './web-push-http.adapter';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationActionRegistry,
    WebPushHttpAdapter,
  ],
  exports: [NotificationsService, NotificationActionRegistry],
})
export class NotificationsModule {}

