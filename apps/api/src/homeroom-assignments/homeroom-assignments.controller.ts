import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { ChangeHomeroomTeacherDto, CorrectHomeroomAssignmentDto, CreateHomeroomAssignmentDto, EndHomeroomAssignmentDto, HomeroomEligibleTeachersDto, HomeroomPageDto, ListHomeroomAssignmentsDto, ResolveHomeroomAssignmentDto } from './dto';
import { HomeroomAssignmentsService } from './homeroom-assignments.service';
@Controller()
@RequireCapability('HOMEROOM_ASSIGNMENT_MANAGE', { scope: 'SCHOOL_WIDE' })
export class HomeroomAssignmentsController {
  constructor(private readonly service: HomeroomAssignmentsService) {}
  @Get('academic-years/:academicYearId/homeroom-assignments') @UseGuards(SessionAuthGuard, CapabilityGuard) list(@Param('academicYearId', ParseUUIDPipe) year: string, @Query() q: ListHomeroomAssignmentsDto) { return this.service.list(year, q); }
  @Post('academic-years/:academicYearId/homeroom-assignments') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) create(@Param('academicYearId', ParseUUIDPipe) year: string, @Body() dto: CreateHomeroomAssignmentDto, @Req() r: AuthenticatedRequest) { return this.service.create(year, dto, r.auth!.user.id, requestMeta(r)); }
  @Get('homeroom-assignments/:id') @UseGuards(SessionAuthGuard, CapabilityGuard) get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post('homeroom-assignments/:id/end') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndHomeroomAssignmentDto, @Req() r: AuthenticatedRequest) { return this.service.end(id, dto, r.auth!.user.id, requestMeta(r)); }
  @Post('homeroom-assignments/:id/change-teacher') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) change(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeHomeroomTeacherDto, @Req() r: AuthenticatedRequest) { return this.service.changeTeacher(id, dto, r.auth!.user.id, requestMeta(r)); }
  @Post('homeroom-assignments/:id/correct') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard) correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectHomeroomAssignmentDto, @Req() r: AuthenticatedRequest) { return this.service.correct(id, dto, r.auth!.user.id, requestMeta(r)); }
  @Get('academic-years/:academicYearId/homeroom-assignments/resolve') @UseGuards(SessionAuthGuard, CapabilityGuard) resolve(@Param('academicYearId', ParseUUIDPipe) year: string, @Query() dto: ResolveHomeroomAssignmentDto) { return this.service.resolve(year, dto.schoolClassId, dto.on); }
  @Get('homeroom-assignment-options/academic-years') @UseGuards(SessionAuthGuard, CapabilityGuard) years(@Query() q:HomeroomPageDto){return this.service.optionYears(q);}
  @Get('homeroom-assignment-options/academic-years/:academicYearId') @UseGuards(SessionAuthGuard, CapabilityGuard) workspace(@Param('academicYearId',ParseUUIDPipe) year:string){return this.service.workspace(year);}
  @Get('homeroom-assignment-options/academic-years/:academicYearId/eligible-teachers') @UseGuards(SessionAuthGuard, CapabilityGuard) eligible(@Param('academicYearId',ParseUUIDPipe) year:string,@Query() q:HomeroomEligibleTeachersDto){return this.service.eligibleTeachers(year,q);}
}
