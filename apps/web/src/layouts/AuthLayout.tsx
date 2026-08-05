import { APP_NAME_SHORT, SCHOOL_NAME } from '@baogiang/config';
import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="auth-frame">
      <a className="skip-link" href="#main-content">Đến biểu mẫu</a>
      <header className="auth-masthead">
        <div className="auth-width identity-lockup">
          <span className="identity-lockup__mark" aria-hidden="true">BG</span>
          <div>
            <p className="identity-lockup__product">{APP_NAME_SHORT}</p>
            <p className="identity-lockup__school">{SCHOOL_NAME}</p>
          </div>
        </div>
      </header>
      <main id="main-content" className="auth-width auth-main" tabIndex={-1}>
        <section className="auth-context" aria-labelledby="auth-context-title">
          <div className="auth-context__rail" aria-hidden="true" />
          <p className="utility-label">Sổ công tác Đam San</p>
          <h1 id="auth-context-title">Một phiên làm việc rõ ràng, đúng phạm vi.</h1>
          <p>Đăng nhập để tiếp tục công việc được giao. Quyền truy cập được hệ thống kiểm tra theo từng phạm vi.</p>
          <dl className="auth-context__ledger">
            <div><dt>Phiên</dt><dd>Được bảo vệ trong trình duyệt</dd></div>
            <div><dt>Quyền</dt><dd>Theo phạm vi công việc được giao</dd></div>
            <div><dt>Hỗ trợ</dt><dd><Link to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống</Link></dd></div>
          </dl>
        </section>
        <div className="auth-form-region"><Outlet /></div>
      </main>
    </div>
  );
}
