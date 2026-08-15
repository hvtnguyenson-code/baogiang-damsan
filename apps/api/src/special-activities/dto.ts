import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { SpecialActivityStatus, SpecialActivityScope } from '@prisma/client';
import { IsCivilDate } from '../common/validation/civil-date';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

const text = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);

export class CreateSpecialActivityDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() academicCalendarVersionId!: string;
  @IsCivilDate() civilDate!: string;
  @IsEnum(SpecialActivityScope) scope!: SpecialActivityScope;
  @ValidateIf((v) => v.scope === SpecialActivityScope.GRADE) @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel?: number;
  @ValidateIf((v) => v.scope === SpecialActivityScope.CLASS) @IsUUID() schoolClassId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('4', { each: true }) exactTimeSlotDefinitionIds!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4', { each: true }) scheduledTeacherUserIds!: string[];
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) title!: string;
  @IsOptional() @text() @IsString() @Matches(/\S/u) @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class ReverseSpecialActivityDto {
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(500) reversalReason!: string;
}

export class ListSpecialActivitiesDto {
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsCivilDate() civilDate?: string;
  @IsOptional() @IsEnum(SpecialActivityStatus) status?: SpecialActivityStatus;
  @IsOptional() @IsEnum(SpecialActivityScope) scope?: SpecialActivityScope;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
