import type { CivilDateString } from '@baogiang/contracts';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, SelectField } from '../components/ui/management';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';
import type { OperationalSourceOccurrence, OperationalWorkspaceContext } from '../lib/operational-overlays-api';

const kindLabel: Record<OperationalSourceOccurrence['effectiveKind'], string> = {
  BASE_TIMETABLE: 'Tiết học theo thời khóa biểu',
  CALENDAR_INTERRUPTION: 'Đã bị loại bởi lịch năm học',
  CALENDAR_EXCEPTION: 'Đã có ngoại lệ lịch',
  SPECIAL_ACTIVITY_SUPPRESSED: 'Đã chuyển sang hoạt động khác',
  OPERATIONAL_DISPOSITION: 'Đã được xử lý điều hành',
};

export function TeachingOperationsPage() {
  const [context, setContext] = useState<OperationalWorkspaceContext | null>(null);
  const [yearId, setYearId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [civilDate, setCivilDate] = useState('');
  const [items, setItems] = useState<OperationalSourceOccurrence[]>([]);
  const [status, setStatus] = useState<'UNVERIFIED' | 'LOADING' | 'PASS' | 'BLOCKED'>('UNVERIFIED');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    operationalOverlaysApi.getWorkspaceContext().then((data) => {
      if (!active) return;
      setContext(data);
      setYearId(data.years[0]?.id ?? '');
      if (!data.permissions.teachingSchoolWide && !data.permissions.calendarSchoolWide) {
        setSubjectId(data.permissions.teachingSubjectIds[0] ?? '');
      }
    }).catch(() => {
      if (active) setError('Không thể tải phạm vi điều hành. Kiểm tra lại quyền hoặc kết nối.');
    }).finally(() => {
      if (active) setLoadingContext(false);
    });
    return () => { active = false; };
  }, []);

  function resetSource() {
    requestId.current += 1;
    setItems([]);
    setStatus('UNVERIFIED');
    setReason('');
    setError('');
  }

  async function loadSources() {
    if (!yearId || !/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) {
      setError('Chọn năm học và ngày hợp lệ để xem tiết dạy gốc.');
      return;
    }
    const current = ++requestId.current;
    setError('');
    setItems([]);
    setReason('');
    setStatus('LOADING');
    try {
      const response = await operationalOverlaysApi.listSourceOccurrences({
        academicYearId: yearId,
        civilDate: civilDate as CivilDateString,
        ...(subjectId ? { subjectId } : {}),
      });
      if (current !== requestId.current) return;
      setStatus(response.status);
      if (response.status === 'PASS') setItems(response.items);
      else setReason(response.reason);
    } catch {
      if (current !== requestId.current) return;
      setStatus('UNVERIFIED');
      setError('Không thể xác minh nguồn tiết học. Chưa có dữ liệu nào đủ điều kiện thao tác.');
    }
  }

  const requiresSubject = Boolean(context && !context.permissions.teachingSchoolWide && !context.permissions.calendarSchoolWide);
  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Điều hành chuyên môn" title="Điều chỉnh hoạt động dạy học">
        Xác minh tiết học từ nguồn thời khóa biểu và lịch năm học có hiệu lực. Mọi thay đổi chỉ được thực hiện sau khi kiểm tra tác động.
      </PageHeader>
      {loadingContext && <p role="status">Đang tải phạm vi được phân quyền…</p>}
      {error && <InlineAlert title="Chưa thể tiếp tục">{error}</InlineAlert>}
      {context && (
        <>
          <section className="management-panel">
            <h2>Chọn tiết dạy gốc</h2>
            <div className="form-grid">
              <SelectField label="Năm học" id="operation-year" value={yearId} onChange={(event) => { setYearId(event.target.value); resetSource(); }}>
                {context.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
              </SelectField>
              <div className="form-field">
                <label className="form-field__label" htmlFor="operation-date">Ngày dạy</label>
                <input className="form-field__input" id="operation-date" type="date" value={civilDate} onChange={(event) => { setCivilDate(event.target.value); resetSource(); }} />
              </div>
              {context.subjects.length > 0 && (
                <SelectField label="Môn học" id="operation-subject" value={subjectId} onChange={(event) => { setSubjectId(event.target.value); resetSource(); }}>
                  {!requiresSubject && <option value="">Tất cả môn được phép xem</option>}
                  {context.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </SelectField>
              )}
            </div>
            <Button type="button" disabled={status === 'LOADING' || !yearId || !civilDate || (requiresSubject && !subjectId)} onClick={() => { void loadSources(); }}>
              {status === 'LOADING' ? 'Đang kiểm tra…' : 'Xem tiết dạy gốc'}
            </Button>
          </section>
          {status === 'BLOCKED' && <InlineAlert title="Nguồn chưa đủ điều kiện">{reason}</InlineAlert>}
          {status === 'PASS' && items.length === 0 && <EmptyState title="Không có tiết dạy phù hợp" message="Không tìm thấy tiết học theo ngày và phạm vi đã chọn." />}
          {status === 'PASS' && items.length > 0 && (
            <section className="management-panel">
              <h2>Tiết học đã xác minh</h2>
              <DataTable label="Tiết dạy gốc" headings={['Lớp', 'Môn', 'Giáo viên', 'Thời điểm', 'Trạng thái']}>
                {items.map((item) => (
                  <tr key={item.occurrenceKey}>
                    <td>{item.schoolClassName ?? 'Chưa có tên lớp'}</td>
                    <td>{item.subjectName ?? 'Chưa có tên môn'}</td>
                    <td>{item.responsibleTeacherName ?? 'Chưa có tên giáo viên'}</td>
                    <td>{item.slot.session === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều'} · {item.slot.startTime}–{item.slot.endTime}</td>
                    <td>{kindLabel[item.effectiveKind]}{!item.selectable && ' · Không thể chọn'}</td>
                  </tr>
                ))}
              </DataTable>
              <p>Đây chỉ là kết quả xác minh nguồn, chưa phải bản xem trước xung đột, PPCT, định mức hoặc nợ tiết. Chức năng xác nhận thay đổi chưa mở.</p>
            </section>
          )}
          <p><Link to="/quan-tri/lich-day-bu">Đi đến lịch dạy bù đã có</Link></p>
        </>
      )}
    </div>
  );
}
