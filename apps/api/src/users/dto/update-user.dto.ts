import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, ValidateIf, ValidateNested } from 'class-validator';
import { StaffProfileDto } from './staff-profile.dto';

export class UpdateUserDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  username?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StaffProfileDto)
  profile?: StaffProfileDto;
}
