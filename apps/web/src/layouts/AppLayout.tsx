import { APP_NAME_SHORT, SCHOOL_NAME } from '@baogiang/config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { LogoutNotice } from '../auth/logout-notice';
import { Button } from '../components/ui/button';
import { getAccessibleNavigationFamilies, type AccessibleFamily } from '../lib/navigation-registry';

export function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [expandedMobileFamilies, setExpandedMobileFamilies] = useState<Record<string, boolean>>({});
  const navRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const dropdownToggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const openDropdownIdRef = useRef<string | null>(null);
  const mobileMenuOpenRef = useRef(false);

  openDropdownIdRef.current = openDropdownId;
  mobileMenuOpenRef.current = mobileMenuOpen;

  const capabilities = auth.auth?.capabilities ?? [];
  const accessibleFamilies = getAccessibleNavigationFamilies(capabilities);

  const userInitials = auth.auth?.user.displayName
    ? auth.auth.user.displayName.trim().charAt(0).toUpperCase()
    : 'U';

  // Đóng mọi dropdown và mobile menu khi chuyển route
  useEffect(() => {
    setOpenDropdownId(null);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Đóng dropdown khi click outside hoặc ấn Escape (trả focus về nút kích hoạt)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (mobileMenuOpenRef.current) {
          setMobileMenuOpen(false);
          mobileMenuToggleRef.current?.focus();
        } else if (openDropdownIdRef.current) {
          const currentId = openDropdownIdRef.current;
          setOpenDropdownId(null);
          dropdownToggleRefs.current[currentId]?.focus();
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isFamilyActive = useCallback((family: AccessibleFamily): boolean => {
    return family.items.some((item) => {
      if (item.exactEnd) {
        return location.pathname === item.to;
      }
      if (item.isMatchActive) {
        return item.isMatchActive(location.pathname);
      }
      return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    });
  }, [location.pathname]);

  // Tự động mở accordion của nhóm đang active khi mở drawer
  useEffect(() => {
    if (mobileMenuOpen) {
      const activeFamily = accessibleFamilies.find(isFamilyActive);
      if (activeFamily) {
        setExpandedMobileFamilies((prev) => ({ ...prev, [activeFamily.id]: true }));
      }
    }
  }, [mobileMenuOpen, accessibleFamilies, isFamilyActive]);

  const toggleMobileFamily = (familyId: string) => {
    setExpandedMobileFamilies((prev) => ({
      ...prev,
      [familyId]: !prev[familyId],
    }));
  };

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
              <span className="session-context__role">Tài khoản làm việc</span>
            </div>
            <Button
              aria-label="Đăng xuất khỏi không gian làm việc"
              type="button"
              variant="quiet"
              loading={auth.isMutating}
              onClick={() => void auth.logout().catch(() => undefined)}
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <div className="page-width"><LogoutNotice /></div>
      <nav ref={navRef} className="primary-nav" aria-label="Điều hướng chính">
        <div className="page-width primary-nav__inner">
          <div className="primary-nav__links">
            <NavLink to="/" end className="primary-nav__root-link">
              Không gian làm việc
            </NavLink>

            {accessibleFamilies.map((family) => {
              const isOpen = openDropdownId === family.id;
              const active = isFamilyActive(family);
              return (
                <div key={family.id} className="primary-nav__group-container">
                  <button
                    ref={(el) => {
                      dropdownToggleRefs.current[family.id] = el;
                    }}
                    type="button"
                    className={`primary-nav__group-toggle ${active ? 'primary-nav__group-toggle--active' : ''}`}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    aria-controls={`nav-dropdown-${family.id}`}
                    onClick={() => setOpenDropdownId((prev) => (prev === family.id ? null : family.id))}
                  >
                    <span>{family.title}</span>
                    <span className="primary-nav__caret" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                  </button>
                  {isOpen && (
                    <div
                      id={`nav-dropdown-${family.id}`}
                      className="primary-nav__dropdown"
                      aria-label={family.title}
                    >
                      <div className="primary-nav__dropdown-header">
                        <p className="primary-nav__dropdown-title">{family.title}</p>
                        <p className="primary-nav__dropdown-desc">{family.description}</p>
                      </div>
                      <div className="primary-nav__dropdown-items">
                        {family.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.exactEnd}
                            className="primary-nav__dropdown-item"
                            onClick={() => setOpenDropdownId(null)}
                          >
                            <span className="primary-nav__item-label">{item.label}</span>
                            {item.actionHint && (
                              <span className="primary-nav__item-hint" aria-hidden="true">{item.actionHint}</span>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <NavLink to="/ho-so" className="primary-nav__root-link">
              Hồ sơ
            </NavLink>
            <NavLink to="/trang-thai-he-thong" className="primary-nav__root-link">
              Trạng thái hệ thống
            </NavLink>
          </div>

          <button
            ref={mobileMenuToggleRef}
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
          <div className="primary-nav__mobile-menu" aria-label="Thực đơn di động">
            <div className="page-width py-3 space-y-4">
              <div className="mobile-nav-section">
                <span className="mobile-nav-section__title">Không gian chung</span>
                <div className="mobile-nav-section__links">
                  <NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Không gian làm việc
                  </NavLink>
                  <NavLink to="/ho-so" onClick={() => setMobileMenuOpen(false)} className="mobile-nav-link">
                    Hồ sơ cá nhân
                  </NavLink>
                </div>
              </div>

              {accessibleFamilies.map((family) => {
                const isExpanded = Boolean(expandedMobileFamilies[family.id]);
                return (
                  <div key={family.id} className="mobile-nav-section">
                    <button
                      type="button"
                      className="mobile-nav-accordion__trigger"
                      aria-expanded={isExpanded}
                      aria-controls={`mobile-family-items-${family.id}`}
                      onClick={() => toggleMobileFamily(family.id)}
                    >
                      <span className="mobile-nav-accordion__title">{family.title}</span>
                      <span className="mobile-nav-accordion__caret" aria-hidden="true">
                        {isExpanded ? '▴' : '▾'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div id={`mobile-family-items-${family.id}`} className="mobile-nav-section__links">
                        {family.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.exactEnd}
                            onClick={() => setMobileMenuOpen(false)}
                            className="mobile-nav-link"
                          >
                            <span className="mobile-nav-link__label">{item.label}</span>
                            {item.actionHint && (
                              <span className="mobile-nav-link__hint" aria-hidden="true">{item.actionHint}</span>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="mobile-nav-section">
                <NavLink
                  to="/trang-thai-he-thong"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mobile-nav-link mobile-nav-link--system"
                >
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
      <footer className="site-footer">
        <div className="page-width">
          {SCHOOL_NAME} • Hệ thống Quản lý Báo giảng & Chuẩn hóa Chuyên môn
        </div>
      </footer>
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
