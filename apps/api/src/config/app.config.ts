import { registerAs } from '@nestjs/config';
import { BUSINESS_TIME_ZONE } from '@baogiang/config';

export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
}

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
  telegram: TelegramConfig;
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
  loginRateLimitUserMax?: number;
  loginRateLimitIpTotalMax?: number;
  loginRateLimitIpFailedDegradedThreshold?: number;
  loginRateLimitMaxIpKeys?: number;
  loginRateLimitMaxUserKeys?: number;
  loginRateLimitInFlightIp?: number;
  loginRateLimitInFlightIpDegraded?: number;
  loginRateLimitInFlightGlobal?: number;
  loginRateLimitQueueTimeoutMs?: number;
  loginRateLimitMaxQueuePerIp?: number;
  loginRateLimitMaxQueueGlobal?: number;
  loginRateLimitDegradedPaceMs?: number;
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

  const telegramEnabled = booleanValue('TELEGRAM_ENABLED', false);
  let telegramBotToken: string | undefined;
  let telegramBotUsername: string | undefined;
  let telegramWebhookSecret: string | undefined;

  if (telegramEnabled) {
    const rawBotToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (!rawBotToken || rawBotToken.trim().length === 0) {
      throw new Error('[Config] TELEGRAM_BOT_TOKEN is required and cannot be blank when TELEGRAM_ENABLED is true.');
    }
    telegramBotToken = rawBotToken.trim();

    const rawBotUsername = process.env['TELEGRAM_BOT_USERNAME'];
    if (!rawBotUsername || !/^[A-Za-z0-9_]{3,64}$/.test(rawBotUsername.trim())) {
      throw new Error('[Config] TELEGRAM_BOT_USERNAME is required and must be 3-64 characters [A-Za-z0-9_] when TELEGRAM_ENABLED is true.');
    }
    telegramBotUsername = rawBotUsername.trim();

    const rawWebhookSecret = process.env['TELEGRAM_WEBHOOK_SECRET'];
    if (!rawWebhookSecret || !/^[A-Za-z0-9_-]{1,256}$/.test(rawWebhookSecret)) {
      throw new Error('[Config] TELEGRAM_WEBHOOK_SECRET is required and must be 1-256 characters [A-Za-z0-9_-] when TELEGRAM_ENABLED is true.');
    }
    telegramWebhookSecret = rawWebhookSecret;
  } else {
    telegramBotToken = process.env['TELEGRAM_BOT_TOKEN']?.trim() || undefined;
    telegramBotUsername = process.env['TELEGRAM_BOT_USERNAME']?.trim() || undefined;
    telegramWebhookSecret = process.env['TELEGRAM_WEBHOOK_SECRET'] || undefined;
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
      loginRateLimitUserMax: positiveInteger('AUTH_LOGIN_RATE_LIMIT_USER_MAX', 10),
      loginRateLimitIpTotalMax: positiveInteger('AUTH_LOGIN_RATE_LIMIT_IP_TOTAL_MAX', 150),
      loginRateLimitIpFailedDegradedThreshold: positiveInteger('AUTH_LOGIN_RATE_LIMIT_IP_FAILED_DEGRADED_THRESHOLD', 25),
      loginRateLimitMaxIpKeys: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX_IP_KEYS', 10_000),
      loginRateLimitMaxUserKeys: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX_USER_KEYS', 10_000),
      loginRateLimitInFlightIp: positiveInteger('AUTH_LOGIN_RATE_LIMIT_IN_FLIGHT_IP', 3),
      loginRateLimitInFlightIpDegraded: positiveInteger('AUTH_LOGIN_RATE_LIMIT_IN_FLIGHT_IP_DEGRADED', 1),
      loginRateLimitInFlightGlobal: positiveInteger('AUTH_LOGIN_RATE_LIMIT_IN_FLIGHT_GLOBAL', 8),
      loginRateLimitQueueTimeoutMs: positiveInteger('AUTH_LOGIN_RATE_LIMIT_QUEUE_TIMEOUT_MS', 10_000),
      loginRateLimitMaxQueuePerIp: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX_QUEUE_PER_IP', 60),
      loginRateLimitMaxQueueGlobal: positiveInteger('AUTH_LOGIN_RATE_LIMIT_MAX_QUEUE_GLOBAL', 120),
      loginRateLimitDegradedPaceMs: positiveInteger('AUTH_LOGIN_RATE_LIMIT_DEGRADED_PACE_MS', 1_000),
    },
    telegram: {
      enabled: telegramEnabled,
      botToken: telegramBotToken,
      botUsername: telegramBotUsername,
      webhookSecret: telegramWebhookSecret,
    },
  };
});
