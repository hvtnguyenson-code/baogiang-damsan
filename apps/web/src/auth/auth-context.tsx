import type { AuthMeResponse, ChangePasswordRequest, LoginRequest } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ApiError,
  broadcastSessionBoundary,
  changePassword,
  fetchAuthMe,
  login,
  logout,
  onRemoteSessionBoundary,
  onUnauthorized,
} from '../lib/api-client';
import { AUTH_QUERY_KEY, clearSessionCache } from './session-cache';


export type AuthStatus = 'checking' | 'anonymous' | 'firstLoginRequired' | 'authenticated' | 'error';
export type ReconciliationMode = 'NONE' | 'FOREGROUND_VERIFY' | 'BOUNDARY_VERIFY';

interface AuthContextValue {
  status: AuthStatus;
  auth: AuthMeResponse | null;
  reconciliationMode: ReconciliationMode;
  reconciliationError: ApiError | null;
  sessionIdentityKey: string;
  error: ApiError | null;
  logoutError: ApiError | null;
  isMutating: boolean;
  login(input: LoginRequest): Promise<AuthMeResponse>;
  changePassword(input: ChangePasswordRequest): Promise<AuthMeResponse>;
  logout(): Promise<void>;
  retry(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState<ApiError | null>(null);
  const [reconciliationMode, setReconciliationMode] = useState<ReconciliationMode>('NONE');
  const [reconciliationError, setReconciliationError] = useState<ApiError | null>(null);
  const reconciliationModeRef = useRef<ReconciliationMode>('NONE');
  const reconciliationSeqRef = useRef(0);

  const invalidatePendingReconciliations = useCallback(() => {
    reconciliationSeqRef.current += 1;
    reconciliationModeRef.current = 'NONE';
    setReconciliationMode('NONE');
    setReconciliationError(null);
  }, []);

  const authQuery = useQuery<AuthMeResponse | null, ApiError>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => fetchAuthMe(),
    retry: (failureCount, error) => error.statusCode !== 401 && failureCount < 1,
    staleTime: 30_000,
  });

  const currentUserId = authQuery.data?.user.id;
  const previousUserIdRef = useRef<string | undefined>(currentUserId);
  if (!previousUserIdRef.current && currentUserId) {
    previousUserIdRef.current = currentUserId;
  }

  useEffect(() => onUnauthorized(() => {
    invalidatePendingReconciliations();
    setLogoutError(null);
    clearSessionCache(queryClient);
    previousUserIdRef.current = undefined;
  }), [invalidatePendingReconciliations, queryClient]);

  // Centralized, fail-closed cross-tab session boundary reconciliation:
  // 1. Remote boundary: immediately purges old-generation business cache & aborts in-flight requests,
  //    enters fail-closed presentation (reconciliationMode = 'BOUNDARY_VERIFY' -> status 'checking', auth null),
  //    and forces direct server network fetchAuthMe().
  // 2. Foreground return safety net: immediately enters fail-closed presentation (reconciliationMode = 'FOREGROUND_VERIFY' -> status 'checking', auth null)
  //    WITHOUT prematurely purging business cache, aborting valid in-flight requests, or unmounting protected route drafts.
  // 3. Same-user server result: preserves business query cache, session generation, in-flight requests, and protected draft state.
  // 4. Changed-user server result: purges old business cache, aborts old generation, establishes single new session generation, and discards old draft state.
  // 5. Anonymous / 401 result: purges session/business cache, aborts old generation, transitions cleanly to anonymous.
  // 6. Indeterminate verification failure (network / 5xx / malformed response):
  //    - MUST NOT infer logout.
  //    - If foreground: retains session, cache, generation, and mounted draft; enters bounded recovery UI.
  //    - If boundary: remains in fail-closed recovery state without falsely classifying as anonymous.
  // 7. Monotonic sequence counter & invalidatePendingReconciliations ensures latest reconciliation wins; superseded responses perform no state mutation.
  const reconcileSessionBoundary = useCallback(async (options?: { isRemoteBoundary?: boolean }) => {
    const seq = ++reconciliationSeqRef.current;
    const isRemote = options?.isRemoteBoundary ?? (reconciliationModeRef.current === 'BOUNDARY_VERIFY');

    reconciliationModeRef.current = isRemote ? 'BOUNDARY_VERIFY' : 'FOREGROUND_VERIFY';
    setReconciliationMode(reconciliationModeRef.current);
    setReconciliationError(null);
    setLogoutError(null);

    let alreadyPurged = false;
    if (isRemote) {
      // Authoritative remote boundary signal: purge old cache & abort old generation immediately
      clearSessionCache(queryClient);
      previousUserIdRef.current = undefined;
      alreadyPurged = true;
    }

    try {
      const refreshed = await fetchAuthMe({ notifyUnauthorized: false });
      if (reconciliationSeqRef.current !== seq) return;

      const previousUserId = previousUserIdRef.current ?? authQuery.data?.user.id;
      const isSameUser = Boolean(previousUserId && refreshed.user.id === previousUserId);

      if (isSameUser) {
        // Same identity confirmed by server:
        // - keep existing business query cache
        // - keep existing session generation
        // - keep existing page component instance and local draft state
        // - DO NOT call clearSessionCache(), resetSessionScope(), or startSessionScope()
        // - DO NOT abort in-flight query or mutation
        queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
        previousUserIdRef.current = refreshed.user.id;
        setReconciliationError(null);
        reconciliationModeRef.current = 'NONE';
        setReconciliationMode('NONE');
      } else {
        // Identity changed (or previous session was anonymous):
        // If not already purged by remote boundary, purge old business cache & abort old generation now
        if (!alreadyPurged && previousUserId) {
          clearSessionCache(queryClient);
        }
        // clearSessionCache already established a single new usable session generation via resetSessionScope;
        // do not call startSessionScope() to prevent double-resetting generation.
        queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
        previousUserIdRef.current = refreshed.user.id;
        setReconciliationError(null);
        reconciliationModeRef.current = 'NONE';
        setReconciliationMode('NONE');
      }
    } catch (caught: unknown) {
      if (reconciliationSeqRef.current !== seq) return;

      const apiError = caught instanceof ApiError
        ? caught
        : new ApiError(0, 'Không thể kết nối đến máy chủ.');

      if (apiError.statusCode === 401) {
        // Authoritative anonymous confirmed by server 401:
        if (!alreadyPurged) {
          clearSessionCache(queryClient);
        }
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
        previousUserIdRef.current = undefined;
        setReconciliationError(null);
        reconciliationModeRef.current = 'NONE';
        setReconciliationMode('NONE');
      } else {
        // Indeterminate verification failure (network / 5xx / malformed response):
        // MUST NOT infer logout.
        // If foreground: retains verified auth/session/cache internally, retains generation and draft,
        // enters bounded verification-recovery state.
        // If remote boundary: remains fail-closed in boundary recovery state without falsely classifying as anonymous.
        setReconciliationError(apiError);
      }
    }
  }, [authQuery.data?.user.id, queryClient]);

  // Remote cross-tab session boundary listener (BroadcastChannel)
  useEffect(() => onRemoteSessionBoundary(() => {
    void reconcileSessionBoundary({ isRemoteBoundary: true });
  }), [reconcileSessionBoundary]);

  // Foreground safety net: always active regardless of BroadcastChannel availability (defense-in-depth)
  useEffect(() => {
    const handleForegroundSafety = (event?: Event) => {
      // Guard: only ignore focus events originating from interactive form controls
      if (event) {
        const target = event.target as { tagName?: string } | null;
        const tagName = target?.tagName?.toUpperCase();
        if (tagName && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(tagName)) {
          return;
        }
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      void reconcileSessionBoundary({ isRemoteBoundary: false });
    };

    window.addEventListener('focus', handleForegroundSafety);
    document.addEventListener('visibilitychange', handleForegroundSafety);
    return () => {
      window.removeEventListener('focus', handleForegroundSafety);
      document.removeEventListener('visibilitychange', handleForegroundSafety);
    };
  }, [reconcileSessionBoundary]);

  // Identity transition: if session user changes (User A -> User B) without explicit logout,
  // purge any leftover query cache from User A before User B observes or shares it.
  useEffect(() => {
    if (previousUserIdRef.current && currentUserId && previousUserIdRef.current !== currentUserId) {
      clearSessionCache(queryClient);
      queryClient.setQueryData(AUTH_QUERY_KEY, authQuery.data);
    }
    previousUserIdRef.current = currentUserId;
  }, [currentUserId, authQuery.data, queryClient]);

  const loginMutation = useMutation({ mutationFn: login });
  const passwordMutation = useMutation({ mutationFn: changePassword });
  const logoutMutation = useMutation({ mutationFn: logout });

  async function refreshAuth(): Promise<AuthMeResponse> {
    const refreshed = await fetchAuthMe();
    queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
    return refreshed;
  }

  const sessionIdentityKey = previousUserIdRef.current ?? authQuery.data?.user.id ?? 'anonymous';

  const value: AuthContextValue = {
    status: deriveStatus(authQuery, reconciliationMode, reconciliationError),
    auth: reconciliationMode !== 'NONE' ? null : (authQuery.data ?? null),
    reconciliationMode,
    reconciliationError,
    sessionIdentityKey,
    error: reconciliationError ?? (reconciliationMode !== 'NONE' ? null : (authQuery.error ?? null)),
    logoutError,
    isMutating: loginMutation.isPending || passwordMutation.isPending || logoutMutation.isPending,
    async login(input) {
      // 1. Authenticate credentials first; if login fails (e.g. wrong password),
      // it rejects immediately without clearing valid current session or broadcasting.
      await loginMutation.mutateAsync(input);

      // 2. If login succeeds and cookie is replaced:
      // Authoritative local boundary invalidates any older pending foreground reconciliations,
      // establishes local session boundary, purges old business cache, and broadcasts.
      invalidatePendingReconciliations();
      clearSessionCache(queryClient);
      broadcastSessionBoundary();

      // 3. Refresh /auth/me and establish new local generation
      const refreshed = await refreshAuth();
      previousUserIdRef.current = refreshed.user.id;
      setLogoutError(null);
      return refreshed;
    },
    async changePassword(input) {
      try {
        await passwordMutation.mutateAsync(input);
        const refreshed = await refreshAuth();
        setLogoutError(null);
        return refreshed;
      } catch (caught) {
        if (caught instanceof ApiError && caught.statusCode === 401) {
          try {
            const refreshed = await fetchAuthMe({ notifyUnauthorized: false });
            queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
          } catch (refreshError) {
            if (refreshError instanceof ApiError && refreshError.statusCode === 401) {
              invalidatePendingReconciliations();
              clearSessionCache(queryClient);
              previousUserIdRef.current = undefined;
              broadcastSessionBoundary();
            }
            throw refreshError;
          }
        }
        throw caught;
      }
    },
    async logout() {
      invalidatePendingReconciliations();
      setLogoutError(null);
      try {
        await logoutMutation.mutateAsync();
        clearSessionCache(queryClient);
        previousUserIdRef.current = undefined;
        broadcastSessionBoundary();
      } catch (caught) {
        const apiError = caught instanceof ApiError ? caught : new ApiError(0, 'Không thể đăng xuất.');
        if (apiError.statusCode === 401) {
          clearSessionCache(queryClient);
          previousUserIdRef.current = undefined;
          broadcastSessionBoundary();
          return;
        }
        setLogoutError(apiError);
        throw apiError;
      }
    },
    async retry() {
      if (reconciliationModeRef.current !== 'NONE') {
        await reconcileSessionBoundary({
          isRemoteBoundary: reconciliationModeRef.current === 'BOUNDARY_VERIFY',
        });
      } else {
        await authQuery.refetch();
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function deriveStatus(
  query: {
    isPending: boolean;
    data: AuthMeResponse | null | undefined;
    error: ApiError | null;
  },
  reconciliationMode: ReconciliationMode,
  reconciliationError: ApiError | null,
): AuthStatus {
  if (reconciliationError) return 'error';
  if (reconciliationMode !== 'NONE' || query.isPending) return 'checking';
  if (query.error?.statusCode === 401 || query.data === null) return 'anonymous';
  if (query.error) return 'error';
  if (query.data?.user.mustChangePassword) return 'firstLoginRequired';
  return query.data ? 'authenticated' : 'anonymous';
}

// Hook intentionally colocated with its provider to keep the auth state boundary explicit.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
