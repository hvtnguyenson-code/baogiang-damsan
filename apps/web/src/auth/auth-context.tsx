import type { AuthMeResponse, ChangePasswordRequest, LoginRequest } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ApiError,
  broadcastSessionBoundary,
  changePassword,
  fetchAuthMe,
  isBroadcastChannelSupported,
  login,
  logout,
  onRemoteSessionBoundary,
  onUnauthorized,
} from '../lib/api-client';
import { AUTH_QUERY_KEY, clearSessionCache, startSessionScope } from './session-cache';


export type AuthStatus = 'checking' | 'anonymous' | 'firstLoginRequired' | 'authenticated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  auth: AuthMeResponse | null;
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
  const authQuery = useQuery<AuthMeResponse | null, ApiError>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => fetchAuthMe(),
    retry: (failureCount, error) => error.statusCode !== 401 && failureCount < 1,
    staleTime: 30_000,
  });

  const currentUserId = authQuery.data?.user.id;
  const previousUserIdRef = useRef<string | undefined>(currentUserId);

  useEffect(() => onUnauthorized(() => {
    setLogoutError(null);
    clearSessionCache(queryClient);
  }), [queryClient]);

  // Remote cross-tab session boundary listener (BroadcastChannel)
  useEffect(() => onRemoteSessionBoundary(async () => {
    // Fail-closed: clear all old-generation business cache, abort in-flight requests
    clearSessionCache(queryClient);
    try {
      const refreshed = await queryClient.fetchQuery({
        queryKey: AUTH_QUERY_KEY,
        queryFn: () => fetchAuthMe({ notifyUnauthorized: false }),
      });
      startSessionScope(refreshed.user.id);
      queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
    } catch {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    }
  }), [queryClient]);

  // Fallback for environments where BroadcastChannel is not supported (foreground/focus revalidation)
  useEffect(() => {
    if (isBroadcastChannelSupported()) return;

    const handleForegroundFallback = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      // Fail-closed confidentiality: purge old business cache immediately before revalidating identity
      clearSessionCache(queryClient);

      try {
        const refreshed = await queryClient.fetchQuery({
          queryKey: AUTH_QUERY_KEY,
          queryFn: () => fetchAuthMe({ notifyUnauthorized: false }),
        });
        startSessionScope(refreshed.user.id);
        queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
      } catch {
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
      }
    };

    window.addEventListener('focus', handleForegroundFallback);
    document.addEventListener('visibilitychange', handleForegroundFallback);
    return () => {
      window.removeEventListener('focus', handleForegroundFallback);
      document.removeEventListener('visibilitychange', handleForegroundFallback);
    };
  }, [queryClient]);

  // Identity transition: if session user changes (User A -> User B) without explicit logout,
  // purge any leftover query cache from User A before User B observes or shares it.
  useEffect(() => {
    if (previousUserIdRef.current && currentUserId && previousUserIdRef.current !== currentUserId) {
      clearSessionCache(queryClient);
      queryClient.setQueryData(AUTH_QUERY_KEY, authQuery.data);
      startSessionScope(currentUserId);
    }
    previousUserIdRef.current = currentUserId;
  }, [currentUserId, authQuery.data, queryClient]);

  const loginMutation = useMutation({ mutationFn: login });
  const passwordMutation = useMutation({ mutationFn: changePassword });
  const logoutMutation = useMutation({ mutationFn: logout });

  async function refreshAuth(): Promise<AuthMeResponse> {
    await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY, refetchType: 'none' });
    const refreshed = await queryClient.fetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: () => fetchAuthMe() });
    queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
    return refreshed;
  }

  const value: AuthContextValue = {
    status: deriveStatus(authQuery),
    auth: authQuery.data ?? null,
    error: authQuery.error ?? null,
    logoutError,
    isMutating: loginMutation.isPending || passwordMutation.isPending || logoutMutation.isPending,
    async login(input) {
      // 1. Authenticate credentials first; if login fails (e.g. wrong password),
      // it rejects immediately without clearing valid current session or broadcasting.
      await loginMutation.mutateAsync(input);

      // 2. If login succeeds and cookie is replaced:
      // Immediately establish local session boundary, purge old business cache,
      // and broadcast SESSION_BOUNDARY_CHANGED to all other open tabs.
      clearSessionCache(queryClient);
      broadcastSessionBoundary();

      // 3. Refresh /auth/me and establish new local generation
      const refreshed = await refreshAuth();
      startSessionScope(refreshed.user.id);
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
              clearSessionCache(queryClient);
              broadcastSessionBoundary();
            }
            throw refreshError;
          }
        }
        throw caught;
      }
    },
    async logout() {
      setLogoutError(null);
      try {
        await logoutMutation.mutateAsync();
        clearSessionCache(queryClient);
        broadcastSessionBoundary();
      } catch (caught) {
        const apiError = caught instanceof ApiError ? caught : new ApiError(0, 'Không thể đăng xuất.');
        if (apiError.statusCode === 401) {
          clearSessionCache(queryClient);
          broadcastSessionBoundary();
          return;
        }
        setLogoutError(apiError);
        throw apiError;
      }
    },
    async retry() {
      await authQuery.refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function deriveStatus(query: {
  isPending: boolean;
  data: AuthMeResponse | null | undefined;
  error: ApiError | null;
}): AuthStatus {
  if (query.isPending) return 'checking';
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
