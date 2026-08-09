import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PageDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20; }
export class CreateMembershipDto { @IsUUID() userId!: string; @IsUUID() subjectGroupId!: string; @IsOptional() @IsDateString() validFrom?: string; @IsOptional() @IsDateString() validUntil?: string; @IsOptional() @IsBoolean() isPrimary?: boolean; }
export class CreateStaffSubjectDto { @IsUUID() userId!: string; @IsUUID() subjectId!: string; @IsOptional() @IsDateString() validFrom?: string; @IsOptional() @IsDateString() validUntil?: string; @IsOptional() @IsBoolean() isPrimary?: boolean; }
export class UpdateAssignmentDto { @IsOptional() @IsDateString() validFrom?: string; @IsOptional() @IsDateString() validUntil?: string; @IsOptional() @IsBoolean() isPrimary?: boolean; }
export class EndAssignmentDto { @IsOptional() @IsDateString() endAt?: string; }
export class ListMembershipDto extends PageDto { @IsOptional() @IsUUID() userId?: string; @IsOptional() @IsUUID() subjectGroupId?: string; @IsOptional() @IsDateString() activeAt?: string; @IsOptional() @Type(() => Boolean) @IsBoolean() isPrimary?: boolean; }
export class ListStaffSubjectDto extends PageDto { @IsOptional() @IsUUID() userId?: string; @IsOptional() @IsUUID() subjectId?: string; @IsOptional() @IsDateString() activeAt?: string; @IsOptional() @Type(() => Boolean) @IsBoolean() isPrimary?: boolean; }
