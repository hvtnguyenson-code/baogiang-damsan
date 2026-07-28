import type { HealthLiveResponse, HealthReadyResponse } from '@baogiang/contracts';
import { HEALTH_PATHS } from '@baogiang/config';

/**
 * Centralized API client for baogiang-damsan.
 *
 * All API calls go through this module.
 * In production, the /api prefix is proxied to the backend.
 */

const API_BASE = '/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      message: `HTTP ${response.status} ${response.statusText}`,
    }));
    throw new ApiError(
      response.status,
      errorBody.message ?? 'Request failed',
      errorBody,
    );
  }

  return response.json() as Promise<T>;
}

/** Typed API error */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================
// Health API
// ============================================================

/** Fetch liveness status */
export async function fetchHealthLive(): Promise<HealthLiveResponse> {
  return apiFetch<HealthLiveResponse>(HEALTH_PATHS.LIVE.replace('/api', ''));
}

/** Fetch readiness status including database check */
export async function fetchHealthReady(): Promise<HealthReadyResponse> {
  return apiFetch<HealthReadyResponse>(HEALTH_PATHS.READY.replace('/api', ''));
}
