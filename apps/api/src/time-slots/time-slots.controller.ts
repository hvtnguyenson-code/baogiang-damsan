import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TimeSlotDefinitionListResponse, TimeSlotDefinitionRecord, TimeSlotRevisionResult } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { CreateTimeSlotDto, ListTimeSlotsDto, ReviseTimeSlotDto } from './dto';
import { TimeSlotsService } from './time-slots.service';

@Controller('academic-years/:academicYearId/time-slots')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class AcademicYearTimeSlotsController {
  constructor(private readonly service: TimeSlotsService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query() query: ListTimeSlotsDto,
  ): Promise<TimeSlotDefinitionListResponse> {
    return this.service.list(academicYearId, query);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Body() dto: CreateTimeSlotDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimeSlotDefinitionRecord> {
    return this.service.create(academicYearId, dto, request.auth!.user.id, requestMeta(request));
  }
}

@Controller('time-slots')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TimeSlotsController {
  constructor(private readonly service: TimeSlotsService) {}

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TimeSlotDefinitionRecord> {
    return this.service.get(id);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseTimeSlotDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimeSlotRevisionResult> {
    return this.service.revise(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/retire')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  retire(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<TimeSlotDefinitionRecord> {
    return this.service.retire(id, request.auth!.user.id, requestMeta(request));
  }
}
