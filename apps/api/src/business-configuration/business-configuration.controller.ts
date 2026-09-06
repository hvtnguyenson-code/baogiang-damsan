import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { BusinessConfigurationService } from './business-configuration.service';
import { CreateBusinessPolicyDraftDto, EditBusinessPolicyDraftDto, LifecycleBusinessPolicyDto } from './dto';

@Controller('business-configuration')
@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })
export class BusinessConfigurationController {
  constructor(private readonly service: BusinessConfigurationService) {}
  @Get('families') @UseGuards(SessionAuthGuard, CapabilityGuard) families() { return this.service.familiesList(); }
  @Get('policies') @UseGuards(SessionAuthGuard, CapabilityGuard) list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.service.list(Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(pageSize) || 25))); }
  @Get('policies/:streamId') @UseGuards(SessionAuthGuard, CapabilityGuard) get(@Param('streamId', ParseUUIDPipe) streamId: string) { return this.service.get(streamId); }
  @Get('resolve') @UseGuards(SessionAuthGuard, CapabilityGuard) resolve(@Query('family') family: string, @Query('kind') kind: 'SCHOOL_WIDE' | 'ACADEMIC_YEAR', @Query('academicYearId') academicYearId: string | undefined, @Query('civilDate') civilDate?: string) { return this.service.resolveEffectiveBusinessPolicy(family, kind === 'ACADEMIC_YEAR' ? { kind, academicYearId: academicYearId! } : { kind: 'SCHOOL_WIDE' }, civilDate ?? this.service.businessCivilDate()); }
  @Post('policies/drafts') @HttpCode(201) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) create(@Body() dto: CreateBusinessPolicyDraftDto, @Req() request: AuthenticatedRequest) { return this.service.createDraft(dto, request.auth!.user.id, requestMeta(request)); }
  @Post('policy-versions/:id/edit-draft') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditBusinessPolicyDraftDto, @Req() request: AuthenticatedRequest) { return this.service.editDraft(id, dto, request.auth!.user.id, requestMeta(request)); }
  @Post('policy-versions/:id/publish') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleBusinessPolicyDto, @Req() request: AuthenticatedRequest) { return this.service.publish(id, dto, request.auth!.user.id, requestMeta(request)); }
  @Post('policy-versions/:id/replace') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleBusinessPolicyDto, @Req() request: AuthenticatedRequest) { return this.service.replace(id, dto, request.auth!.user.id, requestMeta(request)); }
  @Post('policy-versions/:id/retire') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) retire(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleBusinessPolicyDto, @Req() request: AuthenticatedRequest) { return this.service.retire(id, dto, request.auth!.user.id, requestMeta(request)); }
  @Post('policy-versions/:id/correct') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleBusinessPolicyDto, @Req() request: AuthenticatedRequest) { return this.service.correct(id, dto, request.auth!.user.id, requestMeta(request)); }
}
