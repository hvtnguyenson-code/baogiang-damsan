import { Link } from 'react-router-dom';
import { PublicFrame } from '../layouts/AppLayout';

export function AccessDeniedPage() {
  return (
    <PublicFrame>
      <main id="main-content" className="page-width route-state" tabIndex={-1}>
        <section className="recovery-state" aria-labelledby="denied-title">
          <div className="margin-rail" aria-hidden="true" />
          <div>
            <p className="utility-label">Quyền truy cập</p>
            <h1 id="denied-title">Bạn không có quyền thực hiện thao tác này</h1>
            <p>
              Phiên đăng nhập của bạn vẫn còn hiệu lực, nhưng tài khoản chưa được cấp quyền để truy cập vào
              địa chỉ này hoặc chức năng yêu cầu thẩm quyền bổ sung.
            </p>
            <p className="text-sm text-slate-600 mb-6">
              Nếu đây là phần việc thuộc nhiệm vụ công tác của bạn, vui lòng liên hệ Ban Giám hiệu hoặc
              cán bộ quản trị nhà trường để được rà soát và cấp phân công phù hợp.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link className="button button--primary" to="/">
                Về không gian làm việc
              </Link>
              <Link className="text-link" to="/trang-thai-he-thong">
                Kiểm tra trạng thái hệ thống
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
