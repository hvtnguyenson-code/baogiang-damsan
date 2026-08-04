import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

export function HomePage() {
  const auth = useAuth();
  return (
    <div className="workspace-page">
      <header className="page-heading page-heading--rail">
        <div className="margin-rail" aria-hidden="true" />
        <div>
          <p className="utility-label">Không gian làm việc</p>
          <h1>Chào {auth.auth?.user.displayName}</h1>
          <p>Nền tảng đăng nhập, phiên và phân quyền đã sẵn sàng cho các lát nghiệp vụ tiếp theo.</p>
        </div>
      </header>

      <section className="ledger-section" aria-labelledby="foundation-heading">
        <h2 id="foundation-heading">Trạng thái nền tảng</h2>
        <dl className="foundation-ledger">
          <div><dt>Phiên đăng nhập</dt><dd><span className="status-cue status-cue--ok">Sẵn sàng</span><span>Phiên hiện tại được xác minh trên máy chủ.</span></dd></div>
          <div><dt>Phân quyền</dt><dd><span className="status-cue status-cue--ok">Sẵn sàng</span><span>Quyền được đánh giá theo capability và phạm vi.</span></dd></div>
          <div><dt>Nghiệp vụ báo giảng</dt><dd><span className="status-cue status-cue--neutral">Chưa mở</span><span>Không có dữ liệu hoặc thao tác nghiệp vụ trong lát nền móng này.</span></dd></div>
        </dl>
      </section>

      <div className="workspace-actions">
        <Link className="text-link" id="link-system-status" to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}
