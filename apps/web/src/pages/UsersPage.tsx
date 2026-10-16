import type { UserManagementRecord } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { DataTable, EmptyState, FormSection, MutationNotice, PageHeader, PageLoading, Pagination, QueryFailure, StatusText } from '../components/ui/management';
import { usersApi, type UserInput } from '../lib/management-api';
import { hasSchoolCapability } from '../lib/capabilities';

type UserDraft = { id?: string; username: string; password: string; staffCode: string; displayName: string; email: string; phone: string; positionTitle: string; isTeachingStaff: boolean };
type PasswordResetDraft = { id: string; username: string; newPassword: string; confirmation: string };
const emptyDraft: UserDraft = { username: '', password: '', staffCode: '', displayName: '', email: '', phone: '', positionTitle: '', isTeachingStaff: true };

export function UsersPage() {
  const { auth } = useAuth();
  const canResetPasswords = hasSchoolCapability(auth?.capabilities ?? [], 'SYSTEM_ADMIN');
  const [resetDraft, setResetDraft] = useState<PasswordResetDraft | null>(null);
  const [resetError, setResetError] = useState('');
  const queryClient = useQueryClient(); const [page, setPage] = useState(1); const [draft, setDraft] = useState<UserDraft | null>(null); const [success, setSuccess] = useState(''); const [confirm, setConfirm] = useState<{ id: string; action: 'activate' | 'disable' | 'unlock' }>();
  const query = useQuery({ queryKey: ['users', { page }], queryFn: () => usersApi.list({ page, pageSize: 20 }) });
  const save = useMutation({ mutationFn: ({ id, input }: { id?: string; input: UserInput }) => id ? usersApi.update(id, input) : usersApi.create(input), onMutate: () => { setSuccess(''); actionMutation.reset(); }, onSuccess: async () => { setDraft(null); setSuccess('Đã lưu người dùng. Tài khoản mới ở trạng thái Chờ kích hoạt; mật khẩu khởi tạo không được hiển thị lại.'); await queryClient.invalidateQueries({ queryKey: ['users'] }); } });
  const actionMutation = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'activate' | 'disable' | 'unlock' }) => usersApi.action(id, action), onMutate: () => { setSuccess(''); save.reset(); }, onSuccess: async () => { setConfirm(undefined); setSuccess('Đã cập nhật trạng thái tài khoản.'); await queryClient.invalidateQueries({ queryKey: ['users'] }); } });
  const resetPassword = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => usersApi.resetPassword(id, newPassword),
    onMutate: () => { setSuccess(''); setResetError(''); save.reset(); actionMutation.reset(); },
    onSuccess: async () => {
      setResetDraft(null);
      setSuccess('Đã đặt lại mật khẩu. Các phiên đăng nhập cũ đã bị thu hồi; tài khoản phải đổi mật khẩu khi đăng nhập lại.');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      resetPassword.reset();
    },
    gcTime: 0,
  });
  function startReset(user: UserManagementRecord) {
    setDraft(null);
    setConfirm(undefined);
    setSuccess('');
    setResetError('');
    resetPassword.reset();
    setResetDraft({ id: user.id, username: user.username, newPassword: '', confirmation: '' });
  }
  function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!resetDraft) return;
    if (!resetDraft.newPassword) { setResetError('Cần nhập mật khẩu khởi tạo mới.'); return; }
    if (resetDraft.newPassword !== resetDraft.confirmation) { setResetError('Hai lần nhập mật khẩu chưa khớp.'); return; }
    resetPassword.mutate({ id: resetDraft.id, newPassword: resetDraft.newPassword });
  }
  function cancelReset() {
    setResetDraft(null);
    setResetError('');
    resetPassword.reset();
  }

  function edit(user: UserManagementRecord) { setSuccess(''); setDraft({ id: user.id, username: user.username, password: '', staffCode: user.profile?.staffCode ?? '', displayName: user.profile?.displayName ?? '', email: user.profile?.email ?? '', phone: user.profile?.phone ?? '', positionTitle: user.profile?.positionTitle ?? '', isTeachingStaff: user.profile?.isTeachingStaff ?? false }); }
  function submit(event: FormEvent) { event.preventDefault(); if (!draft || !draft.username.trim() || (!draft.id && !draft.password) || !draft.displayName.trim()) return; const input: UserInput = { username: draft.username, ...(!draft.id ? { password: draft.password } : {}), profile: { staffCode: draft.staffCode || null, displayName: draft.displayName, email: draft.email || null, phone: draft.phone || null, positionTitle: draft.positionTitle || null, isTeachingStaff: draft.isTeachingStaff } }; save.mutate({ id: draft.id, input }); }
  return <div className="management-page staff-register"><PageHeader eyebrow="Quản trị danh tính" title="Người dùng" action={<Button type="button" onClick={() => { setSuccess(''); setDraft({ ...emptyDraft }); }}>Tạo người dùng</Button>}>Danh sách tài khoản và hồ sơ nhân sự. Trang này không xóa tài khoản.</PageHeader><MutationNotice error={save.error ?? actionMutation.error ?? resetPassword.error} success={success} />{draft && <form className="long-form" onSubmit={submit}><h2>{draft.id ? 'Chỉnh sửa người dùng' : 'Tạo người dùng'}</h2><FormSection title="Tài khoản"><div className="form-grid"><FormField label="Tên đăng nhập" name="username" autoComplete="off" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} required />{!draft.id && <FormField label="Mật khẩu khởi tạo" name="initial-password" type="password" autoComplete="new-password" hint="Có thể dán mật khẩu. Mật khẩu không được lưu trên giao diện sau khi tạo." value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} required />}</div></FormSection><FormSection title="Hồ sơ nhân sự"><div className="form-grid"><FormField label="Mã nhân sự" name="staff-code" value={draft.staffCode} onChange={(e) => setDraft({ ...draft, staffCode: e.target.value })} /><FormField label="Tên hiển thị" name="display-name" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} required /><FormField label="Email" name="email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /><FormField label="Số điện thoại" name="phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /><FormField label="Chức danh" name="position-title" value={draft.positionTitle} onChange={(e) => setDraft({ ...draft, positionTitle: e.target.value })} /></div><label className="check-field"><input type="checkbox" checked={draft.isTeachingStaff} onChange={(e) => setDraft({ ...draft, isTeachingStaff: e.target.checked })} /> Là nhân sự giảng dạy</label></FormSection><div className="form-actions"><Button type="submit" loading={save.isPending}>{draft.id ? 'Lưu thay đổi' : 'Tạo người dùng'}</Button><Button type="button" variant="quiet" onClick={() => setDraft(null)}>Hủy</Button></div></form>}{query.isPending ? <PageLoading /> : query.isError ? <QueryFailure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length === 0 ? <EmptyState title="Chưa có nhân sự trong sổ" message="Tạo người dùng đầu tiên để bắt đầu danh sách nhân sự." /> : <><DataTable label="Danh sách người dùng" headings={['Họ tên / tài khoản', 'Mã nhân sự', 'Trạng thái', 'Chức danh', 'Giảng dạy', 'Thao tác']}>{query.data.items.map((user) => <tr key={user.id}><td><strong>{user.profile?.displayName ?? 'Chưa có tên hiển thị'}</strong><small className="technical-value table-secondary">{user.username}</small></td><td className="technical-value">{user.profile?.staffCode ?? '—'}</td><td><StatusText active={user.status === 'ACTIVE'} activeLabel="Đang hoạt động" inactiveLabel={statusLabel(user.status)} /></td><td>{user.profile?.positionTitle ?? '—'}</td><td>{user.profile?.isTeachingStaff ? 'Có' : 'Không'}</td><td><div className="row-actions"><Button type="button" variant="quiet" onClick={() => edit(user)}>Sửa {user.username}</Button>{confirm?.id === user.id ? <><span>Xác nhận {actionLabel(confirm.action).toLowerCase()}?</span><Button type="button" variant="secondary" loading={actionMutation.isPending} onClick={() => actionMutation.mutate(confirm)}>Xác nhận</Button><Button type="button" variant="quiet" onClick={() => setConfirm(undefined)}>Hủy</Button></> : <>{user.status === 'ACTIVE' && <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setConfirm({ id: user.id, action: 'disable' }); }}>Vô hiệu hóa</Button>}{(user.status === 'DISABLED' || user.status === 'PENDING') && <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setConfirm({ id: user.id, action: 'activate' }); }}>Kích hoạt</Button>}{user.status === 'LOCKED' && <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setConfirm({ id: user.id, action: 'unlock' }); }}>Mở khóa</Button>}{canResetPasswords && user.status === 'ACTIVE' && user.id !== auth?.user.id && (
  <Button type="button" variant="quiet" onClick={() => startReset(user)}>Đặt lại mật khẩu</Button>
)}</>}{resetDraft?.id === user.id && (
  <form className="row-confirm" onSubmit={submitReset}>
    <p>Đặt lại mật khẩu cho <strong>{resetDraft.username}</strong>. Người dùng sẽ phải đổi mật khẩu khi đăng nhập lần tới; mọi phiên hiện có sẽ bị thu hồi.</p>
    <FormField
      id={`reset-password-${user.id}`}
      name="new-password"
      type="password"
      label="Mật khẩu khởi tạo mới"
      autoComplete="new-password"
      minLength={12}
      maxLength={1024}
      required
      value={resetDraft.newPassword}
      onChange={(event) => { setResetError(''); setResetDraft({ ...resetDraft, newPassword: event.target.value }); }}
    />
    <FormField
      id={`reset-confirm-${user.id}`}
      name="confirm-password"
      type="password"
      label="Nhập lại mật khẩu mới"
      autoComplete="new-password"
      minLength={12}
      maxLength={1024}
      required
      value={resetDraft.confirmation}
      onChange={(event) => { setResetError(''); setResetDraft({ ...resetDraft, confirmation: event.target.value }); }}
    />
    {resetError && <p role="alert" className="form-field__error">{resetError}</p>}
    <Button type="submit" variant="secondary" loading={resetPassword.isPending}>Xác nhận đặt lại</Button>
    <Button type="button" variant="quiet" onClick={cancelReset}>Hủy đặt lại</Button>
  </form>
)}</div></td></tr>)}</DataTable><Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} /></>}</div>;
}

function statusLabel(status: UserManagementRecord['status']) { return ({ PENDING: 'Chờ kích hoạt', LOCKED: 'Đang khóa', DISABLED: 'Đã vô hiệu hóa', ACTIVE: 'Đang hoạt động' })[status]; }
function actionLabel(action: 'activate' | 'disable' | 'unlock') { return ({ activate: 'Kích hoạt', disable: 'Vô hiệu hóa', unlock: 'Mở khóa' })[action]; }
