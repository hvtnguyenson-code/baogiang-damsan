import { useQuery } from '@tanstack/react-query';
import type { HealthLiveResponse, HealthReadyResponse, HealthCheckDetail } from '@baogiang/contracts';
import { fetchHealthLive, fetchHealthReady } from '../lib/api-client';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '../components/icons';

/**
 * SystemStatusPage - /system-status route
 *
 * Calls /api/health/live and /api/health/ready.
 * Displays status, loading, error, and retry states.
 * All text in Vietnamese for end users.
 */
export function SystemStatusPage() {
  const liveQuery = useQuery<HealthLiveResponse, Error>({
    queryKey: ['health', 'live'],
    queryFn: fetchHealthLive,
    refetchInterval: 30_000,
  });

  const readyQuery = useQuery<HealthReadyResponse, Error>({
    queryKey: ['health', 'ready'],
    queryFn: fetchHealthReady,
    refetchInterval: 30_000,
  });

  const isLoading = liveQuery.isLoading || readyQuery.isLoading;
  const hasError = liveQuery.isError || readyQuery.isError;

  const handleRetry = () => {
    void liveQuery.refetch();
    void readyQuery.refetch();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trạng thái hệ thống</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kiểm tra kết nối API và cơ sở dữ liệu
          </p>
        </div>
        <button
          id="btn-retry-status"
          onClick={handleRetry}
          disabled={isLoading}
          className="btn-secondary flex items-center gap-1.5 text-sm"
          aria-label="Tải lại trạng thái"
        >
          <ArrowPathIcon
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Tải lại
        </button>
      </div>

      {/* Overall status banner */}
      {!isLoading && (
        <StatusBanner
          hasError={hasError}
          isReady={readyQuery.data?.status === 'ok'}
          apiOk={liveQuery.data?.status === 'ok'}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          className="card card-body text-center py-12"
          role="status"
          aria-label="Đang kiểm tra trạng thái"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 font-medium">Đang kiểm tra hệ thống...</p>
            <p className="text-gray-400 text-sm">Vui lòng chờ trong giây lát</p>
          </div>
        </div>
      )}

      {/* API Liveness card */}
      <StatusCard
        title="API — Tiến trình"
        description="Kiểm tra tiến trình API có đang hoạt động không"
        isLoading={liveQuery.isLoading}
        isError={liveQuery.isError}
        errorMessage={liveQuery.error?.message}
        status={liveQuery.data?.status}
        details={
          liveQuery.data
            ? [
                { label: 'Phiên bản', value: liveQuery.data.version },
                { label: 'Giai đoạn', value: liveQuery.data.phase },
                {
                  label: 'Thời gian hoạt động',
                  value: formatUptime(liveQuery.data.uptime),
                },
                {
                  label: 'Thời điểm kiểm tra',
                  value: formatTimestamp(liveQuery.data.timestamp),
                },
              ]
            : []
        }
      />

      {/* Database Readiness card */}
      <StatusCard
        title="Cơ sở dữ liệu — PostgreSQL"
        description="Kiểm tra kết nối đến PostgreSQL bằng truy vấn SELECT 1"
        isLoading={readyQuery.isLoading}
        isError={readyQuery.isError}
        errorMessage={readyQuery.error?.message}
        status={readyQuery.data?.checks?.database?.status}
        details={
          readyQuery.data
            ? buildDbDetails(readyQuery.data.checks.database)
            : []
        }
        dbDetail={readyQuery.data?.checks?.database}
      />
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

interface StatusBannerProps {
  hasError: boolean;
  isReady: boolean;
  apiOk: boolean;
}

function StatusBanner({ hasError, isReady, apiOk }: StatusBannerProps) {
  if (hasError) {
    return (
      <div
        className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4"
        role="alert"
        aria-live="polite"
      >
        <XCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-red-900">Không kết nối được API</p>
          <p className="text-sm text-red-700 mt-0.5">
            Kiểm tra API đang chạy tại{' '}
            <code className="font-mono text-xs bg-red-100 px-1 py-0.5 rounded">
              http://127.0.0.1:3100
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (apiOk && isReady) {
    return (
      <div
        className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4"
        role="status"
        aria-live="polite"
      >
        <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-green-900">Hệ thống hoạt động bình thường</p>
          <p className="text-sm text-green-700 mt-0.5">
            API và cơ sở dữ liệu đều sẵn sàng
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4"
      role="status"
      aria-live="polite"
    >
      <span className="status-dot status-dot-warning mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold text-yellow-900">Hệ thống chưa sẵn sàng hoàn toàn</p>
        <p className="text-sm text-yellow-700 mt-0.5">
          Một hoặc nhiều thành phần chưa kết nối được
        </p>
      </div>
    </div>
  );
}

interface DetailItem {
  label: string;
  value: string;
}

interface StatusCardProps {
  title: string;
  description: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  status?: string;
  details: DetailItem[];
  dbDetail?: HealthCheckDetail;
}

function StatusCard({
  title,
  description,
  isLoading,
  isError,
  errorMessage,
  status,
  details,
}: StatusCardProps) {
  const isOk = status === 'ok';

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <StatusIndicator isLoading={isLoading} isError={isError} isOk={isOk} />
      </div>
      <div className="card-body">
        {isLoading && (
          <p className="text-sm text-gray-500">Đang kiểm tra...</p>
        )}
        {isError && (
          <div className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3">
            <p className="font-medium">Lỗi kết nối</p>
            <p className="mt-1 text-xs font-mono text-red-600 break-all">
              {errorMessage ?? 'Không xác định được lỗi'}
            </p>
          </div>
        )}
        {!isLoading && !isError && details.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

interface StatusIndicatorProps {
  isLoading: boolean;
  isError: boolean;
  isOk: boolean;
}

function StatusIndicator({ isLoading, isError, isOk }: StatusIndicatorProps) {
  if (isLoading) {
    return <span className="badge badge-neutral">Đang kiểm tra</span>;
  }
  if (isError) {
    return <span className="badge badge-error">Lỗi kết nối</span>;
  }
  if (isOk) {
    return <span className="badge badge-ok">Hoạt động bình thường</span>;
  }
  return <span className="badge badge-warning">Chưa sẵn sàng</span>;
}

// ============================================================
// Helpers
// ============================================================

function buildDbDetails(detail: HealthCheckDetail): DetailItem[] {
  const items: DetailItem[] = [];
  items.push({
    label: 'Trạng thái',
    value: detail.status === 'ok' ? 'Kết nối thành công' : 'Không kết nối được',
  });
  if (typeof detail.latencyMs === 'number') {
    items.push({ label: 'Độ trễ', value: `${detail.latencyMs} ms` });
  }
  if (detail.message) {
    items.push({ label: 'Chi tiết lỗi', value: detail.message });
  }
  return items;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} giây`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`;
  return `${Math.floor(seconds / 3600)} giờ ${Math.floor((seconds % 3600) / 60)} phút`;
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('vi-VN');
  } catch {
    return isoString;
  }
}
