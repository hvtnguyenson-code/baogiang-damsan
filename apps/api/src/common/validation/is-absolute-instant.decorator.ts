import { isISO8601, registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

export function isAbsoluteInstant(value: unknown): value is string {
  return typeof value === 'string'
    && EXPLICIT_TIME_ZONE.test(value)
    && isISO8601(value, { strict: true, strictSeparator: true });
}

export function IsAbsoluteInstant(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'isAbsoluteInstant',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate: isAbsoluteInstant,
        defaultMessage: (args: ValidationArguments) => `${args.property} must be an ISO 8601 timestamp with Z or an explicit numeric offset`,
      },
    });
  };
}
