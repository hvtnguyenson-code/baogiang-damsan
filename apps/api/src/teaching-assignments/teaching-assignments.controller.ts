import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  TeachingAssignmentChangeResult,
  TeachingAssignmentListResponse,
  TeachingAssignmentRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import {
  ChangeTeachingAssignmentTeacherDto,
  CreateTeachingAssignmentDto,
  EndTeachingAssignmentDto,
  ListTeachingAssignmentsDto,
} from './dto';
import { TeachingAssignmentsService } from './teaching-assignments.service';

@Controller('academic-years/:academicYearId/teaching-assignments')
@RequireCapability('SUBJECT_MANAGE', { scope: 'SCHOOL_WIDE' })
export class AcademicYearTeachingAssignmentsController {
  constructor(private readonly service: TeachingAssignmentsService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query() query: ListTeachingAssignmentsDto,
  ): Promise<TeachingAssignmentListResponse> {
    return this.service.list(academicYearId, query);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Body() dto: CreateTeachingAssignmentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TeachingAssignmentRecord> {
    return this.service.create(academicYearId, dto, request.auth!.user.id, requestMeta(request));
  }
}

@Controller('teaching-assignments')
@RequireCapability('SUBJECT_MANAGE', { scope: 'SCHOOL_WIDE' })
export class TeachingAssignmentsController {
  constructor(private readonly service: TeachingAssignmentsService) {}

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TeachingAssignmentRecord> {
    return this.service.get(id);
  }

  @Post(':id/end')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EndTeachingAssignmentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TeachingAssignmentRecord> {
    return this.service.end(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/change-teacher')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  changeTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTeachingAssignmentTeacherDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TeachingAssignmentChangeResult> {
    return this.service.changeTeacher(id, dto, request.auth!.user.id, requestMeta(request));
  }
}
