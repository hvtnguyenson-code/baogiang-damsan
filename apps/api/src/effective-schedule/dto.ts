import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CivilDateString } from '@baogiang/contracts';
import { IsCivilDate } from '../common/validation/civil-date';

export class ListEffectiveScheduleTeachersDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class GetEffectiveScheduleContextDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class GetIndividualWeeklyScheduleDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  academicWeekId!: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;
}

export class GetSchoolWideDayScheduleDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsCivilDate()
  civilDate!: CivilDateString;
}

export class GetEffectiveScheduleComparisonDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  academicWeekId!: string;

  @IsUUID()
  peerTeacherUserId!: string;
}
