import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString,
  Length, Max, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { AcademicWeekKind, AcademicWeekday, CatalogStatus } from '@prisma/client';
import { IsCivilDate } from '../common/validation/civil-date';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toUpperCase() : value;
const optional = (_object: object, value: unknown): boolean => value !== undefined;

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class EmptyCommandDto {}

export class CreateAcademicYearDto {
  @Transform(upper) @IsString() @Length(1, 20) code!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
}

export class UpdateAcademicYearDto {
  @ValidateIf(optional) @Transform(upper) @IsString() @Length(1, 20) code?: string;
  @ValidateIf(optional) @Transform(trim) @IsString() @Length(1, 150) name?: string;
}

export class SemesterDto {
  @Transform(upper) @IsString() @Length(1, 30) code!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @Type(() => Number) @IsInt() @Min(1) ordinal!: number;
  @IsCivilDate() startDate!: string;
  @IsCivilDate() endDate!: string;
}

export class WeekSegmentDto {
  @Transform(trim) @IsString() @Length(1, 50) label!: string;
  @Type(() => Number) @IsInt() @Min(1) segmentOrder!: number;
  @IsCivilDate() startDate!: string;
  @IsCivilDate() endDate!: string;
}

export class AcademicWeekDto {
  @IsEnum(AcademicWeekKind) kind!: AcademicWeekKind;
  @ValidateIf(optional) @Type(() => Number) @IsInt() @Min(1) officialWeekNumber?: number;
  @ValidateIf(optional) @Type(() => Number) @IsInt() @Min(1) reserveWeekNumber?: number;
  @Transform(trim) @IsString() @Length(1, 50) displayLabel!: string;
  @Type(() => Number) @IsInt() @Min(1) sortOrder!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => WeekSegmentDto)
  segments!: WeekSegmentDto[];
}

export class CalendarInterruptionDto {
  @Transform(upper) @IsString() @Length(1, 50) code!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @IsCivilDate() startDate!: string;
  @IsCivilDate() endDate!: string;
}

export class CreateCalendarVersionDto {
  @IsCivilDate() startDate!: string;
  @IsCivilDate() endDate!: string;
  @Type(() => Number) @IsInt() @Min(1) officialWeekCount!: number;
  @Type(() => Number) @IsInt() @Min(0) reserveWeekCount!: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsEnum(AcademicWeekday, { each: true })
  teachingWeekdays!: AcademicWeekday[];
  @ValidateIf(optional) @Transform(trim) @IsString() note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SemesterDto)
  semesters!: SemesterDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AcademicWeekDto)
  weeks!: AcademicWeekDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => CalendarInterruptionDto)
  interruptions!: CalendarInterruptionDto[];
}

export class CreateSchoolClassDto {
  @Transform(upper) @IsString() @Length(1, 50) code!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel!: number;
}

export class UpdateSchoolClassDto {
  @ValidateIf(optional) @Transform(upper) @IsString() @Length(1, 50) code?: string;
  @ValidateIf(optional) @Transform(trim) @IsString() @Length(1, 150) name?: string;
  @ValidateIf(optional) @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel?: number;
}

export class ListSchoolClassesDto extends PageDto {
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel?: number;
}
