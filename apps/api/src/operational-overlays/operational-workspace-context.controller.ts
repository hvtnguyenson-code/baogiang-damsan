import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { PreviewCalendarExceptionDto } from './dto';
import { IsOptional, IsUUID } from 'class-validator';
import { CivilDateString } from '@baogiang/contracts';
import { IsCivilDate } from '../common/validation/civil-date';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { OperationalWorkspaceContextService } from './operational-workspace-context.service';

class SourceOccurrencesQuery {
  @IsUUID() academicYearId!: string;
  @IsCivilDate() civilDate!: CivilDateString;
  @IsOptional() @IsUUID() subjectId?: string;
}

/** Scoped discovery only; this controller exposes no mutation commands. */
@Controller('operational-overlays/workspace')
@UseGuards(SessionAuthGuard)
export class OperationalWorkspaceContextController {
  constructor(private readonly context: OperationalWorkspaceContextService) {}

  @Post('calendar-preview')
  @UseGuards(CsrfOriginGuard)
  previewCalendar(@Req() request: AuthenticatedRequest, @Body() input: PreviewCalendarExceptionDto) {
    return this.context.previewCalendarException(request, input);
  }

  @Get('source-occurrences')
  getSourceOccurrences(@Req() request: AuthenticatedRequest, @Query() query: SourceOccurrencesQuery) {
    return this.context.getSourceOccurrences(request, query);
  }

  @Get('context')
  getContext(@Req() request: AuthenticatedRequest) {
    return this.context.getContext(request);
  }
}
