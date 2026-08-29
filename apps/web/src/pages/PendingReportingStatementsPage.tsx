import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StatementListTable } from '../components/reporting-statements/ReportingPresentation';
import { EmptyState, PageHeader, PageLoading, Pagination, QueryFailure } from '../components/ui/management';
import { reportingStatementsApi } from '../lib/reporting-statements-api';

const PAGE_SIZE = 15;

export function PendingReportingStatementsPage() {
  const [page, setPage] = useState(1);
  const contextQuery = useQuery({ queryKey: ['reporting-workspace-context'], queryFn: () => reportingStatementsApi.workspaceContext() });
  const listQuery = useQuery({ queryKey: ['reporting-statements-pending', page], queryFn: () => reportingStatementsApi.listPendingDecision({ page, pageSize: PAGE_SIZE }) });
  const yearLabels = useMemo(() => new Map((contextQuery.data?.academicYears ?? []).map((year) => [year.id, `${year.name} (${year.code})`])), [contextQuery.data]);

  return <div className="reporting-page">
    <PageHeader eyebrow="Quy trình phê duyệt" title="Báo cáo chờ phê duyệt">Mở từng báo cáo để đọc bằng chứng đầy đủ trước khi quyết định.</PageHeader>
    <p className="limitation-note"><strong>Nguyên tắc:</strong> Hành động phê duyệt hoặc từ chối chỉ xuất hiện ở cuối bản chi tiết đã lưu, sau phần lịch sử.</p>
    {(contextQuery.isLoading || listQuery.isLoading) && <PageLoading />}
    {contextQuery.isError && <QueryFailure error={contextQuery.error} retry={() => void contextQuery.refetch()} />}
    {listQuery.isError && <QueryFailure error={listQuery.error} retry={() => void listQuery.refetch()} />}
    {listQuery.data?.items.length === 0 && <EmptyState title="Không có báo cáo đang chờ" message="Hàng đợi hiện không có báo cáo phù hợp để tài khoản này quyết định." />}
    {listQuery.data && listQuery.data.items.length > 0 && <><StatementListTable items={listQuery.data.items} academicYearLabels={yearLabels} /><Pagination page={page} pageSize={PAGE_SIZE} total={listQuery.data.total} onPage={setPage} /></>}
  </div>;
}
