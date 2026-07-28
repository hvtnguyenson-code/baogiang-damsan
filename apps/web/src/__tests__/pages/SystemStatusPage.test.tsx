import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemStatusPage } from '../../pages/SystemStatusPage';
import * as apiClient from '../../lib/api-client';

/**
 * Unit tests for SystemStatusPage.
 * API calls are mocked so no real network/server is needed.
 */

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/system-status']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockLiveOk = {
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
  uptime: 120,
  version: '0.0.1',
  phase: 'Phase 00 — Foundation',
};

const mockReadyOk = {
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
  checks: {
    database: { status: 'ok' as const, latencyMs: 5 },
  },
};

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'fetchHealthLive').mockResolvedValue(mockLiveOk);
    vi.spyOn(apiClient, 'fetchHealthReady').mockResolvedValue(mockReadyOk);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display loading state initially', () => {
    // Make fetch hang so we can see loading
    vi.spyOn(apiClient, 'fetchHealthLive').mockImplementation(
      () => new Promise(() => {}),
    );
    vi.spyOn(apiClient, 'fetchHealthReady').mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithProviders(<SystemStatusPage />);
    expect(screen.getByRole('status', { name: /đang kiểm tra trạng thái/i })).toBeInTheDocument();
  });

  it('should display ready status when API and DB are ok', async () => {
    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(screen.getByText('Hệ thống hoạt động bình thường')).toBeInTheDocument();
    });
  });

  it('should display error state when API is unreachable', async () => {
    vi.spyOn(apiClient, 'fetchHealthLive').mockRejectedValue(
      new Error('Network error'),
    );
    vi.spyOn(apiClient, 'fetchHealthReady').mockRejectedValue(
      new Error('Network error'),
    );

    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(screen.getByText(/không kết nối được api/i)).toBeInTheDocument();
    });
  });

  it('should have a retry button that is enabled when not loading', async () => {
    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      const retryBtn = screen.getByRole('button', { name: /tải lại/i });
      expect(retryBtn).toBeInTheDocument();
      expect(retryBtn).not.toBeDisabled();
    });
  });

  it('should call API functions on retry button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => screen.getByRole('button', { name: /tải lại/i }));

    const fetchLive = vi.spyOn(apiClient, 'fetchHealthLive').mockResolvedValue(mockLiveOk);
    const fetchReady = vi.spyOn(apiClient, 'fetchHealthReady').mockResolvedValue(mockReadyOk);

    await user.click(screen.getByRole('button', { name: /tải lại/i }));

    await waitFor(() => {
      expect(fetchLive).toHaveBeenCalled();
      expect(fetchReady).toHaveBeenCalled();
    });
  });
});
