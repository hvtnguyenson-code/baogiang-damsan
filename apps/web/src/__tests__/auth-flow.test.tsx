import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstLoginAuth, jsonResponse, normalAuth, renderApp } from './test-utils';
import { safeInternalPath } from '../auth/route-guards';

describe('auth routing and forms', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows a stable check then redirects an anonymous protected route to login', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    renderApp('/');
    expect(screen.getByRole('status', { name: /đang kiểm tra phiên/i })).toBeInTheDocument();
    resolveFetch(jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session', timestamp: 'now' }, 401));
    expect(await screen.findByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument();
  });

  it('keeps an indeterminate server failure distinct from anonymous and offers recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 503, error: 'Unavailable', message: 'internal detail', timestamp: 'now' }, 503)));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /chưa thể kiểm tra phiên đăng nhập/i }, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^đăng nhập$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/internal detail/i)).not.toBeInTheDocument();
  });

  it('submits login with accessible fields, retains the action label, and shows a generic 401', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: url.endsWith('/auth/login') ? 'specific backend text' : 'No session', timestamp: 'now' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await user.type(await screen.findByLabelText('Tên đăng nhập'), 'unknown');
    await user.type(screen.getByLabelText('Mật khẩu'), 'WrongPassword9');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tên đăng nhập hoặc mật khẩu không hợp lệ.');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('');
    expect(screen.queryByText(/specific backend text/i)).not.toBeInTheDocument();
  });

  it('maps login validation responses to safe validation copy', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse({ statusCode: 401 }, 401)
      : jsonResponse({ statusCode: 422, message: 'internal validation details' }, 422));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await screen.findByRole('heading', { name: /^Đăng nhập$/i });
    await user.type(await screen.findByLabelText('Tên đăng nhập'), 'teacher');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password9');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Thông tin đăng nhập chưa hợp lệ');
    expect(screen.queryByText(/internal validation details/i)).not.toBeInTheDocument();
  });

  it('shows connection recovery copy for a login network failure', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/me')) return jsonResponse({ statusCode: 401 }, 401);
      throw new Error('socket details');
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await screen.findByRole('heading', { name: /^Đăng nhập$/i });
    await user.type(await screen.findByLabelText('Tên đăng nhập'), 'teacher');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password9');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối để đăng nhập');
  });

  it('shows temporary-system copy for a login server failure', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse({ statusCode: 401 }, 401)
      : jsonResponse({ statusCode: 503, message: 'internal server detail' }, 503));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await screen.findByRole('heading', { name: /^Đăng nhập$/i });
    await user.type(await screen.findByLabelText('Tên đăng nhập'), 'teacher');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password9');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hệ thống tạm thời chưa thể đăng nhập');
    expect(screen.queryByText(/internal server detail/i)).not.toBeInTheDocument();
  });

  it('refreshes /me after login and routes first-login users to password change', async () => {
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return jsonResponse({ user: firstLoginAuth.user, expiresAt: '2026-08-05T00:00:00Z' });
      meCalls += 1;
      return meCalls === 1
        ? jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session', timestamp: 'now' }, 401)
        : jsonResponse(firstLoginAuth);
    }));
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await user.type(await screen.findByLabelText('Tên đăng nhập'), 'teacher');
    await user.type(screen.getByLabelText('Mật khẩu'), 'BootstrapPassword9');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(await screen.findByRole('heading', { name: /đổi mật khẩu để tiếp tục/i })).toBeInTheDocument();
  });

  it('validates exact backend password policy and confirmation before mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(firstLoginAuth));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await screen.findByRole('heading', { name: /đổi mật khẩu để tiếp tục/i });
    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'OldPassword9');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'too-short');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'different');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(screen.getAllByText(/ít nhất 12 ký tự, có chữ thường, chữ hoa và chữ số/i)).toHaveLength(2);
    expect(screen.getByText(/mật khẩu xác nhận chưa khớp/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('changes password, refreshes auth, and enters the workspace', async () => {
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/change-password')) return jsonResponse({ success: true });
      meCalls += 1;
      return jsonResponse(meCalls === 1 ? firstLoginAuth : normalAuth);
    }));
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'BootstrapPassword9');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'ReplacementPassword8');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'ReplacementPassword8');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(await screen.findByRole('heading', { name: /chào nguyễn văn an/i })).toBeInTheDocument();
    expect(meCalls).toBe(2);
  });

  it('keeps the first-login page and shows the current-password error after a 401', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/change-password')) return jsonResponse({ statusCode: 401, message: 'Current password is incorrect' }, 401);
      return jsonResponse(firstLoginAuth);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'WrongPassword9');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'ReplacementPassword8');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'ReplacementPassword8');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu hiện tại không đúng');
    expect(screen.getByRole('heading', { name: /đổi mật khẩu để tiếp tục/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/auth/me'))).toBe(true);
  });

  it('redirects to login when password-change 401 is confirmed as an expired session', async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/change-password')) return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401);
      if (url.endsWith('/auth/me')) {
        meCalls += 1;
        return meCalls === 1 ? jsonResponse(firstLoginAuth) : jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401);
      }
      return jsonResponse(firstLoginAuth);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await screen.findByRole('heading', { name: /đổi mật khẩu để tiếp tục/i });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'WrongPassword9');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'ReplacementPassword8');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'ReplacementPassword8');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(await screen.findByRole('heading', { name: /^Đăng nhập$/i })).toBeInTheDocument();
  });

  it('keeps the first-login page with recovery copy when password change cannot reach the server', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/change-password')) throw new Error('socket details');
      return jsonResponse(firstLoginAuth);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await screen.findByRole('heading', { name: /đổi mật khẩu để tiếp tục/i });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'OldPassword9');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'ReplacementPassword8');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'ReplacementPassword8');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối để đổi mật khẩu');
    expect(screen.getByRole('heading', { name: /đổi mật khẩu để tiếp tục/i })).toBeInTheDocument();
  });

  it('keeps only safe internal intended destinations', () => {
    expect(safeInternalPath('/trang-thai-he-thong')).toBe('/trang-thai-he-thong');
    expect(safeInternalPath('//attacker.invalid')).toBe('/');
    expect(safeInternalPath('https://attacker.invalid')).toBe('/');
  });

  it('does not allow a normal authenticated user to revisit first-login route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/doi-mat-khau-lan-dau');
    expect(await screen.findByRole('heading', { name: /chào nguyễn văn an/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: /đổi mật khẩu/i })).not.toBeInTheDocument());
  });

  it('blocks blank login client-side and clears stale field errors as the user types', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ statusCode: 401 }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/dang-nhap');
    await screen.findByRole('heading', { name: /^Đăng nhập$/i });
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    expect(screen.getByText('Nhập tên đăng nhập.')).toBeInTheDocument();
    expect(screen.getByText('Nhập mật khẩu.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText(/tên đăng nhập/i), 'teacher');
    expect(screen.queryByText('Nhập tên đăng nhập.')).not.toBeInTheDocument();
  });

  it('requires all first-login fields and rejects reusing the current password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(firstLoginAuth));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/doi-mat-khau-lan-dau');
    await screen.findByRole('heading', { name: /đổi mật khẩu để tiếp tục/i });
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(screen.getByText('Nhập mật khẩu hiện tại.')).toBeInTheDocument();
    expect(screen.getByText('Nhập xác nhận mật khẩu mới.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/mật khẩu hiện tại/i), 'SamePassword9');
    await user.type(screen.getByLabelText(/^Mật khẩu mới$/i), 'SamePassword9');
    await user.type(screen.getByLabelText(/xác nhận mật khẩu mới/i), 'SamePassword9');
    await user.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));
    expect(screen.getByText('Mật khẩu mới phải khác mật khẩu hiện tại.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps authenticated state and offers retry when logout fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/logout')) return jsonResponse({ statusCode: 503 }, 503);
      return jsonResponse(normalAuth);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /chào/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /đăng xuất/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/tạm thời chưa thể đăng xuất/i);
    expect(screen.getByRole('heading', { name: /chào/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thử đăng xuất lại/i })).toBeInTheDocument();
  });

  it('treats a logout 401 as already logged out', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/logout')) return jsonResponse({ statusCode: 401 }, 401);
      return jsonResponse(normalAuth);
    }));
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    await user.click(screen.getByRole('button', { name: /đăng xuất/i }));
    expect(await screen.findByRole('heading', { name: /^Đăng nhập$/i })).toBeInTheDocument();
  });
});
