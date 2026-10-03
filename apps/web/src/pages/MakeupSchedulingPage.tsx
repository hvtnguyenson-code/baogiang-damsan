import type {
  AcademicYearRecord,
  CivilDateString,
  MakeupTargetOptionsResponse,
  MakeupTeachingCandidateRecord,
  MakeupTeachingScheduleRecord,
} from '@baogiang/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, PageLoading, SelectField, StatusText, TextareaField } from '../components/ui/management';
import { academicYearsApi } from '../lib/academic-structure-api';
import { ApiError } from '../lib/api-client';
import { hasSchoolCapability } from '../lib/capabilities';
import { makeupSchedulesApi } from '../lib/makeup-schedules-api';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.serverError ? `${error.serverError}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : 'Yêu cầu không thực hiện được.';
}

function dispositionTypeLabel(type: string): string {
  if (type === 'ABSENCE_NO_REPLACEMENT') return 'Vắng không người dạy thay';
  if (type === 'DIFFERENT_SUBJECT_SUPERVISION') return 'Quản lớp môn khác';
  return type;
}

type SelectedCandidateState = {
  sourceNormalOccurrenceKey: string;
  sourceCivilDate: CivilDateString;
  schoolClassName: string;
  subjectName: string;
  responsibleTeacherName: string;
  dispositionType: string;
};

export function MakeupSchedulingPage() {
  const { auth } = useAuth();
  const rawCapabilities = auth?.capabilities;
  const capabilities = useMemo(() => rawCapabilities ?? [], [rawCapabilities]);

  const isSchoolWide = hasSchoolCapability(capabilities, 'TEACHING_OPERATION_MANAGE');
  const subjectGrants = useMemo(
    () => capabilities.filter((g) => g.key === 'TEACHING_OPERATION_MANAGE' && g.scope === 'SUBJECT' && g.resourceId),
    [capabilities],
  );
  const hasAccess = isSchoolWide || subjectGrants.length > 0;

  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    if (!isSchoolWide && subjectGrants.length > 0) {
      return subjectGrants[0]!.resourceId!;
    }
    return '';
  });

  const [candidates, setCandidates] = useState<MakeupTeachingCandidateRecord[]>([]);
  const [schedules, setSchedules] = useState<MakeupTeachingScheduleRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVERSED'>('ALL');

  const [knownSubjects, setKnownSubjects] = useState<Array<{ id: string; name: string }>>([]);

  const [selectedCandidate, setSelectedCandidate] = useState<SelectedCandidateState | null>(null);
  const [replacesSchedule, setReplacesSchedule] = useState<MakeupTeachingScheduleRecord | null>(null);

  const [targetCivilDate, setTargetCivilDate] = useState('');
  const [targetTimeSlotDefinitionId, setTargetTimeSlotDefinitionId] = useState('');
  const [scheduledTeacherUserId, setScheduledTeacherUserId] = useState('');
  const [note, setNote] = useState('');

  const [targetOptions, setTargetOptions] = useState<MakeupTargetOptionsResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [reversalScheduleId, setReversalScheduleId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const [busy, setBusy] = useState<'init' | 'loading' | 'submitting' | 'reversing' | null>('init');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isSchoolWide && subjectGrants.length > 0) {
      if (!selectedSubjectId || !subjectGrants.some((g) => g.resourceId === selectedSubjectId)) {
        setSelectedSubjectId(subjectGrants[0]!.resourceId!);
      }
    }
  }, [isSchoolWide, subjectGrants, selectedSubjectId]);

  useEffect(() => {
    if (!hasAccess) {
      setBusy(null);
      return;
    }

    let active = true;
    academicYearsApi.list({ page: 1, pageSize: 50 })
      .then((res) => {
        if (!active) return;
        setYears(res.items);
        if (res.items.length > 0) {
          setAcademicYearId(res.items[0].id);
        }
      })
      .catch((caught) => {
        if (active) setError(errorText(caught));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => { active = false; };
  }, [hasAccess]);

  useEffect(() => {
    if (!academicYearId || !hasAccess) return;
    const effectiveSubjectId = !isSchoolWide
      ? (selectedSubjectId || (subjectGrants[0]?.resourceId ?? ''))
      : selectedSubjectId;

    if (!isSchoolWide && !effectiveSubjectId) return;

    loadData(academicYearId, effectiveSubjectId);
  }, [academicYearId, selectedSubjectId, hasAccess, isSchoolWide, subjectGrants]);

  async function loadData(yearId: string, subjectId?: string) {
    setBusy('loading');
    setError('');
    try {
      const queryParams: { academicYearId: string; subjectId?: string } = { academicYearId: yearId };
      if (subjectId) {
        queryParams.subjectId = subjectId;
      }
      const [candidateRes, scheduleRes] = await Promise.all([
        makeupSchedulesApi.listCandidates(queryParams),
        makeupSchedulesApi.listSchedules(queryParams),
      ]);
      setCandidates(candidateRes.items);
      setSchedules(scheduleRes.items);

      // Collect subject names
      const subMap = new Map<string, string>();
      for (const c of candidateRes.items) {
        if (c.subjectId && c.subjectName) {
          subMap.set(c.subjectId, c.subjectName);
        }
      }
      if (subMap.size > 0) {
        setKnownSubjects((prev) => {
          const merged = new Map(prev.map((s) => [s.id, s.name]));
          subMap.forEach((name, id) => merged.set(id, name));
          return Array.from(merged.entries()).map(([id, name]) => ({ id, name }));
        });
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  // Load advisory target options when selectedCandidate and targetCivilDate are chosen
  useEffect(() => {
    if (!selectedCandidate || !academicYearId || !targetCivilDate || targetCivilDate.length !== 10) {
      setTargetOptions(null);
      return;
    }

    let active = true;
    setLoadingOptions(true);
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');

    makeupSchedulesApi.getTargetOptions({
      academicYearId,
      sourceNormalOccurrenceKey: selectedCandidate.sourceNormalOccurrenceKey,
      targetCivilDate,
    })
      .then((res) => {
        if (!active) return;
        setTargetOptions(res);
        if (res.slots.length > 0) {
          setTargetTimeSlotDefinitionId(res.slots[0].id);
        }
        if (res.teachers.length > 0) {
          setScheduledTeacherUserId(res.teachers[0].userId);
        }
      })
      .catch((err) => {
        if (!active) return;
        setTargetOptions(null);
        setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => { active = false; };
  }, [selectedCandidate, academicYearId, targetCivilDate]);

  function handleSelectCandidate(candidate: MakeupTeachingCandidateRecord) {
    setSelectedCandidate({
      sourceNormalOccurrenceKey: candidate.sourceNormalOccurrenceKey,
      sourceCivilDate: candidate.originalCivilDate,
      schoolClassName: candidate.schoolClassName ?? candidate.schoolClassId,
      subjectName: candidate.subjectName ?? candidate.subjectId,
      responsibleTeacherName: candidate.responsibleTeacherName ?? candidate.responsibleTeacherUserId,
      dispositionType: candidate.dispositionType,
    });
    setReplacesSchedule(null);
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');
    setTargetOptions(null);
    setNote('');
    setError('');
    setSuccess('');
  }

  function handleStartReplacement(schedule: MakeupTeachingScheduleRecord) {
    const origDate = schedule.originalCivilDate.slice(0, 10) as CivilDateString;
    const sourceKey = `NORMAL:${schedule.originalTimetableEntryId}:${origDate}`;
    setReplacesSchedule(schedule);
    setSelectedCandidate({
      sourceNormalOccurrenceKey: sourceKey,
      sourceCivilDate: origDate,
      schoolClassName: schedule.schoolClassId,
      subjectName: schedule.subjectId,
      responsibleTeacherName: schedule.responsibleTeacherUserId,
      dispositionType: 'Đảo lịch (Thay thế)',
    });
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');
    setTargetOptions(null);
    setNote(`Thay thế lịch dạy bù ${schedule.id}`);
    setError('');
    setSuccess('');
  }

  function handleCancelSelection() {
    setSelectedCandidate(null);
    setReplacesSchedule(null);
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');
    setTargetOptions(null);
    setNote('');
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidate || !academicYearId) return;

    if (!targetCivilDate.trim()) {
      setError('Vui lòng chọn ngày dạy bù dự kiến.');
      return;
    }
    if (!targetTimeSlotDefinitionId.trim()) {
      setError('Vui lòng chọn tiết học mục tiêu.');
      return;
    }
    if (!scheduledTeacherUserId.trim()) {
      setError('Vui lòng chọn giáo viên thực hiện.');
      return;
    }

    setBusy('submitting');
    setError('');
    setSuccess('');

    try {
      const result = await makeupSchedulesApi.createSchedule({
        academicYearId,
        sourceNormalOccurrenceKey: selectedCandidate.sourceNormalOccurrenceKey,
        targetCivilDate: targetCivilDate as CivilDateString,
        targetTimeSlotDefinitionId: targetTimeSlotDefinitionId.trim(),
        scheduledTeacherUserId: scheduledTeacherUserId.trim(),
        replacesId: replacesSchedule ? replacesSchedule.id : undefined,
        note: note.trim() || undefined,
        requestKey: `mkp-${crypto.randomUUID()}`,
      });

      setSuccess(`Lập lịch dạy bù thành công (${result.outcome === 'IDEMPOTENT_REPLAY' ? 'Ghi nhận lại' : 'Tạo mới'}). Mã lịch: ${result.record.id}`);
      handleCancelSelection();
      await loadData(academicYearId, selectedSubjectId);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleReverseSchedule(schedule: MakeupTeachingScheduleRecord) {
    if (!reversalReason.trim()) {
      setError('Vui lòng nhập lý do đảo lịch.');
      return;
    }

    setBusy('reversing');
    setError('');
    setSuccess('');

    try {
      const result = await makeupSchedulesApi.reverseSchedule(schedule.id, {
        expectedUpdatedAt: schedule.updatedAt,
        reversalReason: reversalReason.trim(),
        requestKey: `rev-${crypto.randomUUID()}`,
      });

      setSuccess(`Đã đảo ngược lịch dạy bù (${result.record.id}).`);
      setReversalScheduleId(null);
      setReversalReason('');
      await loadData(academicYearId, selectedSubjectId);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  if (!hasAccess) {
    return (
      <div className="workspace-page">
        <PageHeader eyebrow="Quản lý vận hành" title="Lịch dạy bù">
          Lập và quản lý lịch dạy bù cho các nghĩa vụ nợ tiết hợp lệ.
        </PageHeader>
        <InlineAlert title="Từ chối truy cập">
          Tài khoản này không có quyền quản lý vận hành giảng dạy (TEACHING_OPERATION_MANAGE).
        </InlineAlert>
      </div>
    );
  }

  const filteredSchedules = schedules.filter((s) => {
    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Quản lý vận hành"
        title="Lịch dạy bù"
      >
        Lập và quản lý lịch dạy bù cho các nghĩa vụ nợ tiết hợp lệ phát sinh từ thực tế vận hành (vắng không dạy thay, quản lớp môn khác).
      </PageHeader>

      <section className="form-section">
        <legend>Phạm vi điều hành</legend>
        <div className="form-row">
          <SelectField
            label="Năm học"
            id="academic-year-select"
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name} ({y.code})</option>
            ))}
          </SelectField>

          {isSchoolWide ? (
            <SelectField
              label="Lọc theo môn học"
              id="subject-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
            >
              <option value="">Tất cả môn học (toàn trường)</option>
              {knownSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          ) : subjectGrants.length > 1 ? (
            <SelectField
              label="Môn học được phân công"
              id="subject-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              required
            >
              {subjectGrants.map((g) => {
                const sub = knownSubjects.find((s) => s.id === g.resourceId);
                const label = sub?.name ?? `Môn học (${g.resourceId?.slice(0, 8)})`;
                return <option key={g.resourceId} value={g.resourceId}>{label}</option>;
              })}
            </SelectField>
          ) : (
            <div className="form-field" style={{ minWidth: '200px' }}>
              <label className="form-field__label" htmlFor="single-subject-display">Môn học phụ trách</label>
              <div id="single-subject-display" className="form-field__input" style={{ display: 'flex', alignItems: 'center', background: 'var(--mist-50)' }}>
                <strong>
                  {knownSubjects.find((s) => s.id === subjectGrants[0]?.resourceId)?.name ?? `Môn học (${subjectGrants[0]?.resourceId?.slice(0, 8)})`}
                </strong>
              </div>
            </div>
          )}

          <div style={{ alignSelf: 'flex-end', marginBottom: '16px' }}>
            <Button
              type="button"
              variant="secondary"
              disabled={!academicYearId || busy !== null}
              onClick={() => academicYearId && loadData(academicYearId, selectedSubjectId)}
            >
              Tải lại danh sách
            </Button>
          </div>
        </div>
      </section>

      {error && <InlineAlert title="Lỗi thao tác">{error}</InlineAlert>}
      {success && <InlineAlert title="Thành công" tone="success">{success}</InlineAlert>}
      {busy === 'init' && <PageLoading />}

      {/* Selected candidate form */}
      {selectedCandidate && (
        <section className="form-section" style={{ marginTop: '24px' }}>
          <legend>{replacesSchedule ? `Tạo lịch thay thế cho lịch đã đảo (${replacesSchedule.id})` : 'Thiết lập lịch dạy bù'}</legend>
          <div style={{ marginBottom: '16px', background: 'var(--mist-50)', padding: '12px', borderRadius: '4px' }}>
            <p><strong>Lớp:</strong> {selectedCandidate.schoolClassName} | <strong>Môn:</strong> {selectedCandidate.subjectName}</p>
            <p><strong>Ngày gốc:</strong> {selectedCandidate.sourceCivilDate} | <strong>Giáo viên chịu trách nhiệm:</strong> {selectedCandidate.responsibleTeacherName}</p>
            <p><strong>Lý do nợ:</strong> {dispositionTypeLabel(selectedCandidate.dispositionType)}</p>
          </div>

          <form onSubmit={handleCreateSchedule}>
            <div className="form-row">
              <div className="form-field">
                <label className="form-field__label" htmlFor="target-date">Ngày dạy bù dự kiến</label>
                <input
                  id="target-date"
                  type="date"
                  className="form-field__input"
                  value={targetCivilDate}
                  onChange={(e) => setTargetCivilDate(e.target.value)}
                  required
                />
              </div>

              {loadingOptions ? (
                <div className="form-field">
                  <label className="form-field__label">Tiết học mục tiêu</label>
                  <div className="form-field__input" style={{ display: 'flex', alignItems: 'center' }}>
                    <em>Đang tải tiết học hợp lệ...</em>
                  </div>
                </div>
              ) : targetOptions && targetOptions.slots.length > 0 ? (
                <SelectField
                  label="Tiết học mục tiêu"
                  id="target-slot"
                  value={targetTimeSlotDefinitionId}
                  onChange={(e) => setTargetTimeSlotDefinitionId(e.target.value)}
                  required
                >
                  <option value="">-- Chọn tiết học --</option>
                  {targetOptions.slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      Tiết {s.ordinal} — {s.displayLabel} ({s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)})
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div className="form-field">
                  <label className="form-field__label">Tiết học mục tiêu</label>
                  <div className="form-field__input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    {targetCivilDate ? 'Không có tiết học cho phép dạy bù vào ngày này' : 'Vui lòng chọn ngày trước'}
                  </div>
                </div>
              )}
            </div>

            <div className="form-row">
              {loadingOptions ? (
                <div className="form-field">
                  <label className="form-field__label">Giáo viên thực hiện</label>
                  <div className="form-field__input" style={{ display: 'flex', alignItems: 'center' }}>
                    <em>Đang tải danh sách giáo viên đủ điều kiện...</em>
                  </div>
                </div>
              ) : targetOptions && targetOptions.teachers.length > 0 ? (
                <SelectField
                  label="Giáo viên thực hiện"
                  id="scheduled-teacher"
                  value={scheduledTeacherUserId}
                  onChange={(e) => setScheduledTeacherUserId(e.target.value)}
                  required
                >
                  <option value="">-- Chọn giáo viên cùng môn --</option>
                  {targetOptions.teachers.map((t) => (
                    <option key={t.userId} value={t.userId}>
                      {t.displayName}{t.staffCode ? ` (${t.staffCode})` : ''}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div className="form-field">
                  <label className="form-field__label">Giáo viên thực hiện</label>
                  <div className="form-field__input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    {targetCivilDate ? 'Không có giáo viên đủ điều kiện chuyên môn vào ngày này' : 'Vui lòng chọn ngày trước'}
                  </div>
                </div>
              )}
            </div>

            <TextareaField
              label="Ghi chú điều hành"
              id="makeup-note"
              placeholder="Lý do sắp xếp, chỉ đạo chuyên môn..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <Button type="submit" disabled={busy === 'submitting' || loadingOptions || !targetTimeSlotDefinitionId || !scheduledTeacherUserId}>
                {busy === 'submitting' ? 'Đang tạo lịch...' : 'Xác nhận tạo lịch dạy bù'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancelSelection}>
                Hủy bỏ
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Candidates section */}
      <section style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2>Nghĩa vụ đủ điều kiện dạy bù ({candidates.length})</h2>
        </div>

        {candidates.length === 0 ? (
          <EmptyState
            title="Không có nghĩa vụ nợ tiết hợp lệ"
            message="Hiện tại không có tiết dạy nào thuộc diện nợ tiết đã xác nhận (ABSENCE_NO_REPLACEMENT / DIFFERENT_SUBJECT_SUPERVISION) trong phạm vi quản lý."
          />
        ) : (
          <DataTable
            label="Danh sách nghĩa vụ đủ điều kiện dạy bù"
            headings={['Ngày gốc', 'Lớp', 'Môn học', 'Giáo viên gốc', 'Nguyên nhân', 'PPCT', 'Trạng thái', 'Thao tác']}
          >
            {candidates.map((c) => (
              <tr key={c.sourceNormalOccurrenceKey}>
                <td>{c.originalCivilDate}</td>
                <td>{c.schoolClassName ?? c.schoolClassId}</td>
                <td>{c.subjectName ?? c.subjectId}</td>
                <td>{c.responsibleTeacherName ?? c.responsibleTeacherUserId}</td>
                <td>{dispositionTypeLabel(c.dispositionType)}</td>
                <td>{c.ppctItemName ? `Tiết ${c.ppctItemSequence ?? ''} (${c.ppctItemName})` : '—'}</td>
                <td>
                  <StatusText
                    active={!c.hasActiveMakeupSchedule}
                    activeLabel="Cần lập lịch"
                    inactiveLabel="Đã có lịch"
                    inactiveTone="warning"
                  />
                </td>
                <td>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={c.hasActiveMakeupSchedule || busy !== null}
                    onClick={() => handleSelectCandidate(c)}
                  >
                    Lập lịch bù
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      {/* Schedules section */}
      <section style={{ marginTop: '48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2>Lịch dạy bù đã thiết lập ({filteredSchedules.length})</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="button"
              variant={statusFilter === 'ALL' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('ALL')}
            >
              Tất cả
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'ACTIVE' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('ACTIVE')}
            >
              Hiệu lực
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'REVERSED' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('REVERSED')}
            >
              Đã đảo
            </Button>
          </div>
        </div>

        {filteredSchedules.length === 0 ? (
          <EmptyState
            title="Chưa có lịch dạy bù nào"
            message="Các lịch dạy bù được thiết lập sẽ xuất hiện tại bảng này."
          />
        ) : (
          <DataTable
            label="Danh sách lịch dạy bù"
            headings={['Mã lịch', 'Trạng thái', 'Ngày gốc', 'Ngày dạy bù', 'Giáo viên dạy bù', 'Ghi chú', 'Lý do đảo', 'Thao tác']}
          >
            {filteredSchedules.map((s) => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>{s.id.slice(0, 8)}...</td>
                <td>
                  <StatusText
                    active={s.status === 'ACTIVE'}
                    activeLabel="Đang hiệu lực"
                    inactiveLabel="Đã đảo"
                    inactiveTone="error"
                  />
                </td>
                <td>{s.originalCivilDate}</td>
                <td>{s.targetCivilDate}</td>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>{s.scheduledTeacherUserId.slice(0, 8)}...</td>
                <td>{s.note ?? '—'}</td>
                <td>{s.reversalReason ?? '—'}</td>
                <td>
                  {s.status === 'ACTIVE' ? (
                    reversalScheduleId === s.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          placeholder="Lý do đảo lịch..."
                          className="form-field__input"
                          value={reversalReason}
                          onChange={(e) => setReversalReason(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Button
                            type="button"
                            disabled={busy === 'reversing'}
                            onClick={() => handleReverseSchedule(s)}
                          >
                            Xác nhận đảo
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => { setReversalScheduleId(null); setReversalReason(''); }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy !== null}
                        onClick={() => { setReversalScheduleId(s.id); setReversalReason(''); }}
                      >
                        Đảo lịch
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => handleStartReplacement(s)}
                    >
                      Tạo lịch thay thế
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
