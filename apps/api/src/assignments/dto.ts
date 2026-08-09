import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

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
  @IsAbsoluteInstant()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsAbsoluteInstant()
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
  @IsAbsoluteInstant()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsAbsoluteInstant()
  validUntil?: string;

  @ValidateIf(optionalValue)
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateAssignmentDto {
  @ValidateIf(optionalValue)
  @IsAbsoluteInstant()
  validFrom?: string;

  @ValidateIf(optionalValue)
  @IsAbsoluteInstant()
  validUntil?: string;

  @ValidateIf(optionalValue)
  @IsBoolean()
  isPrimary?: boolean;
}

export class EndAssignmentDto {
  @ValidateIf(optionalValue)
  @IsAbsoluteInstant()
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
  @IsAbsoluteInstant()
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
  @IsAbsoluteInstant()
  activeAt?: string;

  @IsOptional()
  @Type(() => String)
  @Transform(strictBoolean)
  @IsBoolean()
  isPrimary?: boolean;
}
