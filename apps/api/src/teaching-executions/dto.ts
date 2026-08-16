import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { IsCivilDate } from '../common/validation/civil-date';
import { IsAbsoluteInstant } from '../common/validation/is-absolute-instant.decorator';

const text = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);

export class ConfirmNormalTeachingExecutionDto {
  @IsUUID() academicYearId!: string;
  @IsUUID() schoolClassId!: string;
  @IsUUID() subjectId!: string;
  @IsUUID() timetableEntryId!: string;
  @IsCivilDate() sourceCivilDate!: string;
  @IsOptional() @text() @IsString() @Matches(/\S/u) @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class ConfirmMakeupTeachingExecutionDto {
  @IsUUID() makeupTeachingScheduleId!: string;
  @IsOptional() @text() @IsString() @Matches(/\S/u) @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class ConfirmSpecialActivityParticipationDto {
  @IsUUID() specialActivityId!: string;
  @IsUUID() specialActivityStaffingId!: string;
  @IsUUID() specialActivityTimeSlotId!: string;
  @IsOptional() @IsUUID() replacesId?: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
}

export class ReverseTeachingExecutionDto {
  @text() @IsString() @Matches(/\S/u) @MaxLength(200) requestKey!: string;
  @IsAbsoluteInstant() expectedUpdatedAt!: string;
  @text() @IsString() @Matches(/\S/u) @MaxLength(500) reversalReason!: string;
}
