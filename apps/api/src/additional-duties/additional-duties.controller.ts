import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  AdditionalDutyDefinitionListResponse,
  AdditionalDutyDefinitionOptionsResponse,
  AdditionalDutyDefinitionRecord,
  StaffAdditionalDutyAssignmentListResponse,
  StaffAdditionalDutyAssignmentRecord,
} from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AdditionalDutyAccessService } from './additional-duty-access.service';
import { AdditionalDutiesService } from './additional-duties.service';
import {
  CreateDefinitionDto,
  CreateDutyAssignmentDto,
  EndDutyAssignmentDto,
  ListDefinitionOptionsDto,
  ListDefinitionsDto,
  ListDutyAssignmentsDto,
  UpdateDefinitionDto,
  UpdateDutyAssignmentDto,
} from './dto';

@Controller('additional-duty-definitions')
export class DefinitionsController {
  constructor(private readonly service: AdditionalDutiesService, private readonly access: AdditionalDutyAccessService) {}

  @Get()
  @RequireCapability('ADDITIONAL_DUTY_CATALOG_MANAGE', { scope: 'SCHOOL_WIDE' })
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListDefinitionsDto): Promise<AdditionalDutyDefinitionListResponse> {
    return this.service.listDefinitions(query);
  }

  @Get('options')
  @UseGuards(SessionAuthGuard)
  async options(@Query() query: ListDefinitionOptionsDto, @Req() request: AuthenticatedRequest): Promise<AdditionalDutyDefinitionOptionsResponse> {
    await this.access.requireOptions(request);
    return this.service.listOptions(query);
  }

  @Post()
  @RequireCapability('ADDITIONAL_DUTY_CATALOG_MANAGE', { scope: 'SCHOOL_WIDE' })
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateDefinitionDto, @Req() request: AuthenticatedRequest): Promise<AdditionalDutyDefinitionRecord> {
    return this.service.createDefinition(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id')
  @RequireCapability('ADDITIONAL_DUTY_CATALOG_MANAGE', { scope: 'SCHOOL_WIDE' })
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdditionalDutyDefinitionRecord> {
    return this.service.getDefinition(id);
  }

  @Patch(':id')
  @RequireCapability('ADDITIONAL_DUTY_CATALOG_MANAGE', { scope: 'SCHOOL_WIDE' })
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDefinitionDto, @Req() request: AuthenticatedRequest): Promise<AdditionalDutyDefinitionRecord> {
    return this.service.updateDefinition(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/disable')
  @HttpCode(200)
  @RequireCapability('ADDITIONAL_DUTY_CATALOG_MANAGE', { scope: 'SCHOOL_WIDE' })
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  disable(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<AdditionalDutyDefinitionRecord> {
    return this.service.disableDefinition(id, request.auth!.user.id, requestMeta(request));
  }
}

@Controller('staff-additional-duty-assignments')
export class DutyAssignmentsController {
  constructor(private readonly service: AdditionalDutiesService, private readonly access: AdditionalDutyAccessService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async list(@Query() query: ListDutyAssignmentsDto, @Req() request: AuthenticatedRequest): Promise<StaffAdditionalDutyAssignmentListResponse> {
    const authorizationWhere = await this.access.assignmentRestriction(request, query);
    return this.service.listAssignments(query, authorizationWhere);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async create(@Body() dto: CreateDutyAssignmentDto, @Req() request: AuthenticatedRequest): Promise<StaffAdditionalDutyAssignmentRecord> {
    await this.access.requireCreate(request, dto.scopeType, dto.scopeResourceId);
    return this.service.createAssignment(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<StaffAdditionalDutyAssignmentRecord> {
    await this.access.requirePersisted(request, await this.service.getAssignmentScope(id));
    return this.service.getAssignment(id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDutyAssignmentDto, @Req() request: AuthenticatedRequest): Promise<StaffAdditionalDutyAssignmentRecord> {
    await this.access.requirePersisted(request, await this.service.getAssignmentScope(id));
    return this.service.updateAssignment(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/end')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndDutyAssignmentDto, @Req() request: AuthenticatedRequest): Promise<StaffAdditionalDutyAssignmentRecord> {
    await this.access.requirePersisted(request, await this.service.getAssignmentScope(id));
    return this.service.endAssignment(id, dto, request.auth!.user.id, requestMeta(request));
  }
}
