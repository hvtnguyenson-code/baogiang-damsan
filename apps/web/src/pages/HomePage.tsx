import { Link } from 'react-router-dom';
import { APP_NAME, SCHOOL_NAME, CURRENT_PHASE, REPOSITORY } from '@baogiang/config';
import { ActivityIcon, BookOpenIcon } from '../components/icons';

/**
 * HomePage - / route
 *
 * Displays system name, school unit, and phase status.
 * No business data, no role selectors, no demo content.
 */
export function HomePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Hero card */}
      <div className="card animate-fade-in">
        <div className="card-body text-center py-12">
          {/* Logo icon */}
          <div className="mx-auto w-16 h-16 bg-brand-700 rounded-2xl flex items-center justify-center shadow-md mb-6">
            <BookOpenIcon className="w-9 h-9 text-white" aria-hidden="true" />
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {APP_NAME}
          </h1>
          <p className="text-gray-500 font-medium mb-6">{SCHOOL_NAME}</p>

          {/* Phase badge */}
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-full text-sm font-semibold mb-8">
            <span className="status-dot status-dot-loading" aria-hidden="true" />
            {CURRENT_PHASE}
          </div>

          {/* Phase description */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-left mb-8">
            <h2 className="text-sm font-semibold text-amber-900 mb-2 uppercase tracking-wide">
              Thông báo — Giai đoạn khởi tạo
            </h2>
            <p className="text-sm text-amber-800 leading-relaxed">
              Hệ thống đang ở <strong>Phase 00 — Nền móng kỹ thuật</strong>.
              Chưa có chức năng nghiệp vụ nào hoạt động ở giai đoạn này.
              Đây là bước thiết lập kiến trúc, kết nối cơ sở dữ liệu và kiểm thử hạ tầng.
              Các chức năng như báo giảng, PPCT, bảng kê và phê duyệt sẽ được phát triển
              trong các phase tiếp theo.
            </p>
          </div>

          {/* CTA */}
          <Link
            to="/system-status"
            id="link-system-status"
            className="btn-primary inline-flex items-center gap-2"
          >
            <ActivityIcon className="w-4 h-4" aria-hidden="true" />
            Xem trạng thái hệ thống
          </Link>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoCard
          title="Repository"
          value={REPOSITORY}
          description="Mã nguồn dự án trên GitHub"
        />
        <InfoCard
          title="Phiên bản"
          value="0.0.1 — Phase 00"
          description="Nền móng kỹ thuật"
        />
        <InfoCard
          title="Công nghệ"
          value="React · NestJS · PostgreSQL"
          description="Stack kỹ thuật chính"
        />
        <InfoCard
          title="Trí tuệ nhân tạo"
          value="Chưa kích hoạt"
          description="AI sẽ được bổ sung ở phase cuối"
          valueClassName="text-gray-400"
        />
      </div>
    </div>
  );
}

interface InfoCardProps {
  title: string;
  value: string;
  description: string;
  valueClassName?: string;
}

function InfoCard({ title, value, description, valueClassName }: InfoCardProps) {
  return (
    <div className="card p-5">
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        {title}
      </dt>
      <dd className={`text-base font-semibold text-gray-900 mb-1 ${valueClassName ?? ''}`}>
        {value}
      </dd>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}
