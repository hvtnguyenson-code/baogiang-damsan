import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, MutationNotice, QueryFailure } from '../components/ui/management';
import { ApiError } from '../lib/api-client';

describe('P5-058 Vietnamese feedback', () => {
  it.each([401, 403])('keeps HTTP %s distinct and offers navigation instead of retrying', (status) => {
    const retry = vi.fn();
    render(<MemoryRouter><QueryFailure error={new ApiError(status, 'RAW_SQL_SECRET', 'internal-id', 'TECH_CODE')} retry={retry} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: status === 401 ? 'Đăng nhập lại' : 'Về trang công việc' }))
      .toHaveAttribute('href', status === 401 ? '/dang-nhap' : '/');
    expect(screen.getByRole('alert')).toHaveTextContent(status === 401 ? 'Phiên đăng nhập đã hết hạn' : 'Tài khoản chưa được cấp quyền');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(/RAW_SQL_SECRET|TECH_CODE|internal-id/);
    expect(retry).not.toHaveBeenCalled();
  });

  it('reloads a conflicted query only on an explicit action', () => {
    const reload = vi.fn();
    render(<QueryFailure error={new ApiError(409, 'CAS_MISMATCH')} retry={reload} />);
    expect(screen.getByRole('alert')).toHaveTextContent('kiểm tra trước khi lưu');
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại dữ liệu' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).not.toHaveTextContent('CAS_MISMATCH');
  });

  it.each([new Error('401 Forbidden READY'), new ApiError(500, '401 Forbidden READY', undefined, 'APPROVED'), new ApiError(0, '403')])('does not infer auth, success or escalation from response text', (error) => {
    const retry = vi.fn();
    render(<QueryFailure error={error} retry={retry} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(/401|403|Forbidden|READY|APPROVED/);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([400, 404, 409, 422, 500])('keeps a failed mutation at HTTP %s an error even alongside success text', (status) => {
    render(<MutationNotice error={new ApiError(status, 'RAW_BACKEND_CODE')} success="Đã hoàn tất" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa thể lưu thay đổi');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/RAW_BACKEND_CODE|Đã hoàn tất/);
  });

  it('provides an actual empty-state action without claiming readiness', () => {
    const clear = vi.fn();
    render(<EmptyState filtered action={<button onClick={clear}>Bỏ bộ lọc</button>} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Không có kết quả phù hợp');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bộ lọc' }));
    expect(clear).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
