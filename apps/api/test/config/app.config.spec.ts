import { appConfig } from '../../src/config/app.config';

/**
 * Unit tests for app configuration factory.
 * Verifies validation behavior.
 */
describe('appConfig (unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create fresh copy of env for each test
    process.env = { ...originalEnv };
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

  it('should parse CORS_ORIGINS as an array', () => {
    process.env['DATABASE_URL'] = 'postgresql://test@localhost:5432/test';
    process.env['CORS_ORIGINS'] = 'http://localhost:5173,http://127.0.0.1:5173';
    const config = appConfig();
    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });
});
