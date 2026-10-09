import { ApiError } from "../api/errors";

/**
 * Extracts a human-readable message from an unknown thrown value.
 * Falls back to `fallback` (default "An unexpected error occurred.").
 */
export function errorMessage(
  error: unknown,
  fallback = "An unexpected error occurred.",
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

/**
 * Conditionally joins class names, filtering out falsy values.
 * Matches the common `cn()` utility pattern.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
