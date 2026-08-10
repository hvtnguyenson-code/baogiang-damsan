import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SchoolClassRecord } from '@baogiang/contracts';
import { CatalogStatus } from '@prisma/client';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AcademicStructureService } from './academic-structure.service';
import { EmptyCommandDto, UpdateSchoolClassDto } from './dto';

@Controller('school-classes')
@RequireCapability('ACADEMIC_STRUCTURE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class SchoolClassesController {
  constructor(private readonly service: AcademicStructureService) {}

  @Get(':id') @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SchoolClassRecord> { return this.service.getSchoolClass(id); }

  @Patch(':id') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolClassDto, @Req() request: AuthenticatedRequest): Promise<SchoolClassRecord> {
    return this.service.updateSchoolClass(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/activate') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  activate(@Param('id', ParseUUIDPipe) id: string, @Body() _dto: EmptyCommandDto, @Req() request: AuthenticatedRequest): Promise<SchoolClassRecord> {
    return this.service.changeSchoolClassStatus(id, CatalogStatus.ACTIVE, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/deactivate') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Body() _dto: EmptyCommandDto, @Req() request: AuthenticatedRequest): Promise<SchoolClassRecord> {
    return this.service.changeSchoolClassStatus(id, CatalogStatus.INACTIVE, request.auth!.user.id, requestMeta(request));
  }
}
