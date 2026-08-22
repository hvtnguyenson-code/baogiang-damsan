import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsUUID, registerDecorator, ValidateNested, ValidationArguments, ValidationOptions } from 'class-validator';
import { IsCivilDate } from '../common/validation/civil-date';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

export class ReportingProjectionRootDto {
  @IsUUID()
  schoolClassId!: string;

  @IsUUID()
  subjectId!: string;
}

function HasUniqueReportingRoots(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'hasUniqueReportingRoots',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return false;
          return new Set(value.map((root) => root && typeof root === 'object'
            ? `${(root as ReportingProjectionRootDto).schoolClassId}:${(root as ReportingProjectionRootDto).subjectId}`
            : '')).size === value.length;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not contain duplicate schoolClassId/subjectId roots`;
        },
      },
    });
  };
}

export class ResolveReportingProjectionDto {
  @IsUUID()
  academicYearId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReportingProjectionRootDto)
  @HasUniqueReportingRoots()
  roots!: ReportingProjectionRootDto[];

  @IsCivilDate()
  fromCivilDate!: string;

  @IsCivilDate()
  toCivilDate!: string;

  @IsAbsoluteInstant()
  asOfInstant!: string;
}
