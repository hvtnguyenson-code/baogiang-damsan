import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import { ApiError } from '../lib/api-client';
import { LogoutNotice } from '../auth/logout-notice';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
const CURRENT_REQUIRED_ERROR = 'Nhập mật khẩu hiện tại.';
const POLICY_ERROR = 'Mật khẩu mới cần ít nhất 12 ký tự, có chữ thường, chữ hoa và chữ số.';
const SAME_PASSWORD_ERROR = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
const CONFIRM_REQUIRED_ERROR = 'Nhập xác nhận mật khẩu mới.';
const CONFIRM_MISMATCH_ERROR = 'Mật khẩu xác nhận chưa khớp.';

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';
type PasswordValues = Record<PasswordField, string>;
type PasswordErrors = Partial<Record<PasswordField, string>>;

function getNewPasswordError(values: PasswordValues): string | undefined {
  if (!PASSWORD_POLICY.test(values.newPassword)) return POLICY_ERROR;
  if (values.currentPassword && values.currentPassword === values.newPassword) return SAME_PASSWORD_ERROR;
  return undefined;
}

function getConfirmPasswordError(values: PasswordValues): string | undefined {
  if (!values.confirmPassword) return CONFIRM_REQUIRED_ERROR;
  if (values.confirmPassword !== values.newPassword) return CONFIRM_MISMATCH_ERROR;
  return undefined;
}

function updateFieldErrors(field: PasswordField, values: PasswordValues, errors: PasswordErrors): PasswordErrors {
  const next = { ...errors };
  if (field === 'currentPassword') {
    if (next.currentPassword) {
      if (values.currentPassword) delete next.currentPassword;
      else next.currentPassword = CURRENT_REQUIRED_ERROR;
    }
    if (next.newPassword === SAME_PASSWORD_ERROR && values.currentPassword !== values.newPassword) delete next.newPassword;
  }
  if (field === 'newPassword') {
    if (next.newPassword) {
      const error = getNewPasswordError(values);
      if (error) next.newPassword = error;
      else delete next.newPassword;
    }
    if (next.confirmPassword) {
      const confirmError = getConfirmPasswordError(values);
      if (confirmError) next.confirmPassword = confirmError;
      else delete next.confirmPassword;
    }
  }
  if (field === 'confirmPassword' && next.confirmPassword) {
    const error = getConfirmPasswordError(values);
    if (error) next.confirmPassword = error;
    else delete next.confirmPassword;
  }
  return next;
}

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
    const values = { currentPassword, newPassword, confirmPassword };
    if (!currentPassword) nextErrors.currentPassword = CURRENT_REQUIRED_ERROR;
    const newPasswordError = getNewPasswordError(values);
    if (newPasswordError) nextErrors.newPassword = newPasswordError;
    const confirmPasswordError = getConfirmPasswordError(values);
    if (confirmPasswordError) nextErrors.confirmPassword = confirmPasswordError;
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

  function handleFieldChange(field: PasswordField, value: string) {
    const values = { currentPassword, newPassword, confirmPassword, [field]: value };
    setCurrentPassword(values.currentPassword);
    setNewPassword(values.newPassword);
    setConfirmPassword(values.confirmPassword);
    setErrors((current) => updateFieldErrors(field, values, current));
    setServerError(null);
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
        <FormField id="current-password" name="currentPassword" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => handleFieldChange('currentPassword', event.target.value)} error={errors.currentPassword} />
        <FormField id="new-password" name="newPassword" label="Mật khẩu mới" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => handleFieldChange('newPassword', event.target.value)} error={errors.newPassword} />
        <FormField id="confirm-password" name="confirmPassword" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => handleFieldChange('confirmPassword', event.target.value)} error={errors.confirmPassword} />
        <div className="form-actions">
          <Button type="submit" loading={auth.isMutating}>Đổi mật khẩu</Button>
          <Button aria-label="Đăng xuất khỏi lần đăng nhập đầu tiên" type="button" variant="quiet" loading={auth.isMutating} onClick={() => void auth.logout().catch(() => undefined)}>Đăng xuất</Button>
        </div>
      </form>
      <LogoutNotice />
    </section>
  );
}
