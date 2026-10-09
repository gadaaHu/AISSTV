import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  cancelLeave,
  createLeave,
  fetchLeaves,
  reviewLeave,
} from "../../api/endpoints";
import type { LeaveInput, LeaveReviewInput } from "../../api/types";
import { POLL_INTERVAL_MS } from "../../lib/constants";
import { queryKeys } from "./keys";

/**
 * The leave list plus the pending badge count, and the three leave mutations.
 *
 * They live together because they share one cache namespace: every mutation
 * invalidates `queryKeys.leaves.all()`, which refreshes both the filtered list
 * and the pending count in a single call, so a badge can never disagree with
 * the rows beneath it.
 *
 * `fetchLeaves` drops `""` query values, so `status: ""` (the "All statuses"
 * option) removes the filter instead of sending `status=`.
 */
export function useLeaves(params: {
  status: string | undefined;
  limit: number;
  offset: number;
}) {
  return useQuery({
    queryKey: queryKeys.leaves.list(params),
    queryFn: ({ signal }) => fetchLeaves(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * How many requests are waiting for a decision.
 *
 * `limit: 1` because only `total` is read — the list endpoint always reports the
 * full count regardless of the page size, so there is no reason to transfer 25
 * rows for a badge. It is its own query rather than a derivation from the list
 * so the badge stays correct while the list is filtered to approved/rejected.
 */
export function usePendingLeaveCount() {
  return useQuery({
    queryKey: queryKeys.leaves.pendingCount(),
    queryFn: ({ signal }) =>
      fetchLeaves({ status: "pending", limit: 1 }, signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useCreateLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LeaveInput) => createLeave(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all() });
    },
  });
}

/** `status` is typed as the union the server accepts; anything else is a 400. */
export function useReviewLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LeaveReviewInput }) =>
      reviewLeave(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all() });
    },
  });
}

export function useCancelLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelLeave(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all() });
    },
  });
}
