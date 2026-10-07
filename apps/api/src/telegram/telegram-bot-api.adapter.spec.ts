import { TelegramBotApiAdapter } from './telegram-bot-api.adapter';
import { AppConfig } from '../config/app.config';

describe('TelegramBotApiAdapter (CX-02 / CX-03 / CX-04 Transport Hardening)', () => {
  const secretBotToken = '123456:ABC-DEF_ghi_SecretBotToken_999';
  const mockConfig: AppConfig = {
    nodeEnv: 'test',
    timeZone: 'Asia/Ho_Chi_Minh',
    host: '127.0.0.1',
    port: 3100,
    httpTrustProxyHops: 1,
    corsOrigins: ['http://localhost:5173'],
    auth: {
      sessionTtlSeconds: 86400,
      lastSeenUpdateSeconds: 300,
      cookieName: 'sid',
      cookiePath: '/',
      cookieSecure: false,
      cookieSameSite: 'lax',
      lockoutThreshold: 5,
      lockoutDurationSeconds: 900,
      passwordMinLength: 8,
      loginRateLimitMax: 10,
      loginRateLimitWindowSeconds: 60,
      loginRateLimitMaxKeys: 1000,
    },
    aiEnabled: false,
    aiActiveModeEnabled: false,
    aiPassiveModeEnabled: false,
    webPushEnabled: false,
    telegram: {
      enabled: true,
      botToken: secretBotToken,
      botUsername: 'test_bot',
      webhookSecret: 'secret_123',
    },
    databaseUrl: 'postgresql://...',
    logLevel: 'info',
  };

  let adapter: TelegramBotApiAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new TelegramBotApiAdapter(mockConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('1. returns FEATURE_DISABLED without calling fetch when disabled', async () => {
    const disabledAdapter = new TelegramBotApiAdapter({
      ...mockConfig,
      telegram: { enabled: false },
    });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const result = await disabledAdapter.sendMessage('12345', 'test message');
    expect(result.success).toBe(false);
    expect(result.sanitizedErrorCode).toBe('FEATURE_DISABLED');
    expect(result.uncertainOutcome).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('2. HTTP 200 + valid ok:true + message_id -> SENT-compatible success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { message_id: 887766 },
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('887766');
    expect(result.uncertainOutcome).toBeUndefined();
  });

  it('3. HTTP 200 + ok:true but missing message_id -> uncertain / UNKNOWN (CX-03)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {}, // missing message_id
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('MALFORMED_SUCCESS_ACKNOWLEDGEMENT');
    expect(result.providerMessageId).toBeUndefined();
  });

  it('4. HTTP 200 malformed JSON -> uncertain / UNKNOWN (CX-03)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('PROVIDER_RESPONSE_PARSE_ERROR');
  });

  it('5. HTTP 400 -> deterministic FAILED-compatible code HTTP_400 (CX-02)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error_code: 400,
        description: `Bad Request: token ${secretBotToken}`,
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(false);
    expect(result.sanitizedErrorCode).toBe('HTTP_400');
  });

  it('6. HTTP 403 -> deterministic FAILED-compatible code HTTP_403 (CX-02)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(false);
    expect(result.sanitizedErrorCode).toBe('HTTP_403');
  });

  it('7. HTTP 404 -> deterministic FAILED-compatible code HTTP_404 (CX-02)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        ok: false,
        error_code: 404,
        description: 'Not Found',
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(false);
    expect(result.sanitizedErrorCode).toBe('HTTP_404');
  });

  it('8. HTTP 429 -> deterministic FAILED-compatible code HTTP_429 (CX-02)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests',
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(false);
    expect(result.sanitizedErrorCode).toBe('HTTP_429');
  });

  it('9. HTTP 5xx -> UNKNOWN (500 and 502)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const result500 = await adapter.sendMessage('12345', 'Hello');
    expect(result500.success).toBe(false);
    expect(result500.uncertainOutcome).toBe(true);
    expect(result500.sanitizedErrorCode).toBe('HTTP_500');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway' }),
    });

    const result502 = await adapter.sendMessage('12345', 'Hello');
    expect(result502.success).toBe(false);
    expect(result502.uncertainOutcome).toBe(true);
    expect(result502.sanitizedErrorCode).toBe('HTTP_502');
  });

  it('10. network error -> UNKNOWN', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('NETWORK_ERROR');
  });

  it('11. timeout before headers -> UNKNOWN', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('TIMEOUT');
  });

  it('12. headers received but response body stalls beyond deadline -> abort / UNKNOWN (CX-04)', async () => {
    jest.useFakeTimers();

    // Simulate fetch returning response headers, but response.json() hangs until controller.abort() triggers AbortError
    global.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            if (signal?.aborted) {
              const abortError = new Error('The user aborted a request.');
              abortError.name = 'AbortError';
              reject(abortError);
              return;
            }
            signal?.addEventListener('abort', () => {
              const abortError = new Error('The user aborted a request.');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      });
    });

    const sendPromise = adapter.sendMessage('12345', 'Hello');

    // Flush microtasks so fetch resolves and execution reaches response.json()
    await Promise.resolve();
    await Promise.resolve();

    // Advance fake timer past the 10-second timeout deadline
    jest.advanceTimersByTime(10001);

    const result = await sendPromise;
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('TIMEOUT');
  });

  it('13. provider description with token at beginning/middle/end does NOT leak into error code (CX-02)', async () => {
    // Beginning
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ description: `${secretBotToken} bad parameter` }),
    });
    let result = await adapter.sendMessage('12345', 'Hello');
    expect(result.sanitizedErrorCode).toBe('HTTP_400');
    expect(result.sanitizedErrorCode).not.toContain(secretBotToken);

    // Middle
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ description: `user blocked bot ${secretBotToken} permanently` }),
    });
    result = await adapter.sendMessage('12345', 'Hello');
    expect(result.sanitizedErrorCode).toBe('HTTP_403');
    expect(result.sanitizedErrorCode).not.toContain(secretBotToken);

    // End
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ description: `cannot find chat with ${secretBotToken}` }),
    });
    result = await adapter.sendMessage('12345', 'Hello');
    expect(result.sanitizedErrorCode).toBe('HTTP_404');
    expect(result.sanitizedErrorCode).not.toContain(secretBotToken);
  });

  it('14. provider description with provider URL does NOT leak URL (CX-02)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ description: 'see documentation at https://api.telegram.org/bot123456/sendMessage' }),
    });
    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.sanitizedErrorCode).toBe('HTTP_400');
    expect(result.sanitizedErrorCode).not.toContain('https://');
    expect(result.sanitizedErrorCode).not.toContain('api.telegram.org');
  });
});
