import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { IsCivilDate } from '../common/validation/civil-date';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class SubmitReportingStatementDto {
  @IsUUID()
  academicYearId!: string;

  @IsCivilDate()
  fromCivilDate!: string;

  @IsCivilDate()
  toCivilDate!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  requestKey!: string;
}

export class DecideReportingStatementDto {
  @IsUUID()
  expectedLifecycleToken!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  requestKey!: string;
}

export class PreviewReportingStatementDto {
  @IsUUID()
  academicYearId!: string;

  @IsCivilDate()
  fromCivilDate!: string;

  @IsCivilDate()
  toCivilDate!: string;
}

export class ListReportingStatementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
