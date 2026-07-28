import type { ReactNode } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { APP_NAME_SHORT, SCHOOL_NAME } from '@baogiang/config';
import { BookOpenIcon, ActivityIcon } from '../components/icons';

/**
 * AppLayout - main shell layout.
 * Provides: header with branding, navigation tabs, content area.
 * No role selector. No demo data. Accessible structure.
 */
export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="container-app h-16 flex items-center justify-between">
          {/* Branding */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-700 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <BookOpenIcon className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 leading-tight tracking-tight truncate">
                {APP_NAME_SHORT}
              </h1>
              <p className="text-xs text-gray-500 font-medium hidden sm:block">
                {SCHOOL_NAME}
              </p>
            </div>
          </div>

          {/* Phase badge */}
          <span className="badge badge-info text-xs hidden sm:inline-flex">
            Phase 00 — Nền móng
          </span>
        </div>
      </header>

      {/* Navigation */}
      <nav
        className="bg-white border-b border-gray-200 shadow-sm"
        aria-label="Điều hướng chính"
      >
        <div className="container-app">
          <div className="flex overflow-x-auto" role="tablist">
            <NavItem to="/" label="Trang chủ" />
            <NavItem to="/system-status" label="Trạng thái hệ thống" icon={<ActivityIcon className="w-4 h-4" />} />
          </div>
        </div>
      </nav>

      {/* Content */}
      <main
        id="main-content"
        className="flex-1 container-app py-6 sm:py-8 animate-fade-in"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto py-4">
        <div className="container-app text-center text-xs text-gray-400">
          {SCHOOL_NAME} &mdash; Hệ thống Báo giảng &amp; Thống kê Tiết dạy Tự động
        </div>
      </footer>
    </div>
  );
}

interface NavItemProps {
  to: string;
  label: string;
  icon?: ReactNode;
}

function NavItem({ to, label, icon }: NavItemProps) {
  const location = useLocation();
  const isActive =
    to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(to);

  return (
    <NavLink
      to={to}
      role="tab"
      aria-selected={isActive}
      className={[
        'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap',
        'border-b-2 transition-colors duration-150 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
        isActive
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
      ].join(' ')}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </NavLink>
  );
}
