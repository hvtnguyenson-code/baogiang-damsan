import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import {
  PpctAssociationHistoryResponse,
  PpctAssociationSwitchResult,
  PpctPlanListResponse,
  PpctPlanRecord,
  PpctResolution,
  PpctVersionContent,
  PpctVersionListResponse,
  PpctVersionRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  CreatePpctPlanDto,
  CreatePpctVersionDto,
  ListPpctPlansDto,
  ListPpctVersionsDto,
  PublishPpctVersionDto,
  ReplacePpctContentDto,
  ResolvePpctDto,
  SwitchPpctAssociationDto,
} from './dto';
import { PpctService } from './ppct.service';

@Controller('academic-years/:academicYearId/ppct-plans')
export class AcademicYearPpctPlansController {
  constructor(private readonly service: PpctService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  list(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query() query: ListPpctPlansDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctPlanListResponse> {
    return this.service.listPlans(academicYearId, query, request);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  create(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Body() dto: CreatePpctPlanDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctPlanRecord> {
    return this.service.createPlan(academicYearId, dto, request);
  }
}

@Controller('ppct-plans')
export class PpctPlansController {
  constructor(private readonly service: PpctService) {}

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  get(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<PpctPlanRecord> {
    return this.service.getPlan(id, request);
  }

  @Get(':id/versions')
  @UseGuards(SessionAuthGuard)
  versions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListPpctVersionsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctVersionListResponse> {
    return this.service.listVersions(id, query, request);
  }

  @Post(':id/versions')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePpctVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctVersionRecord> {
    return this.service.createVersion(id, dto, request);
  }
}

@Controller('ppct-versions')
export class PpctVersionsController {
  constructor(private readonly service: PpctService) {}

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  get(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<PpctVersionRecord> {
    return this.service.getVersion(id, request);
  }

  @Get(':id/content')
  @UseGuards(SessionAuthGuard)
  content(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<PpctVersionContent> {
    return this.service.getContent(id, request);
  }

  @Put(':id/content')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  replaceContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePpctContentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctVersionContent> {
    return this.service.replaceContent(id, dto, request);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishPpctVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctVersionRecord> {
    return this.service.publish(id, dto, request);
  }
}

@Controller('academic-years/:academicYearId/classes/:schoolClassId/subjects/:subjectId')
export class PpctClassAssociationsController {
  constructor(private readonly service: PpctService) {}

  @Get('ppct-associations')
  @UseGuards(SessionAuthGuard)
  history(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Param('schoolClassId', ParseUUIDPipe) schoolClassId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctAssociationHistoryResponse> {
    return this.service.associationHistory(academicYearId, schoolClassId, subjectId, request);
  }

  @Post('ppct-associations/switch')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  switch(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Param('schoolClassId', ParseUUIDPipe) schoolClassId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: SwitchPpctAssociationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctAssociationSwitchResult> {
    return this.service.switchAssociation(academicYearId, schoolClassId, subjectId, dto, request);
  }

  @Get('ppct-resolution')
  @UseGuards(SessionAuthGuard)
  resolve(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Param('schoolClassId', ParseUUIDPipe) schoolClassId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Query() query: ResolvePpctDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctResolution> {
    return this.service.resolve(academicYearId, schoolClassId, subjectId, query, request);
  }
}
