import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LifecycleStatus, OfficialWorkloadView } from '../components/reporting-statements/ReportingPresentation';
import { lifecycleLabel, reportingFindingLabel, reportingLabel, workloadFindingLabel } from '../lib/reporting-statement-presentation';
import { renderWithQuery } from './test-utils';

describe('Vietnamese reporting presentation at the server boundary', () => {
  it.each(['UNKNOWN_STATUS', 'toString', '__proto__', 'constructor'])('shows a neutral state for %s', (value) => {
    expect(lifecycleLabel(value)).toBe('Chưa xác định trạng thái');
    expect(reportingFindingLabel(value)).toBe('Dữ liệu báo cáo cần được kiểm tra. Hãy liên hệ người phụ trách chuyên môn.');
    expect(workloadFindingLabel(value)).toBe('Dữ liệu khối lượng và định mức cần được kiểm tra. Hãy liên hệ người phụ trách chuyên môn.');
    expect(reportingLabel({ NORMAL: 'Thực hiện theo lịch' }, value, 'Chưa xác định')).toBe('Chưa xác định');
  });

  it('distinguishes approval, rejection and replacement in Vietnamese', () => {
    renderWithQuery(<><LifecycleStatus state="SUBMITTED" /><LifecycleStatus state="APPROVED" /><LifecycleStatus state="REJECTED" /><LifecycleStatus state="SUPERSEDED" /></>);
    for (const label of ['Chờ phê duyệt', 'Đã phê duyệt', 'Đã bị từ chối', 'Đã được thay thế']) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('does not convert unknown workload or adjusted norm into zero or reveal raw findings', () => {
    const { container } = renderWithQuery(<OfficialWorkloadView workload={{
      status: 'BLOCKED', earnedCredit: null, requiredCredit: null, varianceCredit: null,
      curricularWorkload: { totalCredit: null }, specialProgrammeWorkload: { totalCredit: null },
      adjustmentSegments: [{ fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', baseWeeklyNorm: 17, adjustedWeeklyNorm: null, dailyRequiredCredit: 0, appliedRules: [] }],
      findings: [{ code: 'TEACHING_WEEKDAYS_EMPTY', message: 'calendar.id hidden-uuid teachingWeekdays' }, { code: 'UNKNOWN_SQL_CODE', message: 'WORKLOAD_ADJUSTMENT SQL_INTERNAL' }],
    }} />);
    expect(screen.getAllByText('Chưa xác định')).toHaveLength(6);
    expect(screen.getByText('Lịch năm học chưa cấu hình các ngày dạy trong tuần.')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/0 tiết|17 tiết|BLOCKED|hidden-uuid|teachingWeekdays|SQL_INTERNAL|WORKLOAD_ADJUSTMENT|UNKNOWN_SQL_CODE/);
  });

  it('preserves actual zero and signed backend workload figures', () => {
    renderWithQuery(<OfficialWorkloadView workload={{ earnedCredit: 0, requiredCredit: 3, varianceCredit: -3, curricularCredit: 0, specialProgrammeCredit: 0 }} />);
    expect(screen.getAllByText('0 tiết')).toHaveLength(3);
    expect(screen.getByText('-3 tiết')).toBeInTheDocument();
    expect(screen.getByText('3 tiết')).toBeInTheDocument();
    expect(screen.queryByText('Chưa xác định')).not.toBeInTheDocument();
  });
});
