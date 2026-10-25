import { Link } from 'react-router-dom';
import { PublicFrame } from '../layouts/AppLayout';

export function NotFoundPage() {
  return (
    <PublicFrame>
      <main id="main-content" className="page-width route-state" tabIndex={-1}>
        <section className="recovery-state" aria-labelledby="not-found-title">
          <div className="margin-rail" aria-hidden="true" />
          <div><p className="utility-label">Không tìm thấy trang</p><h1 id="not-found-title">Trang không tồn tại</h1><p>Kiểm tra lại đường dẫn hoặc về không gian làm việc để chọn chức năng được phép sử dụng.</p><Link id="link-go-home" className="text-link" to="/">Về không gian làm việc</Link></div>
        </section>
      </main>
    </PublicFrame>
  );
}
