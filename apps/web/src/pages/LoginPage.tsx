import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { safeInternalPath } from '../auth/route-guards';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import { ApiError } from '../lib/api-client';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const alertRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ title: string; message: string; recoverable: boolean } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors: Record<string, string> = {};
    if (!username.trim()) nextErrors.username = 'Nhập tên đăng nhập.';
    if (!password) nextErrors.password = 'Nhập mật khẩu.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.setTimeout(() => alertRef.current?.focus(), 0);
      return;
    }
    try {
      const result = await auth.login({ username, password });
      setPassword('');
      if (result.user.mustChangePassword) {
        navigate('/doi-mat-khau-lan-dau', { replace: true });
      } else {
        const destination = safeInternalPath((location.state as { from?: unknown } | null)?.from);
        navigate(destination, { replace: true });
      }
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : new ApiError(0, 'Không thể kết nối đến máy chủ.');
      setPassword('');
      const message = apiError.statusCode === 401
        ? 'Tên đăng nhập hoặc mật khẩu không hợp lệ.'
        : apiError.statusCode === 400 || apiError.statusCode === 422
          ? 'Thông tin đăng nhập chưa hợp lệ. Kiểm tra lại rồi thử lại.'
          : apiError.statusCode === 0
            ? 'Không thể kết nối để đăng nhập. Kiểm tra kết nối rồi thử lại.'
            : apiError.statusCode >= 500
              ? 'Hệ thống tạm thời chưa thể đăng nhập. Vui lòng thử lại.'
              : 'Chưa thể đăng nhập. Vui lòng thử lại.';
      setError({ title: 'Không thể đăng nhập', message, recoverable: apiError.statusCode !== 401 });
      window.setTimeout(() => alertRef.current?.focus(), 0);
    }
  }

  return (
    <section className="auth-form" aria-labelledby="login-title">
      <div className="auth-form__heading">
        <p className="utility-label">Xác thực</p>
        <h2 id="login-title">Đăng nhập</h2>
        <p>Dùng tài khoản nội bộ do nhà trường cấp.</p>
      </div>
      {(error || Object.values(fieldErrors).some(Boolean)) && <InlineAlert title={error?.title ?? 'Kiểm tra lại thông tin'} focusRef={alertRef}>{error?.message ?? 'Nhập đủ các trường bắt buộc.'}{error?.recoverable && <span> Bạn có thể thử lại ngay trên biểu mẫu này.</span>}</InlineAlert>}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="username"
          name="username"
          label="Tên đăng nhập"
          autoComplete="username"
          required
          value={username}
          error={fieldErrors.username}
          onChange={(event) => { setUsername(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.username; return next; }); setError(null); }}
        />
        <FormField
          id="password"
          name="password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.password; return next; }); setError(null); }}
        />
        <Button type="submit" loading={auth.isMutating}>Đăng nhập</Button>
      </form>
      <Link className="text-link auth-form__status-link" to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống</Link>
    </section>
  );
}
