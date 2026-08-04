import type { AuthMeResponse, ChangePasswordRequest, LoginRequest } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { ApiError, changePassword, fetchAuthMe, login, logout, onUnauthorized } from '../lib/api-client';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export type AuthStatus = 'checking' | 'anonymous' | 'firstLoginRequired' | 'authenticated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  auth: AuthMeResponse | null;
  error: ApiError | null;
  isMutating: boolean;
  login(input: LoginRequest): Promise<AuthMeResponse>;
  changePassword(input: ChangePasswordRequest): Promise<AuthMeResponse>;
  logout(): Promise<void>;
  retry(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authQuery = useQuery<AuthMeResponse | null, ApiError>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchAuthMe,
    retry: (failureCount, error) => error.statusCode !== 401 && failureCount < 1,
    staleTime: 30_000,
  });

  useEffect(() => onUnauthorized(() => {
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
  }), [queryClient]);

  const loginMutation = useMutation({ mutationFn: login });
  const passwordMutation = useMutation({ mutationFn: changePassword });
  const logoutMutation = useMutation({ mutationFn: logout });

  async function refreshAuth(): Promise<AuthMeResponse> {
    await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY, refetchType: 'none' });
    const refreshed = await queryClient.fetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: fetchAuthMe });
    queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
    return refreshed;
  }

  const value: AuthContextValue = {
    status: deriveStatus(authQuery),
    auth: authQuery.data ?? null,
    error: authQuery.error ?? null,
    isMutating: loginMutation.isPending || passwordMutation.isPending || logoutMutation.isPending,
    async login(input) {
      await loginMutation.mutateAsync(input);
      return refreshAuth();
    },
    async changePassword(input) {
      await passwordMutation.mutateAsync(input);
      return refreshAuth();
    },
    async logout() {
      try {
        await logoutMutation.mutateAsync();
      } finally {
        queryClient.clear();
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
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
