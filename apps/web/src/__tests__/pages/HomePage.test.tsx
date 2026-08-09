import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from '../test-utils';

describe('authenticated workspace', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('renders a factual personalized work index and semantic route links without a role selector', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /chào nguyễn văn an/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /mục lục công việc/i })).toBeInTheDocument();
    expect(screen.getByText(/không có khu vực quản lý/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hồ sơ cá nhân/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /điều hướng chính/i });
    expect(nav.querySelector('[role="tab"]')).toBeNull();
    expect(screen.getByRole('link', { name: /không gian làm việc/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/vai trò/i)).not.toBeInTheDocument();
  });

  it('logs out and returns to the public login page', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/logout') && init?.method === 'POST') return jsonResponse({ success: true });
      return jsonResponse(normalAuth);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /đăng xuất/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ credentials: 'same-origin', method: 'POST' }));
  });
});
