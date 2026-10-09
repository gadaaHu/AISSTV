import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";
import { Spinner } from "./Spinner";

const VARIANTS = {
  primary: "gemini-btn shadow-sm",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost:
    "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  subtle:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
} as const;

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

/**
 * Solid variants carry a subtle shadow; `ghost` and `subtle` stay flat.
 *
 * While `loading` the button renders a `Spinner` and is disabled, so a form
 * cannot be submitted twice by an impatient double click.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={loading || disabled}
      aria-busy={loading ? true : undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner size="sm" label="Loading" /> : null}
      {children}
    </button>
  );
}
