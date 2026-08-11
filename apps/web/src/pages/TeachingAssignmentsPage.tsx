import type {
  CivilDateString,
  TeachingAssignmentRecord,
  TeachingAssignmentTeacherSummary,
} from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import {
  DataTable,
  EmptyState,
  MutationNotice,
  PageHeader,
  PageLoading,
  Pagination,
  QueryFailure,
  SelectField,
  TextareaField,
} from '../components/ui/management';
import { formatCivilDate } from '../lib/academic-structure-api';
import {
  isCivilDate,
  nextCivilDate,
  buildChangeTeachingAssignmentTeacherInput,
  buildCreateTeachingAssignmentInput,
  teachingAssignmentApi,
  type ChangeTeachingAssignmentTeacherInput,
  type CreateTeachingAssignmentInput,
} from '../lib/teaching-assignment-api';

type Filters = { schoolClassId: string; subjectId: string; teacherUserId: string; activeOn: string };
type CreateDraft = {
  kind: 'create';
  schoolClassId: string;
  subjectId: string;
  teacherUserId: string;
  validFrom: string;
  validUntil: string;
  note: string;
};
type EndDraft = { kind: 'end'; row: TeachingAssignmentRecord; endDate: string };
type ChangeDraft = {
  kind: 'change';
  row: TeachingAssignmentRecord;
  effectiveFrom: string;
  newTeacherUserId: string;
  note: string;
};
type Workflow = CreateDraft | EndDraft | ChangeDraft;

const pageSize = 20;
const emptyFilters: Filters = { schoolClassId: '', subjectId: '', teacherUserId: '', activeOn: '' };

export function TeachingAssignmentsPage() {
  const client = useQueryClient();
  const [selectedYearId, setSelectedYearId] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [workflow, setWorkflow] = useState<Workflow>();
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const years = useQuery({
    queryKey: ['teaching-assignment-years'],
    queryFn: () => teachingAssignmentApi.years({ page: 1, pageSize: 100 }),
  });
  useEffect(() => {
    if (!selectedYearId && years.data?.items[0]) setSelectedYearId(years.data.items[0].id);
  }, [selectedYearId, years.data]);

  const workspace = useQuery({
    queryKey: ['teaching-assignment-workspace', selectedYearId],
    queryFn: () => teachingAssignmentApi.workspace(selectedYearId),
    enabled: Boolean(selectedYearId),
  });
  const assignments = useQuery({
    queryKey: ['teaching-assignments', selectedYearId, { page, filters }],
    queryFn: () => teachingAssignmentApi.list(selectedYearId, {
      page,
      pageSize,
      schoolClassId: filters.schoolClassId || undefined,
      subjectId: filters.subjectId || undefined,
      teacherUserId: filters.teacherUserId || undefined,
      activeOn: isCivilDate(filters.activeOn) ? filters.activeOn : undefined,
    }),
    enabled: Boolean(selectedYearId),
  });

  const activeCalendar = workspace.data?.activeCalendar ?? null;
  const candidateRequest = candidateRequestFor(workflow, activeCalendar);
  const eligibleTeachers = useQuery({
    queryKey: [
      'teaching-assignment-eligible-teachers',
      selectedYearId,
      candidateRequest?.subjectId,
      candidateRequest?.validFrom,
      candidateRequest?.validUntil ?? '',
      1,
    ],
    queryFn: () => teachingAssignmentApi.eligibleTeachers(selectedYearId, {
      ...candidateRequest!, page: 1, pageSize: 100,
    }),
    enabled: Boolean(selectedYearId && activeCalendar && candidateRequest),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateTeachingAssignmentInput) => teachingAssignmentApi.create(selectedYearId, input),
    onMutate: () => { setSuccess(''); setFormError(''); },
    onSuccess: async () => {
      setWorkflow(undefined);
      setSuccess('Đã tạo phân công giảng dạy.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['teaching-assignments', selectedYearId] }),
        client.invalidateQueries({ queryKey: ['teaching-assignment-workspace', selectedYearId] }),
        client.invalidateQueries({ queryKey: ['teaching-assignment-eligible-teachers', selectedYearId] }),
      ]);
    },
  });
  const endMutation = useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: CivilDateString }) =>
      teachingAssignmentApi.end(id, endDate),
    onMutate: () => { setSuccess(''); setFormError(''); },
    onSuccess: async () => {
      setWorkflow(undefined);
      setSuccess('Đã kết thúc phân công; bản ghi trước đó vẫn được giữ trong lịch sử.');
      await client.invalidateQueries({ queryKey: ['teaching-assignments', selectedYearId] });
    },
  });
  const changeMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChangeTeachingAssignmentTeacherInput }) =>
      teachingAssignmentApi.changeTeacher(id, input),
    onMutate: () => { setSuccess(''); setFormError(''); },
    onSuccess: async (_data, variables) => {
      setWorkflow(undefined);
      setSuccess(`Đã đổi giáo viên từ ngày ${formatCivilDate(variables.input.effectiveFrom)}; phân công trước đó vẫn được giữ trong lịch sử.`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['teaching-assignments', selectedYearId] }),
        client.invalidateQueries({ queryKey: ['teaching-assignment-workspace', selectedYearId] }),
        client.invalidateQueries({ queryKey: ['teaching-assignment-eligible-teachers', selectedYearId] }),
      ]);
    },
  });

  const mutationError = createMutation.error ?? endMutation.error ?? changeMutation.error;
  const activeClasses = workspace.data?.classes.filter((item) => item.status === 'ACTIVE') ?? [];
  const activeSubjects = workspace.data?.subjects.filter((item) => item.status === 'ACTIVE') ?? [];
  const usableCandidates = useMemo(() => {
    const items = eligibleTeachers.data?.items ?? [];
    return workflow?.kind === 'change'
      ? items.filter((teacher) => teacher.userId !== workflow.row.teacherUserId)
      : items;
  }, [eligibleTeachers.data, workflow]);
  const filtered = Object.values(filters).some(Boolean);

  function resetFeedback() {
    setSuccess('');
    setFormError('');
    createMutation.reset();
    endMutation.reset();
    changeMutation.reset();
  }

  function begin(next: Workflow) {
    resetFeedback();
    setWorkflow(next);
  }

  function changeYear(id: string) {
    setSelectedYearId(id);
    setPage(1);
    setFilters(emptyFilters);
    setWorkflow(undefined);
    resetFeedback();
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  if (years.isPending) return <div className="management-page"><PageLoading /></div>;
  if (years.isError) return <div className="management-page"><QueryFailure error={years.error} retry={() => void years.refetch()} /></div>;
  if (years.data.items.length === 0) {
    return <div className="management-page teaching-assignment-ledger">
      <PageHeader eyebrow="Sổ phân công giảng dạy" title="Phân công giảng dạy">
        Theo dõi giáo viên phụ trách từng môn học trong lớp theo ngày dân sự của năm học.
      </PageHeader>
      <EmptyState title="Chưa có năm học để xem phân công" message="Khi năm học được thiết lập, lịch sử phân công giảng dạy sẽ xuất hiện tại đây." />
    </div>;
  }

  return <div className="management-page teaching-assignment-ledger">
    <PageHeader
      eyebrow="Sổ phân công giảng dạy"
      title="Phân công giảng dạy"
      action={<Button
        type="button"
        disabled={!activeCalendar || workspace.isPending}
        onClick={() => begin({ kind: 'create', schoolClassId: '', subjectId: '', teacherUserId: '', validFrom: '', validUntil: '', note: '' })}
      >Tạo phân công</Button>}
    >Theo dõi trách nhiệm giảng dạy theo lớp, môn học và khoảng hiệu lực trong năm học.</PageHeader>

    <section className="teaching-assignment-ledger__context" aria-labelledby="year-context-heading">
      <div className="margin-rail" aria-hidden="true" />
      <div>
        <h2 id="year-context-heading">Ngữ cảnh năm học</h2>
        <SelectField label="Năm học" id="teaching-assignment-year" value={selectedYearId} onChange={(event) => changeYear(event.target.value)}>
          {years.data.items.map((year) => <option key={year.id} value={year.id}>{year.code} — {year.name}</option>)}
        </SelectField>
        {workspace.isPending ? <PageLoading /> : workspace.isError ? <QueryFailure error={workspace.error} retry={() => void workspace.refetch()} /> : activeCalendar ?
          <p className="calendar-envelope"><strong>Phiên lịch đang áp dụng:</strong> <span className="technical-value">{formatCivilDate(activeCalendar.startDate)} – {formatCivilDate(activeCalendar.endDate)}</span></p> :
          <p className="limitation-note"><strong>Năm học này chưa có phiên lịch đang áp dụng.</strong> Bạn vẫn có thể xem lịch sử phân công, nhưng chưa thể tạo, kết thúc hoặc đổi giáo viên.</p>}
      </div>
    </section>

    <MutationNotice error={mutationError} success={success} />
    {formError && <p className="form-field__error" role="alert"><span aria-hidden="true">!</span> {formError}</p>}
    {workflow?.kind === 'create' && activeCalendar && workspace.data && <CreateWorkflow
      draft={workflow}
      calendar={activeCalendar}
      classes={activeClasses}
      subjects={activeSubjects}
      candidates={usableCandidates}
      candidatesPending={eligibleTeachers.isPending && Boolean(candidateRequest)}
      candidatesError={eligibleTeachers.error}
      onRetry={() => void eligibleTeachers.refetch()}
      onChange={setWorkflow}
      onCancel={() => setWorkflow(undefined)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!workflow.schoolClassId || !workflow.subjectId || !workflow.teacherUserId || !isCivilDate(workflow.validFrom)) {
          setFormError('Chọn lớp, môn học, ngày bắt đầu và giáo viên đủ điều kiện.'); return;
        }
        if (workflow.validUntil && (!isCivilDate(workflow.validUntil) || workflow.validUntil < workflow.validFrom)) {
          setFormError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.'); return;
        }
        createMutation.mutate(buildCreateTeachingAssignmentInput({ ...workflow, validFrom: workflow.validFrom }));
      }}
      submitting={createMutation.isPending}
    />}
    {workflow?.kind === 'end' && activeCalendar && <EndWorkflow
      draft={workflow}
      calendarEnd={activeCalendar.endDate}
      submitting={endMutation.isPending}
      onChange={setWorkflow}
      onCancel={() => setWorkflow(undefined)}
      onSubmit={(event) => {
        event.preventDefault();
        const max = workflow.row.validUntil ?? activeCalendar.endDate;
        if (!isCivilDate(workflow.endDate) || workflow.endDate < workflow.row.validFrom || workflow.endDate > max) {
          setFormError(`Chọn ngày kết thúc từ ${formatCivilDate(workflow.row.validFrom)} đến ${formatCivilDate(max)}.`); return;
        }
        endMutation.mutate({ id: workflow.row.id, endDate: workflow.endDate });
      }}
    />}
    {workflow?.kind === 'change' && activeCalendar && <ChangeWorkflow
      draft={workflow}
      calendarEnd={activeCalendar.endDate}
      candidates={usableCandidates}
      candidatesPending={eligibleTeachers.isPending && Boolean(candidateRequest)}
      candidatesError={eligibleTeachers.error}
      onRetry={() => void eligibleTeachers.refetch()}
      submitting={changeMutation.isPending}
      onChange={setWorkflow}
      onCancel={() => setWorkflow(undefined)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isCivilDate(workflow.effectiveFrom) || !workflow.newTeacherUserId) {
          setFormError('Chọn ngày hiệu lực và giáo viên mới đủ điều kiện.'); return;
        }
        changeMutation.mutate({ id: workflow.row.id, input: buildChangeTeachingAssignmentTeacherInput({
          newTeacherUserId: workflow.newTeacherUserId,
          effectiveFrom: workflow.effectiveFrom,
          note: workflow.note,
        }) });
      }}
    />}

    {workspace.data && <div className="filter-bar teaching-assignment-ledger__filters">
      <SelectField label="Lớp" id="teaching-filter-class" value={filters.schoolClassId} onChange={(event) => updateFilter('schoolClassId', event.target.value)}><option value="">Tất cả</option>{workspace.data.classes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</SelectField>
      <SelectField label="Môn học" id="teaching-filter-subject" value={filters.subjectId} onChange={(event) => updateFilter('subjectId', event.target.value)}><option value="">Tất cả</option>{workspace.data.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</SelectField>
      <SelectField label="Giáo viên" id="teaching-filter-teacher" value={filters.teacherUserId} onChange={(event) => updateFilter('teacherUserId', event.target.value)}><option value="">Tất cả</option>{workspace.data.historicalTeachers.map((item) => <option key={item.userId} value={item.userId}>{teacherLabel(item)}</option>)}</SelectField>
      <FormField label="Hiệu lực tại" name="teaching-filter-active-on" type="date" value={filters.activeOn} onChange={(event) => updateFilter('activeOn', event.target.value)} />
      {filtered && <Button type="button" variant="quiet" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Xóa bộ lọc</Button>}
    </div>}

    {assignments.isPending ? <PageLoading /> : assignments.isError ? <QueryFailure error={assignments.error} retry={() => void assignments.refetch()} /> : assignments.data.items.length === 0 ?
      <EmptyState filtered={filtered} title={filtered ? 'Không có phân công phù hợp bộ lọc' : 'Chưa có lịch sử phân công giảng dạy'} message={filtered ? 'Điều chỉnh lớp, môn học, giáo viên hoặc ngày hiệu lực rồi thử lại.' : 'Phân công mới và các lần thay đổi giáo viên sẽ được ghi tại đây.'} /> :
      <><DataTable label="Sổ phân công giảng dạy" headings={['Lớp', 'Môn học', 'Giáo viên', 'Hiệu lực', 'Ghi chú', 'Thao tác']}>
        {assignments.data.items.map((row) => {
          const changeMin = nextCivilDate(row.validFrom);
          const changeMax = row.validUntil ?? activeCalendar?.endDate;
          const canChange = Boolean(activeCalendar && changeMax && changeMin <= changeMax);
          return <tr key={row.id}>
            <td><strong>{row.schoolClass.name}</strong><small className="technical-value table-secondary">{row.schoolClass.code} · Khối {row.schoolClass.gradeLevel}</small></td>
            <td><strong>{row.subject.name}</strong><small className="technical-value table-secondary">{row.subject.code}</small></td>
            <td><strong>{row.teacher.displayName}</strong>{row.teacher.staffCode && <small className="technical-value table-secondary">{row.teacher.staffCode}</small>}</td>
            <td><span className="technical-value">{formatCivilDate(row.validFrom)}</span><small className="table-secondary">{row.validUntil ? `đến ${formatCivilDate(row.validUntil)}` : 'Chưa ấn định ngày kết thúc'}</small></td>
            <td>{row.note || <span className="muted-copy">Không có ghi chú</span>}</td>
            <td><div className="row-actions">
              {activeCalendar && <Button type="button" variant="quiet" onClick={() => begin({ kind: 'end', row, endDate: '' })}>Kết thúc</Button>}
              {activeCalendar && <Button type="button" variant="quiet" disabled={!canChange} title={!canChange ? 'Không còn ngày hợp lệ để đổi giáo viên.' : undefined} onClick={() => begin({ kind: 'change', row, effectiveFrom: '', newTeacherUserId: '', note: '' })}>Đổi giáo viên</Button>}
              {!canChange && activeCalendar && <small className="table-secondary">Không còn ngày hợp lệ để đổi.</small>}
            </div></td>
          </tr>;
        })}
      </DataTable><Pagination page={assignments.data.page} pageSize={assignments.data.pageSize} total={assignments.data.total} onPage={setPage} /></>}
  </div>;
}

function candidateRequestFor(workflow: Workflow | undefined, calendar: { startDate: CivilDateString; endDate: CivilDateString } | null) {
  if (!workflow || !calendar) return undefined;
  if (workflow.kind === 'create') {
    if (!workflow.subjectId || !isCivilDate(workflow.validFrom)) return undefined;
    if (workflow.validFrom < calendar.startDate || workflow.validFrom > calendar.endDate) return undefined;
    if (workflow.validUntil && (!isCivilDate(workflow.validUntil) || workflow.validUntil < workflow.validFrom || workflow.validUntil > calendar.endDate)) return undefined;
    return { subjectId: workflow.subjectId, validFrom: workflow.validFrom, ...(isCivilDate(workflow.validUntil) ? { validUntil: workflow.validUntil } : {}) };
  }
  if (workflow.kind === 'change' && isCivilDate(workflow.effectiveFrom)) {
    const min = nextCivilDate(workflow.row.validFrom);
    const max = workflow.row.validUntil ?? calendar.endDate;
    if (workflow.effectiveFrom < min || workflow.effectiveFrom > max) return undefined;
    return { subjectId: workflow.row.subjectId, validFrom: workflow.effectiveFrom, ...(workflow.row.validUntil ? { validUntil: workflow.row.validUntil } : {}) };
  }
  return undefined;
}

function CreateWorkflow(props: {
  draft: CreateDraft;
  calendar: { startDate: CivilDateString; endDate: CivilDateString };
  classes: Array<{ id: string; code: string; name: string }>;
  subjects: Array<{ id: string; code: string; name: string }>;
  candidates: TeachingAssignmentTeacherSummary[];
  candidatesPending: boolean;
  candidatesError: unknown;
  submitting: boolean;
  onChange(draft: CreateDraft): void;
  onCancel(): void;
  onRetry(): void;
  onSubmit(event: FormEvent): void;
}) {
  const { draft } = props;
  const resetTeacher = (patch: Partial<CreateDraft>) => props.onChange({ ...draft, ...patch, teacherUserId: '' });
  const candidateReady = Boolean(candidateRequestFor(draft, props.calendar));
  return <form className="inline-work-form teaching-assignment-workflow" onSubmit={props.onSubmit} noValidate>
    <h2>Tạo phân công giảng dạy</h2>
    <div className="form-grid">
      <SelectField label="Lớp" id="teaching-create-class" value={draft.schoolClassId} onChange={(event) => props.onChange({ ...draft, schoolClassId: event.target.value })} required><option value="">Chọn lớp</option>{props.classes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</SelectField>
      <SelectField label="Môn học" id="teaching-create-subject" value={draft.subjectId} onChange={(event) => resetTeacher({ subjectId: event.target.value })} required><option value="">Chọn môn học</option>{props.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</SelectField>
      <FormField label="Có hiệu lực từ" name="teaching-create-from" type="date" min={props.calendar.startDate} max={props.calendar.endDate} value={draft.validFrom} onChange={(event) => resetTeacher({ validFrom: event.target.value })} required />
      <FormField label="Có hiệu lực đến" name="teaching-create-until" type="date" min={draft.validFrom || props.calendar.startDate} max={props.calendar.endDate} value={draft.validUntil} onChange={(event) => resetTeacher({ validUntil: event.target.value })} />
      <SelectField label="Giáo viên" id="teaching-create-teacher" value={draft.teacherUserId} onChange={(event) => props.onChange({ ...draft, teacherUserId: event.target.value })} disabled={!candidateReady || props.candidatesPending || Boolean(props.candidatesError)} required><option value="">{props.candidatesPending ? 'Đang tìm giáo viên…' : 'Chọn giáo viên'}</option>{props.candidates.map((item) => <option key={item.userId} value={item.userId}>{teacherLabel(item)}</option>)}</SelectField>
      <TextareaField label="Ghi chú" id="teaching-create-note" maxLength={2000} value={draft.note} onChange={(event) => props.onChange({ ...draft, note: event.target.value })} />
    </div>
    {Boolean(props.candidatesError) && <QueryFailure error={props.candidatesError} retry={props.onRetry} />}
    {candidateReady && !props.candidatesPending && !props.candidatesError && props.candidates.length === 0 && <p className="candidate-empty">Không có giáo viên đáp ứng điều kiện môn học và khoảng hiệu lực này.</p>}
    <div className="form-actions"><Button type="submit" loading={props.submitting}>Lưu phân công</Button><Button type="button" variant="quiet" onClick={props.onCancel}>Hủy</Button></div>
  </form>;
}

function EndWorkflow(props: {
  draft: EndDraft;
  calendarEnd: CivilDateString;
  submitting: boolean;
  onChange(draft: EndDraft): void;
  onCancel(): void;
  onSubmit(event: FormEvent): void;
}) {
  const max = props.draft.row.validUntil ?? props.calendarEnd;
  return <form className="inline-work-form teaching-assignment-workflow" onSubmit={props.onSubmit} noValidate>
    <h2>Kết thúc phân công</h2>
    <p><strong>{props.draft.row.schoolClass.name} · {props.draft.row.subject.name}</strong> — {props.draft.row.teacher.displayName}</p>
    <FormField label="Ngày kết thúc" name="teaching-end-date" type="date" min={props.draft.row.validFrom} max={max} value={props.draft.endDate} onChange={(event) => props.onChange({ ...props.draft, endDate: event.target.value })} required />
    <p className="muted-copy">Xác nhận kết thúc chỉ điều chỉnh ngày hiệu lực; lịch sử phân công vẫn được giữ lại.</p>
    <div className="form-actions"><Button type="submit" variant="secondary" loading={props.submitting}>Xác nhận kết thúc</Button><Button type="button" variant="quiet" onClick={props.onCancel}>Hủy</Button></div>
  </form>;
}

function ChangeWorkflow(props: {
  draft: ChangeDraft;
  calendarEnd: CivilDateString;
  candidates: TeachingAssignmentTeacherSummary[];
  candidatesPending: boolean;
  candidatesError: unknown;
  submitting: boolean;
  onChange(draft: ChangeDraft): void;
  onCancel(): void;
  onRetry(): void;
  onSubmit(event: FormEvent): void;
}) {
  const min = nextCivilDate(props.draft.row.validFrom);
  const max = props.draft.row.validUntil ?? props.calendarEnd;
  const candidateReady = Boolean(candidateRequestFor(props.draft, { startDate: min, endDate: props.calendarEnd }));
  return <form className="inline-work-form teaching-assignment-workflow" onSubmit={props.onSubmit} noValidate>
    <h2>Đổi giáo viên</h2>
    <dl className="teaching-assignment-workflow__summary">
      <div><dt>Lớp</dt><dd>{props.draft.row.schoolClass.name}</dd></div>
      <div><dt>Môn học</dt><dd>{props.draft.row.subject.name}</dd></div>
      <div><dt>Giáo viên hiện tại</dt><dd>{props.draft.row.teacher.displayName}</dd></div>
      <div><dt>Khoảng hiệu lực</dt><dd>{formatCivilDate(props.draft.row.validFrom)} – {props.draft.row.validUntil ? formatCivilDate(props.draft.row.validUntil) : 'chưa ấn định ngày kết thúc'}</dd></div>
    </dl>
    <div className="form-grid">
      <FormField label="Có hiệu lực từ" name="teaching-change-from" type="date" min={min} max={max} value={props.draft.effectiveFrom} onChange={(event) => props.onChange({ ...props.draft, effectiveFrom: event.target.value, newTeacherUserId: '' })} required />
      <SelectField label="Giáo viên mới" id="teaching-change-teacher" value={props.draft.newTeacherUserId} onChange={(event) => props.onChange({ ...props.draft, newTeacherUserId: event.target.value })} disabled={!candidateReady || props.candidatesPending || Boolean(props.candidatesError)} required><option value="">{props.candidatesPending ? 'Đang tìm giáo viên…' : 'Chọn giáo viên mới'}</option>{props.candidates.map((item) => <option key={item.userId} value={item.userId}>{teacherLabel(item)}</option>)}</SelectField>
      <TextareaField label="Ghi chú cho phân công mới" id="teaching-change-note" maxLength={2000} value={props.draft.note} onChange={(event) => props.onChange({ ...props.draft, note: event.target.value })} />
    </div>
    {Boolean(props.candidatesError) && <QueryFailure error={props.candidatesError} retry={props.onRetry} />}
    {candidateReady && !props.candidatesPending && !props.candidatesError && props.candidates.length === 0 && <p className="candidate-empty">Không có giáo viên thay thế đáp ứng điều kiện trong khoảng hiệu lực này.</p>}
    <div className="form-actions"><Button type="submit" loading={props.submitting}>Xác nhận đổi giáo viên</Button><Button type="button" variant="quiet" onClick={props.onCancel}>Hủy</Button></div>
  </form>;
}

function teacherLabel(teacher: TeachingAssignmentTeacherSummary): string {
  return `${teacher.displayName}${teacher.staffCode ? ` — ${teacher.staffCode}` : ''}`;
}
