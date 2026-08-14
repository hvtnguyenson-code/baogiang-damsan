import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { TimetableReadinessResponse } from '@baogiang/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { EvaluateTimetableReadinessDto } from './dto';
import { TimetableReadinessService } from './timetable-readiness.service';

@Controller('timetable-versions')
@RequireCapability('TIMETABLE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TimetableReadinessController {
  constructor(private readonly service: TimetableReadinessService) {}

  @Get(':id/readiness')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  evaluate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EvaluateTimetableReadinessDto,
  ): Promise<TimetableReadinessResponse> {
    return this.service.evaluate(id, query);
  }
}
