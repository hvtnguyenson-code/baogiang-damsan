import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/auth-context';
import { AUTH_QUERY_KEY, onUnauthorized } from '../auth/session-cache';
import { ApiError, apiFetch, login } from '../lib/api-client';
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

describe('CX-01 session and React Query cache isolation', () => {
  afterEach(() => {
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
});
