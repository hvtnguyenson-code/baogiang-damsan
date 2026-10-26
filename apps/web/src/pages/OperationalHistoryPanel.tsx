import type { CalendarExceptionRecord, OperationalLessonDispositionRecord } from '@baogiang/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { ErrorFeedback, InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, TextareaField } from '../components/ui/management';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';
import type { OperationalWorkspaceContext } from '../lib/operational-overlays-api';

type ReverseTarget = { kind: 'calendar' | 'teaching'; id: string; updatedAt: string; label: string; requestKey: string };
const dispositionLabel: Record<string, string> = {
  ABSENCE_NO_REPLACEMENT: 'Giáo viên vắng – chưa bố trí thay',
  SAME_SUBJECT_SUBSTITUTION: 'Dạy thay cùng môn',
  DIFFERENT_SUBJECT_SUPERVISION: 'Giám sát khác môn',
  AUTHORIZED_CANCELLATION: 'Hủy tiết có thẩm quyền',
};
function statusLabel(status: string) { return status === 'ACTIVE' ? 'Đang có hiệu lực' : status === 'REVERSED' ? 'Đã hoàn tác' : 'Chưa xác định trạng thái'; }

export function OperationalHistoryPanel({ context, yearId, subjectId, refreshToken = 0 }: {
  context: OperationalWorkspaceContext;
  yearId: string;
  subjectId: string;
  refreshToken?: number;
}) {
  const [calendars, setCalendars] = useState<CalendarExceptionRecord[]>([]);
  const [dispositions, setDispositions] = useState<OperationalLessonDispositionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [reverseTarget, setReverseTarget] = useState<ReverseTarget | null>(null);
  const [reason, setReason] = useState('');
  const [totals, setTotals] = useState({ calendars: 0, dispositions: 0 });
  const version = useRef(0);

  useEffect(() => {
    version.current += 1;
    setLoaded(false);
    setCalendars([]);
    setDispositions([]);
    setError('');
    setNotice('');
    setReverseTarget(null);
    setReason('');
  }, [yearId, subjectId, refreshToken]);

  const canCalendar = context.permissions.calendarSchoolWide;
  const canTeaching = context.permissions.teachingSchoolWide || Boolean(subjectId
    && context.permissions.teachingSubjectIds.includes(subjectId));
  async function loadHistory() {
    if (!yearId || (!canCalendar && !canTeaching)) return;
    const marker = ++version.current;
    setBusy(true);
    setError('');
    try {
      const [calendarResponse, dispositionResponse] = await Promise.all([
        canCalendar ? operationalOverlaysApi.listCalendarExceptions({ academicYearId: yearId, page: 1, pageSize: 50 }) : Promise.resolve(null),
        canTeaching ? operationalOverlaysApi.listLessonDispositions({
          academicYearId: yearId, ...(context.permissions.teachingSchoolWide ? {} : { subjectId }),
          page: 1, pageSize: 50,
        }) : Promise.resolve(null),
      ]);
      if (marker !== version.current) return;
      setCalendars(calendarResponse?.items ?? []);
      setDispositions(dispositionResponse?.items ?? []);
      setTotals({ calendars: calendarResponse?.total ?? 0, dispositions: dispositionResponse?.total ?? 0 });
      setLoaded(true);
    } catch (caught) {
      if (marker === version.current) {
        setLoaded(false);
        setError(caught);
      }
    } finally {
      if (marker === version.current) setBusy(false);
    }
  }

  function chooseReversal(kind: ReverseTarget['kind'], row: { id: string; updatedAt: string }, label: string) {
    setReverseTarget({ kind, id: row.id, updatedAt: row.updatedAt, label, requestKey: `ops-rev-${crypto.randomUUID()}` });
    setReason('');
    setNotice('');
    setError('');
  }

  async function reverse() {
    if (!reverseTarget || reason.trim().length < 5 || busy) return;
    const selected = reverseTarget;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const input = {
        requestKey: selected.requestKey,
        expectedUpdatedAt: selected.updatedAt,
        reversalReason: reason.trim(),
      };
      if (selected.kind === 'calendar') await operationalOverlaysApi.reverseCalendarException(selected.id, input);
      else await operationalOverlaysApi.reverseLessonDisposition(selected.id, input);
      setReverseTarget(null);
      setReason('');
      setNotice('Đã ghi nhận hoàn tác. Lịch sử được giữ nguyên.');
      await loadHistory();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="management-panel form-section">
      <h2>Lịch sử điều hành và hoàn tác</h2>
      <p>Giữ nguyên các bản ghi lịch sử. Hoàn tác chỉ áp dụng cho bản ghi đang có hiệu lực, theo quyền được cấp.</p>
      <Button type="button" variant="secondary" disabled={busy || !yearId || (!canCalendar && !canTeaching)} onClick={() => { void loadHistory(); }}>
        {busy ? 'Tải lịch sử điều hành · Đang xử lý…' : 'Tải lịch sử điều hành'}
      </Button>
      {Boolean(error) && <><ErrorFeedback title="Chưa hoàn thành thao tác" error={error} /><p>Giữ lại lý do đã nhập. Tải lại lịch sử và kiểm tra trước khi xác nhận hoàn tác lần nữa.</p></>}
      {!loaded && !busy && !error && <p>Chọn tải lịch sử để xem các bản ghi trong phạm vi được giao.</p>}
      {notice && <InlineAlert title="Đã cập nhật" tone="success">{notice}</InlineAlert>}
      {!canCalendar && !canTeaching && <p>Chọn môn học trong phạm vi được giao để tải lịch sử; tài khoản cần quyền điều hành tương ứng.</p>}
      {loaded && !busy && !error && calendars.length === 0 && dispositions.length === 0 && <EmptyState title="Chưa có bản ghi điều hành" />}
      {loaded && calendars.length > 0 && (
        <>
          <h3>Ngoại lệ lịch học</h3>
          <DataTable label="Lịch sử ngoại lệ lịch" headings={['Ngày', 'Phạm vi', 'Thời gian', 'Trạng thái', 'Thao tác']}>
            {calendars.map((row) => <tr key={row.id}>
              <td>{row.civilDate}</td>
              <td>{row.scope === 'SCHOOL_WIDE' ? 'Toàn trường' : row.scope === 'GRADE' ? `Khối ${row.gradeLevel}` : 'Một lớp'}</td>
              <td>{row.timeSelector === 'WHOLE_DAY' ? 'Cả ngày' : row.timeSelector === 'SESSION' ? (row.session === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều') : 'Các tiết cụ thể'}</td>
              <td>{statusLabel(row.status)}</td>
              <td>{row.status === 'ACTIVE' && canCalendar
                ? <Button type="button" variant="secondary" disabled={busy} onClick={() => chooseReversal('calendar', row, `Ngoại lệ ngày ${row.civilDate}`)}>Hoàn tác</Button>
                : '—'}</td>
            </tr>)}
          </DataTable>
          {totals.calendars > calendars.length && <p>Đang hiển thị {calendars.length}/{totals.calendars} bản ghi; chưa phải toàn bộ lịch sử.</p>}
        </>
      )}
      {loaded && dispositions.length > 0 && (
        <>
          <h3>Xử lý tiết dạy</h3>
          <DataTable label="Lịch sử xử lý tiết dạy" headings={['Ngày', 'Loại xử lý', 'Trạng thái', 'Thao tác']}>
            {dispositions.map((row) => <tr key={row.id}>
              <td>{row.sourceCivilDate}</td>
              <td>{(Object.prototype.hasOwnProperty.call(dispositionLabel, row.dispositionType) ? dispositionLabel[row.dispositionType] : undefined) ?? 'Điều hành tiết dạy'}</td>
              <td>{statusLabel(row.status)}</td>
              <td>{row.status === 'ACTIVE'
                && (context.permissions.teachingSchoolWide || row.dispositionType !== 'AUTHORIZED_CANCELLATION')
                ? <Button type="button" variant="secondary" disabled={busy} onClick={() => chooseReversal('teaching', row, `Tiết ngày ${row.sourceCivilDate}`)}>Hoàn tác</Button>
                : '—'}</td>
            </tr>)}
          </DataTable>
          {totals.dispositions > dispositions.length && <p>Đang hiển thị {dispositions.length}/{totals.dispositions} bản ghi; chưa phải toàn bộ lịch sử.</p>}
        </>
      )}
      {reverseTarget && (
        <section className="form-section" aria-label="Xác nhận hoàn tác">
          <h3>Xác nhận hoàn tác: {reverseTarget.label}</h3>
          <p>Hoàn tác sẽ tạo sự kiện lịch sử, không xóa bản ghi cũ. Nếu dữ liệu thay đổi hoặc có lịch dạy bù đang phụ thuộc, máy chủ sẽ từ chối.</p>
          <TextareaField label="Lý do hoàn tác (ít nhất 5 ký tự)" id="operations-reversal-reason" value={reason}
            onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} />
          <div className="management-actions">
            <Button type="button" disabled={busy || reason.trim().length < 5} onClick={() => { void reverse(); }}>Xác nhận hoàn tác</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setReverseTarget(null); setReason(''); }}>Hủy</Button>
          </div>
        </section>
      )}
    </section>
  );
}
