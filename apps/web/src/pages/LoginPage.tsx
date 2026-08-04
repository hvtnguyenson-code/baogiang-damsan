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
  const [error, setError] = useState<{ title: string; message: string; recoverable: boolean } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
      setError(apiError.statusCode === 401
        ? { title: 'Không thể đăng nhập', message: 'Tên đăng nhập hoặc mật khẩu không hợp lệ.', recoverable: false }
        : { title: 'Chưa thể kết nối', message: 'Vui lòng kiểm tra kết nối và thử lại.', recoverable: true });
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
      {error && <InlineAlert title={error.title} focusRef={alertRef}>{error.message}{error.recoverable && <span> Bạn có thể thử lại ngay trên biểu mẫu này.</span>}</InlineAlert>}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="username"
          name="username"
          label="Tên đăng nhập"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <FormField
          id="password"
          name="password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" loading={auth.isMutating}>Đăng nhập</Button>
      </form>
      <Link className="text-link auth-form__status-link" to="/trang-thai-he-thong">Kiểm tra trạng thái hệ thống</Link>
    </section>
  );
}
