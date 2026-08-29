export type TestDatabaseEnvironment = Readonly<Record<string, string | undefined>>;

const SAFETY_ERROR = 'Refusing destructive integration tests because TEST_DATABASE_URL has not been explicitly certified as an isolated test database.';

export function resolveSafeTestDatabaseUrl(env: TestDatabaseEnvironment): string | undefined {
  const raw = env.TEST_DATABASE_URL?.trim();
  if (!raw) return undefined;
  if (env.NODE_ENV === 'production') throw new Error(SAFETY_ERROR);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(SAFETY_ERROR);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(SAFETY_ERROR);

  const databaseName = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname.toLowerCase());
  const githubActions = env.CI === 'true'
    && env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REPOSITORY === 'hvtnguyenson-code/baogiang-damsan';
  if (githubActions) {
    if (env.NODE_ENV === 'test' && loopback && databaseName === 'baogiang_test') return raw;
    throw new Error(SAFETY_ERROR);
  }

  const explicitlyAllowed = env.BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB === '1';
  const clearlyTestDatabase = /test/i.test(databaseName)
    && !['postgres', 'baogiang_dev', 'template0', 'template1'].includes(databaseName.toLowerCase());
  if (env.NODE_ENV === 'test' && explicitlyAllowed && loopback && clearlyTestDatabase) return raw;
  throw new Error(SAFETY_ERROR);
}

export { SAFETY_ERROR as TEST_DATABASE_SAFETY_ERROR };
