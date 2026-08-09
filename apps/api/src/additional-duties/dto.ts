import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

export type DutyAssignmentScope = 'SCHOOL_WIDE' | 'SUBJECT_GROUP';
const dutyScopes: DutyAssignmentScope[] = ['SCHOOL_WIDE', 'SUBJECT_GROUP'];
const optionalValue = (_object: object, value: unknown): boolean => value !== undefined;
const strictBoolean = ({ value }: { value: unknown }): unknown => value === 'true' ? true : value === 'false' ? false : value;
const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
const uppercase = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class DutyPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateDefinitionDto {
  @Transform(uppercase) @IsString() @Length(1, 50) code!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @ValidateIf(optionalValue) @Transform(trim) @IsString() description?: string;
  @Transform(trim) @IsString() @Length(1, 100) category!: string;
  @ValidateIf(optionalValue) @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validFrom?: string;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validUntil?: string;
}

export class UpdateDefinitionDto {
  @ValidateIf(optionalValue) @Transform(uppercase) @IsString() @Length(1, 50) code?: string;
  @ValidateIf(optionalValue) @Transform(trim) @IsString() @Length(1, 150) name?: string;
  @IsOptional() @Transform(trim) @IsString() description?: string | null;
  @ValidateIf(optionalValue) @Transform(trim) @IsString() @Length(1, 100) category?: string;
  @ValidateIf(optionalValue) @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validFrom?: string;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validUntil?: string;
}

export class ListDefinitionsDto extends DutyPageDto {
  @IsOptional() @Type(() => String) @Transform(strictBoolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsAbsoluteInstant() effectiveAt?: string;
}

export class ListDefinitionOptionsDto extends DutyPageDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsAbsoluteInstant() effectiveAt?: string;
}

export class CreateDutyAssignmentDto {
  @IsUUID() staffProfileId!: string;
  @IsUUID() dutyDefinitionId!: string;
  @IsEnum(dutyScopes) scopeType!: DutyAssignmentScope;
  @ValidateIf(optionalValue) @IsUUID() scopeResourceId?: string;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validFrom?: string;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validUntil?: string;
  @ValidateIf(optionalValue) @IsString() note?: string;
}

export class UpdateDutyAssignmentDto {
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validFrom?: string;
  @ValidateIf(optionalValue) @IsAbsoluteInstant() validUntil?: string;
  @IsOptional() @IsString() note?: string | null;
}

export class EndDutyAssignmentDto {
  @ValidateIf(optionalValue) @IsAbsoluteInstant() endAt?: string;
}

export class ListDutyAssignmentsDto extends DutyPageDto {
  @IsOptional() @IsUUID() staffProfileId?: string;
  @IsOptional() @IsUUID() dutyDefinitionId?: string;
  @IsOptional() @IsEnum(dutyScopes) scopeType?: DutyAssignmentScope;
  @IsOptional() @IsUUID() scopeResourceId?: string;
  @IsOptional() @IsAbsoluteInstant() activeAt?: string;
}
