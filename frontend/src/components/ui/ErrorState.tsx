import type { ReactNode } from "react";

import { ApiError } from "../../api/errors";
import { errorMessage } from "../../lib/utils";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

/**
 * The failure counterpart of `EmptyState`.
 *
 * The message always comes from the error itself (`errorMessage`), and for an
 * `ApiError` the two cases a user can actually act on get an extra hint: a
 * connectivity problem means the API is probably not running, and an
 * unauthorised response means the session has expired.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: ReactNode;
  className?: string;
}) {
  const message = error instanceof ApiError ? error.message : errorMessage(error);

  let hint: string | null = null;
  if (error instanceof ApiError) {
    if (error.isConnectivityProblem) {
      hint =
        "The API did not respond. Check that the backend is running and reachable, then try again.";
    } else if (error.isUnauthorized) {
      hint = "Your session has expired. Sign in again to continue.";
    }
  }

  return (
    <EmptyState
      icon="alert"
      className={className}
      title={title ?? "Something went wrong"}
      description={
        <span className="flex flex-col gap-1">
          <span>{message}</span>
          {hint ? (
            <span className="text-slate-400 dark:text-slate-500">{hint}</span>
          ) : null}
        </span>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
