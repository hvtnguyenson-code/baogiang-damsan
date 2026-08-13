import { Transform, Type } from 'class-transformer';
import {
  TimetableImportAliasEntityType,
  TimetableImportSemanticField,
  TimetableImportTeacherIdentifierMode,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_HEADER_SCAN_ROWS } from './workbook-limits';

export class TimetableImportColumnMappingDto {
  @IsEnum(TimetableImportSemanticField)
  semanticField!: TimetableImportSemanticField;

  @IsString()
  @MaxLength(150)
  sourceHeader!: string;
}

export class ProfileRevisionContentDto {
  @IsEnum(TimetableImportTeacherIdentifierMode)
  teacherIdentifierMode!: TimetableImportTeacherIdentifierMode;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sheetNameHint?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headerRowHint?: number | null;

  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimetableImportColumnMappingDto)
  columnMappings!: TimetableImportColumnMappingDto[];
}

export class CreateTimetableImportProfileDto extends ProfileRevisionContentDto {
  @IsString()
  @MaxLength(100)
  sourceKey!: string;

  @IsString()
  @MaxLength(150)
  name!: string;
}

export class ReviseTimetableImportProfileDto extends ProfileRevisionContentDto {
  @IsUUID()
  expectedActiveRevisionId!: string;
}

export class ExpectedActiveRevisionDto {
  @IsUUID()
  expectedActiveRevisionId!: string;
}

export class ListTimetableImportAliasesDto {
  @IsOptional()
  @IsEnum(TimetableImportAliasEntityType)
  entityType?: TimetableImportAliasEntityType;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  includeRetired = false;
}

export class CreateTimetableImportAliasDto {
  @IsEnum(TimetableImportAliasEntityType)
  entityType!: TimetableImportAliasEntityType;

  @IsString()
  @MaxLength(200)
  sourceValue!: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  schoolClassId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class InspectTimetableImportWorkbookDto {
  @IsUUID()
  profileRevisionId!: string;
}

export class PreviewTimetableImportWorkbookDto extends InspectTimetableImportWorkbookDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() calendarVersionId!: string;
  @IsUUID() effectiveAcademicWeekId!: string;
  @IsString() @MaxLength(150) sheetName!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_HEADER_SCAN_ROWS) headerRowNumber!: number;
}

export class ConfirmTimetableImportWorkbookDto extends PreviewTimetableImportWorkbookDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  requestIdempotencyKey?: string;
}
