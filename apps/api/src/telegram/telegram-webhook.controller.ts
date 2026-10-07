import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('integrations/telegram')
export class TelegramWebhookController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: boolean }> {
    return this.telegramService.handleWebhook(payload, secretToken);
  }
}
