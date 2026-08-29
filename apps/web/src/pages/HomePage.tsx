import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { accessibleManagementRoutes, accessibleProfessionalRoutes } from '../lib/capabilities';

export function HomePage() {
  const auth = useAuth();
  const professional = accessibleProfessionalRoutes(auth.auth);
  const management = accessibleManagementRoutes(auth.auth);
  const hasAssignedWork = professional.length > 0 || management.length > 0;
  return (
    <div className="workspace-page">
      <header className="page-heading page-heading--rail">
        <div className="margin-rail" aria-hidden="true" />
        <div>
          <p className="utility-label">Không gian làm việc</p>
          <h1>Chào {auth.auth?.user.displayName}</h1>
          <p>Đây là các khu vực công việc hiện có theo phạm vi được giao cho tài khoản của bạn.</p>
        </div>
      </header>

      <section className="ledger-section work-index" aria-labelledby="professional-work-heading">
        <h2 id="professional-work-heading">Mục lục công việc</h2>
        <h3>Công việc chuyên môn</h3>
        <ol>
          {professional.map((route, index) => <li key={route.to}><span className="technical-value">{String(index + 1).padStart(2, '0')}</span><Link to={route.to}>{route.label}</Link></li>)}
          {professional.length === 0 && <li><span className="technical-value">01</span><div><strong>Chưa có công việc chuyên môn</strong><p>Không có khu vực chuyên môn nào được cấp cho tài khoản này.</p></div></li>}
        </ol>
      </section>

      {management.length > 0 && <section className="ledger-section work-index" aria-labelledby="management-work-heading">
        <h2 id="management-work-heading">Quản trị</h2>
        <ol>{management.map((route, index) => <li key={route.to}><span className="technical-value">{String(index + 1).padStart(2, '0')}</span><Link to={route.to}>{route.label}</Link></li>)}</ol>
      </section>}

      {!hasAssignedWork && <p className="limitation-note">Bạn vẫn có thể xem hồ sơ cá nhân và trạng thái hệ thống.</p>}

      <section className="ledger-section work-index" aria-labelledby="personal-work-heading">
        <h2 id="personal-work-heading">Tài khoản</h2>
        <ol><li><span className="technical-value">01</span><Link to="/ho-so">Hồ sơ cá nhân</Link></li></ol>
      </section>

      <div className="workspace-actions">
        <Link className="text-link" id="link-system-status" to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}
