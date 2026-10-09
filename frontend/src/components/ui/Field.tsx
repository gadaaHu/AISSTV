import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * Label, control, message — the layout for a single form control.
 *
 * `Field` renders the text only. **Wiring the control's accessibility
 * attributes is the caller's job**, because only the caller knows which input
 * it rendered:
 *
 * ```tsx
 * <Field label="Full name" htmlFor="name" error={errors.name}>
 *   <Input
 *     id="name"
 *     invalid={Boolean(errors.name)}
 *     aria-describedby={errors.name ? "name-error" : "name-hint"}
 *   />
 * </Field>
 * ```
 *
 * To make that easy, the hint and error elements are given the derived ids
 * `"<htmlFor>-hint"` and `"<htmlFor>-error"` when `htmlFor` is set. The error
 * carries `role="alert"` so it is announced the moment validation fails.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-rose-600 dark:text-rose-400">
            *
          </span>
        ) : null}
      </label>

      {children}

      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          className="text-xs text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={htmlFor ? `${htmlFor}-hint` : undefined}
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
