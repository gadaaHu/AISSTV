import { useMemo, useState } from "react";

import { ApiError } from "../api/errors";
import type { LeaveRequest } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { PageHeader } from "../components/PageHeader";
import { LeaveRequestDialog } from "../components/leaves/LeaveRequestDialog";
import { LeaveReviewDialog } from "../components/leaves/LeaveReviewDialog";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Modal,
  Pagination,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "../components/ui";
import {
  useCancelLeave,
  useLeaves,
  usePendingLeaveCount,
} from "../hooks/queries/useLeaves";
import { canReview, LEAVE_STATUS_OPTIONS, leaveStyle, PAGE_SIZE } from "../lib/constants";
import { formatDateTime, formatIsoDay, inclusiveDayCount } from "../lib/dates";
import { humanise } from "../lib/format";
import { cn } from "../lib/utils";

/** How many placeholder rows stand in for a page that has not arrived yet. */
const SKELETON_ROWS = 6;

function dayLabel(request: LeaveRequest): string {
  const count = inclusiveDayCount(request.start_date, request.end_date);
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function rangeLabel(request: LeaveRequest): string {
  return `${formatIsoDay(request.start_date)} → ${formatIsoDay(request.end_date)}`;
}

/**
 * Read-only detail panel.
 *
 * `reason` is rendered with `whitespace-pre-wrap` because the server appends a
 * reviewer's note to it as `"\n[Review note] …"`, and that line break is the
 * only thing separating the employee's words from the reviewer's.
 */
function LeaveDetailDialog({
  request,
  onClose,
}: {
  request: LeaveRequest;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Leave request"
      description={`${request.employee_code} · ${humanise(request.leave_type)}`}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Employee code
          </dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {request.employee_code}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Leave type
          </dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {humanise(request.leave_type)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Dates
          </dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {rangeLabel(request)}{" "}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              ({dayLabel(request)})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Status
          </dt>
          <dd>
            <StatusBadge style={leaveStyle(request.status)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Reviewed by
          </dt>
          <dd className="text-slate-700 dark:text-slate-300">
            {request.reviewed_by ?? "Not reviewed yet"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Reviewed
          </dt>
          <dd className="text-slate-700 dark:text-slate-300">
            {formatDateTime(request.reviewed_at)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Reason
          </dt>
          <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {request.reason ?? "—"}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}

/** Table rows shown before the first response lands. */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <TableRow key={index}>
          <TableCell>
            <Skeleton className="h-3.5 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-20" />
          </TableCell>
          <TableCell align="right">
            <Skeleton className="ml-auto h-7 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** The same placeholders, laid out as the stacked mobile cards. */
function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
        >
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="mb-2 h-3.5 w-48" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * The Leaves screen: browse, file and review leave requests.
 *
 * Every role can read the list and file a request — the backend restricts
 * review and cancellation, not creation — so "New request" is never hidden.
 * Review controls are gated on `canReview(role)`, and every disabled state
 * mirrors a 409 the server would return anyway.
 */
export function Leaves() {
  const { user } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const limit = PAGE_SIZE.leaves;
  const leaves = useLeaves({ status, limit, offset });
  const pending = usePendingLeaveCount();
  const cancelLeave = useCancelLeave();

  const reviewer = canReview(user?.role);
  // Read once and memoised: the dialogs below derive their request from this
  // array by id, and the `?? []` fallback would otherwise mint a new array on
  // every render and invalidate those lookups each time.
  const data = leaves.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pendingTotal = pending.data?.total ?? 0;

  // Looked up in the list rather than kept as a copy captured when the dialog
  // opened, so a poll that refreshes a row also refreshes the open dialog.
  const reviewRequest = useMemo(
    () => (reviewId ? items.find((item) => item.id === reviewId) : undefined),
    [items, reviewId],
  );
  const detailRequest = useMemo(
    () => (detailId ? items.find((item) => item.id === detailId) : undefined),
    [items, detailId],
  );
  const cancelRequest = useMemo(
    () => (cancelId ? items.find((item) => item.id === cancelId) : undefined),
    [items, cancelId],
  );

  const changeStatus = (next: string) => {
    // The empty option means "no filter", and `fetchLeaves` drops an empty
    // `status` rather than sending `status=`.
    setStatus(next === "" ? undefined : next);
    // Offsets belong to a filter: page 3 of "pending" is meaningless once the
    // filter changes to "approved".
    setOffset(0);
  };

  const confirmCancel = async () => {
    if (!cancelRequest) return;
    try {
      await cancelLeave.mutateAsync(cancelRequest.id);
    } catch (error) {
      toast.error(
        "Could not cancel the request",
        error instanceof ApiError ? error.message : undefined,
      );
      setCancelId(null);
      return;
    }
    toast.success("Leave request cancelled", cancelRequest.employee_code);
    setCancelId(null);
  };

  const rowActions = (request: LeaveRequest, stacked: boolean) => (
    <div
      className={cn(
        "flex items-center gap-1",
        stacked && "flex-wrap",
        !stacked && "justify-end",
      )}
    >
      <IconButton
        icon="search"
        label="View details"
        size="sm"
        onClick={() => {
          setDetailId(request.id);
        }}
      />
      {reviewer && request.status === "pending" ? (
        <IconButton
          icon="check"
          label="Review request"
          size="sm"
          onClick={() => {
            setReviewId(request.id);
          }}
        />
      ) : null}
      <IconButton
        icon="trash"
        label={
          request.status === "approved"
            ? "Cancel request — unavailable, an approved request cannot be cancelled"
            : "Cancel request"
        }
        size="sm"
        disabled={request.status === "approved"}
        aria-describedby={
          request.status === "approved" ? `cancel-blocked-${request.id}` : undefined
        }
        onClick={() => {
          setCancelId(request.id);
        }}
      />
      {request.status === "approved" ? (
        <span id={`cancel-blocked-${request.id}`} className="sr-only">
          An approved request cannot be cancelled — reject it instead.
        </span>
      ) : null}
    </div>
  );

  const showEmpty = leaves.isSuccess && items.length === 0;

  return (
    <div>
      <PageHeader
        title="Leaves"
        description="Browse leave requests, file a new one, and review the ones that are waiting."
        actions={
          <>
            {pendingTotal > 0 ? (
              <Badge tone="warning" icon="clock">
                {pendingTotal} pending
              </Badge>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                setRequestOpen(true);
              }}
            >
              <Icon name="plus" className="h-4 w-4" />
              New request
            </Button>
          </>
        }
      />

      <Card padded={false} className="mb-4">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-56">
            <label
              htmlFor="leave-status-filter"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Status
            </label>
            <Select
              id="leave-status-filter"
              value={status ?? ""}
              onChange={(event) => {
                changeStatus(event.target.value);
              }}
            >
              {LEAVE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <p
            aria-live="polite"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {leaves.isPending
              ? "Loading leave requests…"
              : `${total} ${total === 1 ? "request" : "requests"}${
                  status ? ` with status “${humanise(status)}”` : ""
                }`}
          </p>
        </div>
      </Card>

      {leaves.isError ? (
        <ErrorState
          error={leaves.error}
          title="Could not load leave requests"
          onRetry={() => {
            void leaves.refetch();
          }}
        />
      ) : showEmpty ? (
        <EmptyState
          icon="leaves"
          title={
            status
              ? `No ${humanise(status).toLowerCase()} leave requests`
              : "No leave requests yet"
          }
          description={
            status
              ? "Nothing matches this filter. Try another status, or file a new request."
              : "Once someone files a request it appears here with its approval state."
          }
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRequestOpen(true);
              }}
            >
              New request
            </Button>
          }
        />
      ) : (
        <Card padded={false}>
          {/* Below `md` a six-column table would only scroll sideways, so the
              same fields are rendered as stacked cards instead. */}
          <div className="p-3 md:hidden">
            {leaves.isPending ? (
              <SkeletonCards />
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {request.employee_code}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {humanise(request.leave_type)}
                        </p>
                      </div>
                      <StatusBadge style={leaveStyle(request.status)} />
                    </div>

                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {rangeLabel(request)}{" "}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({dayLabel(request)})
                      </span>
                    </p>

                    {request.reviewed_by ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Reviewed by {request.reviewed_by}
                      </p>
                    ) : null}

                    <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {rowActions(request, true)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Employee</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Dates</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Reviewed by</TableHeaderCell>
                  <TableHeaderCell align="right">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leaves.isPending ? (
                  <SkeletonRows />
                ) : (
                  items.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                        {request.employee_code}
                      </TableCell>
                      <TableCell>{humanise(request.leave_type)}</TableCell>
                      <TableCell>
                        {rangeLabel(request)}{" "}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({dayLabel(request)})
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge style={leaveStyle(request.status)} />
                      </TableCell>
                      <TableCell>
                        {request.reviewed_by ?? (
                          <span className="text-slate-400 dark:text-slate-500">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {rowActions(request, false)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            disabled={leaves.isFetching}
            itemLabel="leave requests"
            onOffsetChange={setOffset}
          />
        </Card>
      )}

      {/* Mounted only while open, so each dialog starts from a clean slate. */}
      {requestOpen ? (
        <LeaveRequestDialog
          open
          onClose={() => {
            setRequestOpen(false);
          }}
        />
      ) : null}

      {reviewRequest ? (
        <LeaveReviewDialog
          request={reviewRequest}
          open
          onClose={() => {
            setReviewId(null);
          }}
        />
      ) : null}

      {detailRequest ? (
        <LeaveDetailDialog
          request={detailRequest}
          onClose={() => {
            setDetailId(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(cancelRequest)}
        title="Cancel leave request"
        description={
          cancelRequest
            ? `${cancelRequest.employee_code} · ${rangeLabel(cancelRequest)}`
            : undefined
        }
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        loading={cancelLeave.isPending}
        onClose={() => {
          setCancelId(null);
        }}
        onConfirm={() => {
          void confirmCancel();
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This deletes the request and cannot be undone — a cancelled request has
          to be filed again.
        </p>
        {cancelRequest?.status === "approved" ? (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          >
            The server refuses to cancel an approved request. Open it and reject
            it instead.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
