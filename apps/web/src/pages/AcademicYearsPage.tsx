import type { AcademicYearRecord } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { DataTable, EmptyState, MutationNotice, PageHeader, PageLoading, Pagination, QueryFailure } from '../components/ui/management';
import { academicYearPatch, academicYearsApi, normalizeCode, type AcademicYearInput } from '../lib/academic-structure-api';
import { formatDateTime } from '../lib/display';

type Draft = AcademicYearInput & { id?: string; original?: AcademicYearRecord };
export function AcademicYearsPage() {
  const client = useQueryClient(); const [page, setPage] = useState(1); const [draft, setDraft] = useState<Draft>(); const [success, setSuccess] = useState('');
  const query = useQuery({ queryKey: ['academic-years', page], queryFn: () => academicYearsApi.list({ page, pageSize: 20 }) });
  const save = useMutation({ mutationFn: ({ id, input }: { id?: string; input: Partial<AcademicYearInput> }) => id ? academicYearsApi.update(id, input) : academicYearsApi.create(input as AcademicYearInput), onMutate: () => setSuccess(''), onSuccess: async () => { setDraft(undefined); setSuccess('Đã lưu năm học.'); await client.invalidateQueries({ queryKey: ['academic-years'] }); } });
  function submit(event: FormEvent) { event.preventDefault(); if (!draft) return; const input = draft.original ? academicYearPatch(draft, draft.original) : { code: normalizeCode(draft.code), name: draft.name.trim() }; if (!input.code && !input.name) { setDraft(undefined); return; } save.mutate({ id: draft.id, input }); }
  function edit(row: AcademicYearRecord) { setSuccess(''); setDraft({ id: row.id, code: row.code, name: row.name, original: row }); }
  return <div className="management-page academic-register">
    <PageHeader eyebrow="Sổ quản trị học vụ" title="Cấu trúc năm học" action={<Button type="button" onClick={() => setDraft({ code: '', name: '' })}>Tạo năm học</Button>}>Mở từng năm học để quản lý các phiên lịch bất biến và danh sách lớp. Không có thao tác xóa.</PageHeader>
    <MutationNotice error={save.error} success={success} />
    {draft && <form className="long-form" onSubmit={submit}><h2>{draft.id ? 'Chỉnh sửa năm học' : 'Tạo năm học'}</h2><div className="form-grid"><FormField label="Mã năm học" name="academic-year-code" maxLength={20} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required /><FormField label="Tên năm học" name="academic-year-name" maxLength={150} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></div><div className="form-actions"><Button type="submit" loading={save.isPending}>Lưu năm học</Button><Button type="button" variant="quiet" onClick={() => setDraft(undefined)}>Hủy</Button></div></form>}
    {query.isPending ? <PageLoading /> : query.isError ? <QueryFailure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length === 0 ? <EmptyState title="Chưa có năm học" message="Tạo năm học đầu tiên để bắt đầu sổ cấu trúc học vụ." /> : <><DataTable label="Sổ năm học" headings={['Mã / tên năm học', 'Cập nhật', 'Thao tác']}>{query.data.items.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small className="technical-value table-secondary">{row.code}</small></td><td>{formatDateTime(row.updatedAt)}</td><td><div className="row-actions"><Link className="button button--secondary" to={`/quan-tri/cau-truc-nam-hoc/${row.id}/lich`}>Mở năm học</Link><Button type="button" variant="quiet" onClick={() => edit(row)}>Sửa {row.code}</Button></div></td></tr>)}</DataTable><Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} /></>}
  </div>;
}
