import type { ScopedCapability } from '@baogiang/contracts';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState, RecoveryState } from '../components/ui/feedback';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.reconciliationMode === 'BOUNDARY_VERIFY') {
    if (auth.reconciliationError) return <AuthRecovery />;
    return <RouteLoading />;
  }
  if (auth.status === 'checking' && auth.reconciliationMode !== 'FOREGROUND_VERIFY') {
    return <RouteLoading />;
  }
  if (auth.status === 'error' && auth.reconciliationMode !== 'FOREGROUND_VERIFY') {
    return <AuthRecovery />;
  }
  if (auth.status === 'anonymous') {
    return <Navigate to="/dang-nhap" replace state={{ from: safeInternalPath(`${location.pathname}${location.search}`) }} />;
  }
  if (auth.status === 'firstLoginRequired') return <Navigate to="/doi-mat-khau-lan-dau" replace />;

  const isForegroundShielded = auth.reconciliationMode === 'FOREGROUND_VERIFY';

  return (
    <div key={auth.sessionIdentityKey} style={{ display: 'contents' }}>
      <div
        aria-hidden={isForegroundShielded ? 'true' : undefined}
        style={isForegroundShielded ? { display: 'none' } : undefined}
      >
        <Outlet />
      </div>
      {isForegroundShielded && (
        auth.reconciliationError ? <AuthRecovery /> : <RouteLoading label="Đang kiểm tra phiên làm việc" />
      )}
    </div>
  );
}

export function CapabilityRoute({ allow }: { allow(capabilities: ScopedCapability[]): boolean }) {
  const auth = useAuth();
  if (auth.reconciliationMode === 'FOREGROUND_VERIFY') {
    return <Outlet />;
  }
  if (!auth.auth || !allow(auth.auth.capabilities)) return <Navigate to="/khong-co-quyen" replace />;
  return <Outlet />;
}

export function FirstLoginRoute() {
  const auth = useAuth();
  if (auth.status === 'checking') return <RouteLoading />;
  if (auth.status === 'error') return <AuthRecovery />;
  if (auth.status === 'anonymous') return <Navigate to="/dang-nhap" replace />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function LoginRoute() {
  const auth = useAuth();
  const location = useLocation();
  const destination = safeInternalPath((location.state as { from?: unknown } | null)?.from);
  if (auth.status === 'checking') return <RouteLoading />;
  if (auth.status === 'error') return <AuthRecovery />;
  if (auth.status === 'firstLoginRequired') return <Navigate to="/doi-mat-khau-lan-dau" replace />;
  if (auth.status === 'authenticated') return <Navigate to={destination} replace />;
  return <Outlet />;
}

// Pure routing helper is colocated so every redirect uses the same open-redirect boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function safeInternalPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function RouteLoading({ label = 'Đang kiểm tra phiên đăng nhập' }: { label?: string } = {}) {
  return (
    <main id="main-content" className="route-state" tabIndex={-1}>
      <LoadingState label={label} />
    </main>
  );
}

function AuthRecovery() {
  const auth = useAuth();
  return (
    <main id="main-content" className="route-state" tabIndex={-1}>
      <RecoveryState
        title="Chưa thể kiểm tra phiên đăng nhập"
        message="Kết nối đến hệ thống đang gián đoạn. Phiên của bạn chưa bị coi là đã đăng xuất."
        actionLabel="Thử lại"
        onAction={() => void auth.retry()}
      />
    </main>
  );
}
