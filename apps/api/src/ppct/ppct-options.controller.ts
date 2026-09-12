import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import {
  PpctWorkspaceAcademicYearOptionListResponse,
  PpctWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ListPpctWorkspaceAcademicYearsDto } from './dto';
import { PpctAccessService } from './ppct-access.service';
import { PpctOptionsService } from './ppct-options.service';

@Controller('ppct-options')
export class PpctOptionsController {
  constructor(
    private readonly service: PpctOptionsService,
    private readonly access: PpctAccessService,
  ) {}

  @Get('academic-years')
  @UseGuards(SessionAuthGuard)
  async listAcademicYears(
    @Query() query: ListPpctWorkspaceAcademicYearsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctWorkspaceAcademicYearOptionListResponse> {
    await this.access.requireAnyManageScope(request);
    return this.service.listAcademicYears(query);
  }

  @Get('academic-years/:academicYearId')
  @UseGuards(SessionAuthGuard)
  async getWorkspace(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PpctWorkspaceOptionsResponse> {
    const manageScope = await this.access.requireAnyManageScope(request);
    return this.service.getWorkspace(academicYearId, manageScope);
  }
}
