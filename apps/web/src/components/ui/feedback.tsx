import type { ReactNode } from 'react';
import { Button } from './button';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';

// Only the HTTP status is authoritative. Never render server messages or codes.
export function ErrorFeedback({ error, retry, title = 'Chưa tải được dữ liệu' }: {
  error: unknown;
  retry?: () => void;
  title?: string;
}) {
  const status = error instanceof ApiError ? error.statusCode : undefined;
  const message = status === 401
    ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    : status === 403
    ? 'Tài khoản chưa được cấp quyền thực hiện thao tác này.'
    : status === 409
    ? 'Dữ liệu xung đột với bản ghi hiện có hoặc đã thay đổi. Hãy tải lại dữ liệu và kiểm tra trước khi lưu.'
    : status === 404
    ? 'Không tìm thấy dữ liệu được yêu cầu. Hãy tải lại danh sách.'
    : status === 400 || status === 422
    ? 'Một số giá trị chưa hợp lệ. Hãy kiểm tra lại biểu mẫu.'
    : 'Không thể hoàn tất yêu cầu. Hãy kiểm tra kết nối và thử lại.';

  return <InlineAlert title={title}>
    <p>{message}</p>
    {status === 401 ? <Link className="button button--secondary" to="/dang-nhap">Đăng nhập lại</Link>
      : status === 403 ? <Link className="button button--secondary" to="/">Về trang công việc</Link>
      : status === 409 || status === 404 ? <Button type="button" variant="secondary" onClick={retry ?? (() => window.location.reload())}>Tải lại dữ liệu</Button>
      : retry ? <Button type="button" variant="secondary" onClick={retry}>Thử lại</Button> : null}
  </InlineAlert>;
}

export function InlineAlert({ title, children, tone = 'error', focusRef }: {
  title: string;
  children: ReactNode;
  tone?: 'error' | 'warning' | 'success';
  focusRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={focusRef} className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'} tabIndex={-1}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-label={label}><span className="loading-state__mark" aria-hidden="true" /><p>{label}</p></div>;
}

export function RecoveryState({ title, message, actionLabel, onAction }: {
  title: string;
  message: string;
  actionLabel: string;
  onAction(): void;
}) {
  return (
    <section className="recovery-state" aria-labelledby="recovery-title">
      <div className="margin-rail" aria-hidden="true" />
      <div>
        <h1 id="recovery-title">{title}</h1>
        <p>{message}</p>
        <Button type="button" variant="secondary" onClick={onAction}>{actionLabel}</Button>
      </div>
    </section>
  );
}
