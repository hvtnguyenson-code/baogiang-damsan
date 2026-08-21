import { CivilDateString } from '@baogiang/contracts';

export const TEACHING_PROGRESS_DEBT_PROFILE = 'TEACHING_PROGRESS_DEBT_V1' as const;

export interface ResolveProgressDebtInput {
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  asOfInstant: Date;
}

export type ProgressDebtClassification = 'COMPLETED' | 'PROVEN_OPEN_DEBT' | 'UNCONFIRMED_COMPLETION_GAP';
export type ProgressDebtFindingCode =
  | 'RECONCILIATION_REQUIRED'
  | 'ACTIVE_FULFILLMENT_AMBIGUOUS'
  | 'OPERATIONAL_MEANING_UNCLASSIFIABLE'
  | 'UPSTREAM_ALLOCATION_BLOCKED';

export interface ProgressDebtFinding {
  severity: 'BLOCKER';
  code: ProgressDebtFindingCode;
  reason: string;
  entityIds: string[];
  occurrenceKey: string | null;
}

export interface ProgressDebtCounts {
  distributedElapsedCount: number;
  completedCount: number;
  openDebtCount: number;
  lateCount: number;
  unconfirmedGapCount: number;
}

export interface ProgressDebtItem {
  classification: ProgressDebtClassification;
  sourceNormalOccurrenceKey: string;
  originalTimetableVersionId: string;
  originalTimetableEntryId: string;
  sourceCivilDate: CivilDateString;
  sourceAcademicCalendarVersionId: string;
  sourceTimeSlotDefinitionId: string;
  originalTeachingAssignmentId: string;
  responsibleTeacherUserId: string;
  ppctClassAssociationId: string;
  ppctPlanId: string;
  ppctVersionId: string;
  ppctItemId: string;
  ppctItemRevisionId: string;
  operationalLessonDispositionId: string | null;
  operationalDispositionType: string | null;
  fulfillmentExecutionId: string | null;
  fulfillmentKind: 'NORMAL' | 'MAKEUP' | null;
  makeupTeachingScheduleId: string | null;
  executionCivilDate: CivilDateString | null;
  executionAcademicCalendarVersionId: string | null;
  executionTimeSlotDefinitionId: string | null;
  actualTeacherUserId: string | null;
}

export interface ProgressDebtProjection {
  profile: typeof TEACHING_PROGRESS_DEBT_PROFILE;
  scope: ResolveProgressDebtInput;
  status: 'PASS' | 'BLOCKED';
  counts: ProgressDebtCounts | null;
  items: ProgressDebtItem[];
  findings: ProgressDebtFinding[];
  evaluatedAt: string;
}
