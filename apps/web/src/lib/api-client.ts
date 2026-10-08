import type {
  AuthMeResponse,
  AuthMutationResponse,
  ChangePasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  LoginRequest,
  LoginResponse,
  TelegramIntegrationStatusResponse,
  TelegramLinkChallengeResponse,
  TelegramTestNotificationRequest,
  TelegramTestNotificationResponse,
  TelegramUnlinkResponse,
} from '@baogiang/contracts';
import { HEALTH_PATHS } from '@baogiang/config';
import {
  broadcastSessionBoundary,
  getCurrentSessionGeneration,
  getSessionAbortSignal,
  isBroadcastChannelSupported,
  isCredentialAuthPath,
  notifyUnauthorized,
  onRemoteSessionBoundary,
  onUnauthorized,
  resetBroadcastChannelForTesting,
  resetSessionScope,
  startSessionScope,
} from '../auth/session-cache';

export {
  onUnauthorized,
  resetSessionScope,
  startSessionScope,
  getCurrentSessionGeneration,
  isCredentialAuthPath,
  broadcastSessionBoundary,
  onRemoteSessionBoundary,
  isBroadcastChannelSupported,
  resetBroadcastChannelForTesting,
};

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly requestId?: string,
    public readonly serverError?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequestOptions extends RequestInit {
  notifyUnauthorized?: boolean;
}

function composeSignals(primary: AbortSignal | null, secondary?: AbortSignal | null): AbortSignal | undefined {
  if (!primary && !secondary) return undefined;
  if (!primary) return secondary ?? undefined;
  if (!secondary) return primary;

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([primary, secondary]);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }
  primary.addEventListener('abort', onAbort, { once: true });
  secondary.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const normalizedPath = path.startsWith('/api/') ? path.slice(4) : path === '/api' ? '' : path;
  const isCredentialPath = isCredentialAuthPath(normalizedPath);
  const shouldNotifyUnauthorized = options.notifyUnauthorized ?? (!isCredentialPath);

  const requestGeneration = getCurrentSessionGeneration();
  const sessionSignal = isCredentialPath ? null : getSessionAbortSignal();
  const combinedSignal = composeSignals(sessionSignal, options.signal);

  const requestOptions: RequestInit = { ...options };
  delete (requestOptions as { notifyUnauthorized?: boolean }).notifyUnauthorized;
  const isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${normalizedPath}`, {
      ...requestOptions,
      signal: combinedSignal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(requestOptions.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...requestOptions.headers,
      },
    });
  } catch (err: unknown) {
    if (sessionSignal?.aborted || (!isCredentialPath && requestGeneration !== getCurrentSessionGeneration())) {
      throw new ApiError(0, 'Yêu cầu bị hủy do phiên làm việc đã thay đổi.');
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Yêu cầu đã bị hủy.');
    }
    throw new ApiError(0, 'Không thể kết nối đến máy chủ.');
  }

  // Generation check 1: before reading body
  if (!isCredentialPath && requestGeneration !== getCurrentSessionGeneration()) {
    throw new ApiError(0, 'Yêu cầu bị hủy do phiên làm việc đã thay đổi.');
  }

  // AR-01-R1: HTTP 401 status code is authoritative for current-generation session validity.
  // Separation of concerns:
  // 1. shouldNotifyUnauthorized === true triggers global unauthorized notification/broadcast.
  // 2. shouldNotifyUnauthorized === false suppresses only global notification/broadcast;
  //    it MUST NOT suppress HTTP 401 status code authority or fall through to body parsing.
  // The response body is non-authoritative for session validity and is not awaited (avoiding stalls/aborts).
  if (response.status === 401) {
    if (shouldNotifyUnauthorized) {
      notifyUnauthorized();
    }
    throw new ApiError(401, 'Phiên làm việc đã hết hạn hoặc không hợp lệ.');
  }

  let body: unknown;
  try {
    body = await readJson(response);
  } catch (readErr: unknown) {
    if (sessionSignal?.aborted || (!isCredentialPath && requestGeneration !== getCurrentSessionGeneration())) {
      throw new ApiError(0, 'Yêu cầu bị hủy do phiên làm việc đã thay đổi.');
    }
    if (readErr instanceof ApiError) throw readErr;
    if (readErr instanceof Error && readErr.name === 'AbortError') {
      throw new ApiError(0, 'Yêu cầu đã bị hủy.');
    }
    throw readErr;
  }

  // Generation check 2: after reading/parsing body (Harden invariant against body read race)
  if (!isCredentialPath && requestGeneration !== getCurrentSessionGeneration()) {
    throw new ApiError(0, 'Yêu cầu bị hủy do phiên làm việc đã thay đổi.');
  }

  if (!response.ok) {
    const parsed = parseApiErrorPayload(body);
    throw new ApiError(
      response.status,
      normalizeMessage(parsed.message),
      parsed.requestId,
      parsed.serverError,
    );
  }

  return body as T;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'Máy chủ trả về dữ liệu không hợp lệ.');
  }
}

interface ParsedApiErrorPayload {
  message?: string | string[];
  requestId?: string;
  serverError?: string;
}

function parseApiErrorPayload(value: unknown): ParsedApiErrorPayload {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const message =
    typeof candidate.message === 'string' || Array.isArray(candidate.message)
      ? (candidate.message as string | string[])
      : undefined;
  const requestId = typeof candidate.requestId === 'string' ? candidate.requestId : undefined;
  const serverError = typeof candidate.error === 'string' ? candidate.error : undefined;
  return { message, requestId, serverError };
}

function normalizeMessage(message: string | string[] | undefined): string {
  if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join(' ');
  return typeof message === 'string' && message.trim() ? message : 'Yêu cầu không thực hiện được.';
}

export const fetchHealthLive = (): Promise<HealthLiveResponse> =>
  apiFetch<HealthLiveResponse>(HEALTH_PATHS.LIVE.replace('/api', ''));

export const fetchHealthReady = (): Promise<HealthReadyResponse> =>
  apiFetch<HealthReadyResponse>(HEALTH_PATHS.READY.replace('/api', ''));

export const login = (input: LoginRequest): Promise<LoginResponse> =>
  apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) });

export const fetchAuthMe = (options?: { notifyUnauthorized?: boolean }): Promise<AuthMeResponse> =>
  apiFetch<AuthMeResponse>('/auth/me', { notifyUnauthorized: options?.notifyUnauthorized ?? true });

export const changePassword = (input: ChangePasswordRequest): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const logout = (): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/logout', { method: 'POST', notifyUnauthorized: true });

export const logoutAll = (): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/logout-all', { method: 'POST', notifyUnauthorized: true });

export const fetchTelegramStatus = (): Promise<TelegramIntegrationStatusResponse> =>
  apiFetch<TelegramIntegrationStatusResponse>('/integrations/telegram/me');

export const createTelegramLinkChallenge = (): Promise<TelegramLinkChallengeResponse> =>
  apiFetch<TelegramLinkChallengeResponse>('/integrations/telegram/link-challenge', {
    method: 'POST',
  });

export const unlinkTelegram = (): Promise<TelegramUnlinkResponse> =>
  apiFetch<TelegramUnlinkResponse>('/integrations/telegram/link', {
    method: 'DELETE',
  });

export const sendTelegramTestNotification = (
  input: TelegramTestNotificationRequest,
): Promise<TelegramTestNotificationResponse> =>
  apiFetch<TelegramTestNotificationResponse>('/integrations/telegram/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });
