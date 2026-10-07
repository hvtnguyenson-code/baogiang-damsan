import { appConfig } from '../../src/config/app.config';
import { BUSINESS_TIME_ZONE } from '@baogiang/config';

/**
 * Unit tests for app configuration factory.
 * Verifies validation behavior.
 */
describe('appConfig (unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create fresh copy of env for each test
    process.env = { ...originalEnv };
    process.env['TZ'] = BUSINESS_TIME_ZONE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw if DATABASE_URL is not set', () => {
    delete process.env['DATABASE_URL'];
    expect(() => appConfig()).toThrow('DATABASE_URL is required');
  });

  it('should return valid config when DATABASE_URL is set', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    const config = appConfig();
    expect(config.databaseUrl).toBe('postgresql://test@localhost:5432/test');
    expect(config.timeZone).toBe(BUSINESS_TIME_ZONE);
  });

  it('should default AI_ENABLED to false', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    delete process.env['AI_ENABLED'];
    delete process.env['AI_ACTIVE_MODE_ENABLED'];
    delete process.env['AI_PASSIVE_MODE_ENABLED'];
    const config = appConfig();
    expect(config.aiEnabled).toBe(false);
    expect(config.aiActiveModeEnabled).toBe(false);
    expect(config.aiPassiveModeEnabled).toBe(false);
  });

  it('should parse AI feature flags correctly when true', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['AI_ENABLED'] = 'true';
    process.env['AI_ACTIVE_MODE_ENABLED'] = 'true';
    process.env['AI_PASSIVE_MODE_ENABLED'] = 'true';
    const config = appConfig();
    expect(config.aiEnabled).toBe(true);
    expect(config.aiActiveModeEnabled).toBe(true);
    expect(config.aiPassiveModeEnabled).toBe(true);
  });

  it('should default to port 3100', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    delete process.env['API_PORT'];
    const config = appConfig();
    expect(config.port).toBe(3100);
  });

  it('validates trust proxy hops and defaults production to one hop', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_COOKIE_SECURE'] = 'true';
    delete process.env['HTTP_TRUST_PROXY_HOPS'];
    expect(appConfig().httpTrustProxyHops).toBe(1);
    process.env['HTTP_TRUST_PROXY_HOPS'] = '-1';
    expect(() => appConfig()).toThrow('must be a non-negative integer');
  });

  it('requires production API binding to remain on loopback', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_COOKIE_SECURE'] = 'true';
    process.env['API_HOST'] = '0.0.0.0';
    expect(() => appConfig()).toThrow('must bind to loopback in production');
  });

  it('validates the bounded login rate-limit key capacity', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['AUTH_LOGIN_RATE_LIMIT_MAX_KEYS'] = '0';
    expect(() => appConfig()).toThrow('AUTH_LOGIN_RATE_LIMIT_MAX_KEYS must be a positive integer');
  });

  it('should parse CORS_ORIGINS as an array', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['CORS_ORIGINS'] = 'http://localhost:5173,http://127.0.0.1:5173';
    const config = appConfig();
    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('rejects wildcard CORS and insecure production cookies', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['CORS_ORIGINS'] = '*';
    expect(() => appConfig()).toThrow('never wildcard');
    process.env['CORS_ORIGINS'] = 'https://example.test';
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_COOKIE_SECURE'] = 'false';
    expect(() => appConfig()).toThrow('must be true in production');
  });

  it('requires the exact business timezone in production', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_COOKIE_SECURE'] = 'true';
    delete process.env['TZ'];
    expect(() => appConfig()).toThrow(`TZ=${BUSINESS_TIME_ZONE} is required`);
    process.env['TZ'] = 'UTC';
    expect(() => appConfig()).toThrow(`TZ must be exactly ${BUSINESS_TIME_ZONE}`);
    process.env['TZ'] = BUSINESS_TIME_ZONE;
    expect(appConfig().timeZone).toBe(BUSINESS_TIME_ZONE);
  });

  describe('Telegram configuration (Case 25)', () => {
    beforeEach(() => {
      process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    });

    it('defaults telegram.enabled to false when not set', () => {
      delete process.env['TELEGRAM_ENABLED'];
      const config = appConfig();
      expect(config.telegram.enabled).toBe(false);
      expect(config.telegram.botToken).toBeUndefined();
    });

    it('rejects invalid non-boolean string for TELEGRAM_ENABLED', () => {
      process.env['TELEGRAM_ENABLED'] = 'invalid_bool';
      expect(() => appConfig()).toThrow('must be true or false');
    });

    it('fails closed when TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN is missing or blank', () => {
      process.env['TELEGRAM_ENABLED'] = 'true';
      delete process.env['TELEGRAM_BOT_TOKEN'];
      process.env['TELEGRAM_BOT_USERNAME'] = 'valid_bot';
      process.env['TELEGRAM_WEBHOOK_SECRET'] = 'secret_123';
      expect(() => appConfig()).toThrow('TELEGRAM_BOT_TOKEN is required');

      process.env['TELEGRAM_BOT_TOKEN'] = '   ';
      expect(() => appConfig()).toThrow('TELEGRAM_BOT_TOKEN is required');
    });

    it('fails closed when TELEGRAM_ENABLED=true but TELEGRAM_BOT_USERNAME is invalid', () => {
      process.env['TELEGRAM_ENABLED'] = 'true';
      process.env['TELEGRAM_BOT_TOKEN'] = 'token_123';
      process.env['TELEGRAM_WEBHOOK_SECRET'] = 'secret_123';

      process.env['TELEGRAM_BOT_USERNAME'] = 'ab'; // too short
      expect(() => appConfig()).toThrow('TELEGRAM_BOT_USERNAME is required and must be 3-64 characters');

      process.env['TELEGRAM_BOT_USERNAME'] = 'invalid@name';
      expect(() => appConfig()).toThrow('TELEGRAM_BOT_USERNAME is required and must be 3-64 characters');
    });

    it('fails closed when TELEGRAM_ENABLED=true but TELEGRAM_WEBHOOK_SECRET is invalid', () => {
      process.env['TELEGRAM_ENABLED'] = 'true';
      process.env['TELEGRAM_BOT_TOKEN'] = 'token_123';
      process.env['TELEGRAM_BOT_USERNAME'] = 'valid_bot';

      delete process.env['TELEGRAM_WEBHOOK_SECRET'];
      expect(() => appConfig()).toThrow('TELEGRAM_WEBHOOK_SECRET is required and must be 1-256 characters');

      process.env['TELEGRAM_WEBHOOK_SECRET'] = 'has space';
      expect(() => appConfig()).toThrow('TELEGRAM_WEBHOOK_SECRET is required and must be 1-256 characters');

      process.env['TELEGRAM_WEBHOOK_SECRET'] = 'special@symbol';
      expect(() => appConfig()).toThrow('TELEGRAM_WEBHOOK_SECRET is required and must be 1-256 characters');
    });

    it('parses valid Telegram configuration when TELEGRAM_ENABLED=true', () => {
      process.env['TELEGRAM_ENABLED'] = 'true';
      process.env['TELEGRAM_BOT_TOKEN'] = '123456:ABC-DEF_ghi';
      process.env['TELEGRAM_BOT_USERNAME'] = 'baogiang_bot';
      process.env['TELEGRAM_WEBHOOK_SECRET'] = 'Valid_Secret-123';

      const config = appConfig();
      expect(config.telegram.enabled).toBe(true);
      expect(config.telegram.botToken).toBe('123456:ABC-DEF_ghi');
      expect(config.telegram.botUsername).toBe('baogiang_bot');
      expect(config.telegram.webhookSecret).toBe('Valid_Secret-123');
    });
  });
});
