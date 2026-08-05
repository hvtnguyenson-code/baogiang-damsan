import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemStatusPage } from '../../pages/SystemStatusPage';
import * as apiClient from '../../lib/api-client';
import { renderWithQuery } from '../test-utils';

const liveOk = { status: 'ok' as const, timestamp: '2026-08-04T00:00:00Z', uptime: 120, version: '0.0.1', phase: 'Phase 01' };
const readyOk = { status: 'ok' as const, timestamp: '2026-08-04T00:00:00Z', checks: { database: { status: 'ok' as const, latencyMs: 5 } } };

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'fetchHealthLive').mockResolvedValue(liveOk);
    vi.spyOn(apiClient, 'fetchHealthReady').mockResolvedValue(readyOk);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shows an accessible stable loading state', () => {
    vi.spyOn(apiClient, 'fetchHealthLive').mockImplementation(() => new Promise(() => {}));
    vi.spyOn(apiClient, 'fetchHealthReady').mockImplementation(() => new Promise(() => {}));
    renderWithQuery(<SystemStatusPage />, '/trang-thai-he-thong');
    expect(screen.getByRole('status', { name: /đang kiểm tra trạng thái/i })).toBeInTheDocument();
  });

  it('shows ready state with text cues and safe details', async () => {
    renderWithQuery(<SystemStatusPage />, '/trang-thai-he-thong');
    expect(await screen.findByText('Hệ thống hoạt động bình thường')).toBeInTheDocument();
    expect(screen.getAllByText('Sẵn sàng')).toHaveLength(2);
    expect(screen.getByText('5 ms')).toBeInTheDocument();
  });

  it('shows a recovery state without raw network details', async () => {
    vi.spyOn(apiClient, 'fetchHealthLive').mockRejectedValue(new Error('socket 127.0.0.1 internal detail'));
    vi.spyOn(apiClient, 'fetchHealthReady').mockRejectedValue(new Error('database secret detail'));
    renderWithQuery(<SystemStatusPage />, '/trang-thai-he-thong');
    expect(await screen.findByText('Không thể kết nối')).toBeInTheDocument();
    expect(screen.queryByText(/socket|database secret|127\.0\.0\.1/i)).not.toBeInTheDocument();
  });

  it('retries both checks through a named button', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SystemStatusPage />, '/trang-thai-he-thong');
    const button = await screen.findByRole('button', { name: /tải lại trạng thái/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(apiClient.fetchHealthLive).toHaveBeenCalledTimes(2);
    expect(apiClient.fetchHealthReady).toHaveBeenCalledTimes(2);
  });
});
