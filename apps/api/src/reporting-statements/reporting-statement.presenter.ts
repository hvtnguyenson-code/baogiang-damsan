import { InternalServerErrorException } from '@nestjs/common';
import {
  CivilDateString,
  ReportingStatementAllowedAction,
  ReportingStatementDetailResponse,
  ReportingStatementHistoryEntry,
  ReportingStatementLifecycleState,
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
    throw new InternalServerErrorException('Reporting Statement revision missing lifecycle state.');
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
    throw new InternalServerErrorException('Reporting Statement version integrity check failed.');
  }

  if (sha256CanonicalJson(row.canonicalSnapshotJson) !== row.semanticHash) {
    throw new InternalServerErrorException('Reporting Statement semantic hash integrity check failed.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.canonicalSnapshotJson);
  } catch {
    throw new InternalServerErrorException('Reporting Statement snapshot JSON parsing failed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new InternalServerErrorException('Reporting Statement snapshot payload is invalid.');
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
    throw new InternalServerErrorException('Reporting Statement snapshot structure is invalid.');
  }

  let recanonical: string;
  try {
    recanonical = canonicalizeJson(snapshot as never);
  } catch {
    throw new InternalServerErrorException('Reporting Statement snapshot canonicalization failed.');
  }

  if (recanonical !== row.canonicalSnapshotJson) {
    throw new InternalServerErrorException('Reporting Statement snapshot canonical byte integrity check failed.');
  }

  const snapshotSubjects = [...new Set(snapshot.responsibilityManifest.map((x) => x.subjectId))].sort();
  const dbSubjects = (row.subjects ?? []).map((s) => s.subjectId).slice().sort();

  if (
    snapshotSubjects.length === 0 ||
    snapshotSubjects.length !== dbSubjects.length ||
    snapshotSubjects.some((id, index) => id !== dbSubjects[index])
  ) {
    throw new InternalServerErrorException('Reporting Statement frozen subject integrity check failed.');
  }

  if (new Date(snapshot.asOfInstant).getTime() !== row.asOfInstant.getTime()) {
    throw new InternalServerErrorException('Reporting Statement asOfInstant integrity check failed.');
  }

  return snapshot;
}

export function presentReportingStatementDetail(
  row: FrozenRevisionRow,
  allowedActions: ReportingStatementAllowedAction[],
): ReportingStatementDetailResponse {
  if (!row.state) {
    throw new InternalServerErrorException('Reporting Statement revision missing lifecycle state.');
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
      findings: s.findings.map((f) => ({
        severity: f.severity,
        code: f.code,
        reason: f.reason,
        entityIds: f.entityIds.slice(),
        occurrenceKey: f.occurrenceKey,
      })),
    })),
    responsibilityManifest: snapshot.responsibilityManifest.map((x) => ({ ...x })),
    frozenSubjectIds,
    history: historyEntries,
    allowedActions,
  };
}

