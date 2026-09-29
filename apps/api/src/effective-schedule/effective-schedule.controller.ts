import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  EffectiveScheduleComparisonResponse,
  EffectiveScheduleContextOptionsResponse,
  EffectiveScheduleTeacherOptionsResponse,
  IndividualWeeklyScheduleResponse,
  SchoolWideDayScheduleResponse,
} from '@baogiang/contracts';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import {
  GetEffectiveScheduleComparisonDto,
  GetEffectiveScheduleContextDto,
  GetIndividualWeeklyScheduleDto,
  GetSchoolWideDayScheduleDto,
  ListEffectiveScheduleTeachersDto,
} from './dto';
import { EffectiveScheduleService } from './effective-schedule.service';

/**
 * Public read-only HTTP surface for SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1.
 * Guarded strictly by authenticated TEACHER_BASE.
 * Exposes NO mutation verbs/commands.
 */
@Controller('effective-schedule')
@RequireCapability('TEACHER_BASE', { scope: 'PERSONAL' })
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class EffectiveScheduleController {
  constructor(private readonly service: EffectiveScheduleService) {}

  @Get('context')
  getContext(@Query() query: GetEffectiveScheduleContextDto): Promise<EffectiveScheduleContextOptionsResponse> {
    return this.service.getContext(query);
  }

  @Get('teachers')
  listTeachers(@Query() query: ListEffectiveScheduleTeachersDto): Promise<EffectiveScheduleTeacherOptionsResponse> {
    return this.service.listTeachers(query);
  }

  @Get('weekly')
  getWeeklySchedule(
    @Query() query: GetIndividualWeeklyScheduleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<IndividualWeeklyScheduleResponse> {
    return this.service.getWeeklySchedule(query, req.auth!.user.id);
  }

  @Get('school-wide')
  getSchoolWideDaySchedule(
    @Query() query: GetSchoolWideDayScheduleDto,
  ): Promise<SchoolWideDayScheduleResponse> {
    return this.service.getSchoolWideDaySchedule(query);
  }

  @Get('compare')
  compareSchedules(
    @Query() query: GetEffectiveScheduleComparisonDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EffectiveScheduleComparisonResponse> {
    return this.service.compareSchedules(query, req.auth!.user.id);
  }
}
