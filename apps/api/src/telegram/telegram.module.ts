import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigModule } from '../config/app-config.module';
import { TelegramPersonalController } from './telegram-personal.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';
import { TELEGRAM_TRANSPORT_PORT } from './telegram-transport.port';
import { TelegramBotApiAdapter } from './telegram-bot-api.adapter';

@Module({
  imports: [AuthModule, PrismaModule, AppConfigModule],
  controllers: [TelegramPersonalController, TelegramWebhookController],
  providers: [
    TelegramService,
    TelegramBotApiAdapter,
    {
      provide: TELEGRAM_TRANSPORT_PORT,
      useClass: TelegramBotApiAdapter,
    },
  ],
  exports: [TelegramService, TELEGRAM_TRANSPORT_PORT],
})
export class TelegramModule {}
