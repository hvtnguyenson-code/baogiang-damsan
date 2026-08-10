import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  TeachingAssignmentAcademicYearOptionListResponse,
  TeachingAssignmentEligibleTeacherListResponse,
  TeachingAssignmentWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { ListEligibleTeachingAssignmentTeachersDto, TeachingAssignmentPageDto } from './dto';
import { TeachingAssignmentOptionsService } from './teaching-assignment-options.service';

@Controller('teaching-assignment-options')
@RequireCapability('SUBJECT_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TeachingAssignmentOptionsController {
  constructor(private readonly service: TeachingAssignmentOptionsService) {}

  @Get('academic-years')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listAcademicYears(
    @Query() query: TeachingAssignmentPageDto,
  ): Promise<TeachingAssignmentAcademicYearOptionListResponse> {
    return this.service.listAcademicYears(query);
  }

  @Get('academic-years/:academicYearId/eligible-teachers')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  listEligibleTeachers(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query() query: ListEligibleTeachingAssignmentTeachersDto,
  ): Promise<TeachingAssignmentEligibleTeacherListResponse> {
    return this.service.listEligibleTeachers(academicYearId, query);
  }

  @Get('academic-years/:academicYearId')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  getWorkspace(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
  ): Promise<TeachingAssignmentWorkspaceOptionsResponse> {
    return this.service.getWorkspace(academicYearId);
  }
}
