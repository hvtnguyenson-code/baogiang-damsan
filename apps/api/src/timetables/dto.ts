import { Type } from 'class-transformer';
import { AcademicWeekday, TimetableVersionStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';
import { IsCivilDate } from '../common/validation/civil-date';

export class ListTimetableVersionsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(TimetableVersionStatus) status?: TimetableVersionStatus;
}

export class CreateTimetableVersionDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class SetTimetableTargetDto {
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
  @IsUUID() calendarVersionId!: string;
  @IsUUID() effectiveAcademicWeekId!: string;
}

export class ListTimetableEntriesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(AcademicWeekday) weekday?: AcademicWeekday;
  @IsOptional() @IsUUID() schoolClassId?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsUUID() teacherUserId?: string;
}

export class ReplaceTimetableEntryDto {
  @IsEnum(AcademicWeekday) weekday!: AcademicWeekday;
  @IsUUID() timeSlotDefinitionId!: string;
  @IsUUID() schoolClassId!: string;
  @IsUUID() subjectId!: string;
  @IsUUID() teachingAssignmentId!: string;
}

export class ReplaceTimetableEntriesDto {
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReplaceTimetableEntryDto)
  entries!: ReplaceTimetableEntryDto[];
}

export class ValidateTimetableVersionDto {
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
}

export class ApproveTimetableVersionDto {
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
}

export class ActivateTimetableVersionDto {
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @IsOptional() @IsUUID() expectedActiveVersionId?: string | null;
}

export class ResolveTimetableDateDto {
  @IsCivilDate() date!: string;
}

export class EvaluateTimetableReadinessDto {
  @IsCivilDate() from!: string;
  @IsCivilDate() to!: string;
}
