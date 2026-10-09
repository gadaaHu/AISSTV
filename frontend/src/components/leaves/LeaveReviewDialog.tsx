import { useState } from "react";

import type { LeaveRequest } from "../../api/types";
import { ApiError } from "../../api/errors";
import { useReviewLeave } from "../../hooks/queries/useLeaves";
import { leaveStyle } from "../../lib/constants";
import { formatIsoDay, inclusiveDayCount } from "../../lib/dates";
import { humanise } from "../../lib/format";
import { cn } from "../../lib/utils";
import {
  Button,
  Field,
  Modal,
  StatusBadge,
  Textarea,
  useToast,
} from "../ui";

type Decision = "approved" | "rejected";

/**
 * Approves or rejects one request.
 *
 * `status` is sent as exactly `"approved"` or `"rejected"` — the endpoint
 * answers 400 for anything else, and `LeaveReviewInput` types it as that union
 * so the mistake cannot be made here.
 *
 * The note is **not** a separate field on the server: a non-empty note is
 * appended to the request's `reason` as `"\n[Review note] …"`. The dialog says
 * so out loud, because "note" otherwise implies a hidden reviewer-only comment.
 */
export function LeaveReviewDialog({
  request,
  open,
  onClose,
}: {
  request: LeaveRequest;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const reviewLeave = useReviewLeave();
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = request.status === "pending";
  const busy = reviewLeave.isPending;
  const trimmedNote = note.trim();
  const days = inclusiveDayCount(request.start_date, request.end_date);

  const decide = async (status: Decision) => {
    setError(null);
    setDecision(status);

    try {
      await reviewLeave.mutateAsync({
        id: request.id,
        // The note is optional, so a blank one is omitted rather than sent as
        // `""` — which would append an empty "[Review note]" line.
        body: { status, ...(trimmedNote ? { note: trimmedNote } : {}) },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The review could not be saved.",
      );
      setDecision(null);
      return;
    }

    toast.success(
      status === "approved" ? "Request approved" : "Request rejected",
      `${request.employee_code} · ${formatIsoDay(request.start_date)} → ${formatIsoDay(request.end_date)}`,
    );
    setNote("");
    setDecision(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pending ? "Review leave request" : "Leave request"}
      description={`${request.employee_code} · ${humanise(request.leave_type)}`}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!pending || busy}
            loading={busy && decision === "rejected"}
            onClick={() => {
              void decide("rejected");
            }}
          >
            Reject
          </Button>
          <Button
            size="sm"
            disabled={!pending || busy}
            loading={busy && decision === "approved"}
            onClick={() => {
              void decide("approved");
            }}
          >
            Approve
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-950/50">
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
              {formatIsoDay(request.start_date)} → {formatIsoDay(request.end_date)}{" "}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                ({days} {days === 1 ? "day" : "days"})
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
          {request.reason ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Reason on file
              </dt>
              <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {request.reason}
              </dd>
            </div>
          ) : null}
        </dl>

        {pending ? (
          <p
            id="leave-review-note-explainer"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200"
          >
            A non-empty note is <strong>appended to the request's reason</strong>{" "}
            as a new line reading{" "}
            <code className="font-mono">[Review note] …</code>. It is not a
            private comment — the employee sees it, and it joins the reason text
            above.
          </p>
        ) : (
          <p
            id="leave-review-not-pending"
            role="status"
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400",
            )}
          >
            This request is already <strong>{request.status}</strong>
            {request.reviewed_by ? ` by ${request.reviewed_by}` : ""}. Only a
            pending request can be reviewed, so Approve and Reject are disabled —
            the server answers 409 otherwise.
          </p>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}

        <Field
          label="Review note"
          htmlFor="leave-review-note"
          hint="Optional. Leave it blank to record only the decision."
        >
          <Textarea
            id="leave-review-note"
            rows={3}
            value={note}
            disabled={!pending || busy}
            aria-describedby="leave-review-note-explainer"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
