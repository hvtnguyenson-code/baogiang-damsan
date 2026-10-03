import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  MakeupTargetOptionsResponse,
  MakeupTeachingCandidateListResponse,
  MakeupTeachingScheduleCreateResult,
  MakeupTeachingScheduleListResponse,
  MakeupTeachingScheduleRecord,
  MakeupTeachingScheduleReverseResult,
} from '@baogiang/contracts';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  CreateMakeupScheduleDto,
  GetMakeupTargetOptionsDto,
  ListMakeupCandidatesDto,
  ListMakeupSchedulesDto,
  ReverseOperationalOverlayDto,
} from './dto';
import { MakeupSchedulesService } from './makeup-schedules.service';

@Controller(['operational-overlays/makeup-schedules', 'makeup-teaching-schedules'])
export class MakeupSchedulesController {
  constructor(private readonly service: MakeupSchedulesService) {}

  @Get('candidates')
  @UseGuards(SessionAuthGuard)
  listCandidates(
    @Query() query: ListMakeupCandidatesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTeachingCandidateListResponse> {
    return this.service.listCandidates(query, request);
  }

  @Get('target-options')
  @UseGuards(SessionAuthGuard)
  getTargetOptions(
    @Query() query: GetMakeupTargetOptionsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTargetOptionsResponse> {
    return this.service.getTargetOptions(query, request);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  create(
    @Body() dto: CreateMakeupScheduleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleCreateResult> {
    return this.service.create(dto, request);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  list(
    @Query() query: ListMakeupSchedulesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleListResponse> {
    return this.service.list(query, request);
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleRecord> {
    return this.service.get(id, request);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseOperationalOverlayDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleReverseResult> {
    return this.service.reverse(id, dto, request);
  }
}
