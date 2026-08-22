import { CivilDateString } from '@baogiang/contracts';
import { ProgressDebtClassification, ProgressDebtCounts, ProgressDebtFinding } from '../progress-debt/progress-debt.types';
export type ReportingFindingCode = ProgressDebtFinding['code'] | 'SOURCE_TIME_SLOT_PROVENANCE_MISSING';
export interface ReportingFinding { severity: 'BLOCKER'; code: ReportingFindingCode; reason: string; entityIds: string[]; occurrenceKey: string | null; }

export const TEACHING_REPORTING_PROJECTION_PROFILE = 'TEACHING_REPORTING_PROJECTION_V1' as const;

export interface ReportingRootInput { schoolClassId: string; subjectId: string; }
export interface ResolveReportingProjectionInput {
  academicYearId: string; roots: ReportingRootInput[];
  fromCivilDate: CivilDateString; toCivilDate: CivilDateString; asOfInstant: Date;
}
export interface ReportingCounts extends ProgressDebtCounts {}
export interface ReportingDetail {
  academicYearId: string; schoolClassId: string; subjectId: string;
  classification: ProgressDebtClassification;
  sourceNormalOccurrenceKey: string; originalTimetableVersionId: string; originalTimetableEntryId: string;
  sourceCivilDate: CivilDateString; sourceAcademicCalendarVersionId: string; sourceTimeSlotDefinitionId: string;
  sourceSlotStart: string; sourceSlotEnd: string; originalTeachingAssignmentId: string; responsibleTeacherUserId: string;
  ppctClassAssociationId: string; ppctPlanId: string; ppctVersionId: string; ppctItemId: string; ppctItemRevisionId: string;
  operationalLessonDispositionId: string | null; operationalDispositionType: string | null;
  fulfillmentExecutionId: string | null; fulfillmentKind: 'NORMAL' | 'MAKEUP' | null; makeupTeachingScheduleId: string | null;
  executionCivilDate: CivilDateString | null; executionAcademicCalendarVersionId: string | null; executionTimeSlotDefinitionId: string | null; actualTeacherUserId: string | null;
}
export interface ReportingRootProjection {
  scope: ReportingRootInput; status: 'PASS' | 'BLOCKED'; counts: ReportingCounts | null;
  details: ReportingDetail[]; findings: ReportingFinding[];
}
export interface ReportingProjection {
  profile: typeof TEACHING_REPORTING_PROJECTION_PROFILE; scope: ResolveReportingProjectionInput;
  status: 'PASS' | 'BLOCKED'; counts: ReportingCounts | null; roots: ReportingRootProjection[]; evaluatedAt: string;
}