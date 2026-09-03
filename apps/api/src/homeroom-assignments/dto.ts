import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsCivilDate } from '../common/validation/civil-date';

export class HomeroomPageDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20; }
export class ListHomeroomAssignmentsDto extends HomeroomPageDto { @IsOptional() @IsUUID() schoolClassId?: string; @IsOptional() @IsUUID() teacherUserId?: string; @IsOptional() @IsCivilDate() activeOn?: string; }
export class CreateHomeroomAssignmentDto { @IsUUID() schoolClassId!: string; @IsUUID() teacherUserId!: string; @IsCivilDate() validFrom!: string; @IsOptional() @IsCivilDate() validUntil?: string; @IsOptional() @IsString() @MaxLength(500) note?: string; @IsOptional() @IsString() @MaxLength(2000) entryReason?: string; }
export class EndHomeroomAssignmentDto { @IsCivilDate() endDate!: string; }
export class ChangeHomeroomTeacherDto { @IsUUID() newTeacherUserId!: string; @IsCivilDate() effectiveFrom!: string; @IsOptional() @IsString() @MaxLength(500) note?: string; @IsOptional() @IsString() @MaxLength(2000) entryReason?: string; }
export class HomeroomReplacementDto { @IsUUID() teacherUserId!: string; @IsCivilDate() validFrom!: string; @IsOptional() @IsCivilDate() validUntil?: string; @IsOptional() @IsString() @MaxLength(500) note?: string; @IsOptional() @IsString() @MaxLength(2000) entryReason?: string; }
export class CorrectHomeroomAssignmentDto { @IsString() @MaxLength(2000) reason!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => HomeroomReplacementDto) replacements!: HomeroomReplacementDto[]; }
export class HomeroomEligibleTeachersDto extends HomeroomPageDto { @IsCivilDate() validFrom!: string; @IsOptional() @IsCivilDate() validUntil?: string; }
