import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BaselineReconciliationApplyResponse,
  BaselineReconciliationPreviewResponse,
  ResponsibilityTemplateApplyResponse,
  ResponsibilityTemplateListResponse,
  ResponsibilityTemplatePreviewResponse,
} from '@baogiang/contracts';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AccessBaselineService } from './access-baseline.service';
import {
  BaselineReconciliationApplyDto,
  ResponsibilityTemplateApplyDto,
  ResponsibilityTemplatePreviewDto,
} from './dto';
import { listTemplateDefinitions } from './responsibility-template-catalog';

@Controller()
@RequireCapability('CAPABILITY_GRANT', { scope: 'SCHOOL_WIDE' })
export class ResponsibilityTemplatesController {
  constructor(private readonly service: AccessBaselineService) {}

  @Get(['capabilities/responsibility-templates', 'responsibility-templates'])
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listTemplates(): ResponsibilityTemplateListResponse {
    return { items: listTemplateDefinitions() };
  }

  @Post('users/:id/responsibility-templates/preview')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  previewTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResponsibilityTemplatePreviewDto,
  ): Promise<ResponsibilityTemplatePreviewResponse> {
    return this.service.previewTemplate(id, dto);
  }

  @Post('users/:id/responsibility-templates/apply')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  applyTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResponsibilityTemplateApplyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResponsibilityTemplateApplyResponse> {
    return this.service.applyTemplate(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(['baseline-reconciliation/preview', 'responsibility-templates/baseline-reconciliation/preview'])
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  previewReconciliationGet(): Promise<BaselineReconciliationPreviewResponse> {
    return this.service.previewReconciliation();
  }

  @Post(['baseline-reconciliation/preview', 'responsibility-templates/baseline-reconciliation/preview'])
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  previewReconciliationPost(): Promise<BaselineReconciliationPreviewResponse> {
    return this.service.previewReconciliation();
  }

  @Post(['baseline-reconciliation/apply', 'responsibility-templates/baseline-reconciliation/apply'])
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  applyReconciliation(
    @Body() dto: BaselineReconciliationApplyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BaselineReconciliationApplyResponse> {
    return this.service.applyReconciliation(dto, request.auth!.user.id, requestMeta(request));
  }
}
