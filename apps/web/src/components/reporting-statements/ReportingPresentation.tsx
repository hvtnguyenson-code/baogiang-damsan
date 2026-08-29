import type {
  ReportingCounts,
  ReportingDetail,
  ReportingStatementLifecycleState,
  ReportingStatementSummary,
} from '@baogiang/contracts';
import { Link } from 'react-router-dom';
import { formatCivilDate, formatInstant, lifecycleLabels } from '../../lib/reporting-statement-presentation';
import { DataTable } from '../ui/management';

const classificationLabels = {
  COMPLETED: 'Hoàn thành',
  PROVEN_OPEN_DEBT: 'Còn nghĩa vụ chưa hoàn thành',
  UNCONFIRMED_COMPLETION_GAP: 'Chưa đủ bằng chứng xác nhận hoàn thành',
} as const;

const fulfillmentLabels = { NORMAL: 'Thực hiện theo lịch', MAKEUP: 'Dạy bù' } as const;


export function LifecycleStatus({ state }: { state: ReportingStatementLifecycleState }) {
  const tone = state === 'APPROVED' ? 'active' : state === 'REJECTED' ? 'error' : 'inactive';
  return <span className={`status-badge status-badge--${tone}`}>{lifecycleLabels[state]}</span>;
}

export function ReportingCountsView({ counts }: { counts: ReportingCounts }) {
  const rows = [
    ['Tiết đã phân phối đến hạn', counts.distributedElapsedCount],
    ['Tiết đã hoàn thành', counts.completedCount],
    ['Nghĩa vụ còn mở', counts.openDebtCount],
    ['Hoàn thành muộn', counts.lateCount],
    ['Khoảng trống chưa xác nhận', counts.unconfirmedGapCount],
  ] as const;
  return <dl className="reporting-counts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="technical-value">{value}</dd></div>)}</dl>;
}

export function ReportingEvidenceTable({ details }: { details: ReportingDetail[] }) {
  if (details.length === 0) return <p className="muted-copy">Không có dòng bằng chứng trong phần này.</p>;
  return <DataTable label="Bằng chứng thực hiện" headings={['Ngày theo lịch', 'Khung giờ', 'Phân loại', 'Cách thực hiện', 'Ngày thực hiện']}>
    {details.map((detail) => <tr key={detail.sourceNormalOccurrenceKey}>
      <td className="technical-value">{formatCivilDate(detail.sourceCivilDate)}</td>
      <td className="technical-value">{detail.sourceSlotStart}–{detail.sourceSlotEnd}</td>
      <td>{classificationLabels[detail.classification]}</td>
      <td>{detail.fulfillmentKind ? fulfillmentLabels[detail.fulfillmentKind] : 'Chưa có bằng chứng thực hiện'}</td>
      <td className="technical-value">{detail.executionCivilDate ? formatCivilDate(detail.executionCivilDate) : '—'}</td>
    </tr>)}
  </DataTable>;
}

export function StatementListTable({ items, academicYearLabels }: {
  items: ReportingStatementSummary[];
  academicYearLabels: Map<string, string>;
}) {
  return <DataTable label="Danh sách báo cáo kê khai" headings={['Người gửi', 'Năm học', 'Khoảng báo cáo', 'Đã gửi', 'Trạng thái', 'Thao tác']}>
    {items.map((item) => <tr key={item.revisionId}>
      <td><strong>{item.submitterDisplayNameSnapshot ?? 'Người gửi không còn tên hiển thị'}</strong>{item.submitterStaffCodeSnapshot && <span className="table-secondary technical-value">{item.submitterStaffCodeSnapshot}</span>}</td>
      <td>{academicYearLabels.get(item.academicYearId) ?? 'Không còn nhãn năm học trong danh mục hiện tại'}</td>
      <td className="technical-value">{formatCivilDate(item.fromCivilDate)} – {formatCivilDate(item.toCivilDate)}</td>
      <td className="technical-value">{formatInstant(item.submittedAt)}</td>
      <td><LifecycleStatus state={item.lifecycleState} /></td>
      <td><Link className="text-link" to={`/bao-cao-ke-khai/${item.revisionId}`}>Mở báo cáo</Link></td>
    </tr>)}
  </DataTable>;
}
