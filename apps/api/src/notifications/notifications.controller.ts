import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  CreateWebPushSubscriptionDto,
  NotificationQueryDto,
  RevokeWebPushEndpointDto,
} from './dto';
import { NotificationsService } from './notifications.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('notifications')
@UseGuards(SessionAuthGuard, CsrfOriginGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async listNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.listNotifications(
      req.auth!.user.id,
      query.cursor,
      query.limit,
    );
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.auth!.user.id);
  }

  @Get('push-config')
  @Header('Cache-Control', 'no-store')
  getPushConfig() {
    return this.notificationsService.getPushConfig();
  }

  @Get('subscriptions')
  @Header('Cache-Control', 'no-store')
  async listSubscriptions(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.listSubscriptions(req.auth!.user.id);
  }

  @Post('subscriptions')
  @Header('Cache-Control', 'no-store')
  async createSubscription(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWebPushSubscriptionDto,
  ) {
    return this.notificationsService.createSubscription(req.auth!.user.id, dto);
  }

  @Post('subscriptions/revoke-endpoint')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async revokeSubscriptionByEndpoint(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RevokeWebPushEndpointDto,
  ) {
    return this.notificationsService.revokeByEndpoint(req.auth!.user.id, dto.endpoint);
  }

  @Delete('subscriptions/:id')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async revokeSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    if (!UUID_REGEX.test(id)) {
      throw new BadRequestException('ID thiết bị không hợp lệ.');
    }
    return this.notificationsService.revokeSubscription(req.auth!.user.id, id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    if (!UUID_REGEX.test(id)) {
      throw new BadRequestException('ID thông báo không hợp lệ.');
    }
    return this.notificationsService.markRead(req.auth!.user.id, id);
  }

  @Get(':id/action')
  @Header('Cache-Control', 'no-store')
  async resolveAction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    if (!UUID_REGEX.test(id)) {
      throw new BadRequestException('ID thông báo không hợp lệ.');
    }
    return this.notificationsService.resolveAction(req.auth!.user.id, id);
  }
}
