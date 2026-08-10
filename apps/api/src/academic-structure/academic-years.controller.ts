import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  AcademicCalendarVersionDetail, AcademicCalendarVersionListResponse, AcademicYearListResponse,
  AcademicYearRecord, SchoolClassListResponse, SchoolClassRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AcademicStructureService } from './academic-structure.service';
import {
  CreateAcademicYearDto, CreateCalendarVersionDto, CreateSchoolClassDto, ListSchoolClassesDto,
  PageDto, UpdateAcademicYearDto,
} from './dto';

@Controller('academic-years')
@RequireCapability('ACADEMIC_STRUCTURE_MANAGE', { scope: 'SCHOOL_WIDE' })
export class AcademicYearsController {
  constructor(private readonly service: AcademicStructureService) {}

  @Get() @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: PageDto): Promise<AcademicYearListResponse> { return this.service.listAcademicYears(query); }

  @Post() @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateAcademicYearDto, @Req() request: AuthenticatedRequest): Promise<AcademicYearRecord> {
    return this.service.createAcademicYear(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id') @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AcademicYearRecord> { return this.service.getAcademicYear(id); }

  @Patch(':id') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAcademicYearDto, @Req() request: AuthenticatedRequest): Promise<AcademicYearRecord> {
    return this.service.updateAcademicYear(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':academicYearId/calendar-versions') @UseGuards(SessionAuthGuard, CapabilityGuard)
  listVersions(@Param('academicYearId', ParseUUIDPipe) academicYearId: string, @Query() query: PageDto): Promise<AcademicCalendarVersionListResponse> {
    return this.service.listCalendarVersions(academicYearId, query);
  }

  @Post(':academicYearId/calendar-versions') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  createVersion(@Param('academicYearId', ParseUUIDPipe) academicYearId: string, @Body() dto: CreateCalendarVersionDto, @Req() request: AuthenticatedRequest): Promise<AcademicCalendarVersionDetail> {
    return this.service.createCalendarVersion(academicYearId, dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':academicYearId/classes') @UseGuards(SessionAuthGuard, CapabilityGuard)
  listClasses(@Param('academicYearId', ParseUUIDPipe) academicYearId: string, @Query() query: ListSchoolClassesDto): Promise<SchoolClassListResponse> {
    return this.service.listSchoolClasses(academicYearId, query);
  }

  @Post(':academicYearId/classes') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  createClass(@Param('academicYearId', ParseUUIDPipe) academicYearId: string, @Body() dto: CreateSchoolClassDto, @Req() request: AuthenticatedRequest): Promise<SchoolClassRecord> {
    return this.service.createSchoolClass(academicYearId, dto, request.auth!.user.id, requestMeta(request));
  }
}
