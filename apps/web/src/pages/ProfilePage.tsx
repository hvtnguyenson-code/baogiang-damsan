import { useAuth } from '../auth/auth-context';
import { PageHeader } from '../components/ui/management';
import { capabilityLabels, scopeLabels } from '../lib/capabilities';

export function ProfilePage() {
  const { auth } = useAuth();
  if (!auth) return null;
  return <div className="management-page"><PageHeader eyebrow="Hồ sơ cá nhân" title={auth.user.displayName}>Thông tin xác thực do hệ thống hiện có cung cấp. Trang này không thay đổi hồ sơ.</PageHeader><section className="ledger-section" aria-labelledby="identity-heading"><h2 id="identity-heading">Thông tin tài khoản</h2><dl className="detail-ledger"><div><dt>Tên hiển thị</dt><dd>{auth.user.displayName}</dd></div><div><dt>Tên đăng nhập</dt><dd className="technical-value">{auth.user.username}</dd></div><div><dt>Trạng thái</dt><dd>Đang hoạt động</dd></div></dl></section><section className="ledger-section" aria-labelledby="rights-heading"><h2 id="rights-heading">Phạm vi công việc hiện có</h2>{auth.capabilities.length === 0 ? <p className="muted-copy">Chưa có phạm vi quản lý được giao. Bạn vẫn có thể dùng hồ sơ và các liên kết hệ thống công khai.</p> : <ul className="rights-list">{auth.capabilities.map((grant, index) => <li key={`${grant.key}-${grant.scope}-${grant.resourceId ?? index}`}><strong>{capabilityLabels[grant.key] ?? grant.key}</strong><span>{scopeLabels[grant.scope]}{grant.resourceId ? <small className="technical-value"> · mã tài nguyên {grant.resourceId}</small> : null}</span></li>)}</ul>}</section></div>;
}
