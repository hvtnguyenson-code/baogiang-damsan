import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  DecideReportingStatementDto,
  ListReportingStatementsQueryDto,
  PreviewReportingStatementDto,
  SubmitReportingStatementDto,
} from './dto';
import { ReportingStatementsService } from './reporting-statements.service';

@Controller('reporting-statements')
export class ReportingStatementsController {
  constructor(private readonly service: ReportingStatementsService) {}

  @Post('preview')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  preview(@Body() dto: PreviewReportingStatementDto, @Req() req: AuthenticatedRequest) {
    return this.service.preview(dto, req);
  }

  @Get('mine')
  @UseGuards(SessionAuthGuard)
  mine(@Query() query: ListReportingStatementsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.service.listMine(query, req);
  }

  @Get('accessible')
  @UseGuards(SessionAuthGuard)
  accessible(@Query() query: ListReportingStatementsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.service.listAccessible(query, req);
  }

  @Get('pending-decision')
  @UseGuards(SessionAuthGuard)
  pendingDecision(@Query() query: ListReportingStatementsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.service.listPendingDecision(query, req);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  submit(@Body() dto: SubmitReportingStatementDto, @Req() req: AuthenticatedRequest) {
    return this.service.submit(dto, req);
  }

  @Get(':revisionId')
  @UseGuards(SessionAuthGuard)
  read(@Param('revisionId', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.service.read(id, req);
  }

  @Post(':revisionId/approve')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  approve(
    @Param('revisionId', ParseUUIDPipe) id: string,
    @Body() dto: DecideReportingStatementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.decide(id, dto, req, 'APPROVE');
  }

  @Post(':revisionId/reject')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  reject(
    @Param('revisionId', ParseUUIDPipe) id: string,
    @Body() dto: DecideReportingStatementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.decide(id, dto, req, 'REJECT');
  }
}
