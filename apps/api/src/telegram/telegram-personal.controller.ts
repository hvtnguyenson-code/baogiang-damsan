import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  TelegramIntegrationStatusResponse,
  TelegramLinkChallengeResponse,
  TelegramTestNotificationResponse,
  TelegramUnlinkResponse,
} from '@baogiang/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { TelegramService } from './telegram.service';
import { SendTelegramTestNotificationDto } from './telegram.dto';

@Controller('api/integrations/telegram')
export class TelegramPersonalController {
  constructor(private readonly telegramService: TelegramService) {}

  private assertPasswordNotRequired(user?: AuthenticatedUser): void {
    if (!user || user.mustChangePassword) {
      throw new ForbiddenException('Tài khoản cần đổi mật khẩu trước khi thực hiện thao tác này.');
    }
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async getStatus(@CurrentUser() user: AuthenticatedUser): Promise<TelegramIntegrationStatusResponse> {
    this.assertPasswordNotRequired(user);
    return this.telegramService.getIntegrationStatus(user.id);
  }

  @Post('link-challenge')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  async createLinkChallenge(@CurrentUser() user: AuthenticatedUser): Promise<TelegramLinkChallengeResponse> {
    this.assertPasswordNotRequired(user);
    return this.telegramService.createLinkChallenge(user.id);
  }

  @Delete('link')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  async unlink(@CurrentUser() user: AuthenticatedUser): Promise<TelegramUnlinkResponse> {
    this.assertPasswordNotRequired(user);
    return this.telegramService.unlink(user.id);
  }

  @Post('test')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  async sendTestNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendTelegramTestNotificationDto,
  ): Promise<TelegramTestNotificationResponse> {
    this.assertPasswordNotRequired(user);
    return this.telegramService.sendTestNotification(user.id, dto.requestKey);
  }
}
