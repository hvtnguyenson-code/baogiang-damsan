import { TelegramBotApiAdapter } from './telegram-bot-api.adapter';
import { AppConfig } from '../config/app.config';

describe('TelegramBotApiAdapter', () => {
  const secretBotToken = 'SECRET_BOT_TOKEN_XYZ_123';
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
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('2. parses 200 OK with message_id as success', async () => {
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

  it('3. sanitized provider error does not leak bot token or full URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error_code: 400,
        description: `Bad Request: chat not found with token ${secretBotToken}`,
      }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(false);
    // Error code must be sanitized, and NEVER contain token
    expect(result.sanitizedErrorCode).toBeDefined();
    expect(result.sanitizedErrorCode).not.toContain(secretBotToken);
    expect(result.sanitizedErrorCode).not.toContain('https://');
    expect(result.sanitizedErrorCode).not.toContain('api.telegram.org');
  });

  it('4. returns uncertainOutcome: true on 5xx server error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway' }),
    });

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('HTTP_502');
  });

  it('5. returns uncertainOutcome: true on network timeout or abort', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const result = await adapter.sendMessage('12345', 'Hello');
    expect(result.success).toBe(false);
    expect(result.uncertainOutcome).toBe(true);
    expect(result.sanitizedErrorCode).toBe('TIMEOUT');
  });
});
