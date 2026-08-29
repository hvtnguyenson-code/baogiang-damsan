import { InternalServerErrorException } from '@nestjs/common';
import {
  CivilDateString,
  ReportingStatementAllowedAction,
  ReportingStatementDetailResponse,
  ReportingStatementHistoryEntry,
  ReportingStatementLifecycleState,
  ReportingStatementPublicFinding,
  ReportingStatementSummary,
} from '@baogiang/contracts';
import {
  canonicalizeJson,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V1,
  ReportingStatementSnapshotV1,
  sha256CanonicalJson,
} from '../reporting-statement-internal/reporting-statement-canonicalizer';

export function civilDate(value: Date): CivilDateString {
  return value.toISOString().slice(0, 10) as CivilDateString;
}

export const PUBLIC_PRESENTATION_INTEGRITY_ERROR = 'Không thể hiển thị báo cáo do dữ liệu không nhất quán.';

export function mapToPublicFinding(finding: { code: string; severity?: string }): ReportingStatementPublicFinding {
  switch (finding.code) {
    case 'RECONCILIATION_REQUIRED':
      return {
        severity: 'BLOCKER',
        code: 'RECONCILIATION_REQUIRED',
        message: 'Cần đối soát lại dữ liệu phân bổ và tiến độ giảng dạy.',
      };
    case 'ACTIVE_FULFILLMENT_AMBIGUOUS':
      return {
        severity: 'BLOCKER',
        code: 'ACTIVE_FULFILLMENT_AMBIGUOUS',
        message: 'Tồn tại nhiều ghi nhận thực hiện bài dạy chưa thể xác định duy nhất.',
      };
    case 'OPERATIONAL_MEANING_UNCLASSIFIABLE':
      return {
        severity: 'BLOCKER',
        code: 'OPERATIONAL_MEANING_UNCLASSIFIABLE',
        message: 'Không thể phân loại trạng thái bài dạy từ dữ liệu vận hành.',
      };
    case 'UPSTREAM_ALLOCATION_BLOCKED':
      return {
        severity: 'BLOCKER',
        code: 'UPSTREAM_ALLOCATION_BLOCKED',
        message: 'Tiến trình phân bổ PPCT từ hệ thống nguồn đang bị chặn.',
      };
    case 'SOURCE_TIME_SLOT_PROVENANCE_MISSING':
      return {
        severity: 'BLOCKER',
        code: 'SOURCE_TIME_SLOT_PROVENANCE_MISSING',
        message: 'Thiếu thông tin nguồn tiết học hoặc khung giờ giảng dạy.',
      };
    case 'RESPONSIBILITY_SCOPE_PROVENANCE_INVALID':
      return {
        severity: 'BLOCKER',
        code: 'RESPONSIBILITY_SCOPE_PROVENANCE_INVALID',
        message: 'Khoảng thời gian phân công phụ trách giảng dạy không hợp lệ.',
      };
    case 'RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH':
      return {
        severity: 'BLOCKER',
        code: 'RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH',
        message: 'Giáo viên phụ trách trong dữ liệu không trùng khớp với phân công.',
      };
    case 'DUPLICATE_PERSONAL_OCCURRENCE':
      return {
        severity: 'BLOCKER',
        code: 'DUPLICATE_PERSONAL_OCCURRENCE',
        message: 'Phát hiện tiết dạy bị trùng lặp trong kỳ báo cáo cá nhân.',
      };
    case 'PERSONAL_AGGREGATE_RECONCILIATION_FAILED':
      return {
        severity: 'BLOCKER',
        code: 'PERSONAL_AGGREGATE_RECONCILIATION_FAILED',
        message: 'Không thể tổng hợp số liệu báo cáo giảng dạy cá nhân một cách nhất quán.',
      };
    default:
      throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }
}


export interface FrozenRevisionRow {
  id: string;
  seriesId: string;
  snapshotProfile: string;
  serializerVersion: string;
  canonicalSnapshotJson: string;
  semanticHash: string;
  asOfInstant: Date;
  submitterDisplayNameSnapshot: string | null;
  submitterStaffCodeSnapshot: string | null;
  submittedAt: Date;
  predecessorRevisionId: string | null;
  supersedesRevisionId: string | null;
  series: {
    statementProfile: string;
    submitterUserId: string;
    academicYearId: string;
    fromCivilDate: Date;
    toCivilDate: Date;
  };
  state: {
    lifecycleState: ReportingStatementLifecycleState;
    lifecycleToken: string;
  } | null;
  subjects: { subjectId: string }[];
  historyEntries?: {
    id: string;
    eventType: ReportingStatementLifecycleState;
    stateBefore: ReportingStatementLifecycleState | null;
    stateAfter: ReportingStatementLifecycleState;
    actorUserId: string;
    actorDisplayNameSnapshot: string | null;
    actorStaffCodeSnapshot: string | null;
    createdAt: Date;
    causedByRevisionId: string | null;
  }[];
}

export interface RevisionSummaryRow {
  id: string;
  seriesId: string;
  asOfInstant: Date;
  submitterDisplayNameSnapshot: string | null;
  submitterStaffCodeSnapshot: string | null;
  submittedAt: Date;
  predecessorRevisionId: string | null;
  supersedesRevisionId: string | null;
  series: {
    submitterUserId: string;
    academicYearId: string;
    fromCivilDate: Date;
    toCivilDate: Date;
  };
  state: {
    lifecycleState: ReportingStatementLifecycleState;
  } | null;
}

export function presentReportingStatementSummary(row: RevisionSummaryRow): ReportingStatementSummary {
  if (!row.state) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }
  return {
    revisionId: row.id,
    seriesId: row.seriesId,
    submitterUserId: row.series.submitterUserId,
    submitterDisplayNameSnapshot: row.submitterDisplayNameSnapshot,
    submitterStaffCodeSnapshot: row.submitterStaffCodeSnapshot,
    academicYearId: row.series.academicYearId,
    fromCivilDate: civilDate(row.series.fromCivilDate),
    toCivilDate: civilDate(row.series.toCivilDate),
    asOfInstant: row.asOfInstant.toISOString(),
    submittedAt: row.submittedAt.toISOString(),
    lifecycleState: row.state.lifecycleState,
    predecessorRevisionId: row.predecessorRevisionId,
    supersedesRevisionId: row.supersedesRevisionId,
  };
}

export function parseAndVerifyFrozenSnapshot(row: FrozenRevisionRow): ReportingStatementSnapshotV1 {
  if (
    row.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V1 ||
    row.serializerVersion !== REPORTING_STATEMENT_SERIALIZER_V1
  ) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (sha256CanonicalJson(row.canonicalSnapshotJson) !== row.semanticHash) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.canonicalSnapshotJson);
  } catch {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  const snapshot = parsed as ReportingStatementSnapshotV1;

  if (
    snapshot.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V1 ||
    snapshot.serializerVersion !== REPORTING_STATEMENT_SERIALIZER_V1 ||
    snapshot.responsibilityState !== 'RESPONSIBILITY_PRESENT' ||
    !snapshot.counts ||
    !Array.isArray(snapshot.sections) ||
    !Array.isArray(snapshot.responsibilityManifest)
  ) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  let recanonical: string;
  try {
    recanonical = canonicalizeJson(snapshot as never);
  } catch {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (recanonical !== row.canonicalSnapshotJson) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  // Fail-closed cross-record reconciliation between canonical snapshot and persistence metadata
  if (snapshot.statementProfile !== row.series.statementProfile) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.submitterUserId !== row.series.submitterUserId) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.submitterDisplayNameSnapshot !== row.submitterDisplayNameSnapshot) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.submitterStaffCodeSnapshot !== row.submitterStaffCodeSnapshot) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.academicYearId !== row.series.academicYearId) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.fromCivilDate !== civilDate(row.series.fromCivilDate)) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (snapshot.toCivilDate !== civilDate(row.series.toCivilDate)) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  if (new Date(snapshot.asOfInstant).getTime() !== row.asOfInstant.getTime()) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  const snapshotSubjects = [...new Set(snapshot.responsibilityManifest.map((x) => x.subjectId))].sort();
  const dbSubjects = (row.subjects ?? []).map((s) => s.subjectId).slice().sort();

  if (
    snapshotSubjects.length === 0 ||
    snapshotSubjects.length !== dbSubjects.length ||
    snapshotSubjects.some((id, index) => id !== dbSubjects[index])
  ) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }

  return snapshot;
}

export function presentReportingStatementDetail(
  row: FrozenRevisionRow,
  allowedActions: ReportingStatementAllowedAction[],
): ReportingStatementDetailResponse {
  if (!row.state) {
    throw new InternalServerErrorException(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
  }


  const snapshot = parseAndVerifyFrozenSnapshot(row);
  const frozenSubjectIds = (row.subjects ?? []).map((s) => s.subjectId).slice().sort();

  const historyEntries: ReportingStatementHistoryEntry[] = (row.historyEntries ?? [])
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((h) => ({
      id: h.id,
      eventType: h.eventType,
      stateBefore: h.stateBefore,
      stateAfter: h.stateAfter,
      actorUserId: h.actorUserId,
      actorDisplayNameSnapshot: h.actorDisplayNameSnapshot,
      actorStaffCodeSnapshot: h.actorStaffCodeSnapshot,
      createdAt: h.createdAt.toISOString(),
      causedByRevisionId: h.causedByRevisionId,
    }));

  return {
    revisionId: row.id,
    seriesId: row.seriesId,
    statementProfile: row.series.statementProfile,
    submitterUserId: row.series.submitterUserId,
    submitterDisplayNameSnapshot: row.submitterDisplayNameSnapshot,
    submitterStaffCodeSnapshot: row.submitterStaffCodeSnapshot,
    academicYearId: row.series.academicYearId,
    fromCivilDate: civilDate(row.series.fromCivilDate),
    toCivilDate: civilDate(row.series.toCivilDate),
    asOfInstant: row.asOfInstant.toISOString(),
    submittedAt: row.submittedAt.toISOString(),
    lifecycleState: row.state.lifecycleState,
    lifecycleToken: row.state.lifecycleToken,
    predecessorRevisionId: row.predecessorRevisionId,
    supersedesRevisionId: row.supersedesRevisionId,
    counts: { ...snapshot.counts },
    sections: snapshot.sections.map((s) => ({
      schoolClassId: s.schoolClassId,
      subjectId: s.subjectId,
      responsibilityIntervals: s.responsibilityIntervals.map((i) => ({ ...i })),
      status: s.status,
      counts: s.counts ? { ...s.counts } : null,
      details: s.details.map((d) => ({ ...d })),
      findings: s.findings.map((f) => mapToPublicFinding(f)),
    })),
    responsibilityManifest: snapshot.responsibilityManifest.map((x) => ({ ...x })),
    frozenSubjectIds,
    history: historyEntries,
    allowedActions,
  };
}
