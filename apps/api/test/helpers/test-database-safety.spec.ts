import { resolveSafeTestDatabaseUrl, TEST_DATABASE_SAFETY_ERROR } from './test-database-safety';

const local = 'postgresql://test_user:test_password@127.0.0.1:5432/baogiang_test_local';
const resolve = (overrides: Record<string, string | undefined> = {}) => resolveSafeTestDatabaseUrl({ ...overrides });
const githubActions = {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'hvtnguyenson-code/baogiang-damsan',
  NODE_ENV: 'test',
};

describe('resolveSafeTestDatabaseUrl', () => {
  it('SDB1 disables integration when TEST_DATABASE_URL is absent', () => {
    expect(resolve()).toBeUndefined();
  });

  it('SDB2 rejects a malformed configured URL', () => {
    expect(() => resolve({ TEST_DATABASE_URL: 'not-a-url' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });

  it('SDB3 rejects production even with a test-looking URL', () => {
    expect(() => resolve({ TEST_DATABASE_URL: local, NODE_ENV: 'production' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });

  it('SDB4 rejects a local URL without explicit destructive-test opt-in', () => {
    expect(() => resolve({ TEST_DATABASE_URL: local, NODE_ENV: 'test' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });

  it('SDB5 rejects generic and development database names despite opt-in', () => {
    for (const databaseName of ['baogiang_dev', 'postgres']) {
      expect(() => resolve({ TEST_DATABASE_URL: `postgresql://test_user:test_password@127.0.0.1:5432/${databaseName}`, NODE_ENV: 'test', BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB: '1' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
    }
  });

  it('SDB6 rejects PostgreSQL template database names despite opt-in', () => {
    for (const databaseName of ['template0', 'template1']) {
      expect(() => resolve({ TEST_DATABASE_URL: `postgresql://test_user:test_password@127.0.0.1:5432/${databaseName}`, NODE_ENV: 'test', BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB: '1' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
    }
  });

  it('SDB7 allows an explicitly confirmed loopback local test database', () => {
    expect(resolve({ TEST_DATABASE_URL: local, NODE_ENV: 'test', BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB: '1' })).toBe(local);
  });

  it('SDB8 rejects generic CI without explicit local opt-in', () => {
    const ci = 'postgresql://baogiang_test_user:ci_test_pass_only@127.0.0.1:5432/baogiang_test?schema=public';
    expect(() => resolve({ TEST_DATABASE_URL: ci, NODE_ENV: 'test', CI: 'true' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });

  it('SDB9 rejects GitHub Actions from another repository', () => {
    const ci = 'postgresql://baogiang_test_user:ci_test_pass_only@127.0.0.1:5432/baogiang_test?schema=public';
    expect(() => resolve({ TEST_DATABASE_URL: ci, ...githubActions, GITHUB_REPOSITORY: 'somewhere/else' })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });

  it('SDB10 allows the exact GitHub Actions PostgreSQL contract without local opt-in', () => {
    const ci = 'postgresql://baogiang_test_user:ci_test_pass_only@127.0.0.1:5432/baogiang_test?schema=public';
    expect(resolve({ TEST_DATABASE_URL: ci, ...githubActions })).toBe(ci);
  });

  it.each([
    ['SDB11 GitHub Actions non-loopback host', 'postgresql://test_user:test_password@example.test:5432/baogiang_test'],
    ['SDB12 GitHub Actions wrong database', 'postgresql://test_user:test_password@127.0.0.1:5432/wrong_database'],
  ])('%s rejects an unsafe GitHub Actions contract', (_name, url) => {
    expect(() => resolve({ TEST_DATABASE_URL: url, ...githubActions })).toThrow(TEST_DATABASE_SAFETY_ERROR);
  });
});
