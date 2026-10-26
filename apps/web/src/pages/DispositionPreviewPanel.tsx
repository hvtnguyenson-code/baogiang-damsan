import type { CivilDateString, OperationalLessonDispositionType } from '@baogiang/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { ApiError } from '../lib/api-client';
import { OperationalPpctChanges } from './OperationalPpctChanges';
import { ErrorFeedback, InlineAlert } from '../components/ui/feedback';
import { EmptyState, SelectField, TextareaField } from '../components/ui/management';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';
import type { DispositionPreviewResult, OperationalSourceOccurrence, OperationalWorkspaceContext, TeacherOptionsResult } from '../lib/operational-overlays-api';

function blockedReason(reason: string, kind: 'options' | 'preview'): string {
  switch (reason) {
    case 'Quá nhiều giáo viên; cần giới hạn bộ lọc trước khi liệt kê.': return 'Danh sách quá nhiều giáo viên. Chọn môn học cụ thể hơn trước khi tìm lại.';
    case 'Nguồn lịch chưa đủ điều kiện.': return 'Lịch dạy gốc chưa đủ điều kiện. Kiểm tra thời khóa biểu và lịch năm học.';
    case 'Tiết học gốc không còn hợp lệ.': return 'Tiết học gốc không còn hợp lệ. Tải lại tiết dạy trước khi tiếp tục.';
    case 'Giáo viên hoặc cơ hội nguồn xung đột với lịch hiện tại.': return 'Giáo viên hoặc tiết học gốc xung đột với lịch hiện tại. Kiểm tra lại lựa chọn.';
    default: return kind === 'options'
      ? 'Danh sách giáo viên chưa đủ điều kiện để lựa chọn. Hãy kiểm tra môn học và phạm vi được giao hoặc liên hệ cán bộ quản trị.'
      : 'Tiết học gốc hoặc giáo viên chưa đủ điều kiện, hoặc có xung đột lịch. Kiểm tra lại lựa chọn trước khi xem trước lần nữa.';
  }
}

function requiresTeacher(type: OperationalLessonDispositionType) {
  return type === 'SAME_SUBJECT_SUBSTITUTION' || type === 'DIFFERENT_SUBJECT_SUPERVISION';
}

export function DispositionPreviewPanel({ context, yearId, civilDate, items, onCommitted }: {
  context: OperationalWorkspaceContext;
  yearId: string;
  civilDate: CivilDateString;
  items: OperationalSourceOccurrence[];
  onCommitted?: () => void;
}) {
  const allowed = items.filter((item) => item.selectable && (context.permissions.teachingSchoolWide
    || context.permissions.teachingSubjectIds.includes(item.subjectId)));
  const [sourceId, setSourceId] = useState('');
  const [type, setType] = useState<OperationalLessonDispositionType>('ABSENCE_NO_REPLACEMENT');
  const [teacherId, setTeacherId] = useState('');
  const [options, setOptions] = useState<TeacherOptionsResult | null>(null);
  const [preview, setPreview] = useState<DispositionPreviewResult | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const request = useRef(0);
  const command = useRef<Parameters<typeof operationalOverlaysApi.createLessonDisposition>[0] | null>(null);
  const [notice, setNotice] = useState('');
  const eligible = preview?.status === 'PASS' && /^[0-9a-f]{64}$/.test(preview.consequenceFingerprint ?? '')
    && Object.values(preview.coverage).every((v) => v === 'ASSESSED') && Boolean(preview.consequences?.streams.length)
    && Boolean(preview.consequences?.teachers.length) && preview.consequences?.teachers.every((t) => t.status === 'PASS'
      && t.earnedCreditUnchanged && t.requiredCreditUnchanged && !t.createsExecution);

  useEffect(() => {
    request.current += 1;
    command.current = null;
    setSourceId('');
    setOptions(null);
    setPreview(null);
    setTeacherId('');
    setError('');
  }, [yearId, civilDate, items]);

  const source = allowed.find((entry) => entry.timetableEntryId === sourceId) ?? allowed[0];
  function clearPreview() {
    command.current = null;
    request.current += 1;
    setPreview(null);
    setBusy(false);
  }
  function resetSelection() {
    command.current = null;
    request.current += 1;
    setOptions(null);
    setTeacherId('');
    setPreview(null);
    setError('');
    setBusy(false);
  }

  async function loadOptions() {
    if (!source || !requiresTeacher(type)) return;
    const marker = ++request.current;
    setBusy(true);
    setOptions(null);
    setTeacherId('');
    setPreview(null);
    setError('');
    try {
      const result = await operationalOverlaysApi.getTeacherOptions({
        academicYearId: yearId, subjectId: source.subjectId, dispositionType: type,
      });
      if (marker === request.current) setOptions(result);
    } catch (caught) {
      if (marker === request.current) setError(caught);
    } finally {
      if (marker === request.current) setBusy(false);
    }
  }

  async function previewDisposition() {
    if (!source || (requiresTeacher(type) && !(teacherId || options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' && options.items[0]?.userId))) return;
    const marker = ++request.current;
    setBusy(true);
    setPreview(null);
    setError('');
    try {
      command.current = null;
      const input = {
        academicYearId: yearId,
        subjectId: source.subjectId,
        timetableEntryId: source.timetableEntryId,
        sourceCivilDate: civilDate,
        dispositionType: type,
        ...(requiresTeacher(type) ? { assignedTeacherUserId: teacherId || (options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' ? options.items[0]?.userId : undefined) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const result = await operationalOverlaysApi.previewDisposition(input);
      if (marker === request.current) {
        setPreview(result);
        if (result.status === 'PASS' && result.consequenceFingerprint && Object.values(result.coverage).every((v) => v === 'ASSESSED')) {
          const selection = { timetableEntryId: input.timetableEntryId, sourceCivilDate: input.sourceCivilDate,
            dispositionType: input.dispositionType, assignedTeacherUserId: input.assignedTeacherUserId, note: input.note };
          command.current = { ...selection, expectedConsequenceFingerprint: result.consequenceFingerprint,
            requestKey: `disposition-${crypto.randomUUID()}` };
        }
      }
    } catch (caught) {
      if (marker === request.current) setError(caught);
    } finally {
      if (marker === request.current) setBusy(false);
    }
  }

  async function confirmDisposition() {
    if (!eligible || !command.current || busy) return;
    const selected = command.current;
    const marker = request.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operationalOverlaysApi.createLessonDisposition(selected);
      if (marker === request.current) {
        clearPreview();
        setNotice('Đã ghi nhận phân công xử lý. Chưa tạo minh chứng hoàn thành tiết dạy.');
        onCommitted?.();
      }
    } catch (caught) {
      if (marker === request.current) {
        setError(caught);
        if (caught instanceof ApiError && [401, 403, 409].includes(caught.statusCode)) clearPreview();
      }
    } finally { if (marker === request.current) setBusy(false); }
  }

  if (!allowed.length) return null;
  const list = options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' ? options.items : [];
  return (
    <section className="management-panel form-section">
      <h2>Xem trước điều hành tiết dạy</h2>
      {notice && <InlineAlert title="Đã cập nhật" tone="success">{notice}</InlineAlert>}
      <p>Chọn tiết dạy bằng tên lớp, môn và giáo viên; hệ thống kiểm tra nguồn, quyền và xung đột trước khi đưa ra kết luận.</p>
      <div className="form-grid">
        <SelectField label="Tiết học gốc" id="ops-source" value={source?.timetableEntryId ?? ''}
          onChange={(event) => { setSourceId(event.target.value); resetSelection(); }}>
          {allowed.map((entry) => <option key={entry.occurrenceKey} value={entry.timetableEntryId}>
            {entry.schoolClassName ?? 'Lớp'} · {entry.subjectName ?? 'Môn'} · {entry.responsibleTeacherName ?? 'Giáo viên'} · {entry.slot.startTime}
          </option>)}
        </SelectField>
        <SelectField label="Phương án xử lý" id="ops-disposition-type" value={type}
          onChange={(event) => { setType(event.target.value as OperationalLessonDispositionType); resetSelection(); }}>
          <option value="ABSENCE_NO_REPLACEMENT">Giáo viên vắng, chưa bố trí người thay</option>
          <option value="SAME_SUBJECT_SUBSTITUTION">Dạy thay cùng môn</option>
          <option value="DIFFERENT_SUBJECT_SUPERVISION">Giám sát lớp (không ghi nhận dạy môn nguồn)</option>
          {context.permissions.teachingSchoolWide && <option value="AUTHORIZED_CANCELLATION">Hủy tiết theo thẩm quyền toàn trường</option>}
        </SelectField>
        {requiresTeacher(type) && (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { void loadOptions(); }}>
              {busy ? 'Tìm giáo viên có thể lựa chọn · Đang xử lý…' : 'Tìm giáo viên có thể lựa chọn'}
            </Button>
            {options?.status === 'BLOCKED' && <InlineAlert title="Danh sách bị chặn">{blockedReason(options.reason, 'options')}</InlineAlert>}
            {options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' && list.length === 0 && <EmptyState title="Chưa có giáo viên phù hợp" message="Chọn phương án khác hoặc kiểm tra lại phân công môn học." />}
            {options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' && list.length > 0 && (
              <SelectField id="ops-teacher" label="Giáo viên dự kiến" value={teacherId || list[0]?.userId || ''}
                onChange={(event) => { setTeacherId(event.target.value); clearPreview(); }}>
                {list.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.name}</option>)}
              </SelectField>
            )}
            {options?.status === 'OPTIONS_NOT_COLLISION_CHECKED' && <p>Danh sách này chỉ xác minh tư cách giảng dạy. Chưa kiểm tra trùng lịch cho từng giáo viên.</p>}
          </>
        )}
      </div>
      {type === 'SAME_SUBJECT_SUBSTITUTION' && <p>Dạy thay cùng môn giữ phân phối chương trình. Chỉ giáo viên thực dạy được ghi khối lượng khi có minh chứng hợp lệ.</p>}
      {type === 'DIFFERENT_SUBJECT_SUPERVISION' && <p>Giám sát khác môn không hoàn thành môn nguồn và không ghi khối lượng giảng dạy môn nguồn. Nợ tiết chỉ được xác định sau khi tiết gốc kết thúc và chưa được hoàn thành.</p>}
      <TextareaField id="ops-note" label="Ghi chú, lý do (bắt buộc với thay đổi hồi tố)" value={note}
        maxLength={500} rows={2} onChange={(event) => { setNote(event.target.value); clearPreview(); }} />
      <Button type="button" disabled={busy || (requiresTeacher(type) && (!list.length || options?.status !== 'OPTIONS_NOT_COLLISION_CHECKED'))}
        onClick={() => { void previewDisposition(); }}>
        {busy ? 'Xem trước phân công xử lý · Đang kiểm tra…' : 'Xem trước phân công xử lý'}
      </Button>
      {Boolean(error) && <ErrorFeedback title="Chưa thể xác minh" error={error} />}
      {preview?.status === 'BLOCKED' && <InlineAlert title="Không đủ điều kiện điều hành">{blockedReason(preview.reason, 'preview')}</InlineAlert>}
      {preview?.status === 'PASS' && (
        <div aria-live="polite">
          <p><strong>Đã xác minh nguồn, quyền, tư cách giáo viên và xung đột hiện tại.</strong></p>
          {eligible && preview.consequences ? <>
            <OperationalPpctChanges groups={preview.consequences.streams.map((s) => ({
              label: `${source?.schoolClassName ?? 'Lớp liên quan'} · ${source?.subjectName ?? 'Môn liên quan'}`, changes: s.ppctChanges ?? [],
            }))} />
            {preview.consequences.streams.map((s) => <p key={`${s.scope.schoolClassId}:${s.scope.subjectId}`}>
              Phân phối: {s.before?.distributedElapsedCount ?? 'Chưa xác minh'} → {s.after?.distributedElapsedCount ?? 'Chưa xác minh'};
              {' '}hoàn thành: {s.before?.completedCount ?? 'Chưa xác minh'} → {s.after?.completedCount ?? 'Chưa xác minh'};
              {' '}nợ tiết: {s.before?.openDebtCount ?? 'Chưa xác minh'} → {s.after?.openDebtCount ?? 'Chưa xác minh'}.
            </p>)}
            <p>Khối lượng đã ghi nhận và định mức giữ nguyên. Máy chủ đối soát lại trong giao dịch xác nhận.</p>
            <Button type="button" disabled={busy || !command.current} onClick={() => { void confirmDisposition(); }}>Xác nhận điều hành tiết dạy</Button>
          </> : <p>Chưa đánh giá đầy đủ hệ quả phân phối chương trình (PPCT), định mức hoặc nợ tiết. Chưa cho phép ghi thay đổi.</p>}
        </div>
      )}
    </section>
  );
}
