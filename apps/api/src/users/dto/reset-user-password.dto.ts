import { IsString, Length } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @Length(1, 1024)
  newPassword!: string;
}
