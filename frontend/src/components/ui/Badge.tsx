import type { ReactNode } from "react";

import type { Tone } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

/**
 * One subtle tinted pill per tone: a light background, a matching readable
 * text colour and a border that keeps the pill visible on a white card.
 *
 * Exported as `toneClasses` so non-Badge surfaces (toasts, status dots, KPI
 * tiles) can borrow exactly the same palette instead of inventing a second
 * one.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a shared style map, not a component: it lives beside Badge so the pill and its palette cannot drift apart.
export const toneClasses: Record<Tone, string> = {
  neutral:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  brand:
    "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} className="h-3.5 w-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}
