import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Length(1, 100)
  username!: string;

  @IsString()
  @Length(1, 1024)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(1024)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  newPassword!: string;
}
