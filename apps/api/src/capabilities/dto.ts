import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { CapabilityScope } from '@baogiang/contracts';

const scopes: CapabilityScope[] = ['PERSONAL', 'SUBJECT_GROUP', 'SUBJECT', 'ACTIVITY', 'SCHOOL_WIDE'];
const optionalValue = (_object: object, value: unknown): boolean => value !== undefined;
const strictBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CapabilityPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class ListCapabilitiesDto extends CapabilityPageDto {
  @IsOptional() @Type(() => String) @Transform(strictBoolean) @IsBoolean() isActive?: boolean;
}

export class ListGrantsDto extends CapabilityPageDto {
  @IsOptional() @IsString() capabilityKey?: string;
  @IsOptional() @IsEnum(scopes) scopeType?: CapabilityScope;
  @IsOptional() @Type(() => String) @Transform(strictBoolean) @IsBoolean() revoked?: boolean;
  @IsOptional() @IsDateString() activeAt?: string;
}

export class CreateGrantDto {
  @Transform(trim) @IsString() @Length(1, 100) capabilityKey!: string;
  @IsEnum(scopes) scopeType!: CapabilityScope;
  @ValidateIf(optionalValue) @IsUUID() scopeResourceId?: string;
  @ValidateIf(optionalValue) @IsDateString() validFrom?: string;
  @ValidateIf(optionalValue) @IsDateString() validUntil?: string;
}

export class RevokeGrantDto {
  @ValidateIf(optionalValue) @Transform(trim) @IsString() revokeReason?: string;
}
