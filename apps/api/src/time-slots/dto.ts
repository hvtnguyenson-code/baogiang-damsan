import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AcademicWeekday, TimeSlotSession } from '@prisma/client';
import { WALL_CLOCK_TIME_PATTERN } from './wall-clock-time';

const strictBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class ListTimeSlotsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(AcademicWeekday) weekday?: AcademicWeekday;
  @IsOptional() @IsEnum(TimeSlotSession) session?: TimeSlotSession;
  @IsOptional() @Type(() => String) @Transform(strictBoolean) @IsBoolean() isActive?: boolean;
}

export class CreateTimeSlotDto {
  @IsEnum(AcademicWeekday) weekday!: AcademicWeekday;
  @IsEnum(TimeSlotSession) session!: TimeSlotSession;
  @IsInt() @Min(1) ordinal!: number;
  @Transform(trim) @IsString() @MaxLength(50) displayLabel!: string;
  @IsString() @Matches(WALL_CLOCK_TIME_PATTERN) startTime!: string;
  @IsString() @Matches(WALL_CLOCK_TIME_PATTERN) endTime!: string;
  @IsOptional() @IsBoolean() allowRegularTeaching = true;
  @IsOptional() @IsBoolean() allowMakeupTeaching = false;
  @IsOptional() @IsBoolean() allowSelfStudy = false;
}

export class ReviseTimeSlotDto {
  @Transform(trim) @IsString() @MaxLength(50) displayLabel!: string;
  @IsString() @Matches(WALL_CLOCK_TIME_PATTERN) startTime!: string;
  @IsString() @Matches(WALL_CLOCK_TIME_PATTERN) endTime!: string;
  @IsBoolean() allowRegularTeaching!: boolean;
  @IsBoolean() allowMakeupTeaching!: boolean;
  @IsBoolean() allowSelfStudy!: boolean;
}
