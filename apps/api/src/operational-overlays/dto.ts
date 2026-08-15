import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, OperationalLessonDispositionType, OperationalOverlayStatus, TimeSlotSession } from '@prisma/client';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';
import { IsCivilDate } from '../common/validation/civil-date';

export class CreateCalendarExceptionDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() academicCalendarVersionId!: string;
  @IsCivilDate() civilDate!: string;
  @IsEnum(CalendarExceptionScope) scope!: CalendarExceptionScope;
  @ValidateIf((value) => value.scope === CalendarExceptionScope.GRADE) @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel?: number;
  @ValidateIf((value) => value.scope === CalendarExceptionScope.CLASS) @IsUUID() schoolClassId?: string;
  @IsEnum(CalendarExceptionTimeSelector) timeSelector!: CalendarExceptionTimeSelector;
  @ValidateIf((value) => value.timeSelector === CalendarExceptionTimeSelector.SESSION) @IsEnum(TimeSlotSession) session?: TimeSlotSession;
  @ValidateIf((value) => value.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS) @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) exactTimeSlotDefinitionIds?: string[];
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class CreateLessonDispositionDto {
  @IsUUID() timetableEntryId!: string;
  @IsCivilDate() sourceCivilDate!: string;
  @IsEnum(OperationalLessonDispositionType) dispositionType!: OperationalLessonDispositionType;
  @IsOptional() @IsUUID() assignedTeacherUserId?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class ReverseOperationalOverlayDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Matches(/\S/u) @MaxLength(500) reversalReason!: string;
}

class PaginationDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class ListCalendarExceptionsDto extends PaginationDto {
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsCivilDate() civilDate?: string;
  @IsOptional() @IsEnum(OperationalOverlayStatus) status?: OperationalOverlayStatus;
  @IsOptional() @IsEnum(CalendarExceptionScope) scope?: CalendarExceptionScope;
}

export class ListLessonDispositionsDto extends PaginationDto {
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsUUID() schoolClassId?: string;
  @IsOptional() @IsCivilDate() sourceCivilDate?: string;
  @IsOptional() @IsEnum(OperationalOverlayStatus) status?: OperationalOverlayStatus;
  @IsOptional() @IsEnum(OperationalLessonDispositionType) dispositionType?: OperationalLessonDispositionType;
}
