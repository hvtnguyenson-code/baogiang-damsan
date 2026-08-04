import { APP_NAME_SHORT, SCHOOL_NAME } from '@baogiang/config';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';

export function AppLayout() {
  const auth = useAuth();
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      <header className="masthead">
        <div className="page-width masthead__inner">
          <div className="identity-lockup">
            <span className="identity-lockup__mark" aria-hidden="true">BG</span>
            <div>
              <p className="identity-lockup__product">{APP_NAME_SHORT}</p>
              <p className="identity-lockup__school">{SCHOOL_NAME}</p>
            </div>
          </div>
          <div className="session-context">
            <span className="session-context__name">{auth.auth?.user.displayName}</span>
            <Button type="button" variant="quiet" loading={auth.isMutating} onClick={() => void auth.logout()}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Điều hướng chính">
        <div className="page-width primary-nav__links">
          <NavLink to="/" end>Không gian làm việc</NavLink>
          <NavLink to="/trang-thai-he-thong">Trạng thái hệ thống</NavLink>
        </div>
      </nav>
      <main id="main-content" className="page-width main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer"><div className="page-width">{SCHOOL_NAME}</div></footer>
    </div>
  );
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-frame">
      <a className="skip-link" href="#main-content">Bỏ qua phần đầu trang</a>
      <header className="public-header">
        <div className="page-width identity-lockup">
          <span className="identity-lockup__mark" aria-hidden="true">BG</span>
          <div>
            <p className="identity-lockup__product">{APP_NAME_SHORT}</p>
            <p className="identity-lockup__school">{SCHOOL_NAME}</p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
