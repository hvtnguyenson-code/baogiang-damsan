import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DataReadinessSummaryResponse } from '@baogiang/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DataReadinessService } from './data-readiness.service';

@Controller('data-readiness')
@UseGuards(SessionAuthGuard)
export class DataReadinessController {
  constructor(private readonly service: DataReadinessService) {}

  @Get('summary')
  async getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('academicYearId') academicYearId?: string,
  ): Promise<DataReadinessSummaryResponse> {
    return this.service.getSummary(req, academicYearId);
  }
}
