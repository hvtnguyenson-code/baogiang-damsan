import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { requestMeta } from '../auth/auth-http';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapabilities } from '../authorization/require-capability.decorator';
import { B1RoleReceipt } from './b1-role-command-writer';
import { B1RoleCommandContextQueryDto, B1RoleCommandDto, B1RoleOperabilityQueryDto } from './b1-role-command.dto';
import { B1RoleCommandHttpService } from './b1-role-command-http.service';

/**
 * P5-057 WS1: source-aware HTTP replacement, default OFF. It cannot
 * bypass the independent cutover gates or B1 transactional authority proof.
 */
@Controller('role-appointments')
export class B1RoleCommandController {
  constructor(private readonly service: B1RoleCommandHttpService) {}

  @Get('command-context')
  @RequireCapabilities(
    { capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
    { capabilityKey: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
  )
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  context(@Query() input: B1RoleCommandContextQueryDto, @Req() request: AuthenticatedRequest) {
    return this.service.context(input.role, request.auth!.user.id);
  }

  @Get('operability-preview')
  @RequireCapabilities(
    { capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
    { capabilityKey: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
  )
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  operability(@Query() input: B1RoleOperabilityQueryDto) {
    return this.service.operabilityPreview(input.role, input.targetUserId);
  }

  @Post('commands')
  @HttpCode(200)
  @RequireCapabilities(
    { capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
    { capabilityKey: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
  )
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  execute(
    @Body() input: B1RoleCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<B1RoleReceipt> {
    return this.service.execute(input, request.auth!.user.id, requestMeta(request).requestId);
  }
}
