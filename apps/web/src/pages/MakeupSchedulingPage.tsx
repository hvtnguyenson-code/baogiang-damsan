import type {
  AcademicYearRecord,
  CivilDateString,
  MakeupTargetOptionsResponse,
  MakeupTeachingCandidateListStatus,
  MakeupTeachingCandidateRecord,
  MakeupTeachingScheduleRecord,
} from '@baogiang/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, PageLoading, SelectField, StatusText, TextareaField } from '../components/ui/management';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';
import { WorkflowError } from '../components/ui/workflow-error';
import { transportError } from '../lib/teaching-workflow-presentation';
import { hasSchoolCapability } from '../lib/capabilities';
import { makeupSchedulesApi } from '../lib/makeup-schedules-api';
import type { CreateMakeupScheduleInput, MakeupConsequencePreview } from '../lib/makeup-schedules-api';
import { ApiError } from '../lib/api-client';


function dispositionTypeLabel(type: string): string {
  if (type === 'ABSENCE_NO_REPLACEMENT') return 'Vắng không người dạy thay';
  if (type === 'DIFFERENT_SUBJECT_SUPERVISION') return 'Quản lớp môn khác';
  if (type === 'Đảo lịch (Thay thế)') return 'Thay thế lịch đã hoàn tác';
  return 'Chưa xác định nguyên nhân';
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

  const [years, setYears] = useState<Array<Pick<AcademicYearRecord, 'id' | 'code' | 'name'>>>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    if (!isSchoolWide && subjectGrants.length > 0) {
      return subjectGrants[0]!.resourceId!;
    }
    return '';
  });

  const [candidates, setCandidates] = useState<MakeupTeachingCandidateRecord[]>([]);
  const [candidatesStatus, setCandidatesStatus] = useState<MakeupTeachingCandidateListStatus | 'UNVERIFIED' | 'LOADING' | 'ERROR'>('UNVERIFIED');
  const [candidatesBlockedFindings, setCandidatesBlockedFindings] = useState<string[]>([]);
  const [candidateError, setCandidateError] = useState<Error | string>('');
  const [schedules, setSchedules] = useState<MakeupTeachingScheduleRecord[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleError, setScheduleError] = useState<Error | string>('');
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
  const [error, setError] = useState<Error | string>('');
  const [success, setSuccess] = useState('');

  const loadSeqRef = useRef(0);
  const [previewing, setPreviewing] = useState(false);
  const [consequence, setConsequence] = useState<{ key: string; evidence: MakeupConsequencePreview } | null>(null);
  const command = useRef<{ key: string; input: CreateMakeupScheduleInput } | null>(null);
  const previewSequence = useRef(0);
  const selectionKey = JSON.stringify([academicYearId, selectedCandidate?.sourceNormalOccurrenceKey, targetCivilDate,
    targetTimeSlotDefinitionId, scheduledTeacherUserId, replacesSchedule?.id, note, candidatesStatus]);
  const eligible = consequence?.key === selectionKey && consequence.evidence.status === 'PASS'
    && /^[0-9a-f]{64}$/.test(consequence.evidence.consequenceFingerprint)
    && Object.values(consequence.evidence.coverage).every((v) => v === 'ASSESSED')
    && !consequence.evidence.createsExecution && !consequence.evidence.consumesNewPpctItem
    && consequence.evidence.teachers.length > 0 && consequence.evidence.teachers.every((t) => t.earnedCreditUnchanged && t.requiredCreditUnchanged);
  useEffect(() => {
    previewSequence.current += 1;
    command.current = null;
    setConsequence(null);
    setPreviewing(false);
  }, [selectionKey]);

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
    operationalOverlaysApi.getWorkspaceContext()
      .then((res) => {
        if (!active) return;
        if (!Array.isArray(res.years)) throw new Error('Không xác minh được danh sách năm học trong phạm vi điều hành.');
        setYears(res.years);
        if (res.years.length > 0) {
          setAcademicYearId(res.years[0].id);
        }
      })
      .catch((caught) => {
        if (active) setError(transportError(caught));
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
    const currentSeq = ++loadSeqRef.current;
    setBusy('loading');
    setLoadingSchedules(true);
    setError('');
    setCandidateError('');
    setScheduleError('');

    // AR-04: Clear previous candidate selection immediately at reload start so it is NOT actionable while unverified
    setSelectedCandidate(null);
    setReplacesSchedule(null);
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');
    setTargetOptions(null);
    setNote('');
    setCandidatesStatus('LOADING');

    const queryParams: { academicYearId: string; subjectId?: string } = { academicYearId: yearId };
    if (subjectId) {
      queryParams.subjectId = subjectId;
    }

    const candidatePromise = makeupSchedulesApi.listCandidates(queryParams)
      .then((candidateRes) => {
        if (loadSeqRef.current !== currentSeq) return;
        setCandidates(candidateRes.items);
        setCandidatesStatus(candidateRes.status);
        setCandidatesBlockedFindings(candidateRes.blockedFindings ?? []);
        if (candidateRes.status === 'BLOCKED') {
          setSelectedCandidate(null);
          setReplacesSchedule(null);
          setTargetOptions(null);
        }

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
      })
      .catch((caught) => {
        if (loadSeqRef.current !== currentSeq) return;
        setCandidates([]);
        setCandidatesStatus('ERROR');
        setSelectedCandidate(null);
        setReplacesSchedule(null);
        setTargetOptions(null);
        setCandidateError(transportError(caught));
      });

    const schedulePromise = makeupSchedulesApi.listSchedules(queryParams)
      .then((scheduleRes) => {
        if (loadSeqRef.current !== currentSeq) return;
        setSchedules(scheduleRes.items);
      })
      .catch((caught) => {
        if (loadSeqRef.current !== currentSeq) return;
        setSchedules([]);
        setScheduleError(transportError(caught));
      });

    try {
      await Promise.allSettled([candidatePromise, schedulePromise]);
    } finally {
      if (loadSeqRef.current === currentSeq) {
        setLoadingSchedules(false);
        setBusy(null);
      }
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
        setError(transportError(err));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => { active = false; };
  }, [selectedCandidate, academicYearId, targetCivilDate]);

  function handleSelectCandidate(candidate: MakeupTeachingCandidateRecord) {
    if (candidatesStatus !== 'PASS') return;
    setSelectedCandidate({
      sourceNormalOccurrenceKey: candidate.sourceNormalOccurrenceKey,
      sourceCivilDate: candidate.originalCivilDate,
      schoolClassName: candidate.schoolClassName ?? 'Chưa có tên lớp',
      subjectName: candidate.subjectName ?? 'Chưa có tên môn',
      responsibleTeacherName: candidate.responsibleTeacherName ?? 'Chưa có tên giáo viên',
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
    if (candidatesStatus !== 'PASS') return;
    const origDate = schedule.originalCivilDate.slice(0, 10) as CivilDateString;
    const sourceKey = `NORMAL:${schedule.originalTimetableEntryId}:${origDate}`;
    setReplacesSchedule(schedule);
    setSelectedCandidate({
      sourceNormalOccurrenceKey: sourceKey,
      sourceCivilDate: origDate,
      schoolClassName: candidates.find((c) => c.schoolClassId === schedule.schoolClassId)?.schoolClassName ?? 'Chưa có tên lớp',
      subjectName: knownSubjects.find((subject) => subject.id === schedule.subjectId)?.name ?? 'Chưa có tên môn',
      responsibleTeacherName: candidates.find((c) => c.responsibleTeacherUserId === schedule.responsibleTeacherUserId)?.responsibleTeacherName ?? 'Chưa có tên giáo viên',
      dispositionType: 'Đảo lịch (Thay thế)',
    });
    setTargetCivilDate('');
    setTargetTimeSlotDefinitionId('');
    setScheduledTeacherUserId('');
    setTargetOptions(null);
    setNote(`Thay thế lịch dạy bù ngày ${schedule.targetCivilDate}`);
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
    if (!selectedCandidate || candidatesStatus !== 'PASS' || !academicYearId || !eligible || command.current?.key !== selectionKey) return;

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
      const result = await makeupSchedulesApi.createSchedule(command.current.input);

      setSuccess(`Lập lịch dạy bù thành công (${result.outcome === 'IDEMPOTENT_REPLAY' ? 'Ghi nhận lại' : 'Tạo mới'}). Hãy kiểm tra lịch vừa lập trong danh sách bên dưới.`);
      handleCancelSelection();
      await loadData(academicYearId, selectedSubjectId);
    } catch (caught) {
      setError(transportError(caught));
      if (caught instanceof ApiError && [401, 403, 409].includes(caught.statusCode)) {
        setConsequence(null);
        command.current = null;
      }
    } finally {
      setBusy(null);
    }
  }

  async function previewSchedule() {
    if (!selectedCandidate || candidatesStatus !== 'PASS' || !targetCivilDate || !targetTimeSlotDefinitionId || !scheduledTeacherUserId) return;
    const marker = ++previewSequence.current;
    const key = selectionKey;
    const input: CreateMakeupScheduleInput = { academicYearId, sourceNormalOccurrenceKey: selectedCandidate.sourceNormalOccurrenceKey,
      targetCivilDate: targetCivilDate as CivilDateString, targetTimeSlotDefinitionId, scheduledTeacherUserId,
      replacesId: replacesSchedule?.id, note: note.trim() || undefined, requestKey: `mkp-${crypto.randomUUID()}` };
    setPreviewing(true);
    setConsequence(null);
    command.current = null;
    setError('');
    try {
      const evidence = await makeupSchedulesApi.previewSchedule(input);
      if (marker === previewSequence.current) {
        setConsequence({ key, evidence });
        command.current = { key, input: { ...input, expectedConsequenceFingerprint: evidence.consequenceFingerprint } };
      }
    } catch (caught) { if (marker === previewSequence.current) setError(transportError(caught)); }
    finally { if (marker === previewSequence.current) setPreviewing(false); }
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
      await makeupSchedulesApi.reverseSchedule(schedule.id, {
        expectedUpdatedAt: schedule.updatedAt,
        reversalReason: reversalReason.trim(),
        requestKey: `rev-${crypto.randomUUID()}`,
      });

      setSuccess('Đã hoàn tác lịch dạy bù.');
      setReversalScheduleId(null);
      setReversalReason('');
      await loadData(academicYearId, selectedSubjectId);
    } catch (caught) {
      setError(transportError(caught));
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
          Tài khoản này không có quyền quản lý vận hành giảng dạy.
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
                const label = sub?.name ?? `Môn được phân công ${subjectGrants.indexOf(g) + 1} (chưa có tên)`;
                return <option key={g.resourceId} value={g.resourceId}>{label}</option>;
              })}
            </SelectField>
          ) : (
            <div className="form-field" style={{ minWidth: '200px' }}>
              <label className="form-field__label" htmlFor="single-subject-display">Môn học phụ trách</label>
              <div id="single-subject-display" className="form-field__input" style={{ display: 'flex', alignItems: 'center', background: 'var(--mist-50)' }}>
                <strong>
                  {knownSubjects.find((s) => s.id === subjectGrants[0]?.resourceId)?.name ?? 'Môn được phân công (chưa có tên)'}
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

      <WorkflowError error={error} title="Chưa thể hoàn tất thao tác" />
      {success && <InlineAlert title="Thành công" tone="success">{success}</InlineAlert>}
      {busy === 'init' && <PageLoading />}

      {/* Selected candidate form */}
      {selectedCandidate && candidatesStatus === 'PASS' && (
        <section className="form-section" style={{ marginTop: '24px' }}>
          <legend>{replacesSchedule ? 'Tạo lịch thay thế cho lịch đã hoàn tác' : 'Thiết lập lịch dạy bù'}</legend>
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
                  <label className="form-field__label">Tiết dạy bù dự kiến</label>
                  <div className="form-field__input" style={{ display: 'flex', alignItems: 'center' }}>
                    <em>Đang tải tiết học hợp lệ...</em>
                  </div>
                </div>
              ) : targetOptions && targetOptions.slots.length > 0 ? (
                <SelectField
                  label="Tiết dạy bù dự kiến"
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
                  <label className="form-field__label">Tiết dạy bù dự kiến</label>
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
              <Button type="button" disabled={previewing || busy === 'submitting' || loadingOptions || !targetTimeSlotDefinitionId || !scheduledTeacherUserId}
                onClick={() => { void previewSchedule(); }}>{previewing ? 'Đang kiểm tra hệ quả…' : 'Xem trước hệ quả dạy bù'}</Button>
              <Button type="submit" disabled={busy === 'submitting' || previewing || loadingOptions || !eligible}>
                {busy === 'submitting' ? 'Đang tạo lịch...' : 'Xác nhận tạo lịch dạy bù'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancelSelection}>
                Hủy bỏ
              </Button>
            </div>
            {eligible && consequence && <p role="status">Đã đối soát đúng nghĩa vụ và tiết dạy bù đã chọn. Không tiêu thụ PPCT mới;
              {' '}nợ tiết: {consequence.evidence.before.openDebtCount} → {consequence.evidence.after.openDebtCount}.
              {' '}Khối lượng đã thực hiện và định mức giữ nguyên. Lập lịch chưa phải hoàn thành tiết dạy.</p>}
          </form>
        </section>
      )}

      {/* Candidates section */}
      <section style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2>Nghĩa vụ đủ điều kiện dạy bù ({candidatesStatus === 'PASS' ? candidates.length : 0})</h2>
        </div>

        {candidateError ? (
          <WorkflowError error={candidateError} title="Chưa tải được các tiết cần dạy bù" />
        ) : candidatesStatus === 'BLOCKED' ? (
          <InlineAlert title="Dữ liệu nguồn bị chặn" tone="warning">
            Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn.
            {candidatesBlockedFindings.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                Có {candidatesBlockedFindings.length} vấn đề cần người phụ trách kiểm tra dữ liệu nguồn trước khi lập lịch.
              </div>
            )}
          </InlineAlert>
        ) : candidatesStatus === 'LOADING' || candidatesStatus === 'UNVERIFIED' ? (
          <div role="status" style={{ padding: '16px 0', color: 'var(--text-secondary)' }}>
            Đang tải dữ liệu nghĩa vụ dạy bù...
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            title="Không có nghĩa vụ nợ tiết hợp lệ"
            message="Trong phạm vi quản lý đang chọn, chưa có tiết đủ điều kiện dạy bù do giáo viên vắng không người thay hoặc chỉ có người giám sát khác môn."
          />
        ) : (
          <DataTable
            label="Danh sách nghĩa vụ đủ điều kiện dạy bù"
            headings={['Ngày gốc', 'Lớp', 'Môn học', 'Giáo viên gốc', 'Nguyên nhân', 'PPCT', 'Trạng thái', 'Thao tác']}
          >
            {candidates.map((c) => (
              <tr key={c.sourceNormalOccurrenceKey}>
                <td>{c.originalCivilDate}</td>
                <td>{c.schoolClassName ?? 'Chưa có tên lớp'}</td>
                <td>{c.subjectName ?? 'Chưa có tên môn'}</td>
                <td>{c.responsibleTeacherName ?? 'Chưa có tên giáo viên'}</td>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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

        {scheduleError && (
          <div style={{ marginBottom: '16px' }}>
            <WorkflowError error={scheduleError} title="Chưa tải được lịch dạy bù" />
          </div>
        )}

        {busy === 'init' || loadingSchedules ? <p role="status">Đang tải lịch dạy bù…</p> : scheduleError ? null : filteredSchedules.length === 0 ? (
          <EmptyState
            title="Chưa có lịch dạy bù nào"
            message="Các lịch dạy bù được thiết lập sẽ xuất hiện tại bảng này."
          />
        ) : (
          <DataTable
            label="Danh sách lịch dạy bù"
            headings={['Lịch', 'Trạng thái', 'Ngày gốc', 'Ngày dạy bù', 'Giáo viên dạy bù', 'Ghi chú', 'Lý do đảo', 'Thao tác']}
          >
            {filteredSchedules.map((s, index) => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>Lịch {index + 1}</td>
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
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>{targetOptions?.teachers.find((teacher) => teacher.userId === s.scheduledTeacherUserId)?.displayName ?? candidates.find((candidate) => candidate.responsibleTeacherUserId === s.scheduledTeacherUserId)?.responsibleTeacherName ?? 'Chưa có tên giáo viên'}</td>
                <td>{s.note ?? '—'}</td>
                <td>{s.reversalReason ?? '—'}</td>
                <td>
                  {s.status === 'ACTIVE' ? (
                    reversalScheduleId === s.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          aria-label="Lý do đảo lịch dạy bù"
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
                      disabled={busy !== null || candidatesStatus !== 'PASS'}
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
