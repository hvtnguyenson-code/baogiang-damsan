import { CivilDateString } from '@baogiang/contracts';
import { ProgrammeKind, ProgrammeOccurrenceMode } from '@prisma/client';

export const SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1 =
  'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1' as const;

export interface SpecialProgrammeWorkloadProjectionInput {
  academicYearId: string;
  targetUserId: string;
  fromCivilDate: CivilDateString;
  toCivilDate: CivilDateString;
  asOfInstant: Date;
}

export interface SpecialProgrammeWorkloadAttestationEvidence {
  attestationId: string;
  attestedByUserId: string;
  authorityType: string;
  capabilityKey: string;
  scope: string;
  resourceId: string | null;
  attestedAt: string;
}

export interface SpecialProgrammeWorkloadContribution {
  executionId: string;
  specialActivityId: string;
  specialActivityStaffingId: string;
  specialActivityTimeSlotId: string;

  programmeMasterId: string;
  programmePlanVersionId: string;
  programmeTopicItemId: string;
  plannedProgrammeOccurrenceId: string;
  plannedOccurrenceSlotId: string;

  programmeKind: ProgrammeKind;
  occurrenceMode: ProgrammeOccurrenceMode;

  executionCivilDate: CivilDateString;
  actualTeacherUserId: string;

  coefficient: number;
  credit: number;

  policyVersionId: string;
  policyValidatorVersion: string;
  policyEffectiveFrom?: string;
  policyEffectiveUntil?: string | null;

  attestations: SpecialProgrammeWorkloadAttestationEvidence[];
}

export interface SpecialProgrammeWorkloadPendingConfirmation {
  executionId: string;
  specialActivityId: string;
  specialActivityStaffingId: string;
  specialActivityTimeSlotId: string;

  programmeMasterId: string;
  programmePlanVersionId: string;
  programmeTopicItemId: string;
  plannedProgrammeOccurrenceId: string;
  plannedOccurrenceSlotId: string;

  programmeKind: ProgrammeKind;
  occurrenceMode: ProgrammeOccurrenceMode;

  executionCivilDate: CivilDateString;
  actualTeacherUserId: string;

  reason: string;
}

export interface SpecialProgrammeWorkloadFinding {
  code: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
  entityIds: string[];
}

export interface SpecialProgrammeWorkloadProjection {
  profile: typeof SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1;
  status: 'PASS' | 'BLOCKED';
  scope: {
    academicYearId: string;
    targetUserId: string;
    fromCivilDate: CivilDateString;
    toCivilDate: CivilDateString;
    asOfInstant: string;
  };
  totalCredit: number | null;
  contributionCount: number | null;
  contributions: SpecialProgrammeWorkloadContribution[];
  pendingConfirmation: SpecialProgrammeWorkloadPendingConfirmation[];
  findings: SpecialProgrammeWorkloadFinding[];
  evaluatedAt: string;
}
