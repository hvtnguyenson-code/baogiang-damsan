import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  TimetableImportAliasListResponse,
  TimetableImportAliasRecord,
  TimetableImportProfileDetail,
  TimetableImportProfileListResponse,
} from '@baogiang/contracts';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import {
  CreateTimetableImportAliasDto,
  CreateTimetableImportProfileDto,
  ExpectedActiveRevisionDto,
  ListTimetableImportAliasesDto,
  ReviseTimetableImportProfileDto,
} from './dto';
import { TimetableImportService } from './timetable-import.service';

@Controller('timetable-import')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TimetableImportController {
  constructor(private readonly service: TimetableImportService) {}

  @Get('profiles')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listProfiles(): Promise<TimetableImportProfileListResponse> {
    return this.service.listProfiles();
  }

  @Get('profiles/:profileId')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  getProfile(@Param('profileId', ParseUUIDPipe) profileId: string): Promise<TimetableImportProfileDetail> {
    return this.service.getProfile(profileId);
  }

  @Post('profiles')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  createProfile(
    @Body() dto: CreateTimetableImportProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportProfileDetail> {
    return this.service.createProfile(dto, request.auth!.user.id, requestMeta(request));
  }

  @Post('profiles/:profileId/revise')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  reviseProfile(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ReviseTimetableImportProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportProfileDetail> {
    return this.service.reviseProfile(profileId, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post('profiles/:profileId/retire-active')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  retireActiveProfile(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ExpectedActiveRevisionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportProfileDetail> {
    return this.service.retireActiveProfile(profileId, dto.expectedActiveRevisionId, request.auth!.user.id, requestMeta(request));
  }

  @Get('profiles/:profileId/aliases')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listAliases(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: ListTimetableImportAliasesDto,
  ): Promise<TimetableImportAliasListResponse> {
    return this.service.listAliases(profileId, query);
  }

  @Post('profiles/:profileId/aliases')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  createAlias(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateTimetableImportAliasDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportAliasRecord> {
    return this.service.createAlias(profileId, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post('aliases/:aliasId/retire')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  retireAlias(
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableImportAliasRecord> {
    return this.service.retireAlias(aliasId, request.auth!.user.id, requestMeta(request));
  }
}
