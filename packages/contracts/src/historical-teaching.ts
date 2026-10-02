import type { CivilDateString, PpctCurricularComponent } from './index';

export const HISTORICAL_TEACHING_PROFILE = 'HISTORICAL_TEACHING_V1' as const;

export type HistoricalTeachingImportKind = 'NORMAL' | 'SUBSTITUTION' | 'MAKEUP';
export type HistoricalTeachingSession = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type HistoricalTeachingIssueSeverity = 'BLOCKER' | 'ADVISORY';
export type HistoricalTeachingReconciliationStatus = 'CONFIRMED' | 'UNCONFIRMED' | 'CONFLICT';

export interface HistoricalTeachingIssue {
  severity: HistoricalTeachingIssueSeverity;
  code: string;
  message: string;
  rowNumber?: number;
}

export interface HistoricalTeachingNormalizedRow {
  rowNumber: number;
  rowRef: string;
  kind: HistoricalTeachingImportKind;
  schoolClassCode: string;
  subjectCode: string;
  sourceCivilDate: CivilDateString;
  sourceSession: HistoricalTeachingSession;
  sourceOrdinal: number;
  actualTeacherStaffCode: string;
  executionCivilDate: CivilDateString;
  executionSession: HistoricalTeachingSession;
  executionOrdinal: number;
  note: string | null;
}

export interface HistoricalTeachingResolvedPpct {
  component: PpctCurricularComponent;
  sequence: number;
  title: string;
  lessonType: string;
}

export interface HistoricalTeachingPreviewRow extends HistoricalTeachingNormalizedRow {
  status: 'READY' | 'BLOCKED';
  schoolClassName: string | null;
  subjectName: string | null;
  sourceSlotLabel: string | null;
  executionSlotLabel: string | null;
  responsibleTeacherDisplayName: string | null;
  actualTeacherDisplayName: string | null;
  ppct: HistoricalTeachingResolvedPpct | null;
  replacementCandidate: boolean;
  issues: HistoricalTeachingIssue[];
}

export interface HistoricalTeachingPreviewResponse {
  profile: typeof HISTORICAL_TEACHING_PROFILE;
  academicYear: { id: string; code: string; name: string };
  sourceSha256: string;
  batchRef: string;
  operationalStartDate: CivilDateString;
  operationalStartPolicyVersionId: string;
  requestFingerprint: string;
  canConfirm: boolean;
  rows: HistoricalTeachingPreviewRow[];
  issues: HistoricalTeachingIssue[];
}

export interface HistoricalTeachingConfirmRowResult {
  rowNumber: number;
  rowRef: string;
  kind: HistoricalTeachingImportKind;
  executionId: string;
}

export interface HistoricalTeachingConfirmResponse {
  profile: typeof HISTORICAL_TEACHING_PROFILE;
  outcome: 'CREATED' | 'IDEMPOTENT_REPLAY';
  batchId: string;
  requestFingerprint: string;
  sourceSha256: string;
  confirmedAt: string;
  rows: HistoricalTeachingConfirmRowResult[];
}

export interface HistoricalTeachingReconciliationRow {
  occurrenceKey: string;
  sourceCivilDate: CivilDateString;
  sourceSession: HistoricalTeachingSession;
  sourceOrdinal: number;
  sourceSlotLabel: string;
  responsibleTeacherDisplayName: string;
  ppct: HistoricalTeachingResolvedPpct | null;
  status: HistoricalTeachingReconciliationStatus;
  executionId: string | null;
  executionUpdatedAt: string | null;
  executionKind: 'NORMAL' | 'MAKEUP' | null;
  actualTeacherDisplayName: string | null;
  findings: string[];
}

export interface HistoricalTeachingReverseResponse {
  outcome: 'REVERSED' | 'IDEMPOTENT_REPLAY';
  executionId: string;
  updatedAt: string;
}

export interface HistoricalTeachingReconciliationResponse {
  profile: typeof HISTORICAL_TEACHING_PROFILE;
  academicYear: { id: string; code: string; name: string };
  schoolClass: { id: string; code: string; name: string };
  subject: { id: string; code: string; name: string };
  operationalStartDate: CivilDateString;
  throughCivilDate: CivilDateString;
  counts: {
    confirmed: number;
    unconfirmed: number;
    conflict: number;
  };
  rows: HistoricalTeachingReconciliationRow[];
  findings: string[];
}

export interface HistoricalTeachingOptionsResponse {
  academicYears: Array<{ id: string; code: string; name: string }>;
  selectedAcademicYearId: string | null;
  classes: Array<{ id: string; code: string; name: string; gradeLevel: number }>;
  subjects: Array<{ id: string; code: string; name: string }>;
}
