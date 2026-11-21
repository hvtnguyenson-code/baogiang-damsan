import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { B1RoleCommandInput } from './b1-role-command-writer';

/**
 * Client input carries concurrency tokens only; actor authority is taken
 * exclusively from the authenticated server-side session.
 */
export class B1RoleCommandContextQueryDto {
  @IsIn(['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'])
  role!: 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC';
}

export class B1RoleCommandDto implements B1RoleCommandInput {
  @IsIn(['APPOINT', 'DISMISS', 'TRANSFER'])
  operation!: 'APPOINT' | 'DISMISS' | 'TRANSFER';

  @IsIn(['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'])
  role!: 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC';

  @IsUUID('4')
  targetUserId!: string;

  @IsOptional()
  @IsUUID('4')
  previousUserId?: string;

  @IsOptional()
  @IsUUID('4')
  expectedAppointmentId?: string;

  @Matches(/^[1-9][0-9]{0,17}$/)
  expectedSeatVersion!: string;

  @Matches(/^(0|[1-9][0-9]{0,18})$/)
  expectedAuthorizationEpoch!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
  requestKey!: string;
}
