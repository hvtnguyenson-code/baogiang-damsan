import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from '../test-utils';

describe('ProfilePage Telegram Integration UI (Case 30 & 31)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. renders feature-disabled message when telegram is disabled', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(normalAuth);
      if (url.endsWith('/integrations/telegram/me')) {
        return jsonResponse({ enabled: false, linked: false });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/ho-so');
    expect(await screen.findByRole('heading', { name: /tích hợp telegram/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/tính năng liên kết telegram hiện đang tắt trên hệ thống/i),
    ).toBeInTheDocument();
  });

  it('2. renders unlinked state and can initiate link challenge', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(normalAuth);
      if (url.endsWith('/integrations/telegram/me')) {
        return jsonResponse({ enabled: true, linked: false });
      }
      if (url.endsWith('/integrations/telegram/link-challenge') && init?.method === 'POST') {
        return jsonResponse({
          deepLink: 'https://t.me/baogiang_test_bot?start=test_token_xyz',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/ho-so');
    const linkButton = await screen.findByRole('button', { name: /liên kết telegram/i });
    expect(linkButton).toBeInTheDocument();

    await user.click(linkButton);

    const openLink = await screen.findByRole('link', { name: /mở telegram kết nối/i });
    expect(openLink).toBeInTheDocument();
    expect(openLink).toHaveAttribute(
      'href',
      'https://t.me/baogiang_test_bot?start=test_token_xyz',
    );
    expect(screen.getByText(/đang chờ liên kết/i)).toBeInTheDocument();
  });

  it('3. renders linked state, can send test notification and unlink', async () => {
    const user = userEvent.setup();
    let isLinked = true;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(normalAuth);
      if (url.endsWith('/integrations/telegram/me')) {
        return jsonResponse({
          enabled: true,
          linked: isLinked,
          linkedAt: '2026-10-06T12:00:00.000Z',
        });
      }
      if (url.endsWith('/integrations/telegram/test') && init?.method === 'POST') {
        return jsonResponse({
          deliveryStatus: 'SENT',
          sentAt: new Date().toISOString(),
        });
      }
      if (url.endsWith('/integrations/telegram/link') && init?.method === 'DELETE') {
        isLinked = false;
        return jsonResponse({
          unlinked: true,
          revokedAt: new Date().toISOString(),
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/ho-so');
    expect(await screen.findByText(/đã liên kết/i)).toBeInTheDocument();

    // Send test notification
    const testButton = screen.getByRole('button', { name: /gửi tin thử/i });
    await user.click(testButton);

    expect(await screen.findByText(/gửi tin thử thành công/i)).toBeInTheDocument();

    // Unlink
    const unlinkButton = screen.getByRole('button', { name: /hủy liên kết/i });
    await user.click(unlinkButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /liên kết telegram/i })).toBeInTheDocument();
    });
  });

  it('4. displays error alert when test notification status is UNKNOWN or FAILED', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(normalAuth);
      if (url.endsWith('/integrations/telegram/me')) {
        return jsonResponse({
          enabled: true,
          linked: true,
          linkedAt: '2026-10-06T12:00:00.000Z',
        });
      }
      if (url.endsWith('/integrations/telegram/test') && init?.method === 'POST') {
        return jsonResponse({
          deliveryStatus: 'UNKNOWN',
          error: 'NETWORK_TIMEOUT',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/ho-so');
    const testButton = await screen.findByRole('button', { name: /gửi tin thử/i });
    await user.click(testButton);

    expect(await screen.findByText(/lỗi gửi tin thử/i)).toBeInTheDocument();
    expect(screen.getByText(/trạng thái: UNKNOWN/i)).toBeInTheDocument();
  });
});
