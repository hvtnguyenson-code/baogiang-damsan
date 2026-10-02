import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  HistoricalTeachingConfirmResponse,
  HistoricalTeachingOptionsResponse,
  HistoricalTeachingPreviewResponse,
  HistoricalTeachingReconciliationResponse,
} from '@baogiang/contracts/historical-teaching';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import {
  ConfirmHistoricalTeachingDto,
  HistoricalTeachingOptionsQueryDto,
  HistoricalTeachingReconciliationQueryDto,
  PreviewHistoricalTeachingDto,
} from './dto';
import { HistoricalTeachingService } from './historical-teaching.service';

@Controller('historical-teaching')
@RequireCapability('TEACHING_EXECUTION_MANAGE', { scope: 'SCHOOL_WIDE' })
export class HistoricalTeachingController {
  constructor(private readonly service: HistoricalTeachingService) {}

  @Get('options')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  options(@Query() query: HistoricalTeachingOptionsQueryDto): Promise<HistoricalTeachingOptionsResponse> {
    return this.service.options(query.academicYearId);
  }

  @Post('preview')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  preview(@Body() dto: PreviewHistoricalTeachingDto): Promise<HistoricalTeachingPreviewResponse> {
    return this.service.preview(dto);
  }

  @Post('confirm')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  confirm(@Body() dto: ConfirmHistoricalTeachingDto, @Req() request: AuthenticatedRequest): Promise<HistoricalTeachingConfirmResponse> {
    return this.service.confirm(dto, request);
  }

  @Get('reconciliation')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  reconciliation(@Query() query: HistoricalTeachingReconciliationQueryDto): Promise<HistoricalTeachingReconciliationResponse> {
    return this.service.reconciliation(query);
  }
}
