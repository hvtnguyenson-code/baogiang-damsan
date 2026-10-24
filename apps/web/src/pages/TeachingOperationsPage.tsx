import { WorkflowError } from '../components/ui/workflow-error';
import { transportError } from '../lib/teaching-workflow-presentation';
import type { CivilDateString } from '@baogiang/contracts';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { OperationalHistoryPanel } from './OperationalHistoryPanel';
import { DispositionPreviewPanel } from './DispositionPreviewPanel';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, SelectField } from '../components/ui/management';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';
import type { CalendarExceptionPreviewResult, OperationalSourceOccurrence, OperationalWorkspaceContext } from '../lib/operational-overlays-api';

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
  const [error, setError] = useState<Error | string>('');
  const [reason, setReason] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [previewScope, setPreviewScope] = useState<'SCHOOL_WIDE' | 'GRADE' | 'CLASS'>('SCHOOL_WIDE');
  const [previewTime, setPreviewTime] = useState<'WHOLE_DAY' | 'SESSION' | 'EXACT_SLOTS'>('WHOLE_DAY');
  const [previewSession, setPreviewSession] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [previewGrade, setPreviewGrade] = useState<10 | 11 | 12>(10);
  const [previewClass, setPreviewClass] = useState('');
  const [previewSlot, setPreviewSlot] = useState('');
  const [previewResult, setPreviewResult] = useState<CalendarExceptionPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestId = useRef(0);
  const previewRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    operationalOverlaysApi.getWorkspaceContext().then((data) => {
      if (!active) return;
      setContext(data);
      setYearId(data.years[0]?.id ?? '');
      if (!data.permissions.teachingSchoolWide && !data.permissions.calendarSchoolWide) {
        setSubjectId(data.permissions.teachingSubjectIds[0] ?? '');
      }
    }).catch((caught) => {
      if (active) setError(transportError(caught));
    }).finally(() => {
      if (active) setLoadingContext(false);
    });
    return () => { active = false; };
  }, []);

  function resetSource() {
    previewRequestId.current += 1;
    requestId.current += 1;
    setItems([]);
    setStatus('UNVERIFIED');
    setReason('');
    setError('');
    setPreviewResult(null);
  }

  async function loadSources() {
    if (!yearId || !/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) {
      setError('Chọn năm học và ngày hợp lệ để xem tiết dạy gốc.');
      return;
    }
    const current = ++requestId.current;
    setError('');
    setItems([]);
    setPreviewResult(null);
    previewRequestId.current += 1;
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
    } catch (caught) {
      if (current !== requestId.current) return;
      setStatus('UNVERIFIED');
      setError(transportError(caught));
    }
  }

  const requiresSubject = Boolean(context && !context.permissions.teachingSchoolWide && !context.permissions.calendarSchoolWide);
  const classes = [...new Map(items.map((item) => [item.schoolClassId, item.schoolClassName ?? 'Lớp chưa có tên'])).entries()];
  const slots = [...new Map(items.map((item) => [item.slot.id, item.slot])).values()];
  const calendarVersions = [...new Set(items.map((item) => item.academicCalendarVersionId))].filter(Boolean);
  function clearCalendarPreview() {
    previewRequestId.current += 1;
    setPreviewResult(null);
    setPreviewLoading(false);
  }
  const canPreviewCalendar = Boolean(context?.permissions.calendarSchoolWide && status === 'PASS'
    && calendarVersions.length === 1 && items.length > 0);
  async function loadCalendarPreview() {
    if (!canPreviewCalendar || !yearId || !calendarVersions[0]) return;
    const current = ++previewRequestId.current;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await operationalOverlaysApi.previewCalendarException({
        academicYearId: yearId,
        academicCalendarVersionId: calendarVersions[0],
        civilDate: civilDate as CivilDateString,
        scope: previewScope,
        ...(previewScope === 'GRADE' ? { gradeLevel: previewGrade } : {}),
        ...(previewScope === 'CLASS' ? { schoolClassId: previewClass || classes[0]?.[0] } : {}),
        timeSelector: previewTime,
        ...(previewTime === 'SESSION' ? { session: previewSession } : {}),
        ...(previewTime === 'EXACT_SLOTS' ? { exactTimeSlotDefinitionIds: [previewSlot || slots[0]!.id] } : {}),
      });
      if (current === previewRequestId.current) setPreviewResult(result);
    } catch {
      if (current === previewRequestId.current) {
        setPreviewResult({
          status: 'BLOCKED', affected: [], reason: 'Không xác minh được ngoại lệ lịch. Không được thực hiện thay đổi.',
          coverage: { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' },
        });
      }
    } finally {
      if (current === previewRequestId.current) setPreviewLoading(false);
    }
  }
  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Điều hành chuyên môn" title="Điều chỉnh hoạt động dạy học">
        Xác minh tiết học từ nguồn thời khóa biểu và lịch năm học có hiệu lực. Mọi thay đổi chỉ được thực hiện sau khi kiểm tra tác động.
      </PageHeader>
      {loadingContext && <p role="status">Đang tải phạm vi được phân quyền…</p>}
      <WorkflowError error={error} />
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
                    <td>{kindLabel[item.effectiveKind] ?? 'Chưa xác định trạng thái tiết học'}{!item.selectable && ' · Không thể chọn'}</td>
                  </tr>
                ))}
              </DataTable>
              <p>Đây chỉ là kết quả xác minh nguồn, chưa phải bản xem trước xung đột, phân phối chương trình (PPCT), định mức hoặc nợ tiết. Chức năng xác nhận thay đổi chưa mở.</p>
            </section>
          )}

          {canPreviewCalendar && (
            <section className="management-panel">
              <h2>Xem trước ngoại lệ lịch học</h2>
              <p>Đây là bản kiểm tra chỉ đọc. Chưa tạo hoặc thay đổi ngoại lệ lịch.</p>
              <div className="form-grid">
                <SelectField id="preview-scope" label="Phạm vi ngoại lệ" value={previewScope}
                  onChange={(event) => { setPreviewScope(event.target.value as typeof previewScope); clearCalendarPreview(); }}>
                  <option value="SCHOOL_WIDE">Toàn trường</option>
                  <option value="GRADE">Một khối lớp</option>
                  <option value="CLASS">Một lớp</option>
                </SelectField>
                {previewScope === 'GRADE' && (
                  <SelectField id="preview-grade" label="Khối lớp" value={previewGrade}
                    onChange={(event) => { setPreviewGrade(Number(event.target.value) as 10 | 11 | 12); clearCalendarPreview(); }}>
                    <option value={10}>Khối 10</option><option value={11}>Khối 11</option><option value={12}>Khối 12</option>
                  </SelectField>
                )}
                {previewScope === 'CLASS' && (
                  <SelectField id="preview-class" label="Lớp áp dụng" value={previewClass || classes[0]?.[0] || ''}
                    onChange={(event) => { setPreviewClass(event.target.value); clearCalendarPreview(); }}>
                    {classes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </SelectField>
                )}
                <SelectField id="preview-time" label="Thời gian áp dụng" value={previewTime}
                  onChange={(event) => { setPreviewTime(event.target.value as typeof previewTime); clearCalendarPreview(); }}>
                  <option value="WHOLE_DAY">Cả ngày</option>
                  <option value="SESSION">Một buổi</option>
                  <option value="EXACT_SLOTS">Một tiết cụ thể</option>
                </SelectField>
                {previewTime === 'SESSION' && (
                  <SelectField id="preview-session" label="Buổi áp dụng" value={previewSession}
                    onChange={(event) => { setPreviewSession(event.target.value as typeof previewSession); clearCalendarPreview(); }}>
                    <option value="MORNING">Buổi sáng</option><option value="AFTERNOON">Buổi chiều</option>
                  </SelectField>
                )}
                {previewTime === 'EXACT_SLOTS' && (
                  <SelectField id="preview-slot" label="Tiết áp dụng" value={previewSlot || slots[0]?.id || ''}
                    onChange={(event) => { setPreviewSlot(event.target.value); clearCalendarPreview(); }}>
                    {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.session === 'MORNING' ? 'Sáng' : 'Chiều'} · {slot.startTime}–{slot.endTime}</option>)}
                  </SelectField>
                )}
              </div>
              <Button type="button" disabled={previewLoading} onClick={() => { void loadCalendarPreview(); }}>
                {previewLoading ? 'Đang xác minh…' : 'Xem trước số tiết bị ảnh hưởng'}
              </Button>
              {previewResult?.status === 'BLOCKED' && <InlineAlert title="Ngoại lệ không đủ điều kiện">{previewResult.reason}</InlineAlert>}
              {previewResult?.status === 'PASS' && (
                <div aria-live="polite">
                  <p><strong>{previewResult.affected.length} tiết học</strong> nằm trong phạm vi ngoại lệ được xem trước.</p>
                  {previewResult.affected.length > 0 && (
                    <DataTable label="Các tiết bị ảnh hưởng" headings={['Lớp', 'Môn', 'Giáo viên', 'Thời gian']}>
                      {previewResult.affected.map((affected) => {
                        const source = items.find((item) => item.occurrenceKey === affected.occurrenceKey);
                        return <tr key={affected.occurrenceKey}>
                          <td>{source?.schoolClassName ?? 'Chưa có tên lớp'}</td>
                          <td>{source?.subjectName ?? 'Chưa có tên môn'}</td>
                          <td>{source?.responsibleTeacherName ?? 'Chưa có tên giáo viên'}</td>
                          <td>{affected.slot.startTime}–{affected.slot.endTime}</td>
                        </tr>;
                      })}
                    </DataTable>
                  )}
                  <p>Chưa đánh giá đầy đủ tác động PPCT, định mức và nợ tiết. Không được suy ra nợ tiết từ số tiết bị ngừng. Chưa mở thao tác xác nhận.</p>
                </div>
              )}
            </section>
          )}
          {status === 'PASS' && civilDate && <DispositionPreviewPanel context={context} yearId={yearId} civilDate={civilDate as CivilDateString} items={items} />}
          <OperationalHistoryPanel context={context} yearId={yearId} subjectId={subjectId} />
          <p><Link to="/quan-tri/lich-day-bu">Quản lý lịch dạy bù</Link></p>
        </>
      )}
    </div>
  );
}
