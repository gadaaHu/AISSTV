/**
 * HTTP and transport errors, shaped after the backend's error envelope.
 *
 * The API answers with `{"error": "<code>", "detail": "<message>"}` for
 * application errors (see `backend/app/exceptions.py`), and a bare
 * `{"detail": "…"}` for framework-level ones such as an unknown path or a
 * missing `Authorization` header. Both are handled here so callers only ever
 * deal with `ApiError`.
 */

export const API_ERROR_CODES = [
  "network",
  "timeout",
  "aborted",
  "unauthorized",
  "forbidden",
  "notFound",
  "conflict",
  "validation",
  "server",
  "unknown",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

interface ApiErrorInit {
  message: string;
  code: ApiErrorCode;
  status?: number;
  detail?: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.detail = init.detail;
    this.requestId = init.requestId;
  }

  /** The session is gone and the user must sign in again. */
  get isUnauthorized(): boolean {
    return this.code === "unauthorized";
  }

  /** The request never reached the server, so retrying is worthwhile. */
  get isConnectivityProblem(): boolean {
    return this.code === "network" || this.code === "timeout";
  }

  get isAborted(): boolean {
    return this.code === "aborted";
  }

  /** True when the resource was already removed (DELETE is not idempotent). */
  get isGone(): boolean {
    return this.code === "notFound";
  }

  static network(message: string): ApiError {
    return new ApiError({ code: "network", message });
  }

  static timeout(message = "Request timed out"): ApiError {
    return new ApiError({ code: "timeout", message });
  }

  static aborted(): ApiError {
    return new ApiError({ code: "aborted", message: "Cancelled" });
  }

  static unknown(message: string): ApiError {
    return new ApiError({ code: "unknown", message });
  }

  /** Maps an HTTP status plus response body onto a typed error. */
  static fromResponse(
    status: number,
    body: unknown,
    requestId?: string,
  ): ApiError {
    const { detail, error } = parseErrorBody(body);
    const code = statusToCode(status, error);

    return new ApiError({
      code,
      status,
      detail,
      requestId,
      message: detail ?? defaultMessageFor(code, status),
    });
  }
}

function statusToCode(status: number, errorCode?: string): ApiErrorCode {
  if (errorCode === "forbidden") return "forbidden";
  if (errorCode === "unauthorized") return "unauthorized";

  switch (status) {
    case 400:
    case 422:
      return "validation";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    default:
      return status >= 500 ? "server" : "unknown";
  }
}

function defaultMessageFor(code: ApiErrorCode, status: number): string {
  switch (code) {
    case "unauthorized":
      return "Your session expired. Please sign in again.";
    case "forbidden":
      return "You do not have permission to do that.";
    case "notFound":
      return "That item no longer exists.";
    case "conflict":
      return "That conflicts with an existing record.";
    case "validation":
      // The server returns a generic "Invalid request" for every 422 with no
      // field-level detail, so the forms validate client-side instead.
      return "The server rejected those values.";
    case "server":
      return `The server failed (HTTP ${status}).`;
    default:
      return `Request failed (HTTP ${status}).`;
  }
}

interface ParsedErrorBody {
  detail?: string;
  error?: string;
}

/**
 * Extracts `detail` and `error` from an error body, tolerating a JSON string, a
 * plain-text body (nginx error pages) and an empty body.
 */
export function parseErrorBody(body: unknown): ParsedErrorBody {
  if (body === null || body === undefined) return {};
  if (typeof body === "string") {
    const trimmed = body.trim();
    return trimmed ? { detail: trimmed } : {};
  }
  if (typeof body !== "object") return {};

  const record = body as Record<string, unknown>;
  const detail = typeof record.detail === "string" ? record.detail : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;
  return { detail, error };
}
