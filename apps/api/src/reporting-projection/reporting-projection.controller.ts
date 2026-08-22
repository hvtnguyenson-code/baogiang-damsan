import { CivilDateString } from '@baogiang/contracts';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ReportingAccessService } from './reporting-access.service';
import { ResolveReportingProjectionDto } from './reporting-projection.dto';
import { ReportingProjectionService } from './reporting-projection.service';
import { ReportingProjection } from './reporting-projection.types';

@Controller('reporting')
export class ReportingProjectionController {
  constructor(private readonly access: ReportingAccessService, private readonly projection: ReportingProjectionService) {}

  @Post('projection')
  @UseGuards(SessionAuthGuard)
  async resolve(@Body() dto: ResolveReportingProjectionDto, @Req() request: AuthenticatedRequest): Promise<ReportingProjection> {
    await this.access.requireSubjects(request, dto.roots.map((root) => root.subjectId));
    return this.projection.resolve({
      academicYearId: dto.academicYearId,
      roots: dto.roots.map(({ schoolClassId, subjectId }) => ({ schoolClassId, subjectId })),
      fromCivilDate: dto.fromCivilDate as CivilDateString,
      toCivilDate: dto.toCivilDate as CivilDateString,
      asOfInstant: new Date(dto.asOfInstant),
    });
  }
}
