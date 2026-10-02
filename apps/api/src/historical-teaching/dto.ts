import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const text = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);

export class PreviewHistoricalTeachingDto {
  @IsUUID() academicYearId!: string;
  @IsString() @MaxLength(524288) sourceText!: string;
}

export class ConfirmHistoricalTeachingDto {
  @IsUUID() academicYearId!: string;
  @IsString() @MaxLength(524288) sourceText!: string;
  @text() @IsString() @Matches(/^[0-9a-f]{16}$/u) batchRef!: string;
  @text() @IsString() @Matches(/^[0-9a-f]{64}$/u) requestFingerprint!: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class HistoricalTeachingOptionsQueryDto {
  @IsOptional() @IsUUID() academicYearId?: string;
}

export class HistoricalTeachingReconciliationQueryDto {
  @IsUUID() academicYearId!: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(50) schoolClassCode!: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(50) subjectCode!: string;
}
