import type { QueryClient } from '@tanstack/react-query';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener());
}

let currentSessionGeneration = 0;
let currentSessionAbortController = new AbortController();

export function getCurrentSessionGeneration(): number {
  return currentSessionGeneration;
}

export function getSessionAbortSignal(): AbortSignal {
  return currentSessionAbortController.signal;
}

export function resetSessionScope(): void {
  currentSessionAbortController.abort();
  currentSessionAbortController = new AbortController();
  currentSessionGeneration += 1;
}

export function startSessionScope(_userId?: string): void {
  currentSessionAbortController.abort();
  currentSessionAbortController = new AbortController();
  currentSessionGeneration += 1;
}

/**
 * Predicate to identify authentication endpoints where a 401 response is an
 * expected credential rejection (e.g. invalid username/password or incorrect
 * current password) rather than an expired or missing session boundary.
 */
export function isCredentialAuthPath(path: string): boolean {
  const normalized = path.startsWith('/api/') ? path.slice(4) : path === '/api' ? '' : path;
  return normalized === '/auth/login' || normalized === '/auth/change-password';
}

/**
 * Centrally destroys all session-scoped business queries, active mutations,
 * and aborts in-flight network requests across the session boundary.
 *
 * Keeps ['auth', 'me'] query untouched from violent destruction so that
 * the React Query auth lifecycle transitions cleanly to anonymous (`null`).
 */
export function clearSessionCache(queryClient: QueryClient): void {
  resetSessionScope();
  queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  });
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(AUTH_QUERY_KEY, null);
}
