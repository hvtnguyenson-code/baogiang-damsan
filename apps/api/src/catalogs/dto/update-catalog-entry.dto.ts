import { Transform } from 'class-transformer';
import { IsString, Length, ValidateIf } from 'class-validator';

export class UpdateCatalogEntryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Length(1, 50)
  code?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 150)
  name?: string;
}
