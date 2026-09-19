import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
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
import { ProgrammeKind, ProgrammeOccurrenceMode, ProgrammeOccurrenceStatus, ProgrammePlanVersionStatus } from '@prisma/client';

export class ProgrammeTopicItemInputDto {
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsInt()
  @Min(1)
  requiredPeriods!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  guidelineWeekFrom?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  guidelineWeekTo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guidelineSegmentLabel?: string;
}

export class CreateProgrammeMasterDto {
  @IsUUID()
  academicYearId!: string;

  @IsIn(['GDDP', 'HDTN_HN'])
  kind!: ProgrammeKind;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(12)
  gradeLevel?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;
}

export class ListProgrammeMastersDto {
  @IsUUID()
  academicYearId!: string;

  @IsOptional()
  @IsIn(['GDDP', 'HDTN_HN'])
  kind?: ProgrammeKind;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(12)
  gradeLevel?: number;
}

export class CreateDraftPlanVersionDto {
  @IsUUID()
  programmeMasterId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgrammeTopicItemInputDto)
  initialTopics?: ProgrammeTopicItemInputDto[];
}

export class CreateSuccessorDraftPlanVersionDto {
  @IsUUID()
  programmeMasterId!: string;

  @IsUUID()
  predecessorVersionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  changeReason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgrammeTopicItemInputDto)
  initialTopics?: ProgrammeTopicItemInputDto[];
}

export class EditDraftPlanVersionDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgrammeTopicItemInputDto)
  topics?: ProgrammeTopicItemInputDto[];
}

export class PublishPlanVersionDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;
}

export class PlannedSlotStaffingInputDto {
  @IsUUID()
  timeSlotDefinitionId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  teacherUserIds!: string[];
}

export class CreateDraftOccurrenceDto {
  @IsUUID()
  programmeMasterId!: string;

  @IsUUID()
  programmePlanVersionId!: string;

  @IsUUID()
  programmeTopicItemId!: string;

  @IsUUID()
  academicYearId!: string;

  @IsString()
  @IsNotEmpty()
  civilDate!: string;

  @IsIn(['CLASS', 'GRADE', 'SCHOOL_WIDE'])
  mode!: ProgrammeOccurrenceMode;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(12)
  gradeLevel?: number | null;

  @IsOptional()
  @IsUUID()
  schoolClassId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannedSlotStaffingInputDto)
  slots?: PlannedSlotStaffingInputDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;
}

export class EditDraftOccurrenceDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;

  @IsOptional()
  @IsUUID()
  programmeTopicItemId?: string;

  @IsOptional()
  @IsString()
  civilDate?: string;

  @IsOptional()
  @IsIn(['CLASS', 'GRADE', 'SCHOOL_WIDE'])
  mode?: ProgrammeOccurrenceMode;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(12)
  gradeLevel?: number | null;

  @IsOptional()
  @IsUUID()
  schoolClassId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class ReplaceOccurrenceSlotsStaffingDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannedSlotStaffingInputDto)
  slots!: PlannedSlotStaffingInputDto[];
}

export class PublishOccurrenceDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;
}

export class CreateReplacementOccurrenceDto {
  @IsUUID()
  replacesOccurrenceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  changeReason!: string;

  @IsOptional()
  @IsString()
  civilDate?: string;

  @IsOptional()
  @IsIn(['CLASS', 'GRADE', 'SCHOOL_WIDE'])
  mode?: ProgrammeOccurrenceMode;

  @IsOptional()
  @IsUUID()
  programmeTopicItemId?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(12)
  gradeLevel?: number | null;

  @IsOptional()
  @IsUUID()
  schoolClassId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannedSlotStaffingInputDto)
  slots?: PlannedSlotStaffingInputDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  commandId!: string;
}

export class ListPlannedOccurrencesDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  programmeMasterId?: string;

  @IsOptional()
  @IsString()
  civilDate?: string;

  @IsOptional()
  @IsIn(['CLASS', 'GRADE', 'SCHOOL_WIDE'])
  mode?: ProgrammeOccurrenceMode;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'SUPERSEDED'])
  status?: ProgrammeOccurrenceStatus;
}

// Domain return records
export interface ProgrammeMasterRecord {
  id: string;
  academicYearId: string;
  kind: ProgrammeKind;
  gradeLevel: number | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammeTopicItemRecord {
  id: string;
  sequence: number;
  title: string;
  requiredPeriods: number;
  guidelineWeekFrom: number | null;
  guidelineWeekTo: number | null;
  guidelineSegmentLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammePlanVersionRecord {
  id: string;
  programmeMasterId: string;
  versionNumber: number;
  status: ProgrammePlanVersionStatus;
  draftRevision: number;
  predecessorVersionId: string | null;
  changeReason: string | null;
  createdByUserId: string;
  publishedByUserId: string | null;
  publishedAt: string | null;
  supersededByUserId: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  topicItems: ProgrammeTopicItemRecord[];
}

export interface PlannedSlotStaffingRecord {
  id: string;
  plannedOccurrenceSlotId: string;
  teacherUserId: string;
  createdAt: string;
}

export interface PlannedOccurrenceSlotRecord {
  id: string;
  plannedProgrammeOccurrenceId: string;
  academicYearId: string;
  timeSlotDefinitionId: string;
  createdAt: string;
  staffing: PlannedSlotStaffingRecord[];
}

export interface PlannedProgrammeOccurrenceRecord {
  id: string;
  programmeMasterId: string;
  programmePlanVersionId: string;
  programmeTopicItemId: string;
  academicYearId: string;
  civilDate: string;
  mode: ProgrammeOccurrenceMode;
  gradeLevel: number | null;
  schoolClassId: string | null;
  status: ProgrammeOccurrenceStatus;
  draftRevision: number;
  note: string | null;
  replacesOccurrenceId: string | null;
  changeReason: string | null;
  createdByUserId: string;
  publishedByUserId: string | null;
  publishedAt: string | null;
  supersededByUserId: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  slots: PlannedOccurrenceSlotRecord[];
}
