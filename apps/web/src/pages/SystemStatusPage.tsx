import type { HealthCheckDetail, HealthLiveResponse, HealthReadyResponse } from '@baogiang/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { InlineAlert, LoadingState } from '../components/ui/feedback';
import { PublicFrame } from '../layouts/AppLayout';
import { fetchHealthLive, fetchHealthReady } from '../lib/api-client';

export function SystemStatusPage() {
  const liveQuery = useQuery<HealthLiveResponse, Error>({ queryKey: ['health', 'live'], queryFn: fetchHealthLive, refetchInterval: 30_000 });
  const readyQuery = useQuery<HealthReadyResponse, Error>({ queryKey: ['health', 'ready'], queryFn: fetchHealthReady, refetchInterval: 30_000 });
  const isLoading = liveQuery.isLoading || readyQuery.isLoading;
  const hasError = liveQuery.isError || readyQuery.isError;
  const allReady = liveQuery.data?.status === 'ok' && readyQuery.data?.status === 'ok';
  const retry = () => { void liveQuery.refetch(); void readyQuery.refetch(); };

  return (
    <PublicFrame>
      <main id="main-content" className="page-width status-page" tabIndex={-1}>
        <header className="page-heading page-heading--rail">
          <div className="margin-rail" aria-hidden="true" />
          <div>
            <p className="utility-label">Chẩn đoán công khai</p>
            <h1>Trạng thái hệ thống</h1>
            <p>Kiểm tra khả năng phục vụ của API và kết nối dữ liệu, không hiển thị thông tin cấu hình nội bộ.</p>
          </div>
        </header>

        <div className="status-toolbar">
          <StatusSummary loading={isLoading} error={hasError} ready={allReady} />
          <Button id="btn-retry-status" type="button" variant="secondary" loading={isLoading} onClick={retry}>Tải lại trạng thái</Button>
        </div>

        {isLoading && <LoadingState label="Đang kiểm tra trạng thái" />}
        {!isLoading && (
          <section className="status-ledger" aria-label="Các thành phần hệ thống">
            <StatusRow title="API" description="Tiến trình phục vụ yêu cầu" status={liveQuery.data?.status} error={liveQuery.isError} details={liveQuery.data ? [
              ['Phiên bản', liveQuery.data.version],
              ['Thời gian hoạt động', formatUptime(liveQuery.data.uptime)],
              ['Kiểm tra lúc', formatTimestamp(liveQuery.data.timestamp)],
            ] : []} />
            <StatusRow title="Cơ sở dữ liệu" description="Khả năng kết nối PostgreSQL" status={readyQuery.data?.checks.database.status} error={readyQuery.isError} details={buildDbDetails(readyQuery.data?.checks.database)} />
          </section>
        )}

        <p className="status-page__back"><Link className="text-link" to="/">Về không gian làm việc</Link></p>
      </main>
    </PublicFrame>
  );
}

function StatusSummary({ loading, error, ready }: { loading: boolean; error: boolean; ready: boolean }) {
  if (loading) return <p className="status-summary">Đang lấy trạng thái mới nhất…</p>;
  if (error) return <InlineAlert title="Không thể kết nối" tone="error">Hệ thống chưa trả lời. Bạn có thể tải lại sau ít phút.</InlineAlert>;
  if (ready) return <InlineAlert title="Hệ thống hoạt động bình thường" tone="success">API và cơ sở dữ liệu đều sẵn sàng.</InlineAlert>;
  return <InlineAlert title="Hệ thống chưa sẵn sàng hoàn toàn" tone="warning">Một hoặc nhiều thành phần đang ở trạng thái suy giảm.</InlineAlert>;
}

function StatusRow({ title, description, status, error, details }: {
  title: string;
  description: string;
  status?: string;
  error: boolean;
  details: Array<[string, string]>;
}) {
  const label = error ? 'Không kết nối' : status === 'ok' ? 'Sẵn sàng' : 'Chưa sẵn sàng';
  const tone = error ? 'error' : status === 'ok' ? 'ok' : 'warning';
  return (
    <article className="status-row">
      <div className="status-row__title"><h2>{title}</h2><p>{description}</p></div>
      <span className={`status-cue status-cue--${tone}`}><span aria-hidden="true">{status === 'ok' && !error ? '✓' : '!'}</span> {label}</span>
      <dl>{details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    </article>
  );
}

function buildDbDetails(detail?: HealthCheckDetail): Array<[string, string]> {
  if (!detail) return [];
  const details: Array<[string, string]> = [['Kết nối', detail.status === 'ok' ? 'Thành công' : 'Chưa thành công']];
  if (typeof detail.latencyMs === 'number') details.push(['Độ trễ', `${detail.latencyMs} ms`]);
  return details;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} giây`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`;
  return `${Math.floor(seconds / 3600)} giờ ${Math.floor((seconds % 3600) / 60)} phút`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Không xác định' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}
