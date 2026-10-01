import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PreviewPpctWorkbookDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  targets?: string;
}

export class ConfirmPpctWorkbookDto extends PreviewPpctWorkbookDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/u)
  requestFingerprint!: string;
}
