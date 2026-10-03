import type {
  AcademicYearRecord,
  CivilDateString,
  MakeupTeachingCandidateRecord,
  MakeupTeachingScheduleRecord,
} from '@baogiang/contracts';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, PageLoading, SelectField, StatusText, TextareaField } from '../components/ui/management';
import { academicYearsApi } from '../lib/academic-structure-api';
import { ApiError } from '../lib/api-client';
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
  sourceTimetableEntryId: string;
  sourceCivilDate: CivilDateString;
  sourceDispositionId?: string;
  schoolClassName: string;
  subjectName: string;
  responsibleTeacherName: string;
  dispositionType: string;
};

export function MakeupSchedulingPage() {
  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [candidates, setCandidates] = useState<MakeupTeachingCandidateRecord[]>([]);
  const [schedules, setSchedules] = useState<MakeupTeachingScheduleRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVERSED'>('ALL');

  const [selectedCandidate, setSelectedCandidate] = useState<SelectedCandidateState | null>(null);
  const [replacesSchedule, setReplacesSchedule] = useState<MakeupTeachingScheduleRecord | null>(null);

  const [targetCivilDate, setTargetCivilDate] = useState('');
  const [targetTimeSlotDefinitionId, setTargetTimeSlotDefinitionId] = useState('');
  const [scheduledTeacherUserId, setScheduledTeacherUserId] = useState('');
  const [note, setNote] = useState('');

  const [reversalScheduleId, setReversalScheduleId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const [busy, setBusy] = useState<'init' | 'loading' | 'submitting' | 'reversing' | null>('init');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    loadData(academicYearId);
  }, [academicYearId]);

  async function loadData(yearId: string) {
    setBusy('loading');
    setError('');
    try {
      const [candidateRes, scheduleRes] = await Promise.all([
        makeupSchedulesApi.listCandidates({ academicYearId: yearId }),
        makeupSchedulesApi.listSchedules({ academicYearId: yearId }),
      ]);
      setCandidates(candidateRes.items);
      setSchedules(scheduleRes.items);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  function handleSelectCandidate(candidate: MakeupTeachingCandidateRecord) {
    setSelectedCandidate({
      sourceTimetableEntryId: candidate.sourceNormalOccurrenceKey.split(':')[0] || candidate.sourceNormalOccurrenceKey,
      sourceCivilDate: candidate.originalCivilDate,
      sourceDispositionId: candidate.sourceDispositionId,
      schoolClassName: candidate.schoolClassName ?? candidate.schoolClassId,
      subjectName: candidate.subjectName ?? candidate.subjectId,
      responsibleTeacherName: candidate.responsibleTeacherName ?? candidate.responsibleTeacherUserId,
      dispositionType: candidate.dispositionType,
    });
    setReplacesSchedule(null);
    setScheduledTeacherUserId(candidate.responsibleTeacherUserId);
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setNote('');
    setError('');
    setSuccess('');
  }

  function handleStartReplacement(schedule: MakeupTeachingScheduleRecord) {
    setReplacesSchedule(schedule);
    setSelectedCandidate({
      sourceTimetableEntryId: schedule.originalTimetableEntryId,
      sourceCivilDate: schedule.originalCivilDate,
      sourceDispositionId: schedule.sourceDispositionId ?? undefined,
      schoolClassName: schedule.schoolClassId,
      subjectName: schedule.subjectId,
      responsibleTeacherName: schedule.responsibleTeacherUserId,
      dispositionType: 'Đảo lịch (Thay thế)',
    });
    setScheduledTeacherUserId(schedule.scheduledTeacherUserId);
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
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
      setError('Vui lòng nhập mã tiết học dự kiến.');
      return;
    }
    if (!scheduledTeacherUserId.trim()) {
      setError('Vui lòng nhập mã giáo viên dạy bù.');
      return;
    }

    setBusy('submitting');
    setError('');
    setSuccess('');

    try {
      const result = await makeupSchedulesApi.createSchedule({
        academicYearId,
        sourceTimetableEntryId: selectedCandidate.sourceTimetableEntryId,
        sourceCivilDate: selectedCandidate.sourceCivilDate,
        sourceDispositionId: selectedCandidate.sourceDispositionId,
        targetCivilDate,
        targetTimeSlotDefinitionId: targetTimeSlotDefinitionId.trim(),
        scheduledTeacherUserId: scheduledTeacherUserId.trim(),
        replacesId: replacesSchedule ? replacesSchedule.id : undefined,
        note: note.trim() || undefined,
        requestKey: `mkp-${crypto.randomUUID()}`,
      });

      setSuccess(`Lập lịch dạy bù thành công (${result.outcome === 'IDEMPOTENT_REPLAY' ? 'Ghi nhận lại' : 'Tạo mới'}). Mã lịch: ${result.record.id}`);
      handleCancelSelection();
      await loadData(academicYearId);
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
      await loadData(academicYearId);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
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
        <legend>Chọn năm học</legend>
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
          <div style={{ alignSelf: 'flex-end', marginBottom: '16px' }}>
            <Button
              type="button"
              variant="secondary"
              disabled={!academicYearId || busy !== null}
              onClick={() => academicYearId && loadData(academicYearId)}
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
                <label className="form-field__label" htmlFor="target-date">Ngày dạy bù dự kiến (YYYY-MM-DD)</label>
                <input
                  id="target-date"
                  type="date"
                  className="form-field__input"
                  value={targetCivilDate}
                  onChange={(e) => setTargetCivilDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-field__label" htmlFor="target-slot">Mã định danh tiết học (TimeSlotDefinition ID)</label>
                <input
                  id="target-slot"
                  type="text"
                  className="form-field__input"
                  placeholder="UUID của tiết dạy bù"
                  value={targetTimeSlotDefinitionId}
                  onChange={(e) => setTargetTimeSlotDefinitionId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-field__label" htmlFor="scheduled-teacher">Mã giáo viên thực hiện (User ID)</label>
                <input
                  id="scheduled-teacher"
                  type="text"
                  className="form-field__input"
                  placeholder="UUID của giáo viên cùng môn dạy bù"
                  value={scheduledTeacherUserId}
                  onChange={(e) => setScheduledTeacherUserId(e.target.value)}
                  required
                />
              </div>
            </div>

            <TextareaField
              label="Ghi chú điều hành"
              id="makeup-note"
              placeholder="Lý do sắp xếp, chỉ đạo chuyên môn..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <Button type="submit" disabled={busy === 'submitting'}>
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
