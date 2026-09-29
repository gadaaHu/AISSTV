const BASE = "/api";
const TOKEN_KEY = "attendance.token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  sessionStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedListener): void {
  onUnauthorized = fn;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { form?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (options.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = body as BodyInit;
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(BASE + path, { method, headers, body: payload });

  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
    throw new ApiError(401, "Session expired");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "HTTP " + res.status;
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export async function login(username: string, password: string): Promise<TokenOut> {
  const form = new URLSearchParams({ username, password }).toString();
  const out = await request<TokenOut>("POST", "/auth/login", form, { form: true });
  setToken(out.access_token);
  return out;
}

import type { TokenOut } from "./types";
