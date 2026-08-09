import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateCatalogEntryDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Length(1, 50)
  code!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 150)
  name!: string;
}
