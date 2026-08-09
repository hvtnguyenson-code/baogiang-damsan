import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  StaffSubjectListResponse,
  StaffSubjectRecord,
  SubjectGroupMembershipListResponse,
  SubjectGroupMembershipRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AssignmentsService } from './assignments.service';
import {
  CreateMembershipDto,
  CreateStaffSubjectDto,
  EndAssignmentDto,
  ListMembershipDto,
  ListStaffSubjectDto,
  UpdateAssignmentDto,
} from './dto';

@Controller('subject-group-memberships')
@RequireCapability('SUBJECT_GROUP_MANAGE', { scope: 'SCHOOL_WIDE' })
export class MembershipsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListMembershipDto): Promise<SubjectGroupMembershipListResponse> {
    return this.service.listMemberships(query);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateMembershipDto, @Req() request: AuthenticatedRequest): Promise<SubjectGroupMembershipRecord> {
    return this.service.createMembership(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SubjectGroupMembershipRecord> {
    return this.service.getMembership(id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto, @Req() request: AuthenticatedRequest): Promise<SubjectGroupMembershipRecord> {
    return this.service.updateMembership(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/end')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndAssignmentDto, @Req() request: AuthenticatedRequest): Promise<SubjectGroupMembershipRecord> {
    return this.service.endMembership(id, dto, request.auth!.user.id, requestMeta(request));
  }
}

@Controller('staff-subjects')
@RequireCapability('SUBJECT_MANAGE', { scope: 'SCHOOL_WIDE' })
export class StaffSubjectsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListStaffSubjectDto): Promise<StaffSubjectListResponse> {
    return this.service.listStaffSubjects(query);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateStaffSubjectDto, @Req() request: AuthenticatedRequest): Promise<StaffSubjectRecord> {
    return this.service.createStaffSubject(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StaffSubjectRecord> {
    return this.service.getStaffSubject(id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto, @Req() request: AuthenticatedRequest): Promise<StaffSubjectRecord> {
    return this.service.updateStaffSubject(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/end')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndAssignmentDto, @Req() request: AuthenticatedRequest): Promise<StaffSubjectRecord> {
    return this.service.endStaffSubject(id, dto, request.auth!.user.id, requestMeta(request));
  }
}
