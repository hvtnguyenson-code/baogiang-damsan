import {
  CivilDateString,
  CurricularWorkloadContributionContract,
  OfficialTeacherWorkloadProjectionContract,
  OfficialTeacherWorkloadSnapshotContract,
  OfficialWorkloadFindingContract,
  WorkloadAdjustmentAppliedRuleContract,
  WorkloadAdjustmentSegmentContract,
} from '@baogiang/contracts';

export const OFFICIAL_TEACHER_WORKLOAD_PROJECTION_PROFILE_V1 =
  'OFFICIAL_TEACHER_WORKLOAD_PROJECTION_V1' as const;

export interface OfficialTeacherWorkloadProjectionInput {
  academicYearId: string;
  targetUserId: string;
  fromCivilDate: CivilDateString;
  toCivilDate: CivilDateString;
  asOfInstant: Date;
}

export type CurricularWorkloadContribution = CurricularWorkloadContributionContract;
export type WorkloadAdjustmentAppliedRule = WorkloadAdjustmentAppliedRuleContract;
export type WorkloadAdjustmentSegment = WorkloadAdjustmentSegmentContract;
export type OfficialWorkloadFinding = OfficialWorkloadFindingContract;
export type OfficialTeacherWorkloadProjection = OfficialTeacherWorkloadProjectionContract;
export type OfficialTeacherWorkloadSnapshot = OfficialTeacherWorkloadSnapshotContract;
