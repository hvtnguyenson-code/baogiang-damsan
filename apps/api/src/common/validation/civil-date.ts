import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { CivilDateString } from '@baogiang/contracts';

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseCivilDate(value: unknown): Date {
  if (typeof value !== 'string') throw new TypeError('Civil date must be a string.');
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) throw new TypeError('Civil date must use strict YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) throw new TypeError('Civil date does not exist.');
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError('Civil date does not exist.');
  }
  return date;
}

export function isCivilDate(value: unknown): value is CivilDateString {
  try { parseCivilDate(value); return true; } catch { return false; }
}

export function formatCivilDate(date: Date): CivilDateString {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('Invalid Prisma DATE value.');
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}` as CivilDateString;
}

export function civilDateDayNumber(value: string | Date): number {
  return Math.floor((typeof value === 'string' ? parseCivilDate(value) : value).getTime() / DAY_MS);
}

export function IsCivilDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'isCivilDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate: isCivilDate,
        defaultMessage: (args: ValidationArguments) => `${args.property} must be a real civil date in YYYY-MM-DD format`,
      },
    });
  };
}
