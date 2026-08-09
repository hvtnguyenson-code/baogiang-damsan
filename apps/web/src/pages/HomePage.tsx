import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { accessibleManagementRoutes } from '../lib/capabilities';

export function HomePage() {
  const auth = useAuth();
  const routes = accessibleManagementRoutes(auth.auth);
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

      <section className="ledger-section work-index" aria-labelledby="work-heading">
        <h2 id="work-heading">Mục lục công việc</h2>
        <ol>
          {routes.length > 0 ? routes.map((route, index) => <li key={route.to}><span className="technical-value">{String(index + 1).padStart(2, '0')}</span><Link to={route.to}>{route.label}</Link></li>) : <li><span className="technical-value">01</span><div><strong>Không có khu vực quản lý</strong><p>Bạn vẫn có thể xem hồ sơ cá nhân và trạng thái hệ thống.</p></div></li>}
          <li><span className="technical-value">{String(routes.length + 1).padStart(2, '0')}</span><Link to="/ho-so">Hồ sơ cá nhân</Link></li>
        </ol>
      </section>

      <div className="workspace-actions">
        <Link className="text-link" id="link-system-status" to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}
