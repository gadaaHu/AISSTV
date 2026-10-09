import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearToken,
  getToken,
  setToken,
  setUnauthorizedHandler,
} from "../api/client";
import { fetchMe, login as requestLogin } from "../api/endpoints";
import { ApiError } from "../api/errors";
import { queryKeys } from "../hooks/queries/keys";
import { errorMessage } from "../lib/utils";
import { AuthContext, type AuthContextValue } from "./context";

/**
 * Owns the session.
 *
 * The current user lives in the Query cache rather than in local state, so
 * signing out can drop every cached response with one `clear()` — otherwise a
 * second user would briefly see the first user's data.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [authError, setAuthError] = useState<string | null>(null);

  // Every 401 in the app funnels through this single handler.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setTokenState(null);
      setAuthError("Your session expired. Please sign in again.");
      queryClient.clear();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => fetchMe(signal),
    // Without a token there is nothing to validate, so the query stays idle and
    // the sign-in screen shows immediately.
    enabled: token !== null,
    retry: false,
    staleTime: 60_000,
  });

  const signIn = useCallback(
    async (username: string, password: string) => {
      setAuthError(null);
      try {
        const result = await requestLogin(username, password);
        setToken(result.access_token);
        setTokenState(result.access_token);
        await queryClient.fetchQuery({
          queryKey: queryKeys.auth.me(),
          queryFn: ({ signal }) => fetchMe(signal),
        });
      } catch (error) {
        clearToken();
        setTokenState(null);
        setAuthError(
          error instanceof ApiError
            ? error.message
            : errorMessage(error, "Sign-in failed"),
        );
        throw error;
      }
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
    setAuthError(null);
    queryClient.clear();
  }, [queryClient]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      loading: token !== null && meQuery.isPending,
      error: authError ?? (meQuery.error ? errorMessage(meQuery.error) : null),
      signIn,
      signOut,
      clearError,
    }),
    [
      meQuery.data,
      meQuery.isPending,
      meQuery.error,
      token,
      authError,
      signIn,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
