import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StatementListTable } from '../components/reporting-statements/ReportingPresentation';
import { EmptyState, PageHeader, PageLoading, Pagination, QueryFailure } from '../components/ui/management';
import { reportingStatementsApi } from '../lib/reporting-statements-api';

const PAGE_SIZE = 15;

export function AccessibleReportingStatementsPage() {
  const [page, setPage] = useState(1);
  const contextQuery = useQuery({ queryKey: ['reporting-workspace-context'], queryFn: () => reportingStatementsApi.workspaceContext() });
  const listQuery = useQuery({ queryKey: ['reporting-statements-accessible', page], queryFn: () => reportingStatementsApi.listAccessible({ page, pageSize: PAGE_SIZE }) });
  const yearLabels = useMemo(() => new Map((contextQuery.data?.academicYears ?? []).map((year) => [year.id, `${year.name} (${year.code})`])), [contextQuery.data]);

  return <div className="reporting-page">
    <PageHeader eyebrow="Sổ báo cáo" title="Báo cáo được phép xem">Danh sách này do backend xác định theo phạm vi đọc đang có hiệu lực.</PageHeader>
    {(contextQuery.isLoading || listQuery.isLoading) && <PageLoading />}
    {contextQuery.isError && <QueryFailure error={contextQuery.error} retry={() => void contextQuery.refetch()} />}
    {listQuery.isError && <QueryFailure error={listQuery.error} retry={() => void listQuery.refetch()} />}
    {listQuery.data?.items.length === 0 && <EmptyState title="Chưa có báo cáo được phép xem" message="Không có báo cáo nào trong phạm vi backend cho phép tài khoản này đọc." />}
    {listQuery.data && listQuery.data.items.length > 0 && <><StatementListTable items={listQuery.data.items} academicYearLabels={yearLabels} /><Pagination page={page} pageSize={PAGE_SIZE} total={listQuery.data.total} onPage={setPage} /></>}
  </div>;
}
