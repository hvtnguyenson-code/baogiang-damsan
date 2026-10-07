import type { QueryClient } from '@tanstack/react-query';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;
export const SESSION_CHANNEL_NAME = 'baogiang_session_channel' as const;

export interface SessionBoundaryMessage {
  type: 'SESSION_BOUNDARY_CHANGED';
  eventId: string;
  senderId: string;
}

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
  broadcastSessionBoundary();
}

let currentSessionGeneration = 0;
let currentSessionAbortController = new AbortController();

/**
 * Exact Session Generation Lifecycle:
 * 1. Monotonic Integer: `currentSessionGeneration` monotonically increments on authoritative session boundaries.
 * 2. Coupled AbortController: each generation owns an AbortController (`currentSessionAbortController`).
 * 3. Scope Binding: all business apiFetch calls bind to the current generation and abort signal.
 * 4. Destruction Gate: generation rotation / request abortion occurs ONLY on actual session boundaries:
 *    - explicit user logout (`logout()`)
 *    - authoritative remote cross-tab boundary event (`onRemoteSessionBoundary`)
 *    - foreground identity change (`User A -> User B` detected by server /auth/me)
 *    - session revocation / 401 returned from server
 * 5. Invariant: Same-user foreground verification MUST NOT rotate generation or abort valid in-flight requests.
 */
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

// --- Cross-Tab Session Synchronization ---

function resolveBroadcastChannelClass(): typeof BroadcastChannel | undefined {
  if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
    return window.BroadcastChannel;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.BroadcastChannel !== 'undefined') {
    return globalThis.BroadcastChannel;
  }
  return undefined;
}

export function isBroadcastChannelSupported(): boolean {
  return getBroadcastChannel() !== null;
}

let localTabId: string = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab-${Date.now()}-${Math.random()}`;

export function getLocalTabId(): string {
  return localTabId;
}

export function setLocalTabIdForTesting(id: string): void {
  localTabId = id;
}

let currentSessionChannelName: string = SESSION_CHANNEL_NAME;

export function getSessionChannelName(): string {
  if (currentSessionChannelName !== SESSION_CHANNEL_NAME) {
    return currentSessionChannelName;
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    const testPath = typeof expect !== 'undefined' && typeof expect.getState === 'function'
      ? expect.getState()?.testPath
      : undefined;
    if (testPath) {
      return `${SESSION_CHANNEL_NAME}_${testPath}`;
    }
  }
  return currentSessionChannelName;
}

export function setSessionChannelNameForTesting(name: string): void {
  if (channelInstance) {
    try {
      channelInstance.close();
    } catch {
      // ignore
    }
    channelInstance = null;
  }
  currentSessionChannelName = name;
}

let channelInstance: BroadcastChannel | null = null;
const remoteBoundaryListeners = new Set<() => void>();

function handleChannelMessage(event: MessageEvent<SessionBoundaryMessage>): void {
  if (event.data?.type === 'SESSION_BOUNDARY_CHANGED' && event.data.senderId !== localTabId) {
    remoteBoundaryListeners.forEach((listener) => listener());
  }
}

export function getBroadcastChannel(): BroadcastChannel | null {
  const BC = resolveBroadcastChannelClass();
  if (!BC) return null;
  if (!channelInstance) {
    try {
      channelInstance = new BC(getSessionChannelName());
      channelInstance.onmessage = handleChannelMessage;
      channelInstance.onmessageerror = () => {
        // Silently ignore channel errors; foreground fallback preserves safety
      };
    } catch {
      channelInstance = null;
    }
  }
  return channelInstance;
}

export function broadcastSessionBoundary(): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  const message: SessionBoundaryMessage = {
    type: 'SESSION_BOUNDARY_CHANGED',
    eventId: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `evt-${Date.now()}-${Math.random()}`,
    senderId: localTabId,
  };
  try {
    channel.postMessage(message);
  } catch {
    // Silently ignore browser messaging errors
  }
}

export function onRemoteSessionBoundary(listener: () => void): () => void {
  remoteBoundaryListeners.add(listener);
  getBroadcastChannel();
  return () => {
    remoteBoundaryListeners.delete(listener);
    if (remoteBoundaryListeners.size === 0 && channelInstance) {
      try {
        channelInstance.close();
      } catch {
        // ignore
      }
      channelInstance = null;
    }
  };
}

export function resetBroadcastChannelForTesting(): void {
  if (channelInstance) {
    try {
      channelInstance.close();
    } catch {
      // ignore
    }
    channelInstance = null;
  }
  remoteBoundaryListeners.clear();
  currentSessionChannelName = SESSION_CHANNEL_NAME;
  localTabId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random()}`;
}
