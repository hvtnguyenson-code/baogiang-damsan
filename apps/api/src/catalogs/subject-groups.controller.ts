import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CatalogEntry, CatalogListResponse } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogEntryDto } from './dto/create-catalog-entry.dto';
import { ListCatalogEntriesDto } from './dto/list-catalog-entries.dto';
import { UpdateCatalogEntryDto } from './dto/update-catalog-entry.dto';

@Controller('subject-groups')
@RequireCapability('SUBJECT_GROUP_MANAGE', { scope: 'SCHOOL_WIDE' })
export class SubjectGroupsController {
  constructor(private readonly catalogs: CatalogsService) {}
  @Get() @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListCatalogEntriesDto): Promise<CatalogListResponse> { return this.catalogs.list('subjectGroup', query); }
  @Post() @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateCatalogEntryDto, @Req() request: AuthenticatedRequest): Promise<CatalogEntry> { return this.catalogs.create('subjectGroup', dto, request.auth!.user.id, requestMeta(request)); }
  @Get(':id') @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<CatalogEntry> { return this.catalogs.get('subjectGroup', id); }
  @Patch(':id') @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCatalogEntryDto, @Req() request: AuthenticatedRequest): Promise<CatalogEntry> { return this.catalogs.update('subjectGroup', id, dto, request.auth!.user.id, requestMeta(request)); }
  @Post(':id/activate') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  activate(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest): Promise<CatalogEntry> { return this.catalogs.changeStatus('subjectGroup', id, 'ACTIVE', request.auth!.user.id, requestMeta(request)); }
  @Post(':id/deactivate') @HttpCode(200) @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest): Promise<CatalogEntry> { return this.catalogs.changeStatus('subjectGroup', id, 'INACTIVE', request.auth!.user.id, requestMeta(request)); }
}
