import { useState } from "react";

import type { AttendanceRow } from "../api/types";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableMessage,
  TableRow,
} from "../components/ui";
import { useAttendanceList, useAttendanceSummary } from "../hooks/queries/useAttendance";
import { attendanceStyle } from "../lib/constants";
import { formatIsoDay, formatTime, todayIsoDay } from "../lib/dates";
import { EMPTY, formatDuration, formatNumber, humanise } from "../lib/format";

/** How many rows the "today's attendance" table asks for. */
const ATTENDANCE_LIMIT = 50;

/** Below `md` the table is replaced by one card per employee. */
function AttendanceCard({ row }: { row: AttendanceRow }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start gap-3">
        <Avatar name={row.employee_name} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {row.employee_name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono">{row.employee_code}</span>
            {row.department ? ` · ${humanise(row.department)}` : ""}
          </p>
        </div>

        <StatusBadge style={attendanceStyle(row.status)} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Check-in</dt>
          <dd className="text-slate-700 tabular-nums dark:text-slate-300">
            {formatTime(row.check_in)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Check-out</dt>
          <dd className="text-slate-700 tabular-nums dark:text-slate-300">
            {formatTime(row.check_out)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Late</dt>
          <dd className="text-slate-700 tabular-nums dark:text-slate-300">
            {row.minutes_late > 0 ? `${formatNumber(row.minutes_late)} min` : EMPTY}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Dwell</dt>
          <dd className="text-slate-700 tabular-nums dark:text-slate-300">
            {formatDuration(row.dwell_seconds)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function Dashboard() {
  const [day, setDay] = useState(() => todayIsoDay());

  // `undefined` asks the summary for today; passing the day explicitly for every
  // other calendar date keeps the KPI row and the table on the same day.
  const summaryQuery = useAttendanceSummary(day);
  const listQuery = useAttendanceList({
    date: { kind: "day", day },
    limit: ATTENDANCE_LIMIT,
  });

  const { data: summary, isPending: summaryPending, error: summaryError } =
    summaryQuery;
  const { data, isPending, error } = listQuery;
  const rows = data?.items ?? [];
  const isToday = day === todayIsoDay();

  const refresh = () => {
    void summaryQuery.refetch();
    void listQuery.refetch();
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          summary
            ? `${formatIsoDay(day)} · ${formatNumber(summary.total_employees)} active employees`
            : formatIsoDay(day)
        }
        actions={
          <>
            <label
              htmlFor="dashboard-day"
              className="text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              Day
            </label>
            <Input
              id="dashboard-day"
              type="date"
              value={day}
              // An `<input type="date">` already yields `YYYY-MM-DD`, which is
              // exactly the wire format — never round-trip it through a Date.
              onChange={(event) => {
                // A native date input reports "" when the user clears it. Sending
                // that on would ask the API for a day it cannot parse and the
                // table would empty itself for no visible reason, so the last
                // valid day is kept instead.
                if (event.target.value) setDay(event.target.value);
              }}
              className="w-40"
            />
            <Button
              variant="secondary"
              disabled={isToday}
              onClick={() => {
                setDay(todayIsoDay());
              }}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              onClick={refresh}
              aria-label="Refresh dashboard data"
            >
              <Icon name="refresh" className="h-4 w-4" />
              Refresh
            </Button>
          </>
        }
      />

      <section aria-label="Attendance summary" className="mb-6">
        {summaryPending ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 7 }, (_, index) => (
              <Card key={index}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-6 w-14" />
              </Card>
            ))}
          </div>
        ) : summaryError ? (
          <ErrorState
            error={summaryError}
            title="Could not load the summary"
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              <MetricCard
                label="Total employees"
                value={summary.total_employees}
                icon="employees"
                tone="brand"
                hint="Active headcount"
              />
              <MetricCard
                label="Present"
                value={summary.present}
                icon="check"
                tone="success"
              />
              <MetricCard
                label="Late"
                value={summary.late}
                icon="clock"
                tone="warning"
              />
              <MetricCard
                label="Absent"
                value={summary.absent}
                icon="alert"
                tone="danger"
              />
              <MetricCard
                label="On leave"
                value={summary.on_leave}
                icon="leaves"
                tone="info"
              />
              <MetricCard
                label="Checked out"
                value={summary.checked_out}
                icon="logout"
                tone="neutral"
              />
              <MetricCard
                label="Still in"
                value={summary.still_in}
                icon="activity"
                tone="info"
              />
            </div>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              The server derives <span className="font-medium">absent</span> from
              <span className="font-medium"> today&rsquo;s</span> active headcount,
              so for a historical day it is shown for completeness but is not
              authoritative.
            </p>
          </>
        ) : null}
      </section>

      <Card
        title="Attendance"
        description={`${formatIsoDay(day)} · up to ${formatNumber(ATTENDANCE_LIMIT)} records`}
        padded={false}
      >
        {isPending ? (
          <div className="flex flex-col gap-3 p-4">
            <SkeletonText lines={5} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState
              error={error}
              title="Could not load attendance"
              onRetry={() => void listQuery.refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="inbox"
              title="No attendance recorded"
              description={`Nothing was recorded for ${formatIsoDay(day)}. Try another day, or check that the cameras are running.`}
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Employee</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Check-in</TableHeaderCell>
                    <TableHeaderCell className="hidden md:table-cell">
                      Check-out
                    </TableHeaderCell>
                    <TableHeaderCell align="right" className="hidden md:table-cell">
                      Late
                    </TableHeaderCell>
                    <TableHeaderCell align="right" className="hidden md:table-cell">
                      Dwell
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableMessage colSpan={6}>No records for this day.</TableMessage>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={`${row.employee_code}-${row.day}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar name={row.employee_name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {row.employee_name}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-mono">
                                  {row.employee_code}
                                </span>
                                {row.department
                                  ? ` · ${humanise(row.department)}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <StatusBadge style={attendanceStyle(row.status)} />
                        </TableCell>

                        <TableCell className="tabular-nums">
                          {formatTime(row.check_in)}
                        </TableCell>

                        <TableCell className="hidden tabular-nums md:table-cell">
                          {formatTime(row.check_out)}
                        </TableCell>

                        <TableCell
                          align="right"
                          className="hidden tabular-nums md:table-cell"
                        >
                          {row.minutes_late > 0
                            ? `${formatNumber(row.minutes_late)} min`
                            : EMPTY}
                        </TableCell>

                        <TableCell
                          align="right"
                          className="hidden tabular-nums md:table-cell"
                        >
                          {formatDuration(row.dwell_seconds)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <ul className="flex flex-col gap-2 p-3 md:hidden">
              {rows.map((row) => (
                <AttendanceCard
                  key={`${row.employee_code}-${row.day}`}
                  row={row}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
