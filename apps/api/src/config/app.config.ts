import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  corsOrigins: string[];
  aiEnabled: boolean;
  aiActiveModeEnabled: boolean;
  aiPassiveModeEnabled: boolean;
  webPushEnabled: boolean;
  logLevel: string;
  databaseUrl: string;
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

  return {
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    host: process.env['API_HOST'] ?? '127.0.0.1',
    port: parseInt(process.env['API_PORT'] ?? '3100', 10),
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://127.0.0.1:5173')
      .split(',')
      .map((o) => o.trim()),
    aiEnabled: process.env['AI_ENABLED'] === 'true',
    aiActiveModeEnabled: process.env['AI_ACTIVE_MODE_ENABLED'] === 'true',
    aiPassiveModeEnabled: process.env['AI_PASSIVE_MODE_ENABLED'] === 'true',
    webPushEnabled: process.env['WEB_PUSH_ENABLED'] === 'true',
    logLevel: process.env['LOG_LEVEL'] ?? 'log',
    databaseUrl,
  };
});
