import { Link } from 'react-router-dom';
import { PublicFrame } from '../layouts/AppLayout';

export function AccessDeniedPage() {
  return (
    <PublicFrame>
      <main id="main-content" className="page-width route-state" tabIndex={-1}>
        <section className="recovery-state" aria-labelledby="denied-title">
          <div className="margin-rail" aria-hidden="true" />
          <div><p className="utility-label">Quyền truy cập</p><h1 id="denied-title">Bạn không có quyền thực hiện thao tác này</h1><p>Phiên đăng nhập vẫn còn hiệu lực. Hãy quay lại phần công việc được cấp.</p><Link className="text-link" to="/">Về không gian làm việc</Link></div>
        </section>
      </main>
    </PublicFrame>
  );
}
