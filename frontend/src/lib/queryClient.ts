import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/errors";
import { STALE_TIME_MS } from "./constants";

/**
 * Creates the Query client.
 *
 * The retry policy is the interesting part: a request the server deliberately
 * refused (400/401/403/404/409/422) is never retried — retrying an expired
 * session or a validation failure just multiplies the failure. Transport
 * failures and 5xx responses are retried twice with a short backoff.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            if (error.isAborted) return false;
            if (error.status !== undefined && error.status < 500) return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
