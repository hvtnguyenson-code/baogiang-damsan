import { APP_NAME_SHORT, SCHOOL_NAME } from '@baogiang/config';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { LogoutNotice } from '../auth/logout-notice';
import { Button } from '../components/ui/button';
import { accessibleManagementRoutes, accessibleProfessionalRoutes } from '../lib/capabilities';

export function AppLayout() {
  const auth = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const management = accessibleManagementRoutes(auth.auth);
  const professional = accessibleProfessionalRoutes(auth.auth);
  const userInitials = auth.auth?.user.displayName
    ? auth.auth.user.displayName.trim().charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      <header className="masthead">
        <div className="page-width masthead__inner">
          <div className="identity-lockup">
            <span className="identity-lockup__mark" aria-hidden="true">BG</span>
            <div>
              <div className="identity-lockup__title-row">
                <p className="identity-lockup__product">{APP_NAME_SHORT}</p>
              </div>
              <p className="identity-lockup__school">{SCHOOL_NAME}</p>
            </div>
          </div>
          <div className="session-context">
            <div className="session-context__avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div className="session-context__details">
              <span className="session-context__name">{auth.auth?.user.displayName}</span>
              <span className="session-context__role">Không gian quản trị</span>
            </div>
            <Button aria-label="Đăng xuất khỏi không gian làm việc" type="button" variant="quiet" loading={auth.isMutating} onClick={() => void auth.logout().catch(() => undefined)}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <div className="page-width"><LogoutNotice /></div>
      <nav className="primary-nav" aria-label="Điều hướng chính">
        <div className="page-width primary-nav__inner">
          <div className="primary-nav__links">
            <NavLink to="/" end>Không gian làm việc</NavLink>
            <NavLink to="/ho-so">Hồ sơ</NavLink>
            {professional.map((route) => <NavLink key={route.to} to={route.to} end={route.to === '/bao-cao-ke-khai'}>{route.label}</NavLink>)}
            {management.map((route) => <NavLink key={route.to} to={route.to}>{route.label}</NavLink>)}
            <NavLink to="/trang-thai-he-thong">Trạng thái hệ thống</NavLink>
          </div>
          <button
            type="button"
            className="primary-nav__mobile-toggle"
            aria-expanded={mobileMenuOpen}
            aria-label="Chuyển đổi thực đơn điều hướng"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? '✕ Đóng' : '☰ Thực đơn'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="primary-nav__mobile-menu">
            <div className="page-width py-3 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block mb-1">Không gian cá nhân</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">Không gian làm việc</NavLink>
                  <NavLink to="/ho-so" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">Hồ sơ</NavLink>
                </div>
              </div>
              {professional.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Chuyên môn & Báo cáo</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {professional.map((route) => (
                      <NavLink key={route.to} to={route.to} end={route.to === '/bao-cao-ke-khai'} onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                        {route.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
              {management.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Quản trị & Phân công</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {management.map((route) => (
                      <NavLink key={route.to} to={route.to} onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                        {route.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <NavLink to="/trang-thai-he-thong" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link text-slate-300">
                  Trạng thái hệ thống
                </NavLink>
              </div>
            </div>
          </div>
        )}
      </nav>
      <main id="main-content" className="page-width main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer"><div className="page-width">{SCHOOL_NAME} • Hệ thống Quản lý Báo giảng & Chuẩn hóa Chuyên môn</div></footer>
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
