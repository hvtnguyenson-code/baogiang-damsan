import type { AdditionalDutyDefinitionRecord, StaffAdditionalDutyAssignmentRecord } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { DataTable, EmptyState, MutationNotice, PageHeader, PageLoading, Pagination, QueryFailure, SelectField, StatusText, TextareaField } from '../components/ui/management';
import { hasSchoolCapability, subjectGroupResources } from '../lib/capabilities';
import { formatDateTime, isActiveWindow } from '../lib/display';
import { catalogApi, dutyAssignmentsApi, dutyDefinitionsApi, toIso, toLocalInput, usersApi } from '../lib/management-api';

type Draft = { id?: string; staffProfileId: string; dutyDefinitionId: string; scopeType: 'SCHOOL_WIDE' | 'SUBJECT_GROUP'; scopeResourceId: string; validFrom: string; validUntil: string; note: string };
type Filters = { staffProfileId: string; dutyDefinitionId: string; scopeType: string; scopeResourceId: string; activeAt: string };
const emptyFilters: Filters = { staffProfileId: '', dutyDefinitionId: '', scopeType: '', scopeResourceId: '', activeAt: '' };

export function DutyAssignmentsPage() {
  const { auth } = useAuth();
  const capabilities = auth?.capabilities ?? [];
  const schoolWide = hasSchoolCapability(capabilities, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE');
  const canUsers = hasSchoolCapability(capabilities, 'USER_MANAGE');
  const canGroups = hasSchoolCapability(capabilities, 'SUBJECT_GROUP_MANAGE');
  const canDutyCatalog = hasSchoolCapability(capabilities, 'ADDITIONAL_DUTY_CATALOG_MANAGE');
  const exactGroups = subjectGroupResources(capabilities, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [endId, setEndId] = useState<string>();
  const [endAt, setEndAt] = useState('');
  const [success, setSuccess] = useState('');
  const query = useQuery({
    queryKey: ['duty-assignments', { page, filters }],
    queryFn: () => dutyAssignmentsApi.list({
      page,
      pageSize: 20,
      staffProfileId: canUsers ? filters.staffProfileId : undefined,
      dutyDefinitionId: filters.dutyDefinitionId || undefined,
      scopeType: filters.scopeType || undefined,
      scopeResourceId: canGroups && filters.scopeType === 'SUBJECT_GROUP' ? filters.scopeResourceId || undefined : undefined,
      activeAt: toIso(filters.activeAt),
    }),
  });
  const options = useQuery({ queryKey: ['duty-definitions', 'options'], queryFn: () => dutyDefinitionsApi.options({ page: 1, pageSize: 100 }) });
  const definitionHistory = useQuery({ queryKey: ['duty-definitions', 'history-lookup'], queryFn: () => dutyDefinitionsApi.list({ page: 1, pageSize: 100 }), enabled: canDutyCatalog });
  const users = useQuery({ queryKey: ['users', 'duty-lookup'], queryFn: () => usersApi.list({ page: 1, pageSize: 100 }), enabled: canUsers });
  const groups = useQuery({ queryKey: ['catalog', 'groups', 'duty-history-lookup'], queryFn: () => catalogApi('subject-groups').list({ page: 1, pageSize: 100 }), enabled: canGroups });
  const staffNames = useMemo(() => new Map(users.data?.items.filter((user) => user.profile).map((user) => [user.profile!.id, `${user.profile!.displayName}${user.profile!.staffCode ? ` — ${user.profile!.staffCode}` : ''}`])), [users.data]);
  const dutyNames = useMemo(() => {
    const definitions: Array<Pick<AdditionalDutyDefinitionRecord, 'id' | 'code' | 'name'>> = [...(options.data?.items ?? []), ...(definitionHistory.data?.items ?? [])];
    return new Map(definitions.map((definition) => [definition.id, `${definition.code} — ${definition.name}`]));
  }, [definitionHistory.data, options.data]);
  const groupNames = useMemo(() => new Map(groups.data?.items.map((group) => [group.id, `${group.code} — ${group.name}`])), [groups.data]);
  const permittedGroups = (groups.data?.items ?? []).filter((group) => schoolWide || exactGroups.includes(group.id));
  const activePermittedGroups = permittedGroups.filter((group) => group.status === 'ACTIVE');
  const definitionFilters = mergeDefinitions(options.data?.items ?? [], definitionHistory.data?.items ?? []);
  const canCreate = canUsers && (schoolWide || (exactGroups.length > 0 && canGroups));
  const filtered = Object.values(filters).some(Boolean);
  const save = useMutation({
    mutationFn: (value: Draft) => value.id
      ? dutyAssignmentsApi.update(value.id, { validFrom: toIso(value.validFrom), validUntil: toIso(value.validUntil), note: value.note.trim() ? value.note : null })
      : dutyAssignmentsApi.create({ staffProfileId: value.staffProfileId, dutyDefinitionId: value.dutyDefinitionId, scopeType: value.scopeType, ...(value.scopeType === 'SUBJECT_GROUP' ? { scopeResourceId: value.scopeResourceId } : {}), validFrom: toIso(value.validFrom), validUntil: toIso(value.validUntil), ...(value.note.trim() ? { note: value.note } : {}) }),
    onMutate: () => { setSuccess(''); end.reset(); },
    onSuccess: async () => { setDraft(null); setSuccess('Đã lưu phân công kiêm nhiệm.'); await queryClient.invalidateQueries({ queryKey: ['duty-assignments'] }); },
  });
  const end = useMutation({
    mutationFn: () => dutyAssignmentsApi.end(endId!, toIso(endAt)),
    onMutate: () => { setSuccess(''); save.reset(); },
    onSuccess: async () => { setEndId(undefined); setEndAt(''); setSuccess('Đã kết thúc phân công; lịch sử vẫn được giữ.'); await queryClient.invalidateQueries({ queryKey: ['duty-assignments'] }); },
  });
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters((current) => ({ ...current, [key]: value, ...(key === 'scopeType' && value !== 'SUBJECT_GROUP' ? { scopeResourceId: '' } : {}) })); setPage(1); }
  function edit(row: StaffAdditionalDutyAssignmentRecord) { setSuccess(''); setDraft({ id: row.id, staffProfileId: row.staffProfileId, dutyDefinitionId: row.dutyDefinitionId, scopeType: row.scopeType === 'SUBJECT_GROUP' ? 'SUBJECT_GROUP' : 'SCHOOL_WIDE', scopeResourceId: row.scopeResourceId ?? '', validFrom: toLocalInput(row.validFrom), validUntil: toLocalInput(row.validUntil), note: row.note ?? '' }); }
  function submit(event: FormEvent) { event.preventDefault(); if (!draft || (!draft.id && (!draft.staffProfileId || !draft.dutyDefinitionId)) || (draft.scopeType === 'SUBJECT_GROUP' && !draft.scopeResourceId)) return; save.mutate(draft); }
  return <div className="management-page duty-ledger">
    <PageHeader eyebrow="Phân công kiêm nhiệm" title="Kiêm nhiệm nhân sự" action={<Button type="button" disabled={!canCreate} onClick={() => { setSuccess(''); setDraft({ staffProfileId: '', dutyDefinitionId: '', scopeType: schoolWide ? 'SCHOOL_WIDE' : 'SUBJECT_GROUP', scopeResourceId: exactGroups[0] ?? '', validFrom: '', validUntil: '', note: '' }); }}>Tạo phân công</Button>}>Danh sách được máy chủ giới hạn theo đúng phạm vi được giao. Kiêm nhiệm không tự cấp quyền hệ thống.</PageHeader>
    {!canCreate && <div className="limitation-note"><strong>Chưa thể tạo phân công mới.</strong> Cần quyền tra cứu nhân sự và danh mục tổ phù hợp; giao diện không yêu cầu nhập UUID thô.</div>}
    <MutationNotice error={save.error ?? end.error} success={success} />
    {draft && <form className="long-form" onSubmit={submit}><h2>{draft.id ? 'Điều chỉnh phân công' : 'Tạo phân công kiêm nhiệm'}</h2><div className="form-grid">
      {draft.id ? <p><strong>Nhân sự:</strong> {staffNames.get(draft.staffProfileId) ?? 'Không tra cứu được tên'}</p> : <SelectField label="Nhân sự" id="duty-staff" value={draft.staffProfileId} onChange={(event) => setDraft({ ...draft, staffProfileId: event.target.value })} required><option value="">Chọn nhân sự</option>{users.data?.items.filter((user) => user.profile).map((user) => <option key={user.profile!.id} value={user.profile!.id}>{user.profile!.displayName} — {user.profile!.staffCode ?? user.username}</option>)}</SelectField>}
      {draft.id ? <p><strong>Loại kiêm nhiệm:</strong> {dutyNames.get(draft.dutyDefinitionId) ?? <span className="technical-value">{draft.dutyDefinitionId}</span>}</p> : <SelectField label="Loại kiêm nhiệm" id="duty-definition" value={draft.dutyDefinitionId} onChange={(event) => setDraft({ ...draft, dutyDefinitionId: event.target.value })} required><option value="">Chọn loại</option>{options.data?.items.map((definition) => <option key={definition.id} value={definition.id}>{definition.code} — {definition.name}</option>)}</SelectField>}
      {!draft.id && <SelectField label="Phạm vi" id="duty-scope" value={draft.scopeType} onChange={(event) => setDraft({ ...draft, scopeType: event.target.value as Draft['scopeType'], scopeResourceId: '' })}><option value="SCHOOL_WIDE" disabled={!schoolWide}>Toàn trường</option><option value="SUBJECT_GROUP">Tổ chuyên môn</option></SelectField>}
      {draft.scopeType === 'SUBJECT_GROUP' && (draft.id ? <p><strong>Tổ:</strong> {groupNames.get(draft.scopeResourceId) ?? <span className="technical-value">{draft.scopeResourceId}</span>}</p> : <SelectField label="Tổ chuyên môn" id="duty-group" value={draft.scopeResourceId} onChange={(event) => setDraft({ ...draft, scopeResourceId: event.target.value })} required><option value="">Chọn tổ</option>{activePermittedGroups.map((group) => <option key={group.id} value={group.id}>{group.code} — {group.name}</option>)}</SelectField>)}
      <FormField label="Có hiệu lực từ" name="duty-assignment-from" type="datetime-local" value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })} />
      <FormField label="Có hiệu lực đến" name="duty-assignment-until" type="datetime-local" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} />
    </div><TextareaField label="Ghi chú" id="duty-assignment-note" rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /><div className="form-actions"><Button type="submit" loading={save.isPending}>Lưu phân công</Button><Button type="button" variant="quiet" onClick={() => setDraft(null)}>Hủy</Button></div></form>}
    <div className="filter-bar">
      {canUsers && <SelectField label="Nhân sự" id="duty-filter-staff" value={filters.staffProfileId} onChange={(event) => updateFilter('staffProfileId', event.target.value)}><option value="">Tất cả</option>{users.data?.items.filter((user) => user.profile).map((user) => <option key={user.profile!.id} value={user.profile!.id}>{user.profile!.displayName} — {user.profile!.staffCode ?? user.username}</option>)}</SelectField>}
      <SelectField label="Loại kiêm nhiệm" id="duty-filter-definition" value={filters.dutyDefinitionId} onChange={(event) => updateFilter('dutyDefinitionId', event.target.value)}><option value="">Tất cả</option>{definitionFilters.map((definition) => <option key={definition.id} value={definition.id}>{definition.code} — {definition.name}</option>)}</SelectField>
      <SelectField label="Phạm vi" id="duty-filter-scope" value={filters.scopeType} onChange={(event) => updateFilter('scopeType', event.target.value)}><option value="">Tất cả</option><option value="SCHOOL_WIDE">Toàn trường</option><option value="SUBJECT_GROUP">Tổ chuyên môn</option></SelectField>
      {canGroups && filters.scopeType === 'SUBJECT_GROUP' && <SelectField label="Tổ chuyên môn" id="duty-filter-group" value={filters.scopeResourceId} onChange={(event) => updateFilter('scopeResourceId', event.target.value)}><option value="">Tất cả tổ được phép</option>{permittedGroups.map((group) => <option key={group.id} value={group.id}>{group.code} — {group.name}</option>)}</SelectField>}
      <FormField label="Đang hiệu lực tại" name="duty-assignment-active" type="datetime-local" value={filters.activeAt} onChange={(event) => updateFilter('activeAt', event.target.value)} />
      {filtered && <Button type="button" variant="quiet" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Xóa bộ lọc</Button>}
    </div>
    {query.isPending ? <PageLoading /> : query.isError ? <QueryFailure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length === 0 ? <EmptyState filtered={filtered} title={filtered ? 'Không có kiêm nhiệm phù hợp bộ lọc' : 'Chưa có phân công kiêm nhiệm'} message={filtered ? 'Điều chỉnh nhân sự, loại, phạm vi hoặc thời điểm rồi thử lại.' : 'Các phân công đã kết thúc vẫn được giữ trong sổ lịch sử.'} /> : <><DataTable label="Danh sách phân công kiêm nhiệm" headings={['Nhân sự', 'Kiêm nhiệm', 'Phạm vi', 'Hiệu lực', 'Ghi chú', 'Trạng thái', 'Thao tác']}>{query.data.items.map((row) => {
      const active = isActiveWindow(row.validFrom, row.validUntil);
      return <tr key={row.id}><td>{staffNames.get(row.staffProfileId) ?? <><span>Không tra cứu được tên</span><small className="technical-value table-secondary">{row.staffProfileId}</small></>}</td><td>{dutyNames.get(row.dutyDefinitionId) ?? <small className="technical-value">{row.dutyDefinitionId}</small>}</td><td>{row.scopeType === 'SCHOOL_WIDE' ? 'Toàn trường' : groupNames.get(row.scopeResourceId ?? '') ?? <><span>Tổ được giao</span>{row.scopeResourceId && <small className="technical-value table-secondary">{row.scopeResourceId}</small>}</>}</td><td>{formatDateTime(row.validFrom)}<small className="table-secondary">đến {formatDateTime(row.validUntil)}</small></td><td>{row.note ?? '—'}</td><td><StatusText active={active} /></td><td><div className="row-actions"><Button type="button" variant="quiet" onClick={() => edit(row)}>Sửa hiệu lực</Button>{active && (endId === row.id ? <><FormField label="Kết thúc lúc" name={`duty-end-${row.id}`} type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /><Button type="button" variant="secondary" loading={end.isPending} onClick={() => end.mutate()}>Xác nhận kết thúc</Button><Button type="button" variant="quiet" onClick={() => setEndId(undefined)}>Hủy</Button></> : <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setEndId(row.id); }}>Kết thúc</Button>)}</div></td></tr>;
    })}</DataTable><Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} /></>}
  </div>;
}

function mergeDefinitions(active: AdditionalDutyDefinitionRecord[], history: AdditionalDutyDefinitionRecord[]) {
  return Array.from(new Map([...active, ...history].map((definition) => [definition.id, definition])).values());
}
