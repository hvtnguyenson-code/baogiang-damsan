import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { IsCivilDate } from '../common/validation/civil-date';

export class TeachingAssignmentPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class ListTeachingAssignmentsDto extends TeachingAssignmentPageDto {
  @IsOptional() @IsUUID() schoolClassId?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsUUID() teacherUserId?: string;
  @IsOptional() @IsCivilDate() activeOn?: string;
}

export class CreateTeachingAssignmentDto {
  @IsUUID() schoolClassId!: string;
  @IsUUID() subjectId!: string;
  @IsUUID() teacherUserId!: string;
  @IsCivilDate() validFrom!: string;
  @IsOptional() @IsCivilDate() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class EndTeachingAssignmentDto {
  @IsCivilDate() endDate!: string;
}

export class ChangeTeachingAssignmentTeacherDto {
  @IsUUID() newTeacherUserId!: string;
  @IsCivilDate() effectiveFrom!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
