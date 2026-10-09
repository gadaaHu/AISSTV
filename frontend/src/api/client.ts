import { errorMessage } from "../lib/utils";
import { ApiError } from "./errors";

/**
 * The single HTTP entry point.
 *
 * Everything the app sends goes through `request`, so token handling, the
 * timeout, abort propagation and error normalisation live in exactly one place.
 *
 * The app talks to `/api/...` on its own origin; in development Vite proxies
 * that to the backend with the prefix stripped, and in production nginx does the
 * same, so the FastAPI routes are never exposed under a second path.
 */

export const API_BASE = "/api";

/** `sessionStorage`, not `localStorage`: the session ends with the tab. */
const TOKEN_KEY = "aisstv.token";

/** A hung request must not leave a screen spinning forever. */
export const REQUEST_TIMEOUT_MS = 15_000;

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registers the single reaction to a 401. The auth layer uses it to drop the
 * session; nothing else needs to inspect status codes.
 */
export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  unauthorizedHandler = handler;
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies); the session
    // then simply does not survive a reload.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do.
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** `undefined`, `null` and `""` values are omitted entirely. */
  query?: Record<string, QueryValue>;
  json?: unknown;
  form?: Record<string, string>;
  /** Multipart upload. The browser sets the boundary, so no Content-Type. */
  formData?: FormData;
  signal?: AbortSignal;
  /** Set to false for unauthenticated calls such as the login request. */
  auth?: boolean;
  timeoutMs?: number;
  accept?: string;
}

/**
 * Percent-encodes a value for use as a single URL path segment.
 *
 * Employee codes, camera ids and usernames are natural keys taken from user
 * input, so they are escaped rather than interpolated raw.
 */
export function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // nginx and other proxies answer with plain text or HTML.
    return text;
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const {
    method = "GET",
    query,
    json,
    form,
    formData,
    signal,
    auth = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
    accept,
  } = options;

  const headers = new Headers({ Accept: accept ?? "application/json" });
  const token = auth ? getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (formData) {
    // Deliberately no Content-Type: the browser must add the multipart
    // boundary itself, and setting the header by hand omits it.
    body = formData;
  } else if (form) {
    // `URLSearchParams` encodes a space as "+", which the OAuth2 form parser
    // decodes back to a space — correct for this content type. A "+" inside a
    // password becomes %2B, so it survives the round trip.
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  // A request-level timeout, so a hung socket cannot leave a screen spinning.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body,
      signal: controller.signal,
      credentials: "same-origin",
    });

    if (response.status === 401) {
      clearToken();
      unauthorizedHandler?.();
    }

    if (!response.ok) {
      throw ApiError.fromResponse(
        response.status,
        await readBody(response),
        response.headers.get("X-Request-ID") ?? undefined,
      );
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw timedOut ? ApiError.timeout() : ApiError.aborted();
    }
    if (error instanceof TypeError) {
      // `fetch` rejects with a TypeError when the request never reached the
      // server at all (DNS failure, connection refused, CORS).
      throw ApiError.network(
        "Cannot reach the server. Check your connection and that the API is running.",
      );
    }
    throw ApiError.unknown(errorMessage(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/** Performs a request and decodes a JSON response (`undefined` for 204). */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw ApiError.unknown(
      "The server returned a response that could not be read.",
    );
  }
}

/** Performs a request and discards the body — for the 204 endpoints. */
export async function requestVoid(
  path: string,
  options: RequestOptions = {},
): Promise<void> {
  await send(path, options);
}

/**
 * Performs a request and returns raw bytes.
 *
 * Used for `GET /cameras/{id}/snapshot`, which streams an image rather than
 * JSON. The endpoint needs the Authorization header, so an `<img src>` cannot
 * be pointed at it directly.
 */
export async function requestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const response = await send(path, { ...options, accept: "image/*" });
  return response.blob();
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
