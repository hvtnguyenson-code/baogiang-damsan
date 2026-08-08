import { Type } from 'class-transformer';
import { IsString, Length, ValidateIf, ValidateNested } from 'class-validator';
import { StaffProfileDto } from './staff-profile.dto';

export class CreateUserDto {
  @IsString()
  @Length(1, 100)
  username!: string;

  @IsString()
  @Length(1, 1024)
  password!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => StaffProfileDto)
  profile?: StaffProfileDto;
}
