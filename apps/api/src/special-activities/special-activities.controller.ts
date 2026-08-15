import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SpecialActivityCreateResult, SpecialActivityListResponse, SpecialActivityRecord, SpecialActivityReverseResult } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateSpecialActivityDto, ListSpecialActivitiesDto, ReverseSpecialActivityDto } from './dto';
import { SpecialActivitiesService } from './special-activities.service';
@Controller('special-activities')
export class SpecialActivitiesController {
  constructor(private readonly service: SpecialActivitiesService) {}
  @Post() @UseGuards(SessionAuthGuard, CsrfOriginGuard) create(@Body() dto: CreateSpecialActivityDto, @Req() request: AuthenticatedRequest): Promise<SpecialActivityCreateResult> { return this.service.create(dto, request); }
  @Get() @UseGuards(SessionAuthGuard) list(@Query() query: ListSpecialActivitiesDto, @Req() request: AuthenticatedRequest): Promise<SpecialActivityListResponse> { return this.service.list(query, request); }
  @Get(':id') @UseGuards(SessionAuthGuard) get(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<SpecialActivityRecord> { return this.service.get(id, request); }
  @Post(':id/reverse') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard) reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseSpecialActivityDto, @Req() request: AuthenticatedRequest): Promise<SpecialActivityReverseResult> { return this.service.reverse(id, dto, request); }
}
