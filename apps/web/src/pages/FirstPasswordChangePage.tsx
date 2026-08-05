import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import { ApiError } from '../lib/api-client';
import { LogoutNotice } from '../auth/logout-notice';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export function FirstPasswordChangePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const alertRef = useRef<HTMLDivElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = 'Nhập mật khẩu hiện tại.';
    if (!PASSWORD_POLICY.test(newPassword)) nextErrors.newPassword = 'Mật khẩu mới cần ít nhất 12 ký tự, có chữ thường, chữ hoa và chữ số.';
    if (currentPassword && newPassword && currentPassword === newPassword) nextErrors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    if (!confirmPassword) nextErrors.confirmPassword = 'Nhập xác nhận mật khẩu mới.';
    else if (confirmPassword !== newPassword) nextErrors.confirmPassword = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.setTimeout(() => alertRef.current?.focus(), 0);
      return;
    }
    try {
      await auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/', { replace: true });
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : new ApiError(0, 'Không thể kết nối đến máy chủ.');
      if (apiError.statusCode === 401) setCurrentPassword('');
      const message = apiError.statusCode === 401
        ? 'Mật khẩu hiện tại không đúng.'
        : apiError.statusCode === 400 || apiError.statusCode === 422
          ? 'Thông tin đổi mật khẩu chưa hợp lệ. Kiểm tra lại yêu cầu.'
          : apiError.statusCode === 0
            ? 'Không thể kết nối để đổi mật khẩu. Kiểm tra kết nối rồi thử lại.'
            : apiError.statusCode >= 500
              ? 'Hệ thống tạm thời chưa thể đổi mật khẩu. Vui lòng thử lại.'
              : 'Chưa thể đổi mật khẩu. Vui lòng thử lại.';
      setServerError(message);
      window.setTimeout(() => alertRef.current?.focus(), 0);
    }
  }

  const hasClientErrors = Object.keys(errors).length > 0;
  return (
    <section className="auth-form" aria-labelledby="change-title">
      <div className="auth-form__heading">
        <p className="utility-label">Lần đăng nhập đầu tiên</p>
        <h2 id="change-title">Đổi mật khẩu để tiếp tục</h2>
        <p>Mật khẩu mới cần ít nhất 12 ký tự, có chữ thường, chữ hoa và chữ số.</p>
      </div>
      {(hasClientErrors || serverError) && (
        <InlineAlert title="Kiểm tra lại thông tin" focusRef={alertRef}>
          {serverError ?? 'Một số trường chưa đáp ứng yêu cầu. Chi tiết được đặt cạnh từng trường.'}
        </InlineAlert>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <FormField id="current-password" name="currentPassword" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setErrors((current) => { const next = { ...current }; delete next.currentPassword; return next; }); setServerError(null); }} error={errors.currentPassword} />
        <FormField id="new-password" name="newPassword" label="Mật khẩu mới" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setErrors((current) => { const next = { ...current }; delete next.newPassword; return next; }); setServerError(null); }} error={errors.newPassword} />
        <FormField id="confirm-password" name="confirmPassword" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setErrors((current) => { const next = { ...current }; delete next.confirmPassword; return next; }); setServerError(null); }} error={errors.confirmPassword} />
        <div className="form-actions">
          <Button type="submit" loading={auth.isMutating}>Đổi mật khẩu</Button>
          <Button type="button" variant="quiet" loading={auth.isMutating} onClick={() => void auth.logout().catch(() => undefined)}>Đăng xuất</Button>
        </div>
      </form>
      <LogoutNotice />
    </section>
  );
}
