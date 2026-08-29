import type { ReportingStatementLifecycleState, ReportingStatementReferenceOption } from '@baogiang/contracts';

export type ReportingLabels = {
  classes: Map<string, ReportingStatementReferenceOption>;
  subjects: Map<string, ReportingStatementReferenceOption>;
};

export const lifecycleLabels: Record<ReportingStatementLifecycleState, string> = {
  SUBMITTED: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã bị từ chối',
  SUPERSEDED: 'Đã được thay thế',
};

export function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatInstant(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed);
}

export function displayReference(
  id: string,
  references: Map<string, ReportingStatementReferenceOption>,
  kind: 'class' | 'subject',
): string {
  const reference = references.get(id);
  if (!reference) return kind === 'class'
    ? 'Không còn nhãn lớp trong danh mục hiện tại'
    : 'Không còn nhãn môn học trong danh mục hiện tại';
  return `${reference.code} — ${reference.name}`;
}

export function makeReportingLabels(classes: ReportingStatementReferenceOption[], subjects: ReportingStatementReferenceOption[]): ReportingLabels {
  return {
    classes: new Map(classes.map((item) => [item.id, item])),
    subjects: new Map(subjects.map((item) => [item.id, item])),
  };
}
