import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import {
  canManageDutyAssignments,
  canReadAccessibleReporting,
  canReadEffectiveSchedule,
  canReadPersonalReporting,
  canReviewReportingStatements,
  canSubmitPersonalReporting,
} from '../lib/capabilities';
import {
  getAccessibleNavigationFamilies,
  type NavigationFamilyId,
} from '../lib/navigation-registry';
import { reportingStatementsApi } from '../lib/reporting-statements-api';

function familyHeaderClass(id: NavigationFamilyId): string {
  switch (id) {
    case 'my-work':
      return 'form-card-header--teal';
    case 'reporting-approval':
      return 'form-card-header--amber';
    case 'administration':
      return 'form-card-header--indigo';
    case 'teaching-operations':
      return 'form-card-header--blue';
    default:
      return '';
  }
}

export function HomePage() {
  const auth = useAuth();
  const capabilities = auth.auth?.capabilities ?? [];
  const accessibleFamilies = getAccessibleNavigationFamilies(capabilities);
  const userId = auth.auth?.user.id;

  const canReview = canReviewReportingStatements(capabilities);
  const canSubmitPersonal = canSubmitPersonalReporting(capabilities);
  const canReadPersonal = canReadPersonalReporting(capabilities);
  const canReport = canSubmitPersonal || canReadPersonal;
  const canSchedule = canReadEffectiveSchedule(capabilities);
  const canReadAccessible = canReadAccessibleReporting(capabilities);
  const canManageDuty = canManageDutyAssignments(capabilities);

  // Truy vấn số lượng báo cáo chờ phê duyệt (chỉ khi có thẩm quyền duyệt)
  const pendingQuery = useQuery({
    queryKey: ['home-pending-reports-count', userId],
    queryFn: () => reportingStatementsApi.listPendingDecision({ page: 1, pageSize: 1 }),
    enabled: Boolean(userId && canReview),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Truy vấn tổng số báo cáo cá nhân (chỉ khi có thẩm quyền đọc báo cáo cá nhân REPORTING_STATEMENT_READ/PERSONAL)
  const mineQuery = useQuery({
    queryKey: ['home-mine-reports-count', userId],
    queryFn: () => reportingStatementsApi.listMine({ page: 1, pageSize: 1 }),
    enabled: Boolean(userId && canReadPersonal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const hasAnyDuty = accessibleFamilies.length > 0;
  const hasActionQueue = canReview || canReport || canSchedule || canReadAccessible || canManageDuty;

  return (
    <div className="workspace-page">
      <header className="page-heading page-heading--rail">
        <div className="margin-rail" aria-hidden="true" />
        <div>
          <p className="utility-label">Bàn làm việc</p>
          <h1>Chào {auth.auth?.user.displayName}</h1>
          <p>Tổng hợp nhiệm vụ cần xử lý và các không gian làm việc chuyên môn theo thẩm quyền được cấp.</p>
        </div>
      </header>

      {/* KHU VỰC 1: VIỆC CẦN XỬ LÝ (ACTION QUEUE VỚI BẰNG CHỨNG XÁC THỰC) */}
      <section className="work-queue-section" aria-labelledby="work-queue-heading">
        <div className="form-card">
          <div className="form-card-header form-card-header--blue">
            <h2 id="work-queue-heading" className="text-sm font-bold m-0 uppercase tracking-wider text-white">
              Việc cần xử lý & Nhiệm vụ ưu tiên
            </h2>
          </div>
          <div className="form-card-body">
            {!hasActionQueue && !hasAnyDuty && (
              <div className="p-4 bg-slate-50 border border-slate-300 rounded-md">
                <p className="font-semibold text-slate-800 m-0">Tài khoản chưa được phân công nhiệm vụ chuyên môn</p>
                <p className="text-sm text-slate-600 mt-1 mb-3">
                  Tài khoản của bạn hiện chưa được phân công công việc giảng dạy hoặc quản trị cụ thể.
                  Hãy kiểm tra thông tin tại trang Hồ sơ cá nhân hoặc liên hệ cán bộ quản trị nhà trường để được phân công.
                </p>
                <Link to="/ho-so" className="button button--secondary">Xem hồ sơ cá nhân</Link>
              </div>
            )}

            <div className="work-queue-list">
              {/* 1. Hàng đợi phê duyệt cho BGH/PHT */}
              {canReview && (
                <div className="work-queue-item work-queue-item--review" data-testid="queue-item-approval">
                  <div className="work-queue-item__content">
                    <span className="technical-badge technical-badge--amber">Phê duyệt</span>
                    <h3 className="work-queue-item__title">Hàng đợi xem xét & phê duyệt báo cáo</h3>
                    {pendingQuery.isLoading && (
                      <p className="work-queue-item__status text-slate-500">Đang kiểm tra số lượng báo cáo chờ phê duyệt...</p>
                    )}
                    {pendingQuery.isError && (
                      <p className="work-queue-item__status text-amber-800 font-semibold">
                        Chưa thể tải số lượng báo cáo chờ phê duyệt. Bạn vẫn có thể mở hàng đợi để kiểm tra trực tiếp.
                      </p>
                    )}
                    {pendingQuery.isSuccess && (
                      <p className="work-queue-item__status">
                        {pendingQuery.data.total > 0 ? (
                          <strong className="text-amber-900">
                            Có {pendingQuery.data.total} báo cáo chờ phê duyệt chuyên môn.
                          </strong>
                        ) : (
                          <span className="text-slate-600">Không có báo cáo chờ phê duyệt.</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="work-queue-item__action">
                    <Link to="/phe-duyet-bao-cao" className="button button--primary">
                      Mở hàng đợi phê duyệt <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* 2. Nhiệm vụ Lịch dạy cá nhân */}
              {canSchedule && (
                <div className="work-queue-item" data-testid="queue-item-schedule">
                  <div className="work-queue-item__content">
                    <span className="technical-badge technical-badge--teal">Giảng dạy</span>
                    <h3 className="work-queue-item__title">Lịch dạy cá nhân</h3>
                    <p className="work-queue-item__status text-slate-600">
                      Xem thời khóa biểu, khung tiết và tiến độ giảng dạy tuần hiện tại.
                    </p>
                  </div>
                  <div className="work-queue-item__action">
                    <Link to="/lich-day" className="button button--secondary">
                      Xem lịch dạy <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* 3. Nhiệm vụ Báo cáo kê khai cá nhân */}
              {canReport && (
                <div className="work-queue-item" data-testid="queue-item-reporting">
                  <div className="work-queue-item__content">
                    <span className="technical-badge technical-badge--teal">Báo giảng</span>
                    <h3 className="work-queue-item__title">Báo cáo kê khai tiết dạy</h3>
                    {canReadPersonal ? (
                      <>
                        {mineQuery.isLoading && (
                          <p className="work-queue-item__status text-slate-500">Đang kiểm tra số liệu báo cáo cá nhân...</p>
                        )}
                        {mineQuery.isError && (
                          <p className="work-queue-item__status text-amber-800 font-semibold">
                            Chưa thể tải số lượng báo cáo cá nhân. Bạn vẫn có thể mở để kiểm tra chi tiết.
                          </p>
                        )}
                        {mineQuery.isSuccess && (
                          <p className="work-queue-item__status text-slate-700">
                            Số báo cáo của tôi: <strong>{mineQuery.data.total} bản ghi</strong> đã nộp hoặc đang quản lý.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="work-queue-item__status text-slate-700">
                        Lập và gửi báo cáo kê khai tiết dạy mới theo phân công chuyên môn.
                      </p>
                    )}
                  </div>
                  <div className="work-queue-item__action">
                    <Link to="/bao-cao-ke-khai" className="button button--secondary">
                      Mở báo cáo kê khai <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* 4. Giám sát Báo cáo chuyên môn được xem (Tổ trưởng / BGH) */}
              {canReadAccessible && (
                <div className="work-queue-item" data-testid="queue-item-accessible-reports">
                  <div className="work-queue-item__content">
                    <span className="technical-badge technical-badge--blue">Giám sát</span>
                    <h3 className="work-queue-item__title">Báo cáo chuyên môn được phép xem</h3>
                    <p className="work-queue-item__status text-slate-600">
                      Theo dõi và kiểm tra tình hình báo giảng của giáo viên theo phạm vi tổ bộ môn hoặc toàn trường.
                    </p>
                  </div>
                  <div className="work-queue-item__action">
                    <Link to="/bao-cao-ke-khai/duoc-xem" className="button button--secondary">
                      Xem báo cáo <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* 5. Phân công kiêm nhiệm theo tổ / trường */}
              {canManageDuty && (
                <div className="work-queue-item" data-testid="queue-item-duty-assignment">
                  <div className="work-queue-item__content">
                    <span className="technical-badge technical-badge--indigo">Kiêm nhiệm</span>
                    <h3 className="work-queue-item__title">Phân công kiêm nhiệm</h3>
                    <p className="work-queue-item__status text-slate-600">
                      Cập nhật và theo dõi phân công nhiệm vụ kiêm nhiệm trong phạm vi được giao.
                    </p>
                  </div>
                  <div className="work-queue-item__action">
                    <Link to="/quan-tri/kiem-nhiem/phan-cong" className="button button--secondary">
                      Vào phân công <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* KHU VỰC 2: TIẾP TỤC CÔNG VIỆC THEO 5 NHÓM ĐƯỢC CẤP */}
      {accessibleFamilies.length > 0 && (
        <section className="work-families-section mt-8" aria-labelledby="work-families-heading">
          <div className="mb-4">
            <h2 id="work-families-heading" className="text-xl font-bold text-slate-900 m-0">
              Tiếp tục công việc
            </h2>
            <p className="text-slate-600 text-sm mt-1">
              Các lối vào không gian công tác được phân nhóm theo thẩm quyền thực tế của bạn.
            </p>
          </div>

          <div className="space-y-6">
            {accessibleFamilies.map((family) => (
              <div key={family.id} className="form-card" data-testid={`family-card-${family.id}`}>
                <div className={`form-card-header ${familyHeaderClass(family.id)}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tracking-wide text-white uppercase">{family.title}</span>
                  </div>
                  <span className="text-xs text-white font-medium">{family.description}</span>
                </div>
                <div className="form-card-body p-0">
                  <ul className="divide-y divide-slate-200 m-0 p-0 list-none" role="list">
                    {family.items.map((item, index) => (
                      <li
                        key={item.to}
                        className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="technical-value text-xs text-slate-500 font-mono">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <Link
                              to={item.to}
                              className="font-semibold text-slate-900 hover:text-blue-700 underline-offset-2 hover:underline text-base"
                            >
                              {item.label}
                            </Link>
                          </div>
                          {item.actionHint && (
                            <p className="text-xs text-slate-600 mt-1 mb-0 pl-6">
                              {item.actionHint}
                            </p>
                          )}
                        </div>
                        <div className="pl-6 sm:pl-0 shrink-0">
                          <Link
                            to={item.to}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900 min-h-[44px]"
                          >
                            <span>Mở</span>
                            <span aria-hidden="true">→</span>
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KHU VỰC 3: TÀI KHOẢN VÀ HỆ THỐNG */}
      <section className="account-status-section mt-8 pt-6 border-t border-slate-300">
        <h2 className="text-lg font-bold text-slate-900 mb-3">Tài khoản & Hệ thống</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <Link to="/ho-so" className="button button--secondary">
            Hồ sơ cá nhân
          </Link>
          <Link to="/trang-thai-he-thong" id="link-system-status" className="button button--quiet">
            Kiểm tra trạng thái hệ thống <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
