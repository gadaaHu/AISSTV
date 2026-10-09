import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchAttendance,
  fetchAttendanceSummary,
  type AttendanceQuery,
} from "../../api/endpoints";
import { POLL_INTERVAL_MS } from "../../lib/constants";
import { queryKeys } from "./keys";

/**
 * Attendance queries.
 *
 * Two rules hold for both hooks:
 *
 * * The key always comes from `queryKeys` — hand-written keys drift from the
 *   invalidation site, and the failure is silent.
 * * `refetchInterval` is `POLL_INTERVAL_MS`, because the dashboard mirrors a
 *   live camera feed: rows appear as people walk past without anyone touching
 *   the page.
 */

/** The KPI headline figures for one calendar day (`undefined` = today). */
export function useAttendanceSummary(day: string | undefined) {
  return useQuery({
    queryKey: queryKeys.attendance.summary(day),
    queryFn: ({ signal }) => fetchAttendanceSummary(day, signal),
    refetchInterval: POLL_INTERVAL_MS,
    // Changing the day keeps the previous day's figures on screen while the new
    // ones load, instead of collapsing the KPI row to skeletons.
    placeholderData: keepPreviousData,
  });
}

/**
 * One page of attendance rows.
 *
 * The date is passed as the discriminated `AttendanceDateFilter`, never as a
 * loose `start`/`end` pair: the server drops the whole date filter when only one
 * bound is present and would answer with the entire history.
 */
export function useAttendanceList(query: AttendanceQuery) {
  const { date, employeeCode, status, limit = 50, offset = 0 } = query;

  const day = date?.kind === "day" ? date.day : undefined;
  const start = date?.kind === "range" ? date.start : undefined;
  const end = date?.kind === "range" ? date.end : undefined;

  return useQuery({
    queryKey: queryKeys.attendance.list({
      day,
      start,
      end,
      employeeCode,
      status,
      limit,
      offset,
    }),
    queryFn: ({ signal }) => fetchAttendance({ ...query, limit, offset }, signal),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}
