import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import {
  TimetableEntryListResponse,
  TimetableEntryReplaceResult,
  TimetableValidationReport,
  TimetableVersionListResponse,
  TimetableVersionRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import {
  CreateTimetableVersionDto,
  ListTimetableEntriesDto,
  ListTimetableVersionsDto,
  ReplaceTimetableEntriesDto,
  SetTimetableTargetDto,
  ValidateTimetableVersionDto,
} from './dto';
import { TimetablesService } from './timetables.service';

@Controller('academic-years/:academicYearId/timetable-versions')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class AcademicYearTimetableVersionsController {
  constructor(private readonly service: TimetablesService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query() query: ListTimetableVersionsDto,
  ): Promise<TimetableVersionListResponse> {
    return this.service.listVersions(academicYearId, query);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Body() dto: CreateTimetableVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableVersionRecord> {
    return this.service.createVersion(academicYearId, dto, request.auth!.user.id, requestMeta(request));
  }
}

@Controller('timetable-versions')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TimetableVersionsController {
  constructor(private readonly service: TimetablesService) {}

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TimetableVersionRecord> {
    return this.service.getVersion(id);
  }

  @Post(':id/target')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  setTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTimetableTargetDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableVersionRecord> {
    return this.service.setTarget(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id/entries')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listEntries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTimetableEntriesDto,
  ): Promise<TimetableEntryListResponse> {
    return this.service.listEntries(id, query);
  }

  @Put(':id/entries')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  replaceEntries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTimetableEntriesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableEntryReplaceResult> {
    return this.service.replaceEntries(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/validate')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  validate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateTimetableVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimetableValidationReport> {
    return this.service.validateVersion(id, dto, request.auth!.user.id, requestMeta(request));
  }
}
