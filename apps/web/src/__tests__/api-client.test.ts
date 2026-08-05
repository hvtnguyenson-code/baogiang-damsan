import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, changePassword, fetchAuthMe, onUnauthorized } from '../lib/api-client';
import { jsonResponse, normalAuth } from './test-utils';

describe('api client', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends same-origin credentials and handles typed JSON success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(normalAuth));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAuthMe()).resolves.toEqual(normalAuth);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('handles a 204 or empty success without attempting JSON parsing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch<void>('/empty')).resolves.toBeUndefined();
  });

  it('normalizes 403 without notifying an unauthenticated transition', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 403, error: 'Forbidden', message: 'Denied', timestamp: 'now' }, 403)));
    await expect(apiFetch('/protected', { notifyUnauthorized: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('notifies authenticated state on 401 and never exposes the raw response body', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Invalid session', timestamp: 'now', secret: 'hidden' }, 401)));
    const failure = fetchAuthMe().catch((error: unknown) => error);
    await expect(failure).resolves.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    expect((await failure as ApiError)).not.toHaveProperty('body');
    unsubscribe();
  });

  it('does not notify the global unauthorized listener for a password-change 401', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 401, message: 'Current password is incorrect' }, 401)));
    await expect(changePassword({ currentPassword: 'wrong', newPassword: 'ReplacementPassword8' })).rejects.toMatchObject({ statusCode: 401 });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('normalizes network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket details')));
    await expect(fetchAuthMe()).rejects.toMatchObject({ statusCode: 0, message: 'Không thể kết nối đến máy chủ.' });
  });
});
