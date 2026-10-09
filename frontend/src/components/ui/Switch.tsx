import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * An on/off control built on a real `<button role="switch">`.
 *
 * The button *is* the whole row, so clicking the label or the description
 * toggles it, and the control is reachable and operable with the keyboard for
 * free (Space/Enter). The visual track is `aria-hidden`; the accessible state
 * lives in `aria-checked`.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-slate-800/50"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {label}
        </span>
        {description ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            // 36px track − 16px knob − 2px inset = 18px, i.e. a 2px gap either way.
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
