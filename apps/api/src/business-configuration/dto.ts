import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

export class BusinessResourceDto {
  @IsIn(['SCHOOL_WIDE', 'ACADEMIC_YEAR']) kind!: 'SCHOOL_WIDE' | 'ACADEMIC_YEAR';
  @ValidateIf((value: BusinessResourceDto) => value.kind === 'ACADEMIC_YEAR') @IsUUID() academicYearId?: string;
}
export class CreateBusinessPolicyDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(100) family!: string;
  @Type(() => BusinessResourceDto) @ValidateNested() resource!: BusinessResourceDto;
  @IsObject() payload!: Record<string, unknown>;
  @IsString() @IsNotEmpty() @MaxLength(100) commandId!: string;
  @IsString() @IsNotEmpty() effectiveFrom!: string;
  @IsOptional() @IsString() effectiveUntil?: string;
}
export class EditBusinessPolicyDraftDto {
  @IsObject() payload!: Record<string, unknown>;
  @IsInt() @Min(1) expectedRevision!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) commandId!: string;
}
export class LifecycleBusinessPolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(100) commandId!: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() effectiveUntil?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
