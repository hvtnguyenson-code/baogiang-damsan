import type {
  ApiErrorResponse,
  AuthMeResponse,
  AuthMutationResponse,
  ChangePasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  LoginRequest,
  LoginResponse,
} from '@baogiang/contracts';
import { HEALTH_PATHS } from '@baogiang/config';

const API_BASE = '/api';

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

interface ApiRequestOptions extends RequestInit {
  notifyUnauthorized?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { notifyUnauthorized = false, ...requestOptions } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...requestOptions,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...requestOptions.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Không thể kết nối đến máy chủ.');
  }

  const body = await readJson(response);
  if (!response.ok) {
    if (response.status === 401 && notifyUnauthorized) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    const apiError = isApiErrorResponse(body) ? body : undefined;
    throw new ApiError(response.status, normalizeMessage(apiError?.message), apiError?.requestId);
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

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiErrorResponse>;
  return typeof candidate.statusCode === 'number' && (typeof candidate.message === 'string' || Array.isArray(candidate.message));
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

export const fetchAuthMe = (): Promise<AuthMeResponse> =>
  apiFetch<AuthMeResponse>('/auth/me', { notifyUnauthorized: true });

export const changePassword = (input: ChangePasswordRequest): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
    notifyUnauthorized: true,
  });

export const logout = (): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/logout', { method: 'POST', notifyUnauthorized: true });

export const logoutAll = (): Promise<AuthMutationResponse> =>
  apiFetch<AuthMutationResponse>('/auth/logout-all', { method: 'POST', notifyUnauthorized: true });
