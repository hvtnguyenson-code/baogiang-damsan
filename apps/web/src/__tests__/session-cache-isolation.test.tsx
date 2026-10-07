import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/auth-context';
import { ProtectedRoute } from '../auth/route-guards';
import {
  AUTH_QUERY_KEY,
  broadcastSessionBoundary,
  getBroadcastChannel,
  getCurrentSessionGeneration,
  getSessionChannelName,
  onUnauthorized,
  resetBroadcastChannelForTesting,
  resetSessionScope,
  setLocalTabIdForTesting,
  setSessionChannelNameForTesting,
} from '../auth/session-cache';
import { ApiError, apiFetch, login } from '../lib/api-client';
import { ReportingStatementsPage } from '../pages/ReportingStatementsPage';
import { jsonResponse } from './test-utils';

const userAAuth = {
  user: { id: 'user-a', username: 'teacher_a', displayName: 'Giáo viên A', status: 'ACTIVE' as const, mustChangePassword: false },
  capabilities: [],
};

const userBAuth = {
  user: { id: 'user-b', username: 'teacher_b', displayName: 'Giáo viên B', status: 'ACTIVE' as const, mustChangePassword: false },
  capabilities: [],
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

function createProductionQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('CX-01 session and React Query cache isolation', () => {
  beforeEach(() => {
    setSessionChannelNameForTesting('session_isolation_test_channel');
  });

  afterEach(() => {
    resetBroadcastChannelForTesting();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. A loads business data -> logout -> cache A disappears', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userAAuth);
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true });
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // Populate business cache for User A
    queryClient.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stmt-a', teacher: 'Giáo viên A' }] });
    queryClient.setQueryData(['users'], { items: [{ id: 'user-a' }] });
    queryClient.setQueryData(['catalog', 'subjects'], [{ id: 'sub-1', name: 'Toán' }]);

    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();
    expect(queryClient.getQueryData(['users'])).toBeDefined();
    expect(queryClient.getQueryData(['catalog', 'subjects'])).toBeDefined();

    // User A logs out
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('anonymous');
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    expect(queryClient.getQueryData(['users'])).toBeUndefined();
    expect(queryClient.getQueryData(['catalog', 'subjects'])).toBeUndefined();
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });

  it('2. A loads fresh cache -> logout -> B logs in -> B does not receive A data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let currentSessionUser = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(currentSessionUser);
      if (url.endsWith('/auth/logout')) {
        currentSessionUser = null as unknown as typeof userAAuth;
        return jsonResponse({ success: true });
      }
      if (url.endsWith('/auth/login')) {
        currentSessionUser = userBAuth;
        return jsonResponse({ user: userBAuth.user, expiresAt: '2026-12-31T00:00:00Z' });
      }
      if (url.endsWith('/reporting-statements/mine')) {
        return jsonResponse({ items: [{ id: 'stmt-b', owner: 'user-b' }] });
      }
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // Fresh business cache for User A
    queryClient.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stmt-a', owner: 'user-a' }] });
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toEqual({ items: [{ id: 'stmt-a', owner: 'user-a' }] });

    // Logout User A
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe('anonymous');
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();

    // Login User B
    await act(async () => {
      await result.current.login({ username: 'teacher_b', password: 'Password9!' });
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.auth?.user.id).toBe('user-b');

    // B does not see A's data before or after refetch
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    const bData = await queryClient.fetchQuery({
      queryKey: ['reporting-statements-mine'],
      queryFn: () => apiFetch('/reporting-statements/mine'),
    });
    expect(bData).toEqual({ items: [{ id: 'stmt-b', owner: 'user-b' }] });
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toEqual({ items: [{ id: 'stmt-b', owner: 'user-b' }] });
  });

  it('3. A loads stale cache -> logout -> B logs in -> B does not receive A data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });

    let currentSessionUser = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(currentSessionUser);
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true });
      if (url.endsWith('/auth/login')) {
        currentSessionUser = userBAuth;
        return jsonResponse({ user: userBAuth.user, expiresAt: '2026-12-31T00:00:00Z' });
      }
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // Populate data and invalidate to make it explicitly stale
    queryClient.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stale-stmt-a' }] });
    await queryClient.invalidateQueries({ queryKey: ['reporting-statements-mine'], refetchType: 'none' });
    const query = queryClient.getQueryCache().find({ queryKey: ['reporting-statements-mine'] });
    expect(query?.isStale()).toBe(true);

    // Logout User A
    await act(async () => {
      await result.current.logout();
    });
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();

    // Login User B
    await act(async () => {
      await result.current.login({ username: 'teacher_b', password: 'Password9!' });
    });

    expect(result.current.auth?.user.id).toBe('user-b');
    // Stale data from A is completely gone and cannot be served to B
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
  });

  it('4. in-flight request for A -> logout -> B logs in -> late A response does not contaminate B', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let resolveInFlightA!: (res: Response) => void;
    const inFlightAPromise = new Promise<Response>((resolve) => {
      resolveInFlightA = resolve;
    });

    let currentSessionUser = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(currentSessionUser);
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true });
      if (url.endsWith('/auth/login')) {
        currentSessionUser = userBAuth;
        return jsonResponse({ user: userBAuth.user, expiresAt: '2026-12-31T00:00:00Z' });
      }
      if (url.endsWith('/reporting-statements/mine')) {
        return inFlightAPromise;
      }
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // Trigger in-flight query for A
    const fetchPromiseA = apiFetch<{ items: unknown[] }>('/reporting-statements/mine').catch((err: unknown) => err);

    // While A is in-flight, A logs out
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe('anonymous');

    // B logs in
    await act(async () => {
      await result.current.login({ username: 'teacher_b', password: 'Password9!' });
    });
    expect(result.current.auth?.user.id).toBe('user-b');

    // Set B's distinct cache data
    queryClient.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stmt-b-clean' }] });

    // Now late response of A resolves
    resolveInFlightA(jsonResponse({ items: [{ id: 'stmt-a-late-pollutant' }] }));
    const errorA = await fetchPromiseA;

    // A's late request was rejected because its session generation was superseded
    expect(errorA).toBeInstanceOf(ApiError);

    // B's cache is unaffected and NOT contaminated by A's late response
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toEqual({
      items: [{ id: 'stmt-b-clean' }],
    });
  });

  it('5. protected business API returns 401 -> session cache is invalidated', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userAAuth);
      if (url.endsWith('/reporting-statements/mine')) {
        return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Session expired' }, 401);
      }
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['existing-data'] });
    queryClient.setQueryData(['telegram-status'], { linked: true });
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();

    // Protected business API returns 401
    await act(async () => {
      await expect(apiFetch('/reporting-statements/mine')).rejects.toMatchObject({ statusCode: 401 });
    });

    // Central listener should have cleared business query cache and transitioned status to anonymous
    await waitFor(() => {
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
      expect(queryClient.getQueryData(['telegram-status'])).toBeUndefined();
      expect(result.current.status).toBe('anonymous');
    });
  });

  it('6. failed login credential 401 is NOT treated as previous valid session expired', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ statusCode: 401, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' }, 401),
    ));

    await expect(login({ username: 'wrong_user', password: 'WrongPassword' })).rejects.toMatchObject({
      statusCode: 401,
    });

    // The listener was NOT triggered by credential validation failure
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('7. Telegram status cache is cleared at session boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userAAuth);
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true });
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['telegram-status'], {
      linked: true,
      telegramChatId: '123456789',
      hasActiveLink: true,
    });
    expect(queryClient.getQueryData(['telegram-status'])).toBeDefined();

    await act(async () => {
      await result.current.logout();
    });

    expect(queryClient.getQueryData(['telegram-status'])).toBeUndefined();
  });

  it('8. Reporting list, detail, and workspace cache are cleared at session boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userAAuth);
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true });
      return jsonResponse({});
    }));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-workspace-context'], { activePeriod: 'Học kỳ 1' });
    queryClient.setQueryData(['reporting-statements-mine'], { items: ['mine-item'] });
    queryClient.setQueryData(['reporting-statements-accessible'], { items: ['accessible-item'] });
    queryClient.setQueryData(['reporting-statements-pending', 1], { items: ['pending-item'] });
    queryClient.setQueryData(['reporting-statement-detail', 'revision-uuid-1'], { id: 'revision-uuid-1' });

    expect(queryClient.getQueryData(['reporting-workspace-context'])).toBeDefined();
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();
    expect(queryClient.getQueryData(['reporting-statements-accessible'])).toBeDefined();
    expect(queryClient.getQueryData(['reporting-statements-pending', 1])).toBeDefined();
    expect(queryClient.getQueryData(['reporting-statement-detail', 'revision-uuid-1'])).toBeDefined();

    await act(async () => {
      await result.current.logout();
    });

    expect(queryClient.getQueryData(['reporting-workspace-context'])).toBeUndefined();
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    expect(queryClient.getQueryData(['reporting-statements-accessible'])).toBeUndefined();
    expect(queryClient.getQueryData(['reporting-statements-pending', 1])).toBeUndefined();
    expect(queryClient.getQueryData(['reporting-statement-detail', 'revision-uuid-1'])).toBeUndefined();
  });

  it('9. Cross-tab 1: Tab A receives boundary event from Tab B login -> clears cache A, resolves B, zero A data', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let originSessionUser = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(originSessionUser);
      return jsonResponse({});
    }));

    // Mount Tab A
    setLocalTabIdForTesting('tab-a');
    const { result: tabA } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });
    await waitFor(() => expect(tabA.current.status).toBe('authenticated'));
    expect(tabA.current.auth?.user.id).toBe('user-a');

    // Populate business cache in Tab A
    queryClientA.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stmt-a', owner: 'user-a' }] });
    queryClientA.setQueryData(['telegram-status'], { linked: true });
    expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeDefined();

    // Now simulate Tab B: login as User B succeeds, replacing origin cookie
    originSessionUser = userBAuth;

    // Tab B broadcasts SESSION_BOUNDARY_CHANGED
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-b-login',
        senderId: 'tab-b',
      });
      channel.close();
    });

    // Tab A receives boundary event: cache A is immediately cleared, /auth/me resolves B
    await waitFor(() => {
      expect(tabA.current.auth?.user.id).toBe('user-b');
      expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeUndefined();
      expect(queryClientA.getQueryData(['telegram-status'])).toBeUndefined();
    });
  });

  it('10. Cross-tab 2: Tab A has fresh business cache A -> remote boundary event clears it immediately', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userBAuth);
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });

    // Set fresh cache in Tab A
    queryClientA.setQueryData(['reporting-statements-mine'], { items: [{ id: 'fresh-a' }] });
    expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeDefined();

    // Remote boundary from Tab B
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-fresh',
        senderId: 'tab-b',
      });
      channel.close();
    });

    await waitFor(() => {
      expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('11. Cross-tab 3: Tab A has stale business cache A -> remote boundary event clears it', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userBAuth);
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });

    queryClientA.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stale-a' }] });
    await queryClientA.invalidateQueries({ queryKey: ['reporting-statements-mine'], refetchType: 'none' });

    // Remote boundary event
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-stale',
        senderId: 'tab-b',
      });
      channel.close();
    });

    await waitFor(() => {
      expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('12. Cross-tab 4: Tab A request is in-flight when remote boundary arrives -> late response does not repopulate cache', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let resolveInFlightA!: (res: Response) => void;
    const inFlightAPromise = new Promise<Response>((resolve) => {
      resolveInFlightA = resolve;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userBAuth);
      if (url.endsWith('/reporting-statements/mine')) return inFlightAPromise;
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });

    // Start in-flight request in Tab A
    const fetchPromiseA = apiFetch('/reporting-statements/mine').catch((err: unknown) => err);

    // Remote boundary arrives while in-flight
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-in-flight',
        senderId: 'tab-b',
      });
      channel.close();
    });

    // Set clean Tab B cache in QueryClient
    queryClientA.setQueryData(['reporting-statements-mine'], { items: [{ id: 'stmt-b-untouched' }] });

    // Now late response of A resolves
    resolveInFlightA(jsonResponse({ items: [{ id: 'stmt-a-late' }] }));
    const err = await fetchPromiseA;
    expect(err).toBeInstanceOf(ApiError);

    // B's cache is NOT contaminated by A's late response
    expect(queryClientA.getQueryData(['reporting-statements-mine'])).toEqual({
      items: [{ id: 'stmt-b-untouched' }],
    });
  });

  it('13. Cross-tab 5: Remote logout -> Tab A cache cleared and /auth/me -> 401 -> anonymous', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let originSessionUser: typeof userAAuth | null = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        if (!originSessionUser) {
          return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session' }, 401);
        }
        return jsonResponse(originSessionUser);
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result: tabA } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });
    await waitFor(() => expect(tabA.current.status).toBe('authenticated'));

    queryClientA.setQueryData(['reporting-statements-mine'], { items: ['some-data'] });

    // Remote logout happens: cookie cleared on origin
    originSessionUser = null;

    // Tab B broadcasts SESSION_BOUNDARY_CHANGED
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-logout',
        senderId: 'tab-b',
      });
      channel.close();
    });

    await waitFor(() => {
      expect(tabA.current.status).toBe('anonymous');
      expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeUndefined();
      expect(queryClientA.getQueryData(AUTH_QUERY_KEY)).toBeNull();
    });
  });

  it('14. Cross-tab 6: Failed credential login -> no boundary broadcast, valid existing session/cache retained', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(userAAuth);
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Sai mật khẩu' }, 401);
      }
      return jsonResponse({});
    }));

    const broadcastSpy = vi.fn();
    const testChannel = new BroadcastChannel(getSessionChannelName());
    testChannel.onmessage = broadcastSpy;

    setLocalTabIdForTesting('tab-test');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['valid-a-cache'] });

    // Attempt login with wrong password
    await act(async () => {
      await expect(result.current.login({ username: 'user_a', password: 'WrongPassword' })).rejects.toThrow();
    });

    // Session remains authenticated, cache retained, and NO broadcast was sent
    expect(result.current.status).toBe('authenticated');
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toEqual({ items: ['valid-a-cache'] });
    expect(broadcastSpy).not.toHaveBeenCalled();

    testChannel.close();
  });

  it('15. Cross-tab 7: Protected business 401 -> local clear + exactly one outbound boundary event, receiving tab does not rebroadcast', async () => {
    const queryClientA = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const queryClientB = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let isSessionValid = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        if (!isSessionValid) {
          return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Session expired' }, 401);
        }
        return jsonResponse(userAAuth);
      }
      if (url.endsWith('/reporting-statements/mine')) {
        isSessionValid = false;
        return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Session expired' }, 401);
      }
      return jsonResponse({});
    }));

    const broadcastMonitor = vi.fn();
    const monitorChannel = new BroadcastChannel(getSessionChannelName());
    monitorChannel.onmessage = broadcastMonitor;

    // Mount Tab B first to listen
    setLocalTabIdForTesting('tab-b');
    const { result: tabB } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClientB) });
    await waitFor(() => expect(tabB.current.status).toBe('authenticated'));
    queryClientB.setQueryData(['reporting-statements-mine'], { items: ['data-in-b'] });

    // Now switch identity to Tab A and encounter protected 401
    setLocalTabIdForTesting('tab-a');
    renderHook(() => useAuth(), { wrapper: createWrapper(queryClientA) });
    queryClientA.setQueryData(['reporting-statements-mine'], { items: ['data-in-a'] });

    await act(async () => {
      await expect(apiFetch('/reporting-statements/mine')).rejects.toMatchObject({ statusCode: 401 });
    });

    // Tab A cleared its cache
    expect(queryClientA.getQueryData(['reporting-statements-mine'])).toBeUndefined();

    // Exactly one outbound broadcast was sent from Tab A
    await waitFor(() => {
      expect(broadcastMonitor).toHaveBeenCalledTimes(1);
    });

    // Tab B received and cleared its cache without rebroadcasting
    await waitFor(() => {
      expect(queryClientB.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });

    // Ensure monitorChannel saw NO second broadcast (no infinite loop / rebroadcast)
    expect(broadcastMonitor).toHaveBeenCalledTimes(1);

    monitorChannel.close();
  });

  it('16. Cross-tab 8: No BroadcastChannel support -> focus/visibility fallback clears stale cache immediately and revalidates', async () => {
    // Simulate environment without BroadcastChannel
    const originalBC = globalThis.BroadcastChannel;
    // @ts-expect-error test override
    delete globalThis.BroadcastChannel;
    delete (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;

    try {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });

      let originUser = userAAuth;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(originUser);
        return jsonResponse({});
      }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));
      expect(result.current.auth?.user.id).toBe('user-a');

      queryClient.setQueryData(['reporting-statements-mine'], { items: ['user-a-secret-data'] });
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();

      // Outside this tab, cookie switched to User B
      originUser = userBAuth;

      // Tab returns to foreground (focus / visibilitychange)
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      // Stale User A cache was wiped immediately and revalidated to User B
      await waitFor(() => {
        expect(result.current.auth?.user.id).toBe('user-b');
        expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
      });
    } finally {
      globalThis.BroadcastChannel = originalBC;
    }
  });

  it('17. Body race: response body read pending while session generation changes -> rejected as old-session response', async () => {
    let resolveBody!: (text: string) => void;
    const pendingBodyPromise = new Promise<string>((resolve) => {
      resolveBody = resolve;
    });

    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: () => pendingBodyPromise,
    } as unknown as Response;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    // Start apiFetch
    const apiPromise = apiFetch('/reporting-statements/mine');

    // While body read is pending, session scope is reset / generation increments
    resetSessionScope();

    // Now body resolves
    resolveBody(JSON.stringify({ items: ['data-from-old-generation'] }));

    // Request must be rejected because generation changed during body read
    await expect(apiPromise).rejects.toMatchObject({
      message: 'Yêu cầu bị hủy do phiên làm việc đã thay đổi.',
    });
  });

  it('18. Test A & F: Production staleTime (30_000ms) with null auth cache -> remote boundary forces network /auth/me call and resolves B', async () => {
    // Exact production QueryClient configuration as main.tsx
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 2,
          staleTime: 30_000,
          refetchOnWindowFocus: false,
        },
      },
    });

    let authMeCallCount = 0;
    let originSessionUser: typeof userAAuth | null = userAAuth;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCallCount += 1;
        if (!originSessionUser) {
          return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session' }, 401);
        }
        return jsonResponse(originSessionUser);
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.auth?.user.id).toBe('user-a');
    expect(authMeCallCount).toBe(1);

    // Business cache populated in Tab A
    queryClient.setQueryData(['reporting-statements-mine'], { items: ['user-a-data'] });

    // Simulate scenario: auth cache was set to null (e.g. from prior logout or boundary)
    // with 30s staleTime, a plain fetchQuery might consider fresh null data.
    queryClient.setQueryData(AUTH_QUERY_KEY, null);

    // Switch origin cookie to User B
    originSessionUser = userBAuth;

    // Remote boundary from Tab B arrives
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-prod-staletime',
        senderId: 'tab-b',
      });
      channel.close();
    });

    // Verify GET /auth/me was actually called via network (call count incremented)
    await waitFor(() => {
      expect(authMeCallCount).toBe(2);
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('19. Test B: BroadcastChannel constructor throws -> foreground return safety net purges cache and resolves identity', async () => {
    const originalBC = globalThis.BroadcastChannel;

    // Simulate sandbox where BroadcastChannel constructor throws
    // @ts-expect-error test mock
    globalThis.BroadcastChannel = class ThrowingBroadcastChannel {
      constructor() {
        throw new Error('SecurityError: BroadcastChannel access denied in sandbox');
      }
    };

    try {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });

      let originUser = userAAuth;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(originUser);
        return jsonResponse({});
      }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));
      expect(result.current.auth?.user.id).toBe('user-a');

      queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-a'] });
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();

      // Outside tab, session cookie switched to User B
      originUser = userBAuth;

      // Foreground return (window focus)
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      // Safety net purged old cache immediately and resolved current identity User B
      await waitFor(() => {
        expect(result.current.auth?.user.id).toBe('user-b');
        expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
      });
    } finally {
      globalThis.BroadcastChannel = originalBC;
    }
  });

  it('20. Test C: postMessage throws -> sender does not crash and receiver relies on foreground safety net', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let originUser = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(originUser);
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-a'] });

    // Mock postMessage on channel throwing an error
    const channel = getBroadcastChannel();
    expect(channel).not.toBeNull();
    const postMessageSpy = vi.spyOn(channel!, 'postMessage').mockImplementation(() => {
      throw new Error('DataCloneError');
    });

    // Sender calls broadcastSessionBoundary() -> must not throw
    expect(() => broadcastSessionBoundary()).not.toThrow();
    postMessageSpy.mockRestore();

    // Origin cookie switched to B
    originUser = userBAuth;

    // Since broadcast failed to send, Tab A relies on foreground return safety net
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(result.current.auth?.user.id).toBe('user-b');
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('21. Test D: Burst boundary events (logout -> login) -> latest login event wins, final state is User B', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let originUser: typeof userAAuth | null = userAAuth;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        if (!originUser) {
          return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session' }, 401);
        }
        return jsonResponse(originUser);
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-a'] });

    // Burst events from Tab B:
    // Event 1: Logout
    originUser = null;
    const channel = new BroadcastChannel(getSessionChannelName());

    await act(async () => {
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-burst-1-logout',
        senderId: 'tab-b',
      });

      // Immediately Event 2: Login as User B
      originUser = userBAuth;
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-burst-2-login',
        senderId: 'tab-b',
      });
    });

    channel.close();

    // Final state must resolve to User B, never stuck in anonymous, with zero User A cache
    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('22. Test E: First reconciliation pending while second boundary arrives -> slow first response cannot overwrite new state', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let resolveFirstFetch!: (res: Response) => void;
    const firstFetchPromise = new Promise<Response>((resolve) => {
      resolveFirstFetch = resolve;
    });

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        callCount += 1;
        if (callCount === 1) {
          // Initial mount
          return jsonResponse(userAAuth);
        }
        if (callCount === 2) {
          // Slow first reconciliation
          return firstFetchPromise;
        }
        if (callCount === 3) {
          // Fast second reconciliation
          return jsonResponse(userBAuth);
        }
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const channel = new BroadcastChannel(getSessionChannelName());

    // Boundary 1 triggers callCount 2 (pending)
    await act(async () => {
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-slow-1',
        senderId: 'tab-b',
      });
    });

    // Boundary 2 arrives and triggers callCount 3 (which resolves immediately with User B)
    await act(async () => {
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-fast-2',
        senderId: 'tab-b',
      });
    });

    channel.close();

    // Second reconciliation resolved to User B
    await waitFor(() => {
      expect(result.current.auth?.user.id).toBe('user-b');
    });

    // Now slow first reconciliation finishes (with 401 anonymous)
    await act(async () => {
      resolveFirstFetch(jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'No session' }, 401));
    });

    // Crucial check: First reconciliation MUST NOT overwrite or demote User B to anonymous
    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
    });
  });

  it('23. Fail-closed checking state: status is "checking" and auth is null while revalidation is in-flight', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    let resolveRevalidate!: (res: Response) => void;
    const revalidatePromise = new Promise<Response>((resolve) => {
      resolveRevalidate = resolve;
    });

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        callCount += 1;
        if (callCount === 1) return jsonResponse(userAAuth);
        return revalidatePromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.auth?.user.id).toBe('user-a');

    // Remote boundary arrives
    await act(async () => {
      const channel = new BroadcastChannel(getSessionChannelName());
      channel.postMessage({
        type: 'SESSION_BOUNDARY_CHANGED',
        eventId: 'evt-check-status',
        senderId: 'tab-b',
      });
      channel.close();
    });

    // While revalidate is in-flight: fail-closed state
    expect(result.current.status).toBe('checking');
    expect(result.current.auth).toBeNull();

    // Complete revalidation with User B
    await act(async () => {
      resolveRevalidate(jsonResponse(userBAuth));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
    });
  });

  it('24. Test RC4-01: BroadcastChannel operational + delayed foreground verification -> fail-closed checking/null state while in-flight, resolves B', async () => {
    // Exact production QueryClient options (staleTime: 30_000, refetchOnWindowFocus: false)
    const queryClient = createProductionQueryClient();

    let resolveAuthMePending!: (res: Response) => void;
    const authMePendingPromise = new Promise<Response>((resolve) => {
      resolveAuthMePending = resolve;
    });

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        callCount += 1;
        if (callCount === 1) {
          // Mount initial User A
          return jsonResponse(userAAuth);
        }
        // Delayed foreground verification response
        return authMePendingPromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.auth?.user.id).toBe('user-a');

    // Populate User A secret business cache
    queryClient.setQueryData(['reporting-statements-mine'], { items: [{ id: 'secret-stmt-a' }] });
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();

    // BroadcastChannel is operational
    expect(getBroadcastChannel()).not.toBeNull();

    // Outside this tab, origin cookie changed to User B without boundary received (e.g. lost/delayed broadcast)
    // Foreground event fires
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // CRITICAL PROOF FOR RC4-01: while /auth/me is in-flight, presentation MUST fail-closed:
    expect(result.current.status).toBe('checking');
    expect(result.current.auth).toBeNull();
    // Cache remains temporarily in memory but is inaccessible to user
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeDefined();

    // Now resolve server network authority with User B
    await act(async () => {
      resolveAuthMePending(jsonResponse(userBAuth));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
      // Secret cache A removed completely
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('25. Test RC4-01: postMessage failure + delayed foreground verification -> immediately assert status checking and auth null', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const pendingAuthMe = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        callCount += 1;
        if (callCount === 1) return jsonResponse(userAAuth);
        return pendingAuthMe;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-a'] });

    // Mock postMessage on channel throwing an error (delivery failure)
    const channel = getBroadcastChannel();
    expect(channel).not.toBeNull();
    const postMessageSpy = vi.spyOn(channel!, 'postMessage').mockImplementation(() => {
      throw new Error('DataCloneError');
    });

    // Sender attempts broadcast -> silently fails without throwing
    expect(() => broadcastSessionBoundary()).not.toThrow();
    postMessageSpy.mockRestore();

    // Foreground occurs on Tab A
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // IMMEDIATELY ASSERT fail-closed presentation while in-flight:
    expect(result.current.status).toBe('checking');
    expect(result.current.auth).toBeNull();

    // Resolve eventual User B
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userBAuth));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('26. Test RC4-02: same-user foreground does not rotate session generation', async () => {
    // Production QueryClient options (staleTime: 30_000, refetchOnWindowFocus: false)
    const queryClient = createProductionQueryClient();

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        return jsonResponse(userAAuth);
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.auth?.user.id).toBe('user-a');
    expect(authMeCount).toBe(1);

    // Capture initial session generation
    const initialGeneration = getCurrentSessionGeneration();

    // Foreground verification occurs and returns same User A
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(authMeCount).toBe(2);
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-a');
    });

    // MANDATORY PROOF FOR RC4-02: Generation must be exactly unchanged!
    expect(getCurrentSessionGeneration()).toBe(initialGeneration);
  });

  it('27. Test RC4-02: same-user foreground does not abort in-flight GET business request', async () => {
    // Production QueryClient options (staleTime: 30_000, refetchOnWindowFocus: false)
    const queryClient = createProductionQueryClient();

    let resolveBusinessGet!: (res: Response) => void;
    const businessGetPromise = new Promise<Response>((resolve) => {
      resolveBusinessGet = resolve;
    });

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      if (url.endsWith('/reporting-statements/mine')) {
        return businessGetPromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 1. Start protected business GET with delayed response
    const businessGetRequest = apiFetch<{ items: Array<{ id: string }> }>('/reporting-statements/mine');

    // 2. Trigger foreground while GET is in-flight
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.status).toBe('checking');

    // 3. Resolve /auth/me as same User A
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userAAuth));
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 4. Then resolve business GET
    resolveBusinessGet(jsonResponse({ items: [{ id: 'stmt-valid-user-a' }] }));

    // Request must succeed normally and NOT receive session changed abort error
    const getResult = await businessGetRequest;
    expect(getResult).toEqual({ items: [{ id: 'stmt-valid-user-a' }] });
  });

  it('28. Test RC4-02: same-user foreground does not abort in-flight mutation (write certainty)', async () => {
    const queryClient = createProductionQueryClient();

    let resolveMutation!: (res: Response) => void;
    const mutationPromise = new Promise<Response>((resolve) => {
      resolveMutation = resolve;
    });

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      if (url.endsWith('/reporting-statements')) {
        return mutationPromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 1. Start representative protected POST mutation with delayed response
    const mutationRequest = apiFetch<{ id: string; title: string }>('/reporting-statements', {
      method: 'POST',
      body: JSON.stringify({ title: 'Báo giảng tuần 10' }),
    });

    // 2. Trigger foreground while mutation is in-flight
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.status).toBe('checking');

    // 3. Resolve /auth/me as same User A
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userAAuth));
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 4. Then resolve mutation response
    resolveMutation(jsonResponse({ id: 'created-stmt-10', title: 'Báo giảng tuần 10' }));

    // Mutation must resolve normally, preserving write-result certainty
    const mutationResult = await mutationRequest;
    expect(mutationResult).toEqual({ id: 'created-stmt-10', title: 'Báo giảng tuần 10' });
  });

  it('29. changed-user foreground DOES invalidate generation and abort old requests', async () => {
    const queryClient = createProductionQueryClient();

    let resolveOldInFlight!: (res: Response) => void;
    const oldInFlightPromise = new Promise<Response>((resolve) => {
      resolveOldInFlight = resolve;
    });

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      if (url.endsWith('/reporting-statements/mine')) {
        return oldInFlightPromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-data-a'] });
    const initialGeneration = getCurrentSessionGeneration();

    // Start old User-A request
    const oldRequest = apiFetch('/reporting-statements/mine').catch((err: unknown) => err);

    // Foreground occurs
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // Foreground resolves User B (session boundary change)
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userBAuth));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
      expect(result.current.auth?.user.id).toBe('user-b');
    });

    // Generation was incremented/invalidated
    expect(getCurrentSessionGeneration()).toBeGreaterThan(initialGeneration);

    // Old cache A is removed
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();

    // Resolve late old request: must be rejected due to generation change
    resolveOldInFlight(jsonResponse({ items: ['polluting-data-a'] }));
    const oldError = await oldRequest;
    expect(oldError).toBeInstanceOf(ApiError);
    expect((oldError as ApiError).message).toBe('Yêu cầu bị hủy do phiên làm việc đã thay đổi.');

    // B cache is not polluted
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
  });

  it('30. foreground 401 transitions to anonymous and purges cache and generation', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-a'] });
    const initialGen = getCurrentSessionGeneration();

    // Trigger foreground
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // While in-flight: checking and null
    expect(result.current.status).toBe('checking');
    expect(result.current.auth).toBeNull();

    // /auth/me returns 401 (session revoked)
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Hết phiên' }, 401));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('anonymous');
      expect(result.current.auth).toBeNull();
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });

    // Generation was incremented/invalidated
    expect(getCurrentSessionGeneration()).toBeGreaterThan(initialGen);
  });

  it('31. no BroadcastChannel same-user foreground retains cache and generation', async () => {
    const originalBC = globalThis.BroadcastChannel;
    // @ts-expect-error test override
    delete globalThis.BroadcastChannel;
    delete (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;

    try {
      const queryClient = createProductionQueryClient();

      let resolveForegroundAuthMe!: (res: Response) => void;
      const foregroundAuthMePromise = new Promise<Response>((resolve) => {
        resolveForegroundAuthMe = resolve;
      });

      let authMeCount = 0;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          authMeCount += 1;
          if (authMeCount === 1) return jsonResponse(userAAuth);
          return foregroundAuthMePromise;
        }
        return jsonResponse({});
      }));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));

      queryClient.setQueryData(['reporting-statements-mine'], { items: ['valid-user-a-cache'] });
      const initialGen = getCurrentSessionGeneration();

      // Trigger foreground
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      // Presentation fails closed during verification
      expect(result.current.status).toBe('checking');
      expect(result.current.auth).toBeNull();

      // Resolve same User A
      await act(async () => {
        resolveForegroundAuthMe(jsonResponse(userAAuth));
      });

      await waitFor(() => {
        expect(result.current.status).toBe('authenticated');
        expect(result.current.auth?.user.id).toBe('user-a');
      });

      // Cache is retained, generation is unchanged!
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toEqual({ items: ['valid-user-a-cache'] });
      expect(getCurrentSessionGeneration()).toBe(initialGen);
    } finally {
      globalThis.BroadcastChannel = originalBC;
    }
  });

  it('32. Test RC5-01: Draft survives same-user foreground verification without component remounting', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      return jsonResponse({});
    }));

    let mountCount = 0;
    let unmountCount = 0;

    function DraftFixture() {
      const [draftText, setDraftText] = useState('');
      useEffect(() => {
        mountCount += 1;
        return () => {
          unmountCount += 1;
        };
      }, []);

      return (
        <div data-testid="protected-fixture">
          <input
            data-testid="draft-field"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
          />
          <span data-testid="preview-field">{draftText}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/protected" element={<DraftFixture />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Initial mount completes
    await waitFor(() => {
      expect(screen.getByTestId('draft-field')).toBeDefined();
    });
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    // User types draft text: 'DRAFT-MUST-SURVIVE'
    const input = screen.getByTestId('draft-field') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DRAFT-MUST-SURVIVE' } });
    expect(input.value).toBe('DRAFT-MUST-SURVIVE');
    expect(screen.getByTestId('preview-field').textContent).toBe('DRAFT-MUST-SURVIVE');

    const initialGen = getCurrentSessionGeneration();

    // Trigger foreground verification (focus event)
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // While in-flight: session verification shield is visible, protected content is shielded
    expect(screen.getByText('Đang kiểm tra phiên làm việc')).toBeDefined();
    const fixtureWrapper = screen.getByTestId('protected-fixture').parentElement;
    expect(fixtureWrapper?.style.display).toBe('none');
    expect(fixtureWrapper?.getAttribute('aria-hidden')).toBe('true');

    // Server verifies same User A
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userAAuth));
    });

    // Verification completes: shield is removed, protected content is restored
    await waitFor(() => {
      expect(screen.queryByText('Đang kiểm tra phiên làm việc')).toBeNull();
    });

    // Assert: exact draft value is still 'DRAFT-MUST-SURVIVE'
    expect(input.value).toBe('DRAFT-MUST-SURVIVE');
    expect(screen.getByTestId('preview-field').textContent).toBe('DRAFT-MUST-SURVIVE');

    // Assert: component was NOT remounted
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    // Assert: generation unchanged
    expect(getCurrentSessionGeneration()).toBe(initialGen);
  });

  it('33. Test RC5-01: Real production page (ReportingStatementsPage) preserves local state across same-user foreground verification', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    const userAWithReporting = {
      user: { id: 'user-a', username: 'teacher_a', displayName: 'Giáo viên A', status: 'ACTIVE' as const, mustChangePassword: false },
      capabilities: [
        { key: 'TEACHER_BASE' as const, scope: 'PERSONAL' as const },
        { key: 'REPORTING_STATEMENT_SUBMIT' as const, scope: 'PERSONAL' as const },
        { key: 'REPORTING_STATEMENT_READ' as const, scope: 'PERSONAL' as const },
      ],
    };

    const mockWorkspaceContext = {
      academicYears: [
        { id: 'year-2025', name: 'Năm học 2025-2026', code: '2025-2026' },
        { id: 'year-2026', name: 'Năm học 2026-2027', code: '2026-2027' },
      ],
    };

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAWithReporting);
        return foregroundAuthMePromise;
      }
      if (url.endsWith('/reporting-statements/workspace-context')) {
        return jsonResponse(mockWorkspaceContext);
      }
      if (url.endsWith('/reporting-statements/mine?page=1&pageSize=10')) {
        return jsonResponse({ items: [], total: 0 });
      }
      return jsonResponse({});
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/bao-cao-ke-khai']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/bao-cao-ke-khai" element={<ReportingStatementsPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Wait for ReportingStatementsPage to render with academic years
    await waitFor(() => {
      expect(screen.getByLabelText(/Năm học/i)).toBeDefined();
    });

    const yearSelect = screen.getByLabelText(/Năm học/i) as HTMLSelectElement;

    // User interacts with form and populates draft values
    fireEvent.change(yearSelect, { target: { value: 'year-2026' } });
    expect(yearSelect.value).toBe('year-2026');

    // Trigger foreground return
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // In-flight: shield visible
    expect(screen.getByText('Đang kiểm tra phiên làm việc')).toBeDefined();

    // Resolve same user
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userAWithReporting));
    });

    await waitFor(() => {
      expect(screen.queryByText('Đang kiểm tra phiên làm việc')).toBeNull();
    });

    // After completion: exact user inputs remain intact
    expect(yearSelect.value).toBe('year-2026');
  });

  it('34. Test RC5-01: Changed user discards old draft and unmounts old protected subtree', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      return jsonResponse({});
    }));

    let unmountCount = 0;
    function UserDraftFixture() {
      const [text, setText] = useState('');
      useEffect(() => {
        return () => {
          unmountCount += 1;
        };
      }, []);

      return (
        <div>
          <input data-testid="user-input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/protected" element={<UserDraftFixture />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-input')).toBeDefined();
    });

    // User A inputs sensitive draft
    const input = screen.getByTestId('user-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'USER-A-SECRET-DRAFT' } });
    expect(input.value).toBe('USER-A-SECRET-DRAFT');

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['secret-cache-a'] });

    // Foreground verification occurs
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // Foreground verification confirms User B (changed account)
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userBAuth));
    });

    await waitFor(() => {
      expect(screen.queryByText('Đang kiểm tra phiên làm việc')).toBeNull();
    });

    // Assert: old User-A subtree was unmounted and draft discarded
    expect(unmountCount).toBeGreaterThan(0);
    const freshInput = screen.getByTestId('user-input') as HTMLInputElement;
    expect(freshInput.value).toBe('');

    // Assert: User A cache was completely purged
    expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
  });

  it('35. Test RC5-01: 401 discards old draft and transitions to login route', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      return jsonResponse({});
    }));

    let unmountCount = 0;
    function UserDraftFixture() {
      const [text, setText] = useState('');
      useEffect(() => {
        return () => {
          unmountCount += 1;
        };
      }, []);

      return (
        <div>
          <input data-testid="user-input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/protected" element={<UserDraftFixture />} />
              </Route>
              <Route path="/dang-nhap" element={<div data-testid="login-page">Trang đăng nhập</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-input')).toBeDefined();
    });

    // User A inputs draft
    fireEvent.change(screen.getByTestId('user-input'), { target: { value: 'USER-A-UNSAVED-DRAFT' } });

    // Trigger foreground
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // Server returns 401 Unauthorized
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Hết phiên' }, 401));
    });

    // Subtree unmounted and redirected to login page
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeDefined();
    });
    expect(unmountCount).toBeGreaterThan(0);
    expect(screen.queryByTestId('user-input')).toBeNull();
  });

  it('36. Test RC5-02: Pending foreground reconciliation superseded by protected 401', async () => {
    const queryClient = createProductionQueryClient();

    let resolvePendingForeground!: (res: Response) => void;
    const pendingForegroundPromise = new Promise<Response>((resolve) => {
      resolvePendingForeground = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return pendingForegroundPromise;
      }
      if (url.endsWith('/reporting-statements/mine')) {
        return jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Session expired' }, 401);
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    queryClient.setQueryData(['reporting-statements-mine'], { items: ['user-a-data'] });

    // 1. Foreground reconciliation N starts (/auth/me N pending)
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.reconciliationMode).toBe('FOREGROUND_VERIFY');

    // 2. While N is in-flight, a protected business request returns 401
    await act(async () => {
      await expect(apiFetch('/reporting-statements/mine')).rejects.toMatchObject({ statusCode: 401 });
    });

    // Local 401 boundary immediately clears session and invalidates pending sequence
    await waitFor(() => {
      expect(result.current.status).toBe('anonymous');
      expect(result.current.auth).toBeNull();
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });

    // 3. Late response of /auth/me N resolves with HTTP 200 User A
    await act(async () => {
      resolvePendingForeground(jsonResponse(userAAuth));
    });

    // Final result MUST remain anonymous; stale reconciliation N performed zero mutation
    await waitFor(() => {
      expect(result.current.status).toBe('anonymous');
      expect(result.current.auth).toBeNull();
      expect(queryClient.getQueryData(['reporting-statements-mine'])).toBeUndefined();
    });
  });

  it('37. Test RC5-02: Pending foreground reconciliation superseded by successful logout', async () => {
    const queryClient = createProductionQueryClient();

    let resolvePendingForeground!: (res: Response) => void;
    const pendingForegroundPromise = new Promise<Response>((resolve) => {
      resolvePendingForeground = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return pendingForegroundPromise;
      }
      if (url.endsWith('/auth/logout')) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({});
    }));

    setLocalTabIdForTesting('tab-a');
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // 1. Start foreground reconciliation N
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.reconciliationMode).toBe('FOREGROUND_VERIFY');

    // 2. User logs out while N is in-flight
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe('anonymous');

    // 3. Late response of /auth/me N resolves with User A
    await act(async () => {
      resolvePendingForeground(jsonResponse(userAAuth));
    });

    // Must remain anonymous; late N cannot restore authentication
    await waitFor(() => {
      expect(result.current.status).toBe('anonymous');
      expect(result.current.auth).toBeNull();
    });
  });

  it('38. Test RC5-01: Same-user foreground does not remount protected component (mount count unchanged, unmount count == 0)', async () => {
    const queryClient = createProductionQueryClient();

    let resolveForegroundAuthMe!: (res: Response) => void;
    const foregroundAuthMePromise = new Promise<Response>((resolve) => {
      resolveForegroundAuthMe = resolve;
    });

    let authMeCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        authMeCount += 1;
        if (authMeCount === 1) return jsonResponse(userAAuth);
        return foregroundAuthMePromise;
      }
      return jsonResponse({});
    }));

    let mountCount = 0;
    let unmountCount = 0;

    function MonitoredComponent() {
      useEffect(() => {
        mountCount += 1;
        return () => {
          unmountCount += 1;
        };
      }, []);

      return <div data-testid="monitored">Monitored Component</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/protected" element={<MonitoredComponent />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('monitored')).toBeDefined();
    });
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    // Trigger foreground
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    // In-flight: shield visible
    expect(screen.getByText('Đang kiểm tra phiên làm việc')).toBeDefined();

    // Resolve same User A
    await act(async () => {
      resolveForegroundAuthMe(jsonResponse(userAAuth));
    });

    await waitFor(() => {
      expect(screen.queryByText('Đang kiểm tra phiên làm việc')).toBeNull();
    });

    // Exact invariant: mount count unchanged and unmount count is 0
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });
});
