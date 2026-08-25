import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';
import { IsCivilDate } from '../common/validation/is-civil-date.decorator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class SubmitReportingStatementDto { @IsUUID() academicYearId!: string; @IsCivilDate() fromCivilDate!: string; @IsCivilDate() toCivilDate!: string; @Transform(trim) @IsString() @Length(1, 200) requestKey!: string; }
export class DecideReportingStatementDto { @IsUUID() expectedLifecycleToken!: string; @Transform(trim) @IsString() @Length(1, 200) requestKey!: string; }
