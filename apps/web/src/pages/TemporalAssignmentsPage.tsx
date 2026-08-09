import type { StaffSubjectRecord, SubjectGroupMembershipRecord, UserManagementRecord } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { DataTable, EmptyState, MutationNotice, PageHeader, PageLoading, Pagination, QueryFailure, SelectField, StatusText } from '../components/ui/management';
import { hasSchoolCapability } from '../lib/capabilities';
import { formatDateTime, isActiveWindow } from '../lib/display';
import { assignmentApi, buildTemporalAssignmentUpdate, catalogApi, hasPatchChanges, toIso, toLocalInput, usersApi, type AssignmentInput, type AssignmentUpdate } from '../lib/management-api';

type RecordType = SubjectGroupMembershipRecord | StaffSubjectRecord;
type Draft = { id?: string; userId: string; resourceId: string; validFrom: string; validUntil: string; isPrimary: boolean; original?: RecordType };
type SaveVariables = { operation: 'create'; input: AssignmentInput } | { operation: 'update'; id: string; input: AssignmentUpdate };
type Filters = { userId: string; resourceId: string; activeAt: string; isPrimary: string };
const emptyFilters: Filters = { userId: '', resourceId: '', activeAt: '', isPrimary: '' };

export function TemporalAssignmentsPage({ kind }: { kind: 'subject-group-memberships' | 'staff-subjects' }) {
  const isGroup = kind === 'subject-group-memberships';
  const title = isGroup ? 'Phân công tổ chuyên môn' : 'Phân công môn học';
  const resourceLabel = isGroup ? 'Tổ chuyên môn' : 'Môn học';
  const catalogKind = isGroup ? 'subject-groups' : 'subjects';
  const resourceQueryKey = isGroup ? 'subjectGroupId' : 'subjectId';
  const { auth } = useAuth();
  const canLookupUsers = hasSchoolCapability(auth?.capabilities ?? [], 'USER_MANAGE');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [endId, setEndId] = useState<string>();
  const [endAt, setEndAt] = useState('');
  const [success, setSuccess] = useState('');
  const api = assignmentApi(kind);
  const resourceApi = catalogApi(catalogKind);
  const queryKey = ['assignments', kind, { page, filters }] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => api.list({
      page,
      pageSize: 20,
      userId: canLookupUsers ? filters.userId : undefined,
      [resourceQueryKey]: filters.resourceId || undefined,
      activeAt: toIso(filters.activeAt),
      isPrimary: filters.isPrimary || undefined,
    }),
  });
  const users = useQuery({ queryKey: ['users', 'lookup'], queryFn: () => usersApi.list({ page: 1, pageSize: 100 }), enabled: canLookupUsers });
  const resources = useQuery({ queryKey: ['catalog', catalogKind, 'history-lookup'], queryFn: () => resourceApi.list({ page: 1, pageSize: 100 }) });
  const save = useMutation({
    mutationFn: (variables: SaveVariables) => variables.operation === 'update'
      ? api.update(variables.id, variables.input)
      : api.create(variables.input),
    onMutate: () => { setSuccess(''); endMutation.reset(); },
    onSuccess: async () => { setDraft(null); setSuccess('Đã lưu phân công.'); await queryClient.invalidateQueries({ queryKey: ['assignments', kind] }); },
  });
  const endMutation = useMutation({
    mutationFn: () => api.end(endId!, toIso(endAt)),
    onMutate: () => { setSuccess(''); save.reset(); },
    onSuccess: async () => { setEndId(undefined); setEndAt(''); setSuccess('Đã kết thúc phân công; lịch sử vẫn được giữ lại.'); await queryClient.invalidateQueries({ queryKey: ['assignments', kind] }); },
  });
  const userNames = useMemo(() => new Map(users.data?.items.map((user) => [user.id, displayUser(user)])), [users.data]);
  const resourceNames = useMemo(() => new Map(resources.data?.items.map((resource) => [resource.id, `${resource.code} — ${resource.name}`])), [resources.data]);
  const activeResources = resources.data?.items.filter((resource) => resource.status === 'ACTIVE') ?? [];
  const filtered = Object.values(filters).some(Boolean);
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters((current) => ({ ...current, [key]: value })); setPage(1); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft?.userId || !draft.resourceId) return;
    if (draft.id && draft.original) {
      const input = buildTemporalAssignmentUpdate(draft, draft.original);
      if (!hasPatchChanges(input)) { save.reset(); endMutation.reset(); setSuccess('Không có thay đổi cần lưu.'); return; }
      save.mutate({ operation: 'update', id: draft.id, input });
      return;
    }
    save.mutate({ operation: 'create', input: { userId: draft.userId, resourceId: draft.resourceId, validFrom: toIso(draft.validFrom), validUntil: toIso(draft.validUntil), isPrimary: draft.isPrimary } });
  }
  function edit(row: RecordType) {
    setSuccess('');
    setDraft({ id: row.id, userId: row.userId, resourceId: isGroup ? (row as SubjectGroupMembershipRecord).subjectGroupId : (row as StaffSubjectRecord).subjectId, validFrom: toLocalInput(row.validFrom), validUntil: toLocalInput(row.validUntil), isPrimary: row.isPrimary, original: row });
  }
  return <div className="management-page temporal-ledger">
    <PageHeader eyebrow="Phân công có hiệu lực" title={title} action={<Button type="button" disabled={!canLookupUsers} onClick={() => { setSuccess(''); setDraft({ userId: '', resourceId: '', validFrom: '', validUntil: '', isPrimary: false }); }}>Tạo phân công</Button>}>Khoảng hiệu lực dùng quy tắc từ thời điểm bắt đầu đến trước thời điểm kết thúc.</PageHeader>
    {!canLookupUsers && <div className="limitation-note"><strong>Chưa thể tạo phân công.</strong> Tài khoản này không có quyền đọc danh sách người dùng; hệ thống không yêu cầu nhập mã kỹ thuật thay cho việc chọn người.</div>}
    <MutationNotice error={save.error ?? endMutation.error} success={success} />
    {draft && <form className="inline-work-form" onSubmit={submit}><h2>{draft.id ? 'Điều chỉnh hiệu lực' : 'Tạo phân công'}</h2><div className="form-grid">
      {draft.id ? <p><strong>Người:</strong> {userNames.get(draft.userId) ?? 'Mã kỹ thuật không tra cứu được'}</p> : <SelectField label="Người được phân công" id={`${kind}-user`} value={draft.userId} onChange={(event) => setDraft({ ...draft, userId: event.target.value })} required><option value="">Chọn người</option>{users.data?.items.map((user) => <option key={user.id} value={user.id}>{displayUser(user)}</option>)}</SelectField>}
      {draft.id ? <p><strong>{resourceLabel}:</strong> {resourceNames.get(draft.resourceId) ?? 'Mã kỹ thuật không tra cứu được'}</p> : <SelectField label={resourceLabel} id={`${kind}-resource`} value={draft.resourceId} onChange={(event) => setDraft({ ...draft, resourceId: event.target.value })} required><option value="">Chọn {resourceLabel.toLowerCase()}</option>{activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.code} — {resource.name}</option>)}</SelectField>}
      <FormField label="Có hiệu lực từ" name={`${kind}-from`} type="datetime-local" value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })} hint="Để trống khi muốn máy chủ dùng thời điểm mặc định." />
      <FormField label="Có hiệu lực đến" name={`${kind}-until`} type="datetime-local" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} hint="Thời điểm này không còn thuộc khoảng hiệu lực." />
    </div><label className="check-field"><input type="checkbox" checked={draft.isPrimary} onChange={(event) => setDraft({ ...draft, isPrimary: event.target.checked })} /> Phân công chính</label><div className="form-actions"><Button type="submit" loading={save.isPending}>Lưu phân công</Button><Button type="button" variant="quiet" onClick={() => setDraft(null)}>Hủy</Button></div></form>}
    <div className="filter-bar">
      {canLookupUsers && <SelectField label="Người" id={`${kind}-filter-user`} value={filters.userId} onChange={(event) => updateFilter('userId', event.target.value)}><option value="">Tất cả</option>{users.data?.items.map((user) => <option key={user.id} value={user.id}>{displayUser(user)}</option>)}</SelectField>}
      <SelectField label={resourceLabel} id={`${kind}-filter-resource`} value={filters.resourceId} onChange={(event) => updateFilter('resourceId', event.target.value)}><option value="">Tất cả</option>{resources.data?.items.map((resource) => <option key={resource.id} value={resource.id}>{resource.code} — {resource.name}</option>)}</SelectField>
      <SelectField label="Loại phân công" id={`${kind}-filter-primary`} value={filters.isPrimary} onChange={(event) => updateFilter('isPrimary', event.target.value)}><option value="">Tất cả</option><option value="true">Phân công chính</option><option value="false">Phân công khác</option></SelectField>
      <FormField label="Đang hiệu lực tại" name={`${kind}-active-at`} type="datetime-local" value={filters.activeAt} onChange={(event) => updateFilter('activeAt', event.target.value)} />
      {filtered && <Button type="button" variant="quiet" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Xóa bộ lọc</Button>}
    </div>
    {query.isPending ? <PageLoading /> : query.isError ? <QueryFailure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length === 0 ? <EmptyState filtered={filtered} title={filtered ? 'Không có phân công phù hợp bộ lọc' : 'Chưa có lịch sử phân công'} message={filtered ? 'Điều chỉnh người, danh mục, loại hoặc thời điểm rồi thử lại.' : 'Phân công mới và các lần đã kết thúc sẽ được ghi tại đây.'} /> : <><DataTable label={title} headings={['Người', resourceLabel, 'Hiệu lực', 'Loại', 'Trạng thái', 'Thao tác']}>{query.data.items.map((raw) => {
      const row = raw as RecordType;
      const resourceId = isGroup ? (row as SubjectGroupMembershipRecord).subjectGroupId : (row as StaffSubjectRecord).subjectId;
      const active = isActiveWindow(row.validFrom, row.validUntil);
      return <tr key={row.id}><td>{userNames.get(row.userId) ?? <><span>Không tra cứu được tên</span><small className="technical-value table-secondary">{row.userId}</small></>}</td><td>{resourceNames.get(resourceId) ?? <small className="technical-value">{resourceId}</small>}</td><td><span className="technical-value">{formatDateTime(row.validFrom)}</span><small className="table-secondary">đến {formatDateTime(row.validUntil)}</small></td><td>{row.isPrimary ? 'Phân công chính' : 'Phân công khác'}</td><td><StatusText active={active} /></td><td><div className="row-actions"><Button type="button" variant="quiet" onClick={() => edit(row)}>Sửa hiệu lực</Button>{active && (endId === row.id ? <><FormField label="Kết thúc lúc" name={`end-${row.id}`} type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /><Button type="button" variant="secondary" loading={endMutation.isPending} onClick={() => endMutation.mutate()}>Xác nhận kết thúc</Button><Button type="button" variant="quiet" onClick={() => setEndId(undefined)}>Hủy</Button></> : <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setEndId(row.id); }}>Kết thúc</Button>)}</div></td></tr>;
    })}</DataTable><Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} /></>}
  </div>;
}

function displayUser(user: UserManagementRecord) { return `${user.profile?.displayName ?? user.username}${user.profile?.staffCode ? ` — ${user.profile.staffCode}` : ''}`; }
