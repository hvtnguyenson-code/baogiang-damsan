import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const optionalValue = (_object: object, value: unknown): boolean => value !== undefined;
const strictBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class AssignmentPageDto {
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

export class CreateMembershipDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  subjectGroupId!: string;

  @ValidateIf(optionalValue)
  @IsDateString()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsDateString()
  validUntil?: string;

  @ValidateIf(optionalValue)
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateStaffSubjectDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  subjectId!: string;

  @ValidateIf(optionalValue)
  @IsDateString()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsDateString()
  validUntil?: string;

  @ValidateIf(optionalValue)
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateAssignmentDto {
  @ValidateIf(optionalValue)
  @IsDateString()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsDateString()
  validUntil?: string;

  @ValidateIf(optionalValue)
  @IsBoolean()
  isPrimary?: boolean;
}

export class EndAssignmentDto {
  @ValidateIf(optionalValue)
  @IsDateString()
  endAt?: string;
}

export class ListMembershipDto extends AssignmentPageDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  subjectGroupId?: string;

  @IsOptional()
  @IsDateString()
  activeAt?: string;

  @IsOptional()
  @Type(() => String)
  @Transform(strictBoolean)
  @IsBoolean()
  isPrimary?: boolean;
}

export class ListStaffSubjectDto extends AssignmentPageDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsDateString()
  activeAt?: string;

  @IsOptional()
  @Type(() => String)
  @Transform(strictBoolean)
  @IsBoolean()
  isPrimary?: boolean;
}
