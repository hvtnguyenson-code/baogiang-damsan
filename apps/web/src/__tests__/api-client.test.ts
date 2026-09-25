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

  it('preserves standard error body with statusCode, serverError, and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ statusCode: 409, error: 'Conflict', message: 'Tài nguyên đã tồn tại.' }, 409),
      ),
    );
    const failure = apiFetch('/test').catch((err: unknown) => err);
    const error = (await failure) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(409);
    expect(error.serverError).toBe('Conflict');
    expect(error.message).toBe('Tài nguyên đã tồn tại.');
  });

  it('preserves custom semantic error body without statusCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
            message: 'Thay đổi hồ sơ áp dụng chương trình không được chia cắt tuần học nghiệp vụ.',
          },
          409,
        ),
      ),
    );
    const failure = apiFetch('/test').catch((err: unknown) => err);
    const error = (await failure) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(409);
    expect(error.serverError).toBe('PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT');
    expect(error.message).toBe('Thay đổi hồ sơ áp dụng chương trình không được chia cắt tuần học nghiệp vụ.');
  });

  it('normalizes malformed non-object or empty error body with sanitized generic message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error Text', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    const failure = apiFetch('/test').catch((err: unknown) => err);
    const error = (await failure) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(500);
    expect(error.serverError).toBeUndefined();
    expect(error.message).toBe('Yêu cầu không thực hiện được.');
  });

  it('sets Content-Type application/json for JSON request with body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/json-test', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/json-test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('does not force Content-Type application/json for FormData request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('file', 'mock-content');

    await apiFetch('/upload-test', {
      method: 'POST',
      body: formData,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upload-test',
      expect.objectContaining({
        body: formData,
        headers: expect.not.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    const passedHeaders = fetchMock.mock.calls[0][1].headers;
    expect(passedHeaders['Content-Type']).toBeUndefined();
    expect(passedHeaders.Accept).toBe('application/json');
  });

  it('preserves custom headers and allows overriding defaults', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/custom-headers', {
      method: 'POST',
      body: JSON.stringify({ test: 1 }),
      headers: {
        'X-Custom-Header': 'CustomValue',
        'Content-Type': 'application/vnd.custom+json',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/custom-headers',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-Custom-Header': 'CustomValue',
          'Content-Type': 'application/vnd.custom+json',
        }),
      }),
    );
  });

  it('preserves unauthorized notification behavior for FormData requests without regression', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Phiên hết hạn' }, 401),
      ),
    );

    const formData = new FormData();
    formData.append('data', 'test');

    await expect(
      apiFetch('/upload-protected', {
        method: 'POST',
        body: formData,
        notifyUnauthorized: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Phiên hết hạn' });

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
