import type { PpctCurricularComponent, PpctVersionRecord } from './index';

export type PpctImportIssueSeverity = 'BLOCKER' | 'ADVISORY';
export type PpctImportTargetMode = 'CREATE_NEW_DRAFT' | 'UPDATE_EXACT_DRAFT';
export type PpctImportConfirmOutcome = 'CREATED' | 'UPDATED' | 'REPLAYED';

export interface PpctImportIssue {
  severity: PpctImportIssueSeverity;
  code: string;
  message: string;
  sheetName?: string;
  sourceRowNumber?: number;
  gradeLevel?: 10 | 11 | 12;
}

export interface PpctImportInspectionSheet {
  name: string;
  state: 'VISIBLE' | 'HIDDEN' | 'VERY_HIDDEN';
  rowCount: number;
  columnCount: number;
  headers: string[];
  authoritative: boolean;
}

export interface PpctImportMetadata {
  subjectDisplayName: string | null;
  academicYearCode: string | null;
  templateVersion: string | null;
}

export interface PpctImportInspectionResponse {
  sourceFileName: string;
  metadata: PpctImportMetadata;
  sheets: PpctImportInspectionSheet[];
  gradeLevels: Array<10 | 11 | 12>;
  issues: PpctImportIssue[];
}

export interface PpctImportTargetSelection {
  gradeLevel: 10 | 11 | 12;
  targetMode: PpctImportTargetMode;
  targetDraftId: string | null;
  expectedUpdatedAt: string | null;
}

export interface PpctImportDraftOption {
  id: string;
  versionNumber: number;
  createdByUserId: string;
  updatedAt: string;
  itemCount: number;
}

export interface PpctImportPredecessor {
  versionId: string;
  itemId: string;
}

export type PpctImportIdentityDecision =
  | { mode: 'CARRY_FORWARD'; itemId: string }
  | { mode: 'NEW'; itemId: string; predecessors: PpctImportPredecessor[] };

export interface PpctImportConfirmItem {
  component: PpctCurricularComponent;
  sequence: number;
  title: string;
  lessonType: string;
  identityDecision: PpctImportIdentityDecision;
}

export interface PpctImportGradePreview {
  academicYearId: string;
  subjectId: string;
  gradeLevel: 10 | 11 | 12;
  ppctPlanId: string | null;
  sourceHistoricalVersionId: string | null;
  canonicalSemanticDigest: string;
  corePeriodCount: number;
  specializedPeriodCount: number;
  target: PpctImportTargetSelection;
  drafts: PpctImportDraftOption[];
  items: PpctImportConfirmItem[];
}

export interface PpctImportPreviewResponse {
  sourceFileName: string;
  workbookRawDigest: string;
  academicYear: { id: string; code: string; name: string };
  subject: { id: string; code: string; name: string };
  canonicalSemanticDigest: string;
  grades: PpctImportGradePreview[];
  issues: PpctImportIssue[];
  requestFingerprint: string;
}

export interface PpctImportConfirmGradeResult {
  gradeLevel: 10 | 11 | 12;
  outcome: PpctImportConfirmOutcome;
  version: PpctVersionRecord;
}

export interface PpctImportConfirmResponse {
  requestFingerprint: string;
  academicYearId: string;
  subjectId: string;
  results: PpctImportConfirmGradeResult[];
}
