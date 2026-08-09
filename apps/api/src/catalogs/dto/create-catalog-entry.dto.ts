import { IsString, Length } from 'class-validator';

export class CreateCatalogEntryDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;
}
