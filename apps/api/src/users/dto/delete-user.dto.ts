import { IsString, Length, Matches } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { UserDeleteRequest } from '@baogiang/contracts';

export class DeleteUserDto implements UserDeleteRequest {
  // Global implicit conversion must not turn a numeric confirmation into the
  // canonical string username of an account whose username contains digits.
  @Transform(({ obj }: TransformFnParams) => (obj as Record<string, unknown>).confirmUsername)
  @IsString()
  @Length(1, 100)
  @Matches(/^\S(?:[^\r\n]*\S)?$/u)
  confirmUsername!: string;
}
