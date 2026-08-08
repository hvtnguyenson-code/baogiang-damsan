import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserManagementListResponse, UserManagementRecord } from '@baogiang/contracts';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { requestMeta } from '../auth/auth-http';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@RequireCapability('USER_MANAGE', { scope: 'SCHOOL_WIDE' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListUsersDto): Promise<UserManagementListResponse> { return this.users.list(query); }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest): Promise<UserManagementRecord> {
    return this.users.create(dto, request.auth!.user.id, requestMeta(request));
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserManagementRecord> { return this.users.get(id); }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto, @Req() request: AuthenticatedRequest): Promise<UserManagementRecord> {
    return this.users.update(id, dto, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  activate(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest): Promise<UserManagementRecord> {
    return this.users.activate(id, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/disable')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  disable(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest): Promise<UserManagementRecord> {
    return this.users.disable(id, request.auth!.user.id, requestMeta(request));
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard, CapabilityGuard)
  unlock(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest): Promise<UserManagementRecord> {
    return this.users.unlock(id, request.auth!.user.id, requestMeta(request));
  }
}
