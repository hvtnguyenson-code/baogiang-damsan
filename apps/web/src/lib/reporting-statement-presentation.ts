import type { ReportingStatementFindingCode, ReportingStatementLifecycleState, ReportingStatementReferenceOption } from '@baogiang/contracts';

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

// Lookup only reviewed copy. Unknown server values must never become UI text.
export function reportingLabel(labels: Readonly<Record<string, string>>, value: string, fallback: string): string {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : fallback;
}

export function lifecycleLabel(value: string): string {
  return reportingLabel(lifecycleLabels, value, 'Chưa xác định trạng thái');
}

const findingLabels: Record<ReportingStatementFindingCode, string> = {
  RECONCILIATION_REQUIRED: 'Cần đối soát lại dữ liệu phân bổ và tiến độ giảng dạy.',
  ACTIVE_FULFILLMENT_AMBIGUOUS: 'Có nhiều ghi nhận thực hiện cho cùng tiết dạy, chưa thể xác định bản đúng.',
  OPERATIONAL_MEANING_UNCLASSIFIABLE: 'Chưa thể xác định tình trạng tiết dạy từ dữ liệu hiện có.',
  UPSTREAM_ALLOCATION_BLOCKED: 'Chưa thể phân bổ phân phối chương trình. Hãy liên hệ người phụ trách chuyên môn để kiểm tra dữ liệu.',
  SOURCE_TIME_SLOT_PROVENANCE_MISSING: 'Thiếu thông tin nguồn tiết học hoặc khung giờ giảng dạy.',
  RESPONSIBILITY_SCOPE_PROVENANCE_INVALID: 'Khoảng thời gian phân công phụ trách giảng dạy không hợp lệ.',
  RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH: 'Giáo viên phụ trách trong dữ liệu không trùng khớp với phân công.',
  DUPLICATE_PERSONAL_OCCURRENCE: 'Phát hiện tiết dạy bị trùng trong kỳ báo cáo cá nhân.',
  PERSONAL_AGGREGATE_RECONCILIATION_FAILED: 'Số liệu báo cáo cá nhân chưa khớp, cần được kiểm tra lại.',
};

const workloadFindingLabels: Readonly<Record<string, string>> = {
  SPECIAL_PROGRAMME_WORKLOAD_BLOCKED: 'Chưa thể tổng hợp khối lượng giáo dục địa phương và hoạt động trải nghiệm, hướng nghiệp.',
  CALENDAR_VERSION_NOT_FOUND: 'Chưa có lịch năm học đang áp dụng cho một số ngày trong kỳ báo cáo.',
  CALENDAR_VERSION_AMBIGUOUS: 'Có nhiều lịch năm học cùng áp dụng cho một số ngày, cần kiểm tra lại.',
  TEACHING_WEEKDAYS_EMPTY: 'Lịch năm học chưa cấu hình các ngày dạy trong tuần.',
  ADDITIONAL_DUTY_DEFINITION_MISSING: 'Thiếu thông tin nhiệm vụ kiêm nhiệm được dùng để điều chỉnh định mức.',
};

export function reportingFindingLabel(code?: string): string {
  return reportingLabel(findingLabels, code ?? '', 'Dữ liệu báo cáo cần được kiểm tra. Hãy liên hệ người phụ trách chuyên môn.');
}

export function workloadFindingLabel(code?: string): string {
  return reportingLabel(workloadFindingLabels, code ?? '', 'Dữ liệu khối lượng và định mức cần được kiểm tra. Hãy liên hệ người phụ trách chuyên môn.');
}

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
