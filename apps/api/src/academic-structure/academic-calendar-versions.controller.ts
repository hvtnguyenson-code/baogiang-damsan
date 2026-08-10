import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AcademicCalendarVersionDetail } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AcademicStructureService } from './academic-structure.service';
import { EmptyCommandDto } from './dto';

@Controller('academic-calendar-versions')
@RequireCapability('ACADEMIC_STRUCTURE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class AcademicCalendarVersionsController {
  constructor(private readonly service: AcademicStructureService) {}

  @Get(':id') @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AcademicCalendarVersionDetail> { return this.service.getCalendarVersion(id); }

  @Post(':id/activate') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  activate(@Param('id', ParseUUIDPipe) id: string, @Body() _dto: EmptyCommandDto, @Req() request: AuthenticatedRequest): Promise<AcademicCalendarVersionDetail> {
    return this.service.activateCalendarVersion(id, request.auth!.user.id, requestMeta(request));
  }
}
