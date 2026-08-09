import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuditResult } from '@prisma/client';
import { AuditEventListResponse } from '@baogiang/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CapabilityGuard } from '../authorization/capability.guard';
import { RequireCapability } from '../authorization/require-capability.decorator';
import { AuditService } from './audit.service';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

export class ListAuditDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsEnum(AuditResult) result?: AuditResult;
  @IsOptional() @IsAbsoluteInstant() createdFrom?: string;
  @IsOptional() @IsAbsoluteInstant() createdTo?: string;
}

@Controller('audit-events')
@RequireCapability('AUDIT_VIEW', { scope: 'SCHOOL_WIDE' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  list(@Query() query: ListAuditDto): Promise<AuditEventListResponse> {
    return this.audit.list(query);
  }
}
