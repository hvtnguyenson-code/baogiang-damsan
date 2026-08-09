import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCatalogEntryDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;
}
