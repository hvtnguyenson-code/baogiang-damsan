import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PpctVersionStatus } from '@prisma/client';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';
import { IsCivilDate } from '../common/validation/civil-date';

export class ListPpctPlansDto {
  @IsUUID() subjectId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel?: 10 | 11 | 12;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreatePpctPlanDto {
  @IsUUID() subjectId!: string;
  @Type(() => Number) @IsInt() @IsIn([10, 11, 12]) gradeLevel!: 10 | 11 | 12;
}

export class ListPpctVersionsDto {
  @IsOptional() @IsEnum(PpctVersionStatus) status?: PpctVersionStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreatePpctVersionDto {
  @IsOptional() @IsUUID() sourceVersionId?: string;
}

export enum PpctItemIdentityMode {
  NEW = 'NEW',
  CARRY_FORWARD = 'CARRY_FORWARD',
}

export class PpctPredecessorDto {
  @IsUUID() versionId!: string;
  @IsUUID() itemId!: string;
}

export class ReplacePpctItemDto {
  @IsUUID() itemId!: string;
  @IsEnum(PpctItemIdentityMode) identityMode!: PpctItemIdentityMode;
  @Type(() => Number) @IsInt() @Min(1) sequence!: number;
  @IsString() @Matches(/\S/u) @MaxLength(500) title!: string;
  @IsString() @Matches(/\S/u) @MaxLength(100) lessonType!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PpctPredecessorDto)
  predecessors?: PpctPredecessorDto[];
}

export class ReplacePpctContentDto {
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ReplacePpctItemDto)
  items!: ReplacePpctItemDto[];
}

export class PublishPpctVersionDto {
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @ValidateIf((_object, value) => value !== null) @IsUUID()
  expectedPublishedVersionId!: string | null;
}

export class SwitchPpctAssociationDto {
  @IsUUID() ppctVersionId!: string;
  @IsCivilDate() effectiveFrom!: string;
  @ValidateIf((_object, value) => value !== null) @IsUUID()
  expectedLatestAssociationId!: string | null;
}

export class ResolvePpctDto {
  @IsCivilDate() date!: string;
}
