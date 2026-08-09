import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CapabilityDefinitionListResponse, CapabilityGrantListResponse, CapabilityGrantRecord } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { CapabilitiesService } from './capabilities.service';
import { CreateGrantDto, ListCapabilitiesDto, ListGrantsDto, RevokeGrantDto } from './dto';

@Controller()
@RequireCapability('CAPABILITY_GRANT', { scope: 'SCHOOL_WIDE' })
export class CapabilitiesController {
  constructor(private readonly service: CapabilitiesService) {}

  @Get('capabilities')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  definitions(@Query() query: ListCapabilitiesDto): Promise<CapabilityDefinitionListResponse> {
    return this.service.definitions(query);
  }

  @Get('users/:id/capability-grants')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListGrantsDto): Promise<CapabilityGrantListResponse> {
    return this.service.list(id, query);
  }

  @Post('users/:id/capability-grants')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGrantDto, @Req() request: AuthenticatedRequest): Promise<CapabilityGrantRecord> {
    return this.service.create(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post('capability-grants/:id/revoke')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeGrantDto, @Req() request: AuthenticatedRequest): Promise<CapabilityGrantRecord> {
    return this.service.revoke(id, dto, request.auth!.user.id, requestMeta(request));
  }
}
