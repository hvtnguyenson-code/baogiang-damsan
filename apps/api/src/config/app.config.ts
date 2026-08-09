import { registerAs } from '@nestjs/config';
import { BUSINESS_TIME_ZONE } from '@baogiang/config';

export interface AppConfig {
  nodeEnv: string;
  timeZone: string;
  host: string;
  port: number;
  corsOrigins: string[];
  aiEnabled: boolean;
  aiActiveModeEnabled: boolean;
  aiPassiveModeEnabled: boolean;
  webPushEnabled: boolean;
  logLevel: string;
  databaseUrl: string;
  httpTrustProxyHops: number;
  auth: AuthConfig;
}

export interface AuthConfig {
  sessionTtlSeconds: number;
  lastSeenUpdateSeconds: number;
  cookieName: string;
  cookiePath: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  passwordMinLength: number;
  loginRateLimitMax: number;
  loginRateLimitWindowSeconds: number;
  loginRateLimitMaxKeys: number;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[Config] ${name} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[Config] ${name} must be a non-negative integer.`);
  }
  return value;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`[Config] ${name} must be true or false.`);
  }
  return raw === 'true';
}

/**
 * Application configuration factory.
 * Reads from environment variables with sensible defaults for local dev.
 * Validates required variables at startup.
 */
export const appConfig = registerAs('app', (): AppConfig => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      '[Config] DATABASE_URL is required. ' +
      'Copy apps/api/.env.example to apps/api/.env and configure it.',
    );
  }

  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const host = process.env['API_HOST'] ?? '127.0.0.1';
  if (nodeEnv === 'production' && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('[Config] API_HOST must bind to loopback in production.');
  }
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
    throw new Error('[Config] CORS_ORIGINS must contain explicit origins, never wildcard.');
  }
  const sameSite = (process.env['AUTH_COOKIE_SAME_SITE'] ?? 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('[Config] AUTH_COOKIE_SAME_SITE must be lax, strict, or none.');
  }
  const cookieSecure = booleanValue('AUTH_COOKIE_SECURE', nodeEnv === 'production');
  if (nodeEnv === 'production' && !cookieSecure) {
    throw new Error('[Config] AUTH_COOKIE_SECURE must be true in production.');
  }
  if (sameSite === 'none' && !cookieSecure) {
    throw new Error('[Config] SameSite=None requires a Secure cookie.');
  }
  const cookieName = process.env['AUTH_COOKIE_NAME'] ?? 'baogiang_session';
  const cookiePath = process.env['AUTH_COOKIE_PATH'] ?? '/api';
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) {
    throw new Error('[Config] AUTH_COOKIE_NAME contains invalid characters.');
  }
  if (!cookiePath.startsWith('/')) {
    throw new Error('[Config] AUTH_COOKIE_PATH must start with /.');
  }
  const configuredTimeZone = process.env['TZ'];
  if (nodeEnv === 'production' && configuredTimeZone === undefined) {
    throw new Error(`[Config] TZ=${BUSINESS_TIME_ZONE} is required in production.`);
  }
  if (configuredTimeZone !== undefined && configuredTimeZone !== BUSINESS_TIME_ZONE) {
    throw new Error(`[Config] TZ must be exactly ${BUSINESS_TIME_ZONE}.`);
  }

  return {
    nodeEnv,
    timeZone: configuredTimeZone ?? BUSINESS_TIME_ZONE,
    host,
    port: parseInt(process.env['API_PORT'] ?? '3100', 10),
    corsOrigins,
    aiEnabled: process.env['AI_ENABLED'] === 'true',
    aiActiveModeEnabled: process.env['AI_ACTIVE_MODE_ENABLED'] === 'true',
    aiPassiveModeEnabled: process.env['AI_PASSIVE_MODE_ENABLED'] === 'true',
    webPushEnabled: process.env['WEB_PUSH_ENABLED'] === 'true',
    logLevel: process.env['LOG_LEVEL'] ?? 'log',
    databaseUrl,
    httpTrustProxyHops: nonNegativeInteger('HTTP_TRUST_PROXY_HOPS', nodeEnv === 'production' ? 1 : 0),
    auth: {
      sessionTtlSeconds: positiveInteger('AUTH_SESSION_TTL_SECONDS', 28_800),
      lastSeenUpdateSeconds: positiveInteger('AUTH_LAST_SEEN_UPDATE_SECONDS', 300),
      cookieName,
      cookiePath,
      cookieDomain: process.env['AUTH_COOKIE_DOMAIN'] || undefined,
      cookieSecure,
      cookieSameSite: sameSite as AuthConfig['cookieSameSite'],
      lockoutThreshold: positiveInteger('AUTH_LOCKOUT_THRESHOLD', 5),
      lockoutDurationSeconds: positiveInteger('AUTH_LOCKOUT_DURATION_SECONDS', 900),
      passwordMinLength: positiveInteger('AUTH_PASSWORD_MIN_LENGTH', 12),
      loginRateLimitMax: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX', 10),
      loginRateLimitWindowSeconds: positiveInteger('AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS', 60),
      loginRateLimitMaxKeys: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX_KEYS', 10_000),
    },
  };
});
