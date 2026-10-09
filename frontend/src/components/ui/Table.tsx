import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../../lib/utils";

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export function Table({
  className,
  ...rest
}: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...rest} />
    </div>
  );
}

export function TableHead({
  className,
  ...rest
}: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead
      className={cn("bg-slate-50 dark:bg-slate-900/50", className)}
      {...rest}
    />
  );
}

export function TableBody({
  className,
  ...rest
}: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className={className} {...rest} />;
}

export function TableRow({
  interactive = false,
  className,
  ...rest
}: ComponentPropsWithoutRef<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        interactive &&
          "cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
        className,
      )}
      {...rest}
    />
  );
}

export function TableHeaderCell({
  align = "left",
  className,
  ...rest
}: ComponentPropsWithoutRef<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400",
        ALIGN[align],
        className,
      )}
      {...rest}
    />
  );
}

export function TableCell({
  align = "left",
  className,
  ...rest
}: ComponentPropsWithoutRef<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-slate-100 px-3 py-2 text-slate-700 dark:border-slate-800/60 dark:text-slate-300",
        ALIGN[align],
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A single centred muted row for the empty and loading states of a table.
 *
 * `className` is applied to the `<td>` (the visible cell) so callers can adjust
 * the padding or colour; every remaining prop goes to the `<tr>`.
 */
export function TableMessage({
  colSpan = 1,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"tr"> & { colSpan?: number; children: ReactNode }) {
  return (
    <tr {...rest}>
      <td
        colSpan={colSpan}
        className={cn(
          "px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400",
          className,
        )}
      >
        {children}
      </td>
    </tr>
  );
}
