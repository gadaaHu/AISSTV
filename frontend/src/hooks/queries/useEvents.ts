import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchEventCameras, fetchEvents } from "../../api/endpoints";
import type { EventQuery } from "../../api/endpoints";
import { POLL_INTERVAL_MS } from "../../lib/constants";
import { queryKeys } from "./keys";

/**
 * Event queries.
 *
 * `since` is always sent. The server falls back to `now - 60 minutes` when the
 * parameter is missing, which reads in the UI as "the events I asked for are
 * gone" rather than as a default, so the caller must never omit it.
 */

/**
 * The endpoint's own query shape with `since`, `limit` and `offset` made
 * **required**, so the type system enforces the rule above: a caller cannot
 * accidentally leave the window off and silently receive the server's
 * one-hour default, and paging is never left to a guess.
 */
export type EventsQueryParams = Omit<
  EventQuery,
  "since" | "limit" | "offset"
> & { since: Date; limit: number; offset: number };

/**
 * One page of events, newest first.
 *
 * The key carries `since.getTime()`, not the `Date` itself: a `Date` is
 * serialised the same way by the hash function, but the millisecond number is
 * the value that actually defines the window, so the key stays stable and
 * directly comparable when the same window is requested twice.
 */
export function useEvents(params: EventsQueryParams) {
  return useQuery({
    queryKey: queryKeys.events.list({
      sinceMs: params.since.getTime(),
      cameraId: params.cameraId,
      type: params.type,
      limit: params.limit,
      offset: params.offset,
    }),
    queryFn: ({ signal }) => fetchEvents(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * The camera filter's options.
 *
 * `fetchEventCameras` answers with a **bare array** of the thin
 * `CameraListItem` projection — not a `Page<Camera>` and not the full `Camera`
 * model — so this hook wraps that shape rather than reusing the cameras screen's
 * query. The list is near-static, so it is cached well past the list stale time
 * and is not polled.
 */
export function useEventCameras() {
  return useQuery({
    queryKey: queryKeys.events.cameras(),
    queryFn: ({ signal }) => fetchEventCameras(signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // Kept explicit: the event list polls, this must not.
    refetchInterval: false as const,
  });
}
