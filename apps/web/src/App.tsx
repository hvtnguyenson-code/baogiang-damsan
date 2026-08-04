import { Navigate, Route, Routes } from 'react-router-dom';
import { FirstLoginRoute, LoginRoute, ProtectedRoute } from './auth/route-guards';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { FirstPasswordChangePage } from './pages/FirstPasswordChangePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SystemStatusPage } from './pages/SystemStatusPage';

export default function App() {
  return (
    <Routes>
      <Route element={<LoginRoute />}>
        <Route element={<AuthLayout />}><Route path="/dang-nhap" element={<LoginPage />} /></Route>
      </Route>
      <Route element={<FirstLoginRoute />}>
        <Route element={<AuthLayout />}><Route path="/doi-mat-khau-lan-dau" element={<FirstPasswordChangePage />} /></Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}><Route path="/" element={<HomePage />} /></Route>
      </Route>
      <Route path="/trang-thai-he-thong" element={<SystemStatusPage />} />
      <Route path="/khong-co-quyen" element={<AccessDeniedPage />} />
      <Route path="/login" element={<Navigate to="/dang-nhap" replace />} />
      <Route path="/system-status" element={<Navigate to="/trang-thai-he-thong" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
