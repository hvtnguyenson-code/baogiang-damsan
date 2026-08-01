/**
 * @baogiang/config
 * Shared configuration constants for the baogiang-damsan system.
 * Does NOT contain secrets or credentials.
 */

/** Application name */
export const APP_NAME = 'Hệ thống Báo giảng Đam San';

/** Short application name */
export const APP_NAME_SHORT = 'Báo giảng CM Đam San';

/** School unit name */
export const SCHOOL_NAME = 'Trường PTDTNT THPT Đam San';

/** Repository */
export const REPOSITORY = 'hvtnguyenson-code/baogiang-damsan';

/** Current phase */
export const CURRENT_PHASE = 'Phase 01 — Schema & Migration Foundation';

/** Official production domain; infrastructure remains pre-operational. */
export const PRODUCTION_DOMAIN = 'baogiang.dtnt-damsan.edu.vn';

/**
 * Default local development ports.
 * These are the agreed ports for local development only.
 */
export const LOCAL_PORTS = {
  /** Vite dev server port */
  WEB: 5173,
  /** NestJS API port */
  API: 3100,
} as const;

/**
 * Feature flag keys.
 * Values are read from environment variables at runtime.
 */
export const FEATURE_FLAG_KEYS = {
  /**
   * AI assistant master feature.
   * MUST remain disabled until all other subsystems are stable and Phase AI is approved.
   * Default: false
   */
  AI_ENABLED: 'AI_ENABLED',

  /**
   * AI Active mode switch.
   * Default: false
   */
  AI_ACTIVE_MODE_ENABLED: 'AI_ACTIVE_MODE_ENABLED',

  /**
   * AI Passive mode switch.
   * Default: false
   */
  AI_PASSIVE_MODE_ENABLED: 'AI_PASSIVE_MODE_ENABLED',

  /**
   * Web Push notification channel.
   * Default: false in Phase 00
   */
  WEB_PUSH_ENABLED: 'WEB_PUSH_ENABLED',
} as const;

/**
 * API path prefix.
 */
export const API_PREFIX = '/api';

/**
 * Health check paths.
 */
export const HEALTH_PATHS = {
  LIVE: `${API_PREFIX}/health/live`,
  READY: `${API_PREFIX}/health/ready`,
} as const;
